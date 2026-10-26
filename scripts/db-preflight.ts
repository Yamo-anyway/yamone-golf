import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import {
  capture,
  compare,
  expectedSnapshot,
  sqliteQuery,
  type Query,
} from "./lib/db-preflight";

const root = resolve(dirname(process.argv[1]), "..");
const worker = resolve(root, "yamone-golf-cloudflare");
const help = `Read-only D1 schema/history preflight (no apply/deploy/restore).
  npm run db:preflight -- --remote --out .tmp/operations/preflight.json
  npm run db:preflight -- --sqlite /path/to/local.sqlite --out .tmp/operations/local.json
Remote mode always uses --env production and the existing DB binding.
Exit codes: 0 metadata matches; 2 differences require review; 1 failed/incomplete.
Reports contain schema/history/operational metadata, not user or score rows.`;

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    console.log(help);
    return;
  }
  let remote = false,
    local = "",
    out = "";
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--remote") remote = true;
    else if (key === "--sqlite" || key === "--out") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw Error(`Missing value: ${key}`);
      if (key === "--sqlite") local = resolve(value);
      else out = resolve(value);
    } else throw Error(`Unknown option: ${key}`);
  }
  if (remote === !!local || !out)
    throw Error("Choose exactly one of --remote/--sqlite and provide --out.");
  // Never overwrite an input SQLite database, an existing report, or a source file.
  const configPath = resolve(worker, "wrangler.jsonc");
  const parsed = ts.parseConfigFileTextToJson(
    configPath,
    readFileSync(configPath, "utf8"),
  );
  if (parsed.error) throw Error("Invalid Wrangler JSONC");
  const production = parsed.config.env?.production;
  const target = production?.d1_databases?.find(
    (db: any) => db.binding === "DB",
  );
  if (
    !target?.database_id ||
    /^0+-0+-0+-0+-0+$/.test(target.database_id) ||
    target.database_name !== "yamone-golf"
  )
    throw Error("Existing production DB target is not configured.");
  const expected = await expectedSnapshot(resolve(worker, "migrations"));
  let db: DatabaseSync | undefined;
  const wrangler = (args: string[]) =>
    execFileSync(
      process.execPath,
      [resolve(root, "node_modules/wrangler/bin/wrangler.js"), ...args],
      {
        cwd: worker,
        encoding: "utf8",
        env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
  try {
    let query: Query;
    if (remote) {
      query = async (statements) => {
        if (!statements.length) return [];
        let result;
        try {
          result = JSON.parse(
            wrangler([
              "d1",
              "execute",
              "DB",
              "--remote",
              "--env",
              "production",
              "--json",
              "--command",
              statements.join(";\n") + ";",
            ]),
          );
        } catch {
          throw Error(
            "Production metadata read failed. Check Cloudflare login/account and D1 access. No changes were applied.",
          );
        }
        if (
          !Array.isArray(result) ||
          result.length !== statements.length ||
          result.some(
            (row: any) => row.success !== true || !Array.isArray(row.results),
          )
        )
          throw Error("Incomplete D1 result; report not saved.");
        return result.map((row: any) => row.results);
      };
    } else {
      db = new DatabaseSync(local, { readOnly: true });
      query = sqliteQuery(db);
    }
    const snapshot = await capture(query);
    const report = {
      format: 1,
      captured_at: new Date().toISOString(),
      source: remote ? "remote" : "local",
      target: remote
        ? {
            environment: "production",
            database_name: target.database_name,
            database_id: target.database_id,
          }
        : { file: local },
      ...compare(expected, snapshot),
      snapshot,
    };
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    writeFileSync(out, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      `${remote ? "Production" : "Local"} read-only preflight: ${report.issues.length} review items. ${out}`,
    );
    process.exitCode = report.schema_and_history_match ? 0 : 2;
  } finally {
    db?.close();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Preflight failed");
  process.exitCode = 1;
});
