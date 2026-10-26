// Recovered without behavioral changes from admin 0.3.22; see docs/SOURCE_INTEGRATION_20261026.md.
import { ApiError, hash, now, json, body, authenticate, limit } from "./shared";
import { ADMIN_COUNTRIES, isAdminCountryCode } from "../../shared/countries";
import { validateLocalization, REGION_GROUPS_BY_COUNTRY, presentCourse, regionGroupSQL, localizationFor, viewerRegion } from "./course-presentation.js";
import { golfCoreSourceUrl, fetchGolfCoreDetail, fetchGolfCorePage, golfCoreSyncStatus, syncNextGolfCoreCatalogPage } from "./golfcore-sync.recovered.js";
import { adminPage } from "./course-admin-page.recovered.js";
const __name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });

var ADMIN_USER_ID = "00000000-0000-4000-8000-000000000009";
var REQUEST_CATEGORIES = /* @__PURE__ */ new Set([
  "course_name",
  "address",
  "region_city",
  "contact",
  "website",
  "segment_name",
  "hole_par",
  "segment_add",
  "segment_delete",
  "duplicate_merge",
  "operating_status",
  "other"
]);
var REQUEST_STATUSES = /* @__PURE__ */ new Set([
  "pending",
  "processing",
  "completed",
  "on_hold",
  "rejected"
]);
function safeText(value, max, optional = false) {
  if (typeof value !== "string") throw new ApiError("invalid_course");
  const result = value.trim().normalize("NFC");
  if (!optional && !result || Array.from(result).length > max || /[\u0000-\u001f\u007f]/.test(result))
    throw new ApiError("invalid_course");
  return result;
}
__name(safeText, "safeText");
function optionalText2(value, max) {
  if (value === null || value === void 0 || value === "") return null;
  return safeText(value, max, true) || null;
}
__name(optionalText2, "optionalText");
function coordinate(value, min, max) {
  if (value === null || value === void 0 || value === "") return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max)
    throw new ApiError("invalid_course");
  return result;
}
__name(coordinate, "coordinate");
function adminInput(value) {
  let localized;
  try { localized = value.localization === undefined ? null : validateLocalization(value.localization); }
  catch { throw new ApiError("invalid_localization"); }
  const group = value.region_group === undefined ? null : value.region_group;
  const country = safeText(value.country_code, 2).toUpperCase();
  if (!isAdminCountryCode(country)) throw new ApiError("invalid_country");
  if (group !== null && (typeof group !== "string" || (group && !(REGION_GROUPS_BY_COUNTRY[country] || []).includes(group)))) throw new ApiError("invalid_region_group");
  if (!Array.isArray(value.segments) || (value.segments.length < 1 && value.active !== false) || value.segments.length > 9)
    throw new ApiError("invalid_course");
  const segments = value.segments.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new ApiError("invalid_course");
    const segment = item;
    if (!Array.isArray(segment.pars) || segment.pars.length !== 9 || segment.pars.some(
      (par) => !Number.isInteger(par) || Number(par) < 3 || Number(par) > 7
    ))
      throw new ApiError("invalid_course");
    return {
      name: safeText(segment.name, 30),
      pars: segment.pars.map(Number)
    };
  });
  if (new Set(segments.map((segment) => segment.name)).size !== segments.length)
    throw new ApiError("duplicate_segment");
  return {
    localized_json: localized,
    region_group: group,
    name: safeText(value.name, 80),
    country_code: country,
    region: safeText(value.region ?? value.city ?? "", 120, true),
    city: safeText(value.city ?? "", 80, true),
    address: safeText(value.address ?? "", 300, true),
    phone: optionalText2(value.phone, 80),
    website: optionalText2(value.website, 500),
    latitude: coordinate(value.latitude, -90, 90),
    longitude: coordinate(value.longitude, -180, 180),
    segments,
    active: value.active !== false
  };
}
__name(adminInput, "adminInput");
function view2(course, viewer = "KR") {
  return {
    ...presentCourse(course, viewer),
    course_id: course.course_id,
    name: course.name,
    region: course.region,
    country_code: course.country_code,
    city: course.city,
    segments: JSON.parse(course.segments_json),
    version: course.version,
    source_name: course.source_name,
    source_url: course.source_url,
    source_external_id: course.source_external_id,
    source_retrieved_at: course.source_retrieved_at,
    source_hash: course.source_hash,
    address: course.address,
    phone: course.phone,
    website: course.website,
    latitude: course.latitude,
    longitude: course.longitude,
    active: course.active === 1,
    managed_by_admin: course.managed_by_admin === 1,
    round_count: Number(course.round_count ?? 0),
    open_request_count: Number(course.open_request_count ?? 0),
    created_at: course.created_at,
    updated_at: course.updated_at
  };
}
__name(view2, "view");
async function getCatalogCourse(env, id) {
  const course = await env.DB.prepare("SELECT * FROM courses WHERE course_id=?").bind(id).first();
  if (!course) throw new ApiError("course_not_found", 404);
  const counts = await safeCourseOperationalCounts(env, [id]);
  course.round_count = counts.rounds.get(id) ?? 0;
  course.open_request_count = counts.requests.get(id) ?? 0;
  return course;
}
__name(getCatalogCourse, "getCatalogCourse");
async function safeCourseOperationalCounts(env, ids) {
  const rounds = new Map();
  const requests = new Map();
  if (!ids.length) return { rounds, requests };
  const placeholders = ids.map(() => "?").join(",");
  const [roundResult, requestResult] = await Promise.allSettled([
    env.DB.prepare(
      `SELECT json_extract(course_snapshot,'$.course_id') AS course_id,COUNT(*) AS count
       FROM rounds WHERE json_extract(course_snapshot,'$.course_id') IN (${placeholders}) GROUP BY course_id`
    ).bind(...ids).all(),
    env.DB.prepare(
      `SELECT course_id,COUNT(*) AS count FROM course_requests
       WHERE course_id IN (${placeholders}) AND status IN ('pending','processing','on_hold') GROUP BY course_id`
    ).bind(...ids).all()
  ]);
  if (roundResult.status === "fulfilled")
    for (const row of roundResult.value.results) rounds.set(row.course_id, Number(row.count ?? 0));
  if (requestResult.status === "fulfilled")
    for (const row of requestResult.value.results) requests.set(row.course_id, Number(row.count ?? 0));
  return { rounds, requests };
}
__name(safeCourseOperationalCounts, "safeCourseOperationalCounts");
function jsonValue(value) {
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value !== "object") throw new ApiError("invalid_request");
  const serialized = JSON.stringify(value);
  if (serialized.length > 2e4) throw new ApiError("invalid_request");
  return serialized;
}
__name(jsonValue, "jsonValue");
function requestCategory(value) {
  const result = safeText(value, 40);
  if (!REQUEST_CATEGORIES.has(result)) throw new ApiError("invalid_request");
  return result;
}
__name(requestCategory, "requestCategory");
function requestStatus(value) {
  const result = safeText(value, 20);
  if (!REQUEST_STATUSES.has(result)) throw new ApiError("invalid_request");
  return result;
}
__name(requestStatus, "requestStatus");
function catalogReviewStatus(row) {
  if (!row.existing_course_id) return "new";
  return row.existing_source_hash === row.source_hash ? "applied" : "update";
}
__name(catalogReviewStatus, "catalogReviewStatus");
function requestView(row) {
  return {
    ...row,
    requested_value: row.requested_value_json ? JSON.parse(row.requested_value_json) : null,
    resolution: row.resolution_json ? JSON.parse(row.resolution_json) : null,
    requested_value_json: void 0,
    resolution_json: void 0
  };
}
__name(requestView, "requestView");
function uuid(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    value
  ))
    throw new ApiError("invalid_request");
  return value;
}
__name(uuid, "uuid");
function revision2(value) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new ApiError("invalid_request");
  return Number(value);
}
__name(revision2, "revision");
async function authenticateAdmin(request, env) {
  const configured = env.COURSE_ADMIN_TOKEN;
  if (!configured || configured.length < 32)
    throw new ApiError("admin_not_configured", 503);
  const authorization = request.headers.get("Authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const [expectedHash, suppliedHash] = await Promise.all([
    hash(configured),
    hash(supplied)
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index++)
    difference |= expectedHash.charCodeAt(index) ^ suppliedHash.charCodeAt(index);
  if (!supplied || difference !== 0) throw new ApiError("unauthorized", 401);
}
__name(authenticateAdmin, "authenticateAdmin");
async function ensureAdminOwner(env) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users(user_id,nickname,personal_code,language,recovery_hash,created_at,updated_at)
     VALUES(?,?,?,'en',?,0,0)`
  ).bind(ADMIN_USER_ID, "Course Admin", "!COURSE-CATALOG!", "0".repeat(64)).run();
}
__name(ensureAdminOwner, "ensureAdminOwner");
async function guardedAdminUpdate(env, id, version, statements) {
  const guard = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mutation_guards(guard_id,valid)
           VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM courses WHERE course_id=? AND version=?) THEN 1 ELSE 0 END)`
      ).bind(guard, id, version),
      ...statements,
      env.DB.prepare("DELETE FROM mutation_guards WHERE guard_id=?").bind(
        guard
      )
    ]);
  } catch (error) {
    if (/CHECK|UNIQUE|FOREIGN KEY/.test(String(error)))
      throw new ApiError("course_changed", 409);
    throw error;
  }
}
__name(guardedAdminUpdate, "guardedAdminUpdate");
function object3(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
__name(object3, "object");
function scorecard(value) {
  if (!Array.isArray(value)) return null;
  const holes = value.map(object3).filter((hole) => !!hole).map((hole) => ({ position: Number(hole.position), par: Number(hole.par) })).filter(
    (hole) => Number.isInteger(hole.position) && Number.isInteger(hole.par) && hole.par >= 3 && hole.par <= 7
  ).sort((a, b) => a.position - b.position);
  const length = holes.length;
  if (length !== 9 && length !== 18) return null;
  if (holes.some((hole, index) => hole.position !== index + 1)) return null;
  return holes.map((hole) => hole.par);
}
__name(scorecard, "scorecard");
function trimSegmentName(value) {
  return Array.from(value.trim().normalize("NFC")).slice(0, 30).join("");
}
__name(trimSegmentName, "trimSegmentName");
function layoutNames(name, count) {
  const cleaned = typeof name === "string" ? name.trim() : "";
  if (count === 1) return [trimSegmentName(cleaned || "COURSE")];
  const split = cleaned.split(/\s*(?:\+|\/|&|,)\s*/).filter(Boolean);
  if (split.length === 2) return split.map(trimSegmentName);
  if (!cleaned) return ["OUT", "IN"];
  return [trimSegmentName(cleaned + " OUT"), trimSegmentName(cleaned + " IN")];
}
__name(layoutNames, "layoutNames");
function normalizeGolfCoreCourse(value) {
  const course = object3(value);
  if (!course) throw new ApiError("golfcore_invalid_response", 502);
  const slug2 = safeText(course.slug, 120);
  if (!/^[a-z0-9-]{1,120}$/.test(slug2))
    throw new ApiError("golfcore_invalid_response", 502);
  const country = typeof course.country === "string" ? course.country.toUpperCase() : "";
  if (!isAdminCountryCode(country)) throw new ApiError("unsupported_country");
  const warnings = [];
  const segments = [];
  const signatures = /* @__PURE__ */ new Set();
  const names = /* @__PURE__ */ new Map();
  const layouts = Array.isArray(course.layouts) ? course.layouts : [];
  for (const rawLayout of layouts) {
    const layout = object3(rawLayout);
    if (!layout) continue;
    let pars = scorecard(layout.holes);
    if (!pars && Array.isArray(layout.tees)) {
      for (const rawTee of layout.tees) {
        const tee = object3(rawTee);
        pars = tee ? scorecard(tee.holes) : null;
        if (pars) break;
      }
    }
    if (!pars) {
      warnings.push("\uC644\uC804\uD55C 9\uD640 \uB610\uB294 18\uD640 PAR\uAC00 \uC5C6\uB294 \uB808\uC774\uC544\uC6C3\uC740 \uC81C\uC678\uD588\uC2B5\uB2C8\uB2E4.");
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
    warnings.push("\uC571 \uC81C\uD55C\uC5D0 \uB9DE\uCDB0 9\uD640 \uCF54\uC2A4 9\uAC1C\uAE4C\uC9C0\uB9CC \uAC00\uC838\uC654\uC2B5\uB2C8\uB2E4.");
  return {
    slug: slug2,
    name: safeText(course.name, 80),
    country_code: country,
    region: safeText(course.region ?? "", 120, true),
    city: safeText(course.city ?? "", 80, true),
    address: safeText(course.address ?? "", 300, true),
    phone: optionalText2(course.phone, 80),
    website: optionalText2(course.website, 500),
    latitude: coordinate(course.lat, -90, 90),
    longitude: coordinate(course.lng, -180, 180),
    segments,
    source_name: "golfcore",
    source_url: golfCoreSourceUrl(slug2),
    warnings: [...new Set(warnings)]
  };
}
__name(normalizeGolfCoreCourse, "normalizeGolfCoreCourse");
async function golfCoreDetail(env, slug2) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug2)) throw new ApiError("invalid_request");
  return normalizeGolfCoreCourse(await fetchGolfCoreDetail(env, slug2));
}
__name(golfCoreDetail, "golfCoreDetail");
async function golfCoreImportSource(env, slug2) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug2)) throw new ApiError("invalid_request");
  const stored = await env.DB.prepare(
    "SELECT source_payload_json,source_hash,source_retrieved_at,detail_state FROM golfcore_catalog_courses WHERE slug=?"
  ).bind(slug2).first();
  if (stored?.detail_state === "full") {
    try {
      return {
        course: normalizeGolfCoreCourse(JSON.parse(stored.source_payload_json)),
        sourceHash: stored.source_hash,
        sourceRetrievedAt: stored.source_retrieved_at
      };
    } catch {
    }
  }
  const raw = await fetchGolfCoreDetail(env, slug2);
  const serialized = JSON.stringify(raw);
  return {
    course: normalizeGolfCoreCourse(raw),
    sourceHash: await hash(serialized),
    sourceRetrievedAt: now()
  };
}
__name(golfCoreImportSource, "golfCoreImportSource");
async function searchGolfCore(env, url) {
  const country = (url.searchParams.get("country") ?? "").toLowerCase();
  if (!isAdminCountryCode(country)) throw new ApiError("invalid_country");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1e5)
    throw new ApiError("invalid_request");
  const payload = await fetchGolfCorePage(env, country, offset, {
    query: q,
    scorecardsOnly: true,
    limit: 50
  });
  const results = payload.courses.map((course) => ({
    slug: course.slug,
    name: safeText(course.name, 120),
    city: typeof course.city === "string" ? course.city.slice(0, 80) : "",
    region: typeof course.region === "string" ? course.region.slice(0, 80) : "",
    country: country.toUpperCase(),
    hole_count: Number.isInteger(course.hole_count) && Number(course.hole_count) > 0 ? Number(course.hole_count) : null,
    source_url: golfCoreSourceUrl(String(course.slug))
  }));
  const slugs = results.map((course) => course.slug);
  const existing = /* @__PURE__ */ new Map();
  if (slugs.length) {
    const placeholders = slugs.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT source_external_id,course_id FROM courses WHERE source_name='golfcore' AND source_external_id IN (${placeholders})`
    ).bind(...slugs).all();
    rows.results.forEach(
      (row) => existing.set(row.source_external_id, row.course_id)
    );
  }
  const total = Number(payload.total);
  return json({
    courses: results.map((course) => ({
      ...course,
      existing_course_id: existing.get(String(course.slug)) ?? null
    })),
    total: Number.isSafeInteger(total) && total >= 0 ? total : results.length,
    next_offset: results.length === 50 ? offset + 50 : null
  });
}
__name(searchGolfCore, "searchGolfCore");
async function adminOverview(env) {
  const [counts, sync, requests, requestsByCountry, reviewsByCountry, settings] = await Promise.all([
    env.DB.prepare(
      `SELECT country_code,
         SUM(CASE WHEN managed_by_admin=1 THEN 1 ELSE 0 END) AS public_count,
         SUM(CASE WHEN managed_by_admin=0 THEN 1 ELSE 0 END) AS private_count,
         SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active_count
       FROM courses c WHERE country_code<>''
         AND NOT EXISTS(SELECT 1 FROM course_deleted_items d WHERE d.course_id=c.course_id)
       GROUP BY country_code`
    ).all(),
    golfCoreSyncStatus(env),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM course_requests WHERE status IN ('pending','processing','on_hold')"
    ).first(),
    env.DB.prepare(
      `SELECT c.country_code,COUNT(*) AS count
       FROM course_requests r JOIN courses c ON c.course_id=r.course_id
       WHERE r.status IN ('pending','processing','on_hold')
         AND NOT EXISTS(SELECT 1 FROM course_deleted_items d WHERE d.course_id=c.course_id)
       GROUP BY c.country_code`
    ).all(),
    env.DB.prepare(
      `SELECT g.country_code,
         SUM(CASE WHEN c.course_id IS NULL THEN 1 ELSE 0 END) AS new_count,
         SUM(CASE WHEN c.course_id IS NOT NULL AND COALESCE(c.source_hash,'')<>g.source_hash THEN 1 ELSE 0 END) AS update_count,
         SUM(CASE WHEN c.course_id IS NOT NULL AND COALESCE(c.source_hash,'')=g.source_hash THEN 1 ELSE 0 END) AS applied_count
       FROM golfcore_catalog_courses g
       LEFT JOIN courses c ON c.source_name='golfcore' AND c.source_external_id=g.slug
         AND NOT EXISTS(SELECT 1 FROM course_deleted_items d WHERE d.course_id=c.course_id)
       GROUP BY g.country_code`
    ).all(),
    env.DB.prepare("SELECT country_code,enabled,locked,updated_at FROM country_course_settings").all()
  ]);
  const countMap = new Map(counts.results.map((row) => [row.country_code, row]));
  const syncMap = new Map(sync.map((row) => [row.code, row]));
  const requestMap = new Map(
    requestsByCountry.results.map((row) => [row.country_code, row.count])
  );
  const reviewMap = new Map(
    reviewsByCountry.results.map((row) => [row.country_code, row])
  );
  const settingMap = new Map(
    settings.results.map((row) => [row.country_code, row])
  );
  const countries = ADMIN_COUNTRIES.map((country) => {
    const count = countMap.get(country.code);
    const review = reviewMap.get(country.code);
    return {
      ...country,
      public_count: Number(count?.public_count ?? 0),
      private_count: Number(count?.private_count ?? 0),
      active_count: Number(count?.active_count ?? 0),
      enabled: settingMap.get(country.code)?.enabled !== 0,
      locked: settingMap.get(country.code)?.locked !== 0,
      open_request_count: Number(requestMap.get(country.code) ?? 0),
      catalog_new_count: Number(review?.new_count ?? 0),
      catalog_update_count: Number(review?.update_count ?? 0),
      catalog_applied_count: Number(review?.applied_count ?? 0),
      sync: syncMap.get(country.code)
    };
  });
  return json({
    countries,
    totals: {
      countries: countries.length,
      public_count: countries.reduce((sum, row) => sum + row.public_count, 0),
      private_count: countries.reduce((sum, row) => sum + row.private_count, 0),
      open_requests: Number(requests?.count ?? 0)
    }
  });
}
__name(adminOverview, "adminOverview");
async function updateCountrySetting(request, env, country) {
  if (!isAdminCountryCode(country)) throw new ApiError("invalid_request");
  const payload = await body(request);
  const action = safeText(payload.action, 20);
  const current = await env.DB.prepare(
    "SELECT country_code,enabled,locked,updated_at FROM country_course_settings WHERE country_code=?"
  ).bind(country).first();
  if (!current) throw new ApiError("invalid_request");
  const time = now();
  if (action === "unlock") {
    if (payload.confirmation !== "잠금해제") throw new ApiError("invalid_unlock_phrase", 400);
    await env.DB.prepare("UPDATE country_course_settings SET locked=0,updated_at=? WHERE country_code=?").bind(time, country).run();
  } else if (action === "lock") {
    await env.DB.prepare("UPDATE country_course_settings SET locked=1,updated_at=? WHERE country_code=?").bind(time, country).run();
  } else if (action === "set_enabled") {
    if (current.locked === 1) throw new ApiError("country_locked", 409);
    if (typeof payload.enabled !== "boolean") throw new ApiError("invalid_request");
    await env.DB.prepare("UPDATE country_course_settings SET enabled=?,updated_at=? WHERE country_code=?").bind(payload.enabled ? 1 : 0, time, country).run();
  } else {
    throw new ApiError("invalid_request");
  }
  const updated = await env.DB.prepare(
    "SELECT country_code,enabled,locked,updated_at FROM country_course_settings WHERE country_code=?"
  ).bind(country).first();
  return json({ country: { country_code: updated.country_code, enabled: updated.enabled === 1, locked: updated.locked === 1, updated_at: updated.updated_at } });
}
__name(updateCountrySetting, "updateCountrySetting");

async function deleteAdminCourse(request, env, id) {
  const payload = await body(request);
  if (payload.confirmation !== "골프장 삭제") throw new ApiError("invalid_delete_phrase", 400);
  const course = await getCatalogCourse(env, id);
  const deleted = await env.DB.prepare("SELECT 1 FROM course_deleted_items WHERE course_id=?").bind(id).first();
  if (deleted) throw new ApiError("course_already_deleted", 409);
  const time = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO course_deleted_items(course_id,previous_active,deleted_at) VALUES(?,?,?)").bind(id, course.active, time),
    env.DB.prepare("UPDATE courses SET active=0,version=version+1,updated_at=? WHERE course_id=?").bind(time, id)
  ]);
  return json({ deleted: true, recoverable: true, course_id: id, deleted_at: time });
}
__name(deleteAdminCourse, "deleteAdminCourse");

async function listDeletedAdminCourses(env, url, viewer) {
  const country = (url.searchParams.get("country") ?? "").toUpperCase();
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (country && !isAdminCountryCode(country) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1e5)
    throw new ApiError("invalid_request");
  const [rows, total] = await Promise.all([
    env.DB.prepare(
      `SELECT c.*,d.previous_active,d.deleted_at FROM course_deleted_items d
       JOIN courses c ON c.course_id=d.course_id
       WHERE instr(lower(c.name||' '||c.address||' '||c.localized_json),lower(?))>0
         AND (?='' OR c.country_code=?)
       ORDER BY d.deleted_at DESC,c.course_id LIMIT 11 OFFSET ?`
    ).bind(q, country, country, offset).all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count FROM course_deleted_items d
       JOIN courses c ON c.course_id=d.course_id
       WHERE instr(lower(c.name||' '||c.address||' '||c.localized_json),lower(?))>0
         AND (?='' OR c.country_code=?)`
    ).bind(q, country, country).first()
  ]);
  const pageRows = rows.results.slice(0, 10);
  return json({
    courses: pageRows.map((row) => ({ ...view2(row, viewer), previous_active: row.previous_active === 1, deleted_at: row.deleted_at })),
    total_count: Number(total?.count ?? 0),
    current_page: Math.floor(offset / 10) + 1,
    page_count: Math.max(1, Math.ceil(Number(total?.count ?? 0) / 10)),
    next_offset: rows.results.length > 10 ? offset + 10 : null
  });
}
__name(listDeletedAdminCourses, "listDeletedAdminCourses");

async function restoreAdminCourse(env, id) {
  const deleted = await env.DB.prepare("SELECT previous_active FROM course_deleted_items WHERE course_id=?").bind(id).first();
  if (!deleted) throw new ApiError("course_not_deleted", 404);
  const time = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE courses SET active=?,version=version+1,updated_at=? WHERE course_id=?").bind(deleted.previous_active, time, id),
    env.DB.prepare("DELETE FROM course_deleted_items WHERE course_id=?").bind(id)
  ]);
  return json({ restored: true, course: view2(await getCatalogCourse(env, id)) });
}
__name(restoreAdminCourse, "restoreAdminCourse");

async function listGolfCoreCatalog(env, url) {
  const country = (url.searchParams.get("country") ?? "").toUpperCase();
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const region = (url.searchParams.get("region") ?? "").trim().slice(0, 120);
  const status2 = url.searchParams.get("status") ?? "all";
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!isAdminCountryCode(country) || !["all", "new", "applied", "update"].includes(status2) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1e5)
    throw new ApiError("invalid_request");
  const rows = await env.DB.prepare(
    `WITH grouped_catalog AS (SELECT *, ${regionGroupSQL("", false)} AS list_region FROM golfcore_catalog_courses)
     SELECT g.slug,g.name,g.country_code,g.region,g.city,g.address,g.phone,g.website,g.list_region,
       g.hole_count,g.par_total,g.source_payload_json,g.source_hash,g.source_url,
       g.detail_state,g.last_error,g.source_retrieved_at,g.updated_at,
       c.course_id AS existing_course_id,c.source_hash AS existing_source_hash
     FROM grouped_catalog g
     LEFT JOIN courses c ON c.source_name='golfcore' AND c.source_external_id=g.slug
     WHERE g.country_code=?
       AND instr(lower(g.name||' '||g.city||' '||g.region||' '||g.address),lower(?))>0
       AND (?='' OR g.list_region=?)
       AND (?='all'
         OR (?='new' AND c.course_id IS NULL)
         OR (?='applied' AND c.course_id IS NOT NULL AND COALESCE(c.source_hash,'')=g.source_hash)
         OR (?='update' AND c.course_id IS NOT NULL AND COALESCE(c.source_hash,'')<>g.source_hash))
     ORDER BY g.name COLLATE NOCASE,g.slug LIMIT 51 OFFSET ?`
  ).bind(
    country,
    q,
    region,
    region,
    status2,
    status2,
    status2,
    status2,
    offset
  ).all();
  return json({
    courses: rows.results.slice(0, 50).map((row) => ({
      ...presentCourse(row, "KR"),
      slug: row.slug,
      name: row.name,
      country_code: row.country_code,
      region: row.region,
      city: row.city,
      address: row.address,
      phone: row.phone,
      website: row.website,
      hole_count: row.hole_count,
      par_total: row.par_total,
      source_url: row.source_url,
      detail_state: row.detail_state,
      last_error: row.last_error,
      source_retrieved_at: row.source_retrieved_at,
      existing_course_id: row.existing_course_id,
      review_status: catalogReviewStatus(row)
    })),
    next_offset: rows.results.length > 50 ? offset + 50 : null
  });
}
__name(listGolfCoreCatalog, "listGolfCoreCatalog");
async function golfCoreCatalogDetail(env, slug2) {
  const row = await env.DB.prepare(
    `WITH grouped_catalog AS (SELECT *, ${regionGroupSQL("", false)} AS list_region FROM golfcore_catalog_courses)
     SELECT g.slug,g.name,g.country_code,g.region,g.city,g.address,g.phone,g.website,g.list_region,
       g.hole_count,g.par_total,g.source_payload_json,g.source_hash,g.source_url,
       g.detail_state,g.last_error,g.source_retrieved_at,g.updated_at,
       c.course_id AS existing_course_id,c.source_hash AS existing_source_hash
     FROM grouped_catalog g
     LEFT JOIN courses c ON c.source_name='golfcore' AND c.source_external_id=g.slug
     WHERE g.slug=?`
  ).bind(slug2).first();
  if (!row) throw new ApiError("golfcore_not_found", 404);
  const source = await golfCoreImportSource(env, slug2);
  const existing = row.existing_course_id ? view2(await getCatalogCourse(env, row.existing_course_id)) : null;
  return json({
    catalog: {
      slug: row.slug,
      source_hash: row.source_hash,
      source_url: row.source_url,
      source_retrieved_at: row.source_retrieved_at,
      review_status: catalogReviewStatus(row)
    },
    draft: { ...source.course, ...presentCourse(source.course, "KR"), ...(existing ? {localization:existing.localization,region_group:existing.region_group,region_group_override:existing.region_group_override} : {}) },
    existing
  });
}
__name(golfCoreCatalogDetail, "golfCoreCatalogDetail");
function localizationWrite(env, id, input) {
  return env.DB.prepare("UPDATE courses SET localized_json=COALESCE(?,localized_json),region_group=COALESCE(?,region_group) WHERE course_id=?")
    .bind(input.localized_json, input.region_group, id);
}
async function createManual(request, env) {
  const payload = await body(request);
  const input = adminInput(payload);
  const id = payload.course_id === void 0 ? crypto.randomUUID() : uuid(payload.course_id);
  const time = now();
  await ensureAdminOwner(env);
  const after = {
    course_id: id,
    ...input,
    localization: localizationFor({...input, localized_json: input.localized_json || "{}"}),
    source_name: null,
    source_url: null,
    source_external_id: null,
    version: 1
  };
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO courses(course_id,name,region,country_code,city,address,phone,website,latitude,longitude,segments_json,version,created_by,created_at,updated_at,active,managed_by_admin)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,1)`
      ).bind(
        id,
        input.name,
        input.region,
        input.country_code,
        input.city,
        input.address,
        input.phone,
        input.website,
        input.latitude,
        input.longitude,
        JSON.stringify(input.segments),
        ADMIN_USER_ID,
        time,
        time,
        input.active ? 1 : 0
      ),
      localizationWrite(env, id, input),
      env.DB.prepare(
        "INSERT INTO course_admin_changes(change_id,course_id,action,before_json,after_json,created_at) VALUES(?,?,'create',NULL,?,?)"
      ).bind(crypto.randomUUID(), id, JSON.stringify(after), time)
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE"))
      throw new ApiError("course_exists", 409);
    throw error;
  }
  return json({ course: view2(await getCatalogCourse(env, id)) }, 201);
}
__name(createManual, "createManual");
async function importGolfCore(request, env) {
  const payload = await body(request);
  const slug2 = safeText(payload.slug, 120);
  const imported = await golfCoreImportSource(env, slug2);
  const source = imported.course;
  const input = adminInput({
    name: payload.name ?? source.name,
    country_code: payload.country_code ?? source.country_code,
    region: payload.region ?? source.region,
    city: payload.city ?? source.city,
    address: payload.address ?? source.address,
    phone: payload.phone ?? source.phone,
    website: payload.website ?? source.website,
    latitude: payload.latitude ?? source.latitude,
    longitude: payload.longitude ?? source.longitude,
    segments: payload.segments ?? source.segments,
    active: payload.active,
    localization: payload.localization,
    region_group: payload.region_group
  });
  if (input.country_code !== source.country_code)
    throw new ApiError("source_country_mismatch");
  const existing = await env.DB.prepare(
    "SELECT * FROM courses WHERE source_name='golfcore' AND source_external_id=?"
  ).bind(slug2).first();
  const time = now();
  await ensureAdminOwner(env);
  if (existing) {
    const unchanged = existing.name === input.name && existing.country_code === input.country_code && existing.region === input.region && existing.city === input.city && existing.address === input.address && existing.phone === input.phone && existing.website === input.website && existing.latitude === input.latitude && existing.longitude === input.longitude && existing.segments_json === JSON.stringify(input.segments) && existing.active === (input.active ? 1 : 0) && existing.source_url === source.source_url && existing.source_hash === imported.sourceHash && (input.localized_json === null || existing.localized_json === input.localized_json) && (input.region_group === null || existing.region_group === input.region_group);
    if (payload.version === void 0) {
      if (unchanged) return json({ course: view2(existing) });
      throw new ApiError("course_changed", 409);
    }
    const expectedVersion = revision2(payload.version);
    const before = view2(existing);
    const after2 = {
      ...before,
      ...input,
      localization: input.localized_json === null ? before.localization : JSON.parse(input.localized_json),
      region_group: input.region_group ?? before.region_group,
      source_name: "golfcore",
      source_url: source.source_url,
      source_external_id: slug2,
      source_retrieved_at: imported.sourceRetrievedAt,
      source_hash: imported.sourceHash,
      version: expectedVersion + 1,
      updated_at: time
    };
    await guardedAdminUpdate(env, existing.course_id, expectedVersion, [
      env.DB.prepare(
        `UPDATE courses SET name=?,region=?,country_code=?,city=?,address=?,phone=?,website=?,latitude=?,longitude=?,segments_json=?,source_url=?,source_retrieved_at=?,source_hash=?,active=?,managed_by_admin=1,version=version+1,updated_at=? WHERE course_id=?`
      ).bind(
        input.name,
        input.region,
        input.country_code,
        input.city,
        input.address,
        input.phone,
        input.website,
        input.latitude,
        input.longitude,
        JSON.stringify(input.segments),
        source.source_url,
        imported.sourceRetrievedAt,
        imported.sourceHash,
        input.active ? 1 : 0,
        time,
        existing.course_id
      ),
      localizationWrite(env, existing.course_id, input),
      env.DB.prepare(
        "INSERT INTO course_admin_changes(change_id,course_id,action,before_json,after_json,created_at) VALUES(?,?,'import',?,?,?)"
      ).bind(
        crypto.randomUUID(),
        existing.course_id,
        JSON.stringify(before),
        JSON.stringify(after2),
        time
      )
    ]);
    return json({
      course: view2(await getCatalogCourse(env, existing.course_id))
    });
  }
  const id = crypto.randomUUID();
  const after = {
    course_id: id,
    ...input,
    localization: localizationFor({...input, localized_json: input.localized_json || "{}"}),
    source_name: "golfcore",
    source_url: source.source_url,
    source_external_id: slug2,
    source_retrieved_at: imported.sourceRetrievedAt,
    source_hash: imported.sourceHash,
    version: 1
  };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO courses(course_id,name,region,country_code,city,address,phone,website,latitude,longitude,segments_json,version,created_by,created_at,updated_at,source_name,source_url,source_external_id,source_retrieved_at,source_hash,active,managed_by_admin)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,1)`
    ).bind(
      id,
      input.name,
      input.region,
      input.country_code,
      input.city,
      input.address,
      input.phone,
      input.website,
      input.latitude,
      input.longitude,
      JSON.stringify(input.segments),
      ADMIN_USER_ID,
      time,
      time,
      "golfcore",
      source.source_url,
      slug2,
      imported.sourceRetrievedAt,
      imported.sourceHash,
      input.active ? 1 : 0
    ),
    localizationWrite(env, id, input),
    env.DB.prepare(
      "INSERT INTO course_admin_changes(change_id,course_id,action,before_json,after_json,created_at) VALUES(?,?,'import',NULL,?,?)"
    ).bind(crypto.randomUUID(), id, JSON.stringify(after), time)
  ]);
  return json({ course: view2(await getCatalogCourse(env, id)) }, 201);
}
__name(importGolfCore, "importGolfCore");
async function updateAdminCourse(env, id, input, version) {
  const beforeRow = await getCatalogCourse(env, id);
  const before = view2(beforeRow);
  const time = now();
  const action3 = beforeRow.active === 1 && !input.active ? "deactivate" : beforeRow.active === 0 && input.active ? "reactivate" : "update";
  const after = {
    ...before,
    ...input,
    localization: input.localized_json === null ? before.localization : JSON.parse(input.localized_json),
    region_group: input.region_group ?? before.region_group,
    version: version + 1,
    updated_at: time
  };
  await guardedAdminUpdate(env, id, version, [
    env.DB.prepare(
      `UPDATE courses SET name=?,region=?,country_code=?,city=?,address=?,phone=?,website=?,latitude=?,longitude=?,segments_json=?,active=?,managed_by_admin=1,version=version+1,updated_at=? WHERE course_id=?`
    ).bind(
      input.name,
      input.region,
      input.country_code,
      input.city,
      input.address,
      input.phone,
      input.website,
      input.latitude,
      input.longitude,
      JSON.stringify(input.segments),
      input.active ? 1 : 0,
      time,
      id
    ),
    localizationWrite(env, id, input),
    env.DB.prepare(
      "INSERT INTO course_admin_changes(change_id,course_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)"
    ).bind(
      crypto.randomUUID(),
      id,
      action3,
      JSON.stringify(before),
      JSON.stringify(after),
      time
    )
  ]);
  return view2(await getCatalogCourse(env, id));
}
__name(updateAdminCourse, "updateAdminCourse");
async function updateManual(request, env, id) {
  const payload = await body(request);
  const course = await updateAdminCourse(
    env,
    id,
    adminInput(payload),
    revision2(payload.version)
  );
  return json({ course });
}
__name(updateManual, "updateManual");
async function courseRequestRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path !== "/api/course-requests") return null;
  const active = await authenticate(request, env);
  if (request.method === "POST") {
    await limit(request, env, `course-request:${active.user_id}`, 20, 864e5);
    const payload = await body(request);
    const courseId = payload.course_id === null || payload.course_id === void 0 ? null : uuid(payload.course_id);
    if (courseId) await getCatalogCourse(env, courseId);
    const time = now();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO course_requests(
         request_id,requester_id,course_id,category,description,
         requested_value_json,status,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,'pending',?,?)`
    ).bind(
      id,
      active.user_id,
      courseId,
      requestCategory(payload.category),
      safeText(payload.description, 1e3),
      jsonValue(payload.requested_value),
      time,
      time
    ).run();
    return json({ request_id: id, status: "pending" }, 201);
  }
  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT r.*,u.nickname AS requester_name,c.name AS course_name
       FROM course_requests r JOIN users u ON u.user_id=r.requester_id
       LEFT JOIN courses c ON c.course_id=r.course_id
       WHERE r.requester_id=? ORDER BY r.created_at DESC,r.request_id DESC LIMIT 100`
    ).bind(active.user_id).all();
    return json({ requests: rows.results.map(requestView) });
  }
  throw new ApiError("not_found", 404);
}
__name(courseRequestRoute, "courseRequestRoute");
async function listAdminRequests(env, url) {
  const status2 = url.searchParams.get("status") ?? "open";
  const category = url.searchParams.get("category") ?? "all";
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!["all", "open", ...REQUEST_STATUSES].includes(status2) || category !== "all" && !REQUEST_CATEGORIES.has(category) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1e5)
    throw new ApiError("invalid_request");
  const rows = await env.DB.prepare(
    `SELECT r.*,u.nickname AS requester_name,c.name AS course_name
     FROM course_requests r JOIN users u ON u.user_id=r.requester_id
     LEFT JOIN courses c ON c.course_id=r.course_id
     WHERE (?='all' OR (?='open' AND r.status IN ('pending','processing','on_hold')) OR r.status=?)
       AND (?='all' OR r.category=?)
     ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 WHEN 'on_hold' THEN 2 ELSE 3 END,
              r.updated_at DESC,r.request_id DESC LIMIT 51 OFFSET ?`
  ).bind(status2, status2, status2, category, category, offset).all();
  return json({
    requests: rows.results.slice(0, 50).map(requestView),
    next_offset: rows.results.length > 50 ? offset + 50 : null
  });
}
__name(listAdminRequests, "listAdminRequests");
async function updateAdminRequest(request, env, requestId2) {
  const payload = await body(request);
  const status2 = requestStatus(payload.status);
  const note = optionalText2(payload.admin_note, 1e3);
  const row = await env.DB.prepare(
    `SELECT r.*,u.nickname AS requester_name,c.name AS course_name
     FROM course_requests r JOIN users u ON u.user_id=r.requester_id
     LEFT JOIN courses c ON c.course_id=r.course_id WHERE r.request_id=?`
  ).bind(requestId2).first();
  if (!row) throw new ApiError("request_not_found", 404);
  let appliedCourse = null;
  if (payload.course !== void 0) {
    if (!row.course_id || !payload.course || typeof payload.course !== "object")
      throw new ApiError("invalid_request");
    const coursePayload = payload.course;
    appliedCourse = await updateAdminCourse(
      env,
      row.course_id,
      adminInput(coursePayload),
      revision2(coursePayload.version)
    );
  }
  const time = now();
  const resolved = ["completed", "rejected"].includes(status2);
  const resolution = appliedCourse ? JSON.stringify({
    course_id: appliedCourse.course_id,
    version: appliedCourse.version
  }) : row.resolution_json;
  await env.DB.prepare(
    `UPDATE course_requests SET status=?,admin_note=?,resolution_json=?,updated_at=?,resolved_at=?
     WHERE request_id=?`
  ).bind(status2, note, resolution, time, resolved ? time : null, requestId2).run();
  const updated = await env.DB.prepare(
    `SELECT r.*,u.nickname AS requester_name,c.name AS course_name
     FROM course_requests r JOIN users u ON u.user_id=r.requester_id
     LEFT JOIN courses c ON c.course_id=r.course_id WHERE r.request_id=?`
  ).bind(requestId2).first();
  return json({ request: requestView(updated), course: appliedCourse });
}
__name(updateAdminRequest, "updateAdminRequest");
async function courseAdminRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/admin" && request.method === "GET") return adminPage();
  if (!path.startsWith("/admin/api")) return null;
  await authenticateAdmin(request, env);
  await limit(request, env, "course-admin", 240, 6e4);
  if (path === "/admin/api/session" && request.method === "GET")
    return json({ ok: true });
  if (path === "/admin/api/overview" && request.method === "GET")
    return adminOverview(env);
  const countrySettingMatch = path.match(/^\/admin\/api\/countries\/([A-Z]{2})$/);
  if (countrySettingMatch && request.method === "PATCH")
    return updateCountrySetting(request, env, countrySettingMatch[1]);
  if (path === "/admin/api/requests" && request.method === "GET")
    return listAdminRequests(env, url);
  const requestMatch = path.match(
    /^\/admin\/api\/requests\/([a-f0-9-]{36})$/i
  );
  if (requestMatch && request.method === "PATCH")
    return updateAdminRequest(request, env, uuid(requestMatch[1]));
  if (path === "/admin/api/golfcore/sync" && request.method === "GET")
    return json({ countries: await golfCoreSyncStatus(env) });
  if (path === "/admin/api/golfcore/sync" && request.method === "POST") {
    const payload = await body(request);
    const country = payload.country_code === void 0 ? void 0 : safeText(payload.country_code, 2).toUpperCase();
    return json({ sync: await syncNextGolfCoreCatalogPage(env, country, { forceComplete: !!country }) });
  }
  if (path === "/admin/api/golfcore/search" && request.method === "GET")
    return searchGolfCore(env, url);
  if (path === "/admin/api/golfcore/catalog" && request.method === "GET")
    return listGolfCoreCatalog(env, url);
  const catalogDetailMatch = path.match(
    /^\/admin\/api\/golfcore\/catalog\/([a-z0-9-]{1,120})$/
  );
  if (catalogDetailMatch && request.method === "GET")
    return golfCoreCatalogDetail(env, catalogDetailMatch[1]);
  const detailMatch = path.match(
    /^\/admin\/api\/golfcore\/courses\/([a-z0-9-]{1,120})$/
  );
  if (detailMatch && request.method === "GET")
    return json({ course: await golfCoreDetail(env, detailMatch[1]) });
  if (path === "/admin/api/golfcore/import" && request.method === "POST")
    return importGolfCore(request, env);
  if (path === "/admin/api/courses/deleted" && request.method === "GET")
    return listDeletedAdminCourses(env, url, viewerRegion(request, "KR"));
  if (path === "/admin/api/courses" && request.method === "POST")
    return createManual(request, env);
  if (path === "/admin/api/courses" && request.method === "GET") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 80);
    const country = (url.searchParams.get("country") ?? "").toUpperCase();
    const status2 = url.searchParams.get("status") ?? "all";
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (country && !isAdminCountryCode(country) || !["all", "active", "inactive"].includes(status2) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1e5)
      throw new ApiError("invalid_request");
    const [rows, total] = await Promise.all([
      env.DB.prepare(
      `SELECT c.* FROM courses c
       WHERE instr(lower(c.name||' '||c.address||' '||c.localized_json),lower(?))>0
       AND (?='' OR c.country_code=?)
       AND (?='all' OR c.active=CASE WHEN ?='active' THEN 1 ELSE 0 END)
       AND NOT EXISTS(SELECT 1 FROM course_deleted_items d WHERE d.course_id=c.course_id)
       ORDER BY CASE WHEN c.country_code='KR'
         THEN COALESCE(NULLIF(json_extract(c.localized_json,'$.name.ko'),''),c.name)
         ELSE COALESCE(NULLIF(json_extract(c.localized_json,'$.name.en'),''),c.name)
       END COLLATE NOCASE,c.course_id LIMIT 11 OFFSET ?`
      ).bind(q, country, country, status2, status2, offset).all(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM courses
         WHERE instr(lower(name||' '||address||' '||localized_json),lower(?))>0
           AND (?='' OR country_code=?)
           AND (?='all' OR active=CASE WHEN ?='active' THEN 1 ELSE 0 END)
           AND NOT EXISTS(SELECT 1 FROM course_deleted_items d WHERE d.course_id=courses.course_id)`
      ).bind(q, country, country, status2, status2).first()
    ]);
    const pageRows = rows.results.slice(0, 10);
    const operationalCounts = await safeCourseOperationalCounts(env, pageRows.map((row) => row.course_id));
    for (const row of pageRows) {
      row.round_count = operationalCounts.rounds.get(row.course_id) ?? 0;
      row.open_request_count = operationalCounts.requests.get(row.course_id) ?? 0;
    }
    return json({
      courses: pageRows.map(row => view2(row, viewerRegion(request, "KR"))),
      total_count: Number(total?.count ?? 0),
      current_page: Math.floor(offset / 10) + 1,
      page_count: Math.max(1, Math.ceil(Number(total?.count ?? 0) / 10)),
      next_offset: rows.results.length > 10 ? offset + 10 : null
    });
  }
  const match = path.match(
    /^\/admin\/api\/courses\/([a-f0-9-]{36})(?:\/(history|restore))?$/i
  );
  if (match) {
    const id = uuid(match[1]);
    if (match[2] === "history" && request.method === "GET") {
      await getCatalogCourse(env, id);
      const rows = await env.DB.prepare(
        "SELECT change_id,action,before_json,after_json,created_at FROM course_admin_changes WHERE course_id=? ORDER BY created_at DESC,change_id DESC LIMIT 100"
      ).bind(id).all();
      return json({
        changes: rows.results.map((row) => ({
          change_id: row.change_id,
          action: row.action,
          before: row.before_json ? JSON.parse(row.before_json) : null,
          after: JSON.parse(row.after_json),
          created_at: row.created_at
        }))
      });
    }
    if (match[2] === "restore" && request.method === "PATCH")
      return restoreAdminCourse(env, id);
    if (!match[2] && request.method === "GET")
      return json({ course: view2(await getCatalogCourse(env, id), viewerRegion(request, "KR")) });
    if (!match[2] && request.method === "PUT")
      return updateManual(request, env, id);
    if (!match[2] && request.method === "DELETE")
      return deleteAdminCourse(request, env, id);
  }
  throw new ApiError("not_found", 404);
}
__name(courseAdminRoute, "courseAdminRoute");


export { normalizeGolfCoreCourse, courseAdminRoute, courseRequestRoute };
