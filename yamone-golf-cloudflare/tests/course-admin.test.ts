import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const ADMIN_TOKEN =
  "admin-test-token-that-is-longer-than-thirty-two-characters";
const requests: { url: string; agent: string | null }[] = [];
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;

const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];
const detail = {
  slug: "manila-example-golf-club",
  name: "Manila Example Golf Club",
  city: "Manila",
  region: "Metro Manila",
  country: "ph",
  coverage: { scorecard: true },
  layouts: [
    {
      name: "North + South",
      holes: pars.map((par, index) => ({ position: index + 1, par })),
      tees: [],
    },
    {
      // A repeated routing must not create duplicate nines.
      name: "North + South",
      holes: pars.map((par, index) => ({ position: index + 1, par })),
      tees: [],
    },
  ],
};

async function request(path: string, options: RequestInit = {}, admin = true) {
  const response = await mf.dispatchFetch("https://api.test" + path, {
    ...options,
    headers: {
      ...(admin ? { Authorization: "Bearer " + ADMIN_TOKEN } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    data: text.startsWith("{") ? JSON.parse(text) : text,
  };
}

before(async () => {
  await mkdir(".tmp", { recursive: true });
  await build({
    entryPoints: ["src/index.ts"],
    outfile: ".tmp/course-admin-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: ".tmp/course-admin-worker.mjs",
      compatibilityDate: "2026-09-23",
      d1Databases: ["DB"],
      bindings: {
        ENVIRONMENT: "test",
        ALLOWED_ORIGINS: "https://app.test",
        COURSE_ADMIN_TOKEN: ADMIN_TOKEN,
      },
      serviceBindings: {
        GOLFCORE_API: async (incoming: Request) => {
          const url = new URL(incoming.url);
          requests.push({
            url: incoming.url,
            agent: incoming.headers.get("User-Agent"),
          });
          if (url.pathname.endsWith("/courses"))
            return Response.json({
              total: 1,
              count: 1,
              offset: Number(url.searchParams.get("offset")),
              courses: [
                {
                  slug: detail.slug,
                  name: detail.name,
                  city: detail.city,
                  region: detail.region,
                  country: detail.country,
                  hole_count: 18,
                  coverage: detail.coverage,
                },
              ],
            });
          if (url.pathname.endsWith("/courses/" + detail.slug))
            return Response.json(detail);
          return Response.json({ error: "not_found" }, { status: 404 });
        },
      },
    }),
  );
  db = await mf.getD1Database("DB");
  for (const file of (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("migrations/" + file, "utf8");
    await db.batch(
      sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => db.prepare(statement)),
    );
  }
});

after(async () => mf?.dispose());

beforeEach(async () => {
  requests.length = 0;
  await db.batch(
    [
      "course_admin_changes",
      "user_courses",
      "course_lists",
      "courses",
      "devices",
      "users",
      "request_limits",
      "mutation_guards",
    ].map((table) => db.prepare("DELETE FROM " + table)),
  );
});

test("admin page is locked, self-contained and never embeds the secret", async () => {
  const page = await request("/admin", {}, false);
  assert.equal(page.status, 200);
  assert.match(page.data, /골프장 데이터 관리자/);
  assert.doesNotMatch(page.data, new RegExp(ADMIN_TOKEN));
  assert.match(
    page.headers.get("Content-Security-Policy") ?? "",
    /frame-ancestors 'none'/,
  );
  assert.equal((await request("/admin/api/session", {}, false)).status, 401);
  assert.equal(
    (
      await request(
        "/admin/api/session",
        { headers: { Authorization: "Bearer wrong-token" } },
        false,
      )
    ).status,
    401,
  );
  assert.equal((await request("/admin/api/session")).status, 200);
});

test("GolfCore search uses the supported API and review creates unique nine-hole segments", async () => {
  const search = await request(
    "/admin/api/golfcore/search?country=ph&q=Manila&offset=0",
  );
  assert.equal(search.status, 200);
  assert.equal(search.data.courses[0].slug, detail.slug);
  const called = new URL(requests[0].url);
  assert.equal(called.hostname, "api.golfcore.org");
  assert.equal(called.searchParams.get("country"), "ph");
  assert.equal(called.searchParams.get("coverage"), "scorecard");
  assert.equal(called.searchParams.get("q"), "Manila");
  assert.match(requests[0].agent ?? "", /^YamoneGolf\/0\.3\.12/);

  const reviewed = await request("/admin/api/golfcore/courses/" + detail.slug);
  assert.equal(reviewed.status, 200);
  assert.deepEqual(
    reviewed.data.course.segments.map(
      (segment: { name: string }) => segment.name,
    ),
    ["North", "South"],
  );
  assert.equal(reviewed.data.course.segments[0].pars.length, 9);
  assert.equal(
    reviewed.data.course.source_url,
    "https://www.golfcore.org/courses/manila-example-golf-club/",
  );
});

test("GolfCore import persists attribution, supports reviewed edits and is idempotent by slug", async () => {
  const created = await request("/admin/api/golfcore/import", {
    method: "POST",
    body: JSON.stringify({
      slug: detail.slug,
      name: "Manila Example GC",
      country_code: "PH",
      city: "Makati",
      segments: [
        { name: "North", pars: pars.slice(0, 9) },
        { name: "South", pars: pars.slice(9) },
      ],
      active: true,
    }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.course.source_name, "golfcore");
  assert.equal(created.data.course.city, "Makati");
  assert.equal(created.data.course.managed_by_admin, true);

  const repeated = await request("/admin/api/golfcore/import", {
    method: "POST",
    body: JSON.stringify({
      slug: detail.slug,
      name: "Manila Example GC",
      country_code: "PH",
      city: "Makati",
      segments: [
        { name: "North", pars: pars.slice(0, 9) },
        { name: "South", pars: pars.slice(9) },
      ],
      active: true,
    }),
  });
  assert.equal(repeated.status, 200, JSON.stringify(repeated.data));
  assert.equal(repeated.data.course.course_id, created.data.course.course_id);
  assert.equal(repeated.data.course.version, 1);
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM courses")
    .first<{ count: number }>();
  assert.equal(count?.count, 1);
  const history = await request(
    "/admin/api/courses/" + created.data.course.course_id + "/history",
  );
  assert.equal(history.data.changes.length, 1);
  assert.ok(
    history.data.changes.every(
      (change: { action: string }) => change.action === "import",
    ),
  );
});

test("manual catalog edits keep history and inactive courses disappear only from new app selection", async () => {
  const created = await request("/admin/api/courses", {
    method: "POST",
    body: JSON.stringify({
      name: "테스트 골프장",
      country_code: "KR",
      city: "서울",
      segments: [{ name: "동코스", pars: pars.slice(0, 9) }],
      active: true,
    }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.course.course_id;
  const updated = await request("/admin/api/courses/" + id, {
    method: "PUT",
    body: JSON.stringify({
      ...created.data.course,
      city: "인천",
      active: false,
    }),
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.course.active, false);
  assert.equal(updated.data.course.city, "인천");

  const token = randomBytes(32).toString("hex");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const recovery =
    "YMGF" +
    Array.from(
      randomBytes(32),
      (byte) => alphabet[byte % alphabet.length],
    ).join("");
  const registered = await request(
    "/api/users",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({
        nickname: "관리테스트",
        language: "ko",
        device_secret: token,
        recovery_key: recovery,
        client: "native",
      }),
    },
    false,
  );
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const publicSearch = await request(
    "/api/courses?q=테스트",
    { headers: { Authorization: "Bearer " + token } },
    false,
  );
  assert.equal(publicSearch.status, 200);
  assert.equal(publicSearch.data.courses.length, 0);
  const direct = await request(
    "/api/courses/" + id,
    { headers: { Authorization: "Bearer " + token } },
    false,
  );
  assert.equal(direct.status, 404);
  const history = await request("/admin/api/courses/" + id + "/history");
  assert.deepEqual(
    history.data.changes.map((change: { action: string }) => change.action),
    ["deactivate", "create"],
  );
});
