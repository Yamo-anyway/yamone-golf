import { adminPage } from "./course-admin-page";
import { ApiError, body, hash, json, limit, now, type Env } from "./shared";

type Segment = { name: string; pars: number[] };
type CatalogCourse = {
  course_id: string;
  name: string;
  region: string;
  country_code: string;
  city: string;
  segments_json: string;
  version: number;
  source_name: string | null;
  source_url: string | null;
  source_external_id: string | null;
  source_retrieved_at: number | null;
  active: number;
  managed_by_admin: number;
  created_at: number;
  updated_at: number;
};
type GolfCoreObject = Record<string, unknown>;
type AdminInput = {
  name: string;
  country_code: "KR" | "PH";
  city: string;
  segments: Segment[];
  active: boolean;
};

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000009";
const GOLFCORE_BASE = "https://api.golfcore.org/v1";
const GOLFCORE_AGENT =
  "YamoneGolf/0.3.12 (course-admin; contact: support@golf.yamone.net)";

function safeText(value: unknown, max: number, optional = false) {
  if (typeof value !== "string") throw new ApiError("invalid_course");
  const result = value.trim().normalize("NFC");
  if (
    (!optional && !result) ||
    Array.from(result).length > max ||
    /[\u0000-\u001f\u007f]/.test(result)
  )
    throw new ApiError("invalid_course");
  return result;
}

function adminInput(value: Record<string, unknown>): AdminInput {
  const country = safeText(value.country_code, 2).toUpperCase();
  if (country !== "KR" && country !== "PH")
    throw new ApiError("invalid_country");
  if (
    !Array.isArray(value.segments) ||
    value.segments.length < 1 ||
    value.segments.length > 9
  )
    throw new ApiError("invalid_course");
  const segments = value.segments.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new ApiError("invalid_course");
    const segment = item as Record<string, unknown>;
    if (
      !Array.isArray(segment.pars) ||
      segment.pars.length !== 9 ||
      segment.pars.some(
        (par) => !Number.isInteger(par) || Number(par) < 3 || Number(par) > 7,
      )
    )
      throw new ApiError("invalid_course");
    return {
      name: safeText(segment.name, 30),
      pars: segment.pars.map(Number),
    };
  });
  if (new Set(segments.map((segment) => segment.name)).size !== segments.length)
    throw new ApiError("duplicate_segment");
  return {
    name: safeText(value.name, 80),
    country_code: country,
    city: safeText(value.city ?? "", 80, true),
    segments,
    active: value.active !== false,
  };
}

function view(course: CatalogCourse) {
  return {
    course_id: course.course_id,
    name: course.name,
    region: course.region,
    country_code: course.country_code,
    city: course.city,
    segments: JSON.parse(course.segments_json) as Segment[],
    version: course.version,
    source_name: course.source_name,
    source_url: course.source_url,
    source_external_id: course.source_external_id,
    source_retrieved_at: course.source_retrieved_at,
    active: course.active === 1,
    managed_by_admin: course.managed_by_admin === 1,
    created_at: course.created_at,
    updated_at: course.updated_at,
  };
}

async function getCatalogCourse(env: Env, id: string) {
  const course = await env.DB.prepare("SELECT * FROM courses WHERE course_id=?")
    .bind(id)
    .first<CatalogCourse>();
  if (!course) throw new ApiError("course_not_found", 404);
  return course;
}

function uuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new ApiError("invalid_request");
  return value;
}

function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new ApiError("invalid_request");
  return Number(value);
}

async function authenticateAdmin(request: Request, env: Env) {
  const configured = env.COURSE_ADMIN_TOKEN;
  if (!configured || configured.length < 32)
    throw new ApiError("admin_not_configured", 503);
  const authorization = request.headers.get("Authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const [expectedHash, suppliedHash] = await Promise.all([
    hash(configured),
    hash(supplied),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index++)
    difference |=
      expectedHash.charCodeAt(index) ^ suppliedHash.charCodeAt(index);
  if (!supplied || difference !== 0) throw new ApiError("unauthorized", 401);
}

async function ensureAdminOwner(env: Env) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users(user_id,nickname,personal_code,language,recovery_hash,created_at,updated_at)
     VALUES(?,?,?,'en',?,0,0)`,
  )
    .bind(ADMIN_USER_ID, "Course Admin", "!COURSE-CATALOG!", "0".repeat(64))
    .run();
}

async function guardedAdminUpdate(
  env: Env,
  id: string,
  version: number,
  statements: D1PreparedStatement[],
) {
  const guard = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mutation_guards(guard_id,valid)
           VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM courses WHERE course_id=? AND version=?) THEN 1 ELSE 0 END)`,
      ).bind(guard, id, version),
      ...statements,
      env.DB.prepare("DELETE FROM mutation_guards WHERE guard_id=?").bind(
        guard,
      ),
    ]);
  } catch (error) {
    if (/CHECK|UNIQUE|FOREIGN KEY/.test(String(error)))
      throw new ApiError("course_changed", 409);
    throw error;
  }
}

function golfCoreRequest(env: Env, path: string) {
  const request = new Request(GOLFCORE_BASE + path, {
    headers: { Accept: "application/json", "User-Agent": GOLFCORE_AGENT },
    signal: AbortSignal.timeout(8_000),
  });
  return env.GOLFCORE_API ? env.GOLFCORE_API.fetch(request) : fetch(request);
}

function object(value: unknown): GolfCoreObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as GolfCoreObject)
    : null;
}

function sourceUrl(slug: string) {
  return `https://www.golfcore.org/courses/${slug}/`;
}

function scorecard(value: unknown) {
  if (!Array.isArray(value)) return null;
  const holes = value
    .map(object)
    .filter((hole): hole is GolfCoreObject => !!hole)
    .map((hole) => ({ position: Number(hole.position), par: Number(hole.par) }))
    .filter(
      (hole) =>
        Number.isInteger(hole.position) &&
        Number.isInteger(hole.par) &&
        hole.par >= 3 &&
        hole.par <= 7,
    )
    .sort((a, b) => a.position - b.position);
  const length = holes.length;
  if (length !== 9 && length !== 18) return null;
  if (holes.some((hole, index) => hole.position !== index + 1)) return null;
  return holes.map((hole) => hole.par);
}

function trimSegmentName(value: string) {
  return Array.from(value.trim().normalize("NFC")).slice(0, 30).join("");
}

function layoutNames(name: unknown, count: number) {
  const cleaned = typeof name === "string" ? name.trim() : "";
  if (count === 1) return [trimSegmentName(cleaned || "COURSE")];
  const split = cleaned.split(/\s*(?:\+|\/|&|,)\s*/).filter(Boolean);
  if (split.length === 2) return split.map(trimSegmentName);
  if (!cleaned) return ["OUT", "IN"];
  return [trimSegmentName(cleaned + " OUT"), trimSegmentName(cleaned + " IN")];
}

export function normalizeGolfCoreCourse(value: unknown) {
  const course = object(value);
  if (!course) throw new ApiError("golfcore_invalid_response", 502);
  const slug = safeText(course.slug, 120);
  if (!/^[a-z0-9-]{1,120}$/.test(slug))
    throw new ApiError("golfcore_invalid_response", 502);
  const country =
    typeof course.country === "string" ? course.country.toUpperCase() : "";
  if (country !== "KR" && country !== "PH")
    throw new ApiError("unsupported_country");
  const warnings: string[] = [];
  const segments: Segment[] = [];
  const signatures = new Set<string>();
  const names = new Map<string, number>();
  const layouts = Array.isArray(course.layouts) ? course.layouts : [];
  for (const rawLayout of layouts) {
    const layout = object(rawLayout);
    if (!layout) continue;
    let pars = scorecard(layout.holes);
    if (!pars && Array.isArray(layout.tees)) {
      for (const rawTee of layout.tees) {
        const tee = object(rawTee);
        pars = tee ? scorecard(tee.holes) : null;
        if (pars) break;
      }
    }
    if (!pars) {
      warnings.push("완전한 9홀 또는 18홀 PAR가 없는 레이아웃은 제외했습니다.");
      continue;
    }
    const count = pars.length / 9;
    const candidateNames = layoutNames(layout.name, count);
    for (let index = 0; index < count; index++) {
      const nine = pars.slice(index * 9, index * 9 + 9);
      let name = candidateNames[index];
      const signature = name.toLocaleLowerCase("en") + ":" + nine.join(",");
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      const key = name.toLocaleLowerCase("en");
      const used = names.get(key) ?? 0;
      names.set(key, used + 1);
      if (used) name = trimSegmentName(`${name} ${used + 1}`);
      segments.push({ name, pars: nine });
      if (segments.length === 9) break;
    }
    if (segments.length === 9) break;
  }
  if (!segments.length)
    throw new ApiError("golfcore_scorecard_unavailable", 422);
  if (layouts.length && segments.length === 9)
    warnings.push("앱 제한에 맞춰 9홀 코스 9개까지만 가져왔습니다.");
  return {
    slug,
    name: safeText(course.name, 80),
    country_code: country as "KR" | "PH",
    city: safeText(course.city ?? "", 80, true),
    segments,
    source_name: "golfcore",
    source_url: sourceUrl(slug),
    warnings: [...new Set(warnings)],
  };
}

async function golfCoreDetail(env: Env, slug: string) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) throw new ApiError("invalid_request");
  let response: Response;
  try {
    response = await golfCoreRequest(
      env,
      "/courses/" + encodeURIComponent(slug),
    );
  } catch {
    throw new ApiError("golfcore_unavailable", 502);
  }
  if (response.status === 404) throw new ApiError("golfcore_not_found", 404);
  if (!response.ok) throw new ApiError("golfcore_unavailable", 502);
  return normalizeGolfCoreCourse(await response.json());
}

async function searchGolfCore(env: Env, url: URL) {
  const country = (url.searchParams.get("country") ?? "").toLowerCase();
  if (country !== "kr" && country !== "ph")
    throw new ApiError("invalid_country");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
    throw new ApiError("invalid_request");
  const params = new URLSearchParams({
    country,
    coverage: "scorecard",
    limit: "50",
    offset: String(offset),
  });
  if (q) params.set("q", q);
  let response: Response;
  try {
    response = await golfCoreRequest(env, "/courses?" + params.toString());
  } catch {
    throw new ApiError("golfcore_unavailable", 502);
  }
  if (!response.ok) throw new ApiError("golfcore_unavailable", 502);
  const payload = object(await response.json());
  if (!payload || !Array.isArray(payload.courses))
    throw new ApiError("golfcore_invalid_response", 502);
  const results = payload.courses
    .map(object)
    .filter((course): course is GolfCoreObject => !!course)
    .filter(
      (course) =>
        typeof course.slug === "string" &&
        /^[a-z0-9-]{1,120}$/.test(course.slug) &&
        typeof course.name === "string",
    )
    .slice(0, 50)
    .map((course) => ({
      slug: course.slug,
      name: safeText(course.name, 120),
      city: typeof course.city === "string" ? course.city.slice(0, 80) : "",
      region:
        typeof course.region === "string" ? course.region.slice(0, 80) : "",
      country: country.toUpperCase(),
      hole_count:
        Number.isInteger(course.hole_count) && Number(course.hole_count) > 0
          ? Number(course.hole_count)
          : null,
      source_url: sourceUrl(String(course.slug)),
    }));
  const slugs = results.map((course) => course.slug);
  const existing = new Map<string, string>();
  if (slugs.length) {
    const placeholders = slugs.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT source_external_id,course_id FROM courses WHERE source_name='golfcore' AND source_external_id IN (${placeholders})`,
    )
      .bind(...slugs)
      .all<{ source_external_id: string; course_id: string }>();
    rows.results.forEach((row) =>
      existing.set(row.source_external_id, row.course_id),
    );
  }
  const total = Number(payload.total);
  return json({
    courses: results.map((course) => ({
      ...course,
      existing_course_id: existing.get(String(course.slug)) ?? null,
    })),
    total: Number.isSafeInteger(total) && total >= 0 ? total : results.length,
    next_offset: results.length === 50 ? offset + 50 : null,
  });
}

async function createManual(request: Request, env: Env) {
  const payload = await body(request);
  const input = adminInput(payload);
  const id =
    payload.course_id === undefined
      ? crypto.randomUUID()
      : uuid(payload.course_id);
  const time = now();
  await ensureAdminOwner(env);
  const after = {
    course_id: id,
    ...input,
    source_name: null,
    source_url: null,
    source_external_id: null,
    version: 1,
  };
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO courses(course_id,name,region,country_code,city,segments_json,version,created_by,created_at,updated_at,active,managed_by_admin)
           VALUES(?,?,?,?,?,?,1,?,?,?,?,1)`,
      ).bind(
        id,
        input.name,
        input.city,
        input.country_code,
        input.city,
        JSON.stringify(input.segments),
        ADMIN_USER_ID,
        time,
        time,
        input.active ? 1 : 0,
      ),
      env.DB.prepare(
        "INSERT INTO course_admin_changes(change_id,course_id,action,before_json,after_json,created_at) VALUES(?,?,'create',NULL,?,?)",
      ).bind(crypto.randomUUID(), id, JSON.stringify(after), time),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE"))
      throw new ApiError("course_exists", 409);
    throw error;
  }
  return json({ course: view(await getCatalogCourse(env, id)) }, 201);
}

async function importGolfCore(request: Request, env: Env) {
  const payload = await body(request);
  const slug = safeText(payload.slug, 120);
  const source = await golfCoreDetail(env, slug);
  const input = adminInput({
    name: payload.name ?? source.name,
    country_code: payload.country_code ?? source.country_code,
    city: payload.city ?? source.city,
    segments: payload.segments ?? source.segments,
    active: payload.active,
  });
  if (input.country_code !== source.country_code)
    throw new ApiError("source_country_mismatch");
  const existing = await env.DB.prepare(
    "SELECT * FROM courses WHERE source_name='golfcore' AND source_external_id=?",
  )
    .bind(slug)
    .first<CatalogCourse>();
  const time = now();
  await ensureAdminOwner(env);
  if (existing) {
    const unchanged =
      existing.name === input.name &&
      existing.country_code === input.country_code &&
      existing.city === input.city &&
      existing.segments_json === JSON.stringify(input.segments) &&
      existing.active === (input.active ? 1 : 0) &&
      existing.source_url === source.source_url;
    if (payload.version === undefined) {
      if (unchanged) return json({ course: view(existing) });
      throw new ApiError("course_changed", 409);
    }
    const expectedVersion = revision(payload.version);
    const before = view(existing);
    const after = {
      ...before,
      ...input,
      region: input.city,
      source_name: "golfcore",
      source_url: source.source_url,
      source_external_id: slug,
      source_retrieved_at: time,
      version: expectedVersion + 1,
      updated_at: time,
    };
    await guardedAdminUpdate(env, existing.course_id, expectedVersion, [
      env.DB.prepare(
        `UPDATE courses SET name=?,region=?,country_code=?,city=?,segments_json=?,source_url=?,source_retrieved_at=?,active=?,managed_by_admin=1,version=version+1,updated_at=? WHERE course_id=?`,
      ).bind(
        input.name,
        input.city,
        input.country_code,
        input.city,
        JSON.stringify(input.segments),
        source.source_url,
        time,
        input.active ? 1 : 0,
        time,
        existing.course_id,
      ),
      env.DB.prepare(
        "INSERT INTO course_admin_changes(change_id,course_id,action,before_json,after_json,created_at) VALUES(?,?,'import',?,?,?)",
      ).bind(
        crypto.randomUUID(),
        existing.course_id,
        JSON.stringify(before),
        JSON.stringify(after),
        time,
      ),
    ]);
    return json({
      course: view(await getCatalogCourse(env, existing.course_id)),
    });
  }
  const id = crypto.randomUUID();
  const after = {
    course_id: id,
    ...input,
    region: input.city,
    source_name: "golfcore",
    source_url: source.source_url,
    source_external_id: slug,
    source_retrieved_at: time,
    version: 1,
  };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO courses(course_id,name,region,country_code,city,segments_json,version,created_by,created_at,updated_at,source_name,source_url,source_external_id,source_retrieved_at,active,managed_by_admin)
         VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,1)`,
    ).bind(
      id,
      input.name,
      input.city,
      input.country_code,
      input.city,
      JSON.stringify(input.segments),
      ADMIN_USER_ID,
      time,
      time,
      "golfcore",
      source.source_url,
      slug,
      time,
      input.active ? 1 : 0,
    ),
    env.DB.prepare(
      "INSERT INTO course_admin_changes(change_id,course_id,action,before_json,after_json,created_at) VALUES(?,?,'import',NULL,?,?)",
    ).bind(crypto.randomUUID(), id, JSON.stringify(after), time),
  ]);
  return json({ course: view(await getCatalogCourse(env, id)) }, 201);
}

async function updateManual(request: Request, env: Env, id: string) {
  const payload = await body(request);
  const input = adminInput(payload);
  const version = revision(payload.version);
  const beforeRow = await getCatalogCourse(env, id);
  const before = view(beforeRow);
  const time = now();
  const action =
    beforeRow.active === 1 && !input.active
      ? "deactivate"
      : beforeRow.active === 0 && input.active
        ? "reactivate"
        : "update";
  const after = {
    ...before,
    ...input,
    region: input.city,
    version: version + 1,
    updated_at: time,
  };
  await guardedAdminUpdate(env, id, version, [
    env.DB.prepare(
      `UPDATE courses SET name=?,region=?,country_code=?,city=?,segments_json=?,active=?,managed_by_admin=1,version=version+1,updated_at=? WHERE course_id=?`,
    ).bind(
      input.name,
      input.city,
      input.country_code,
      input.city,
      JSON.stringify(input.segments),
      input.active ? 1 : 0,
      time,
      id,
    ),
    env.DB.prepare(
      "INSERT INTO course_admin_changes(change_id,course_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      id,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
      time,
    ),
  ]);
  return json({ course: view(await getCatalogCourse(env, id)) });
}

export async function courseAdminRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/admin" && request.method === "GET") return adminPage();
  if (!path.startsWith("/admin/api")) return null;
  await authenticateAdmin(request, env);
  await limit(request, env, "course-admin", 240, 60_000);
  if (path === "/admin/api/session" && request.method === "GET")
    return json({ ok: true });
  if (path === "/admin/api/golfcore/search" && request.method === "GET")
    return searchGolfCore(env, url);
  const detailMatch = path.match(
    /^\/admin\/api\/golfcore\/courses\/([a-z0-9-]{1,120})$/,
  );
  if (detailMatch && request.method === "GET")
    return json({ course: await golfCoreDetail(env, detailMatch[1]) });
  if (path === "/admin/api/golfcore/import" && request.method === "POST")
    return importGolfCore(request, env);
  if (path === "/admin/api/courses" && request.method === "POST")
    return createManual(request, env);
  if (path === "/admin/api/courses" && request.method === "GET") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 80);
    const country = (url.searchParams.get("country") ?? "").toUpperCase();
    const status = url.searchParams.get("status") ?? "all";
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (
      (country && country !== "KR" && country !== "PH") ||
      !["all", "active", "inactive"].includes(status) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100_000
    )
      throw new ApiError("invalid_request");
    const rows = await env.DB.prepare(
      `SELECT * FROM courses
       WHERE instr(lower(name||' '||city||' '||region),lower(?))>0
       AND (?='' OR country_code=?)
       AND (?='all' OR active=CASE WHEN ?='active' THEN 1 ELSE 0 END)
       ORDER BY active DESC,country_code,city,name,course_id LIMIT 51 OFFSET ?`,
    )
      .bind(q, country, country, status, status, offset)
      .all<CatalogCourse>();
    return json({
      courses: rows.results.slice(0, 50).map(view),
      next_offset: rows.results.length > 50 ? offset + 50 : null,
    });
  }
  const match = path.match(
    /^\/admin\/api\/courses\/([a-f0-9-]{36})(?:\/(history))?$/i,
  );
  if (match) {
    const id = uuid(match[1]);
    if (match[2] === "history" && request.method === "GET") {
      await getCatalogCourse(env, id);
      const rows = await env.DB.prepare(
        "SELECT change_id,action,before_json,after_json,created_at FROM course_admin_changes WHERE course_id=? ORDER BY created_at DESC,change_id DESC LIMIT 100",
      )
        .bind(id)
        .all<{
          change_id: string;
          action: string;
          before_json: string | null;
          after_json: string;
          created_at: number;
        }>();
      return json({
        changes: rows.results.map((row) => ({
          change_id: row.change_id,
          action: row.action,
          before: row.before_json ? JSON.parse(row.before_json) : null,
          after: JSON.parse(row.after_json),
          created_at: row.created_at,
        })),
      });
    }
    if (!match[2] && request.method === "GET")
      return json({ course: view(await getCatalogCourse(env, id)) });
    if (!match[2] && request.method === "PUT")
      return updateManual(request, env, id);
  }
  throw new ApiError("not_found", 404);
}
