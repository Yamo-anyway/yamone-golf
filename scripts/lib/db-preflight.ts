import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

type Row = Record<string, any>;
export type Query = (statements: string[]) => Promise<Row[][]>;
export type Snapshot = {
  schema: Row[];
  columns: Record<string, Row[]>;
  foreignKeys: Record<string, Row[]>;
  history: string[] | null;
  operations: Record<string, Row[]>;
};
export const identifier = (value: string) =>
  '"' + value.replaceAll('"', '""') + '"';
const schemaQuery =
  "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','view','trigger') AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type,name";

// Only generated metadata SELECTs and read-only PRAGMAs are sent to D1.
// Schema SQL returned by the database is compared as text, never executed locally.
export async function capture(query: Query): Promise<Snapshot> {
  const [schema] = await query([schemaQuery]);
  const tables = schema
    .filter((row) => row.type === "table")
    .map((row) => row.name as string);
  const snapshot: Snapshot = {
    schema,
    columns: {},
    foreignKeys: {},
    history: null,
    operations: {},
  };
  const requests: { sql: string; save: (rows: Row[]) => void }[] = [];
  for (const table of tables) {
    requests.push(
      {
        sql: `PRAGMA table_info(${identifier(table)})`,
        save: (rows) => {
          snapshot.columns[table] = rows;
        },
      },
      {
        sql: `PRAGMA foreign_key_list(${identifier(table)})`,
        save: (rows) => {
          snapshot.foreignKeys[table] = rows;
        },
      },
    );
  }
  // Inspect metadata first so a missing/malformed history table is reported, not created.
  const metadata = await query(requests.map((request) => request.sql));
  if (metadata.length !== requests.length)
    throw Error("Incomplete schema metadata response");
  requests.forEach((request, i) => request.save(metadata[i]));
  const reads: { key: string; sql: string }[] = [];
  const has = (table: string, columns: string[]) =>
    columns.every((column) =>
      snapshot.columns[table]?.some((row) => row.name === column),
    );
  if (has("d1_migrations", ["name"])) {
    reads.push({
      key: "history",
      sql: "SELECT name FROM d1_migrations ORDER BY name",
    });
  }
  const operationReads = [
    [
      "country_course_settings",
      ["country_code", "enabled", "locked"],
      "country_code",
    ],
    [
      "golfcore_sync_state",
      [
        "country_code",
        "priority",
        "status",
        "next_offset",
        "last_success_at",
        "last_completed_at",
        "updated_at",
      ],
      "priority,country_code",
    ],
  ] as const;
  for (const [table, columns, order] of operationReads) {
    if (has(table, [...columns]))
      reads.push({
        key: table,
        sql: `SELECT ${columns.join(",")} FROM ${table} ORDER BY ${order}`,
      });
  }
  if (has("course_region_mappings", ["country_code"]))
    reads.push({
      key: "region_mapping_counts",
      sql: "SELECT country_code,COUNT(*) AS count FROM course_region_mappings GROUP BY country_code ORDER BY country_code",
    });
  if (reads.length) {
    const rows = await query(reads.map((read) => read.sql));
    if (rows.length !== reads.length)
      throw Error("Incomplete operations metadata response");
    reads.forEach((read, i) => {
      if (read.key === "history")
        snapshot.history = rows[i].map((row) => String(row.name));
      else snapshot.operations[read.key] = rows[i];
    });
  }
  return snapshot;
}

export function sqliteQuery(db: DatabaseSync): Query {
  return async (statements) => statements.map((sql) => db.prepare(sql).all());
}

export function migrationFiles(directory: string) {
  return readdirSync(directory)
    .filter((file) => /^\d{4}_[\w-]+\.sql$/.test(file))
    .sort()
    .map((name) => {
      const sql = readFileSync(`${directory}/${name}`, "utf8");
      return {
        name,
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

export async function expectedSnapshot(directory: string) {
  const db = new DatabaseSync(":memory:");
  const migrations = migrationFiles(directory);
  try {
    for (const migration of migrations) db.exec(migration.sql);
    return {
      snapshot: await capture(sqliteQuery(db)),
      migrations: migrations.map(({ name, sha256 }) => ({ name, sha256 })),
    };
  } finally {
    db.close();
  }
}

// Ignore formatting and identifier quoting, but preserve string literals and SQL tokens.
// A different definition requires human review; this is deliberately not an equivalence prover.
export function normalizeSQL(sql: string) {
  const tokens =
    sql.match(
      /'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/|[a-zA-Z_][\w]*|\d+(?:\.\d+)?|[^\s]/g,
    ) ?? [];
  const filtered = tokens.filter(
    (token) =>
      !token.startsWith("--") && !token.startsWith("/*") && token !== ";",
  );
  const normalized: string[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (
      filtered
        .slice(i, i + 3)
        .map((token) => token.toLowerCase())
        .join(" ") === "if not exists"
    ) {
      i += 2;
      continue;
    }
    normalized.push(filtered[i]);
  }
  return normalized
    .map((token) => {
      if (token.startsWith("'")) return token;
      if (/^["`\[]\w+["`\]]$/.test(token))
        return token.slice(1, -1).toLowerCase();
      return token.toLowerCase();
    })
    .join(" ");
}

export function compare(
  expected: Awaited<ReturnType<typeof expectedSnapshot>>,
  actual: Snapshot,
) {
  const issues: { kind: string; object: string; detail?: string }[] = [];
  const desired = expected.snapshot;
  const actualObjects = new Map(
    actual.schema.map((row) => [`${row.type}:${row.name}`, row]),
  );
  for (const object of desired.schema) {
    const key = `${object.type}:${object.name}`;
    const found = actualObjects.get(key);
    if (!found) {
      issues.push({ kind: "missing_object", object: key });
      continue;
    }
    if (normalizeSQL(object.sql ?? "") !== normalizeSQL(found.sql ?? ""))
      issues.push({ kind: "definition_review", object: key });
    if (object.type !== "table") continue;
    for (const column of desired.columns[object.name]) {
      const foundColumn = actual.columns[object.name]?.find(
        (row) => row.name === column.name,
      );
      if (!foundColumn)
        issues.push({
          kind: "missing_column",
          object: `${object.name}.${column.name}`,
        });
      else {
        const fields = ["type", "notnull", "dflt_value", "pk"];
        if (
          fields.some(
            (field) =>
              String(column[field] ?? "").toLowerCase() !==
              String(foundColumn[field] ?? "").toLowerCase(),
          )
        )
          issues.push({
            kind: "column_review",
            object: `${object.name}.${column.name}`,
          });
      }
    }
    const fk = (rows: Row[]) =>
      rows
        .map((row) =>
          JSON.stringify([
            row.seq,
            row.table,
            row.from,
            row.to,
            row.on_update,
            row.on_delete,
            row.match,
          ]),
        )
        .sort();
    if (
      JSON.stringify(fk(desired.foreignKeys[object.name])) !==
      JSON.stringify(fk(actual.foreignKeys[object.name] ?? []))
    )
      issues.push({ kind: "foreign_key_review", object: object.name });
  }
  const expectedObjects = new Set(
    desired.schema.map((row) => `${row.type}:${row.name}`),
  );
  for (const object of actual.schema) {
    const key = `${object.type}:${object.name}`;
    if (object.name !== "d1_migrations" && !expectedObjects.has(key))
      issues.push({ kind: "extra_object_review", object: key });
  }
  if (actual.history === null)
    issues.push({ kind: "history_missing", object: "d1_migrations" });
  const migrations = expected.migrations.map((migration) => ({
    ...migration,
    recorded: actual.history?.includes(migration.name) ?? false,
  }));
  for (const migration of migrations)
    if (!migration.recorded)
      issues.push({
        kind: "history_unrecorded_review",
        object: migration.name,
        detail: "May already be manually applied; never replay automatically.",
      });
  for (const name of actual.history ?? [])
    if (!migrations.some((migration) => migration.name === name))
      issues.push({ kind: "unknown_migration_review", object: name });
  for (const table of ["country_course_settings", "golfcore_sync_state"]) {
    for (const code of ["KR", "PH", "JP", "CN", "TW", "VN", "TH", "MY", "ID"]) {
      if (!actual.operations[table]?.some((row) => row.country_code === code))
        issues.push({
          kind: "country_row_missing",
          object: `${table}.${code}`,
        });
    }
  }
  const expectedCounts = desired.operations.region_mapping_counts ?? [];
  for (const row of expectedCounts)
    if (
      !actual.operations.region_mapping_counts?.some(
        (found) =>
          found.country_code === row.country_code && found.count === row.count,
      )
    )
      issues.push({
        kind: "mapping_count_review",
        object: row.country_code,
        detail:
          "Counts differ; mappings may be manually curated. Counts alone cannot verify values.",
      });
  return {
    schema_and_history_match: issues.length === 0,
    automatic_apply_allowed: false,
    issues,
    migrations,
    operations: actual.operations,
    limitations: [
      "Metadata is read in separate requests; run during a schema-change freeze and recheck immediately before changes.",
      "Migration history has names, not checksums; recorded files and equal row counts do not prove identical SQL/data.",
      "This report does not authorize migration, deployment, restore, or data replacement.",
    ],
  };
}
