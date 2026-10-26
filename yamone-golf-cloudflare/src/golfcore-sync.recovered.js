// Recovered without behavioral changes from admin 0.3.22; see docs/SOURCE_INTEGRATION_20261026.md.
import { ApiError, hash, now } from "./shared";
import { ADMIN_COUNTRIES, isAdminCountryCode } from "../../shared/countries";
const __name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });

var GOLFCORE_BASE = "https://api.golfcore.org/v1";
var GOLFCORE_AGENT = "YamoneGolf/0.3.22 (course-catalog; contact: support@golf.yamone.net)";
var SYNC_PAGE_SIZE = 10;
var MAX_RESPONSE_BYTES = 2e6;
var COMPLETE_REFRESH_MS = 30 * 24 * 60 * 60 * 1e3;
var LOCK_TIMEOUT_MS = 5 * 60 * 1e3;
function object2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
__name(object2, "object");
function text2(value, max) {
  return typeof value === "string" ? Array.from(value.trim().normalize("NFC")).slice(0, max).join("") : "";
}
__name(text2, "text");
function optionalText(value, max) {
  const result = text2(value, max);
  return result || null;
}
__name(optionalText, "optionalText");
function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
__name(number, "number");
function integer2(value) {
  return Number.isSafeInteger(value) ? Number(value) : null;
}
__name(integer2, "integer");
function slug(value) {
  const result = text2(value, 120);
  if (!/^[a-z0-9-]{1,120}$/.test(result))
    throw new ApiError("golfcore_invalid_response", 502);
  return result;
}
__name(slug, "slug");
function golfCoreSourceUrl(value) {
  return `https://www.golfcore.org/courses/${value}/`;
}
__name(golfCoreSourceUrl, "golfCoreSourceUrl");
function golfCoreRequest(env, path) {
  const headers = new Headers({ Accept: "application/json", "User-Agent": GOLFCORE_AGENT });
  const apiKey = typeof env.GOLFCORE_API_KEY === "string" ? env.GOLFCORE_API_KEY.trim() : "";
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
  const request = new Request(GOLFCORE_BASE + path, {
    headers,
    signal: AbortSignal.timeout(8e3)
  });
  return env.GOLFCORE_API ? env.GOLFCORE_API.fetch(request) : fetch(request);
}
__name(golfCoreRequest, "golfCoreRequest");
async function boundedJson(response) {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new ApiError("golfcore_invalid_response", 502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError("golfcore_invalid_response", 502);
  const chunks = [];
  let size = 0;
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ApiError("golfcore_invalid_response", 502);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("golfcore_invalid_response", 502);
  }
}
__name(boundedJson, "boundedJson");
async function golfCoreJson(env, path) {
  let response;
  try {
    response = await golfCoreRequest(env, path);
  } catch {
    throw new ApiError("golfcore_unavailable", 502);
  }
  if (response.status === 404) throw new ApiError("golfcore_not_found", 404);
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError("golfcore_unavailable", 502);
  }
  return boundedJson(response);
}
__name(golfCoreJson, "golfCoreJson");
async function fetchGolfCoreDetail(env, value) {
  const validSlug = slug(value);
  const payload = object2(
    await golfCoreJson(env, "/courses/" + encodeURIComponent(validSlug))
  );
  if (!payload) throw new ApiError("golfcore_invalid_response", 502);
  return payload;
}
__name(fetchGolfCoreDetail, "fetchGolfCoreDetail");
async function fetchGolfCorePage(env, countryCode, offset, options = {}) {
  const country = countryCode.toUpperCase();
  if (!isAdminCountryCode(country)) throw new ApiError("invalid_country");
  const limit2 = Math.min(50, Math.max(1, options.limit ?? 50));
  const params = new URLSearchParams({
    country: country.toLowerCase(),
    limit: String(limit2),
    offset: String(offset)
  });
  if (options.query) params.set("q", options.query.slice(0, 80));
  if (options.scorecardsOnly) params.set("coverage", "scorecard");
  const payload = object2(
    await golfCoreJson(env, "/courses?" + params.toString())
  );
  if (!payload || !Array.isArray(payload.courses))
    throw new ApiError("golfcore_invalid_response", 502);
  const courses = payload.courses.map(object2).filter((course) => !!course).filter((course) => {
    try {
      slug(course.slug);
      return !!text2(course.name, 160);
    } catch {
      return false;
    }
  }).slice(0, limit2);
  const total = integer2(payload.total);
  return {
    courses,
    total: total !== null && total >= 0 ? total : courses.length + offset
  };
}
__name(fetchGolfCorePage, "fetchGolfCorePage");
async function catalogStatement(env, expectedCountry, summary, detail, detailError, time) {
  const payload = detail ?? summary;
  const courseSlug = slug(payload.slug ?? summary.slug);
  const name = text2(payload.name ?? summary.name, 160);
  if (!name) throw new ApiError("golfcore_invalid_response", 502);
  const country = text2(payload.country ?? summary.country, 2).toUpperCase();
  if (country && country !== expectedCountry)
    throw new ApiError("golfcore_invalid_response", 502);
  const coverage = object2(payload.coverage ?? summary.coverage) ?? {};
  const layouts = Array.isArray(payload.layouts) ? payload.layouts : null;
  const serialized = JSON.stringify(payload);
  return env.DB.prepare(
    `INSERT INTO golfcore_catalog_courses(
       slug,name,country_code,region,city,address,phone,website,timezone,
       latitude,longitude,hole_count,par_total,coverage_json,layouts_json,
       source_payload_json,source_hash,source_url,detail_state,last_error,
       source_retrieved_at,created_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET
       name=excluded.name,country_code=excluded.country_code,
       region=excluded.region,city=excluded.city,address=excluded.address,
       phone=excluded.phone,website=excluded.website,timezone=excluded.timezone,
       latitude=excluded.latitude,longitude=excluded.longitude,
       hole_count=excluded.hole_count,par_total=excluded.par_total,
       coverage_json=excluded.coverage_json,layouts_json=excluded.layouts_json,
       source_payload_json=excluded.source_payload_json,
       source_hash=excluded.source_hash,source_url=excluded.source_url,
       detail_state=excluded.detail_state,last_error=excluded.last_error,
       source_retrieved_at=excluded.source_retrieved_at,updated_at=excluded.updated_at`
  ).bind(
    courseSlug,
    name,
    expectedCountry,
    text2(payload.region ?? summary.region, 120),
    text2(payload.city ?? summary.city, 120),
    text2(payload.address, 300),
    optionalText(payload.phone, 80),
    optionalText(payload.website, 500),
    optionalText(payload.timezone, 80),
    number(payload.lat ?? summary.lat),
    number(payload.lng ?? summary.lng),
    integer2(payload.hole_count ?? summary.hole_count),
    integer2(payload.par_total ?? summary.par_total),
    JSON.stringify(coverage),
    layouts ? JSON.stringify(layouts) : null,
    serialized,
    await hash(serialized),
    golfCoreSourceUrl(courseSlug),
    detail ? "full" : "summary",
    detailError,
    time,
    time,
    time
  );
}
__name(catalogStatement, "catalogStatement");
async function claimState(env, requestedCountry, forceComplete = false) {
  const time = now();
  const staleLock = time - LOCK_TIMEOUT_MS;
  const staleComplete = time - COMPLETE_REFRESH_MS;
  const requested = requestedCountry?.toUpperCase();
  if (requested && !isAdminCountryCode(requested))
    throw new ApiError("invalid_country");
  const row = requested ? await env.DB.prepare(
    "SELECT * FROM golfcore_sync_state WHERE country_code=?"
  ).bind(requested).first() : await env.DB.prepare(
    `SELECT * FROM golfcore_sync_state
         WHERE status IN ('pending','error')
            OR (status='running' AND updated_at<?)
            OR (status='complete' AND COALESCE(last_completed_at,0)<?)
         ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'error' THEN 1 WHEN 'running' THEN 2 ELSE 3 END,
                  priority LIMIT 1`
  ).bind(staleLock, staleComplete).first();
  if (!row || row.status === "paused") return null;
  if (row.status === "complete" && !forceComplete && Number(row.last_completed_at || 0) >= staleComplete)
    return null;
  if (row.status === "running" && row.updated_at >= staleLock) return null;
  const restart = row.status === "complete";
  return env.DB.prepare(
    `UPDATE golfcore_sync_state
     SET status='running',next_offset=?,cycle_started_at=CASE WHEN ?=1 THEN ? ELSE COALESCE(cycle_started_at,?) END,
         last_error=NULL,updated_at=?
     WHERE country_code=? AND (status<>'running' OR updated_at<?)
     RETURNING *`
  ).bind(
    restart ? 0 : row.next_offset,
    restart ? 1 : 0,
    time,
    time,
    time,
    row.country_code,
    staleLock
  ).first();
}
__name(claimState, "claimState");
async function syncNextGolfCoreCatalogPage(env, requestedCountry, options = {}) {
  const state = await claimState(env, requestedCountry, options.forceComplete === true);
  if (!state) return { status: "idle" };
  const time = now();
  try {
    const page2 = await fetchGolfCorePage(
      env,
      state.country_code,
      state.next_offset,
      { limit: SYNC_PAGE_SIZE }
    );
    const statements = [];
    for (let index = 0; index < page2.courses.length; index += 2) {
      const chunk = await Promise.all(
        page2.courses.slice(index, index + 2).map(async (summary) => {
          let detail = null;
          let detailError = null;
          try {
            detail = await fetchGolfCoreDetail(env, slug(summary.slug));
          } catch (error) {
            detailError = error instanceof ApiError ? error.code : "golfcore_unavailable";
          }
          return catalogStatement(
            env,
            state.country_code,
            summary,
            detail,
            detailError,
            time
          );
        })
      );
      statements.push(...chunk);
    }
    const nextOffset = state.next_offset + page2.courses.length;
    const complete = page2.courses.length === 0 || nextOffset >= page2.total;
    statements.push(
      env.DB.prepare(
        `UPDATE golfcore_sync_state SET status=?,next_offset=?,total_hint=?,
           last_success_at=?,last_completed_at=CASE WHEN ?=1 THEN ? ELSE last_completed_at END,
           last_error=NULL,updated_at=? WHERE country_code=?`
      ).bind(
        complete ? "complete" : "pending",
        complete ? 0 : nextOffset,
        page2.total,
        time,
        complete ? 1 : 0,
        time,
        time,
        state.country_code
      )
    );
    await env.DB.batch(statements);
    return {
      status: complete ? "complete" : "pending",
      country_code: state.country_code,
      saved: page2.courses.length,
      next_offset: complete ? null : nextOffset,
      total: page2.total
    };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "sync_failed";
    await env.DB.prepare(
      "UPDATE golfcore_sync_state SET status='error',last_error=?,updated_at=? WHERE country_code=?"
    ).bind(code, now(), state.country_code).run();
    throw error;
  }
}
__name(syncNextGolfCoreCatalogPage, "syncNextGolfCoreCatalogPage");
async function golfCoreSyncStatus(env) {
  const [states, counts] = await Promise.all([
    env.DB.prepare(
      "SELECT country_code,status,next_offset,total_hint,last_success_at,last_completed_at,last_error,updated_at FROM golfcore_sync_state ORDER BY priority"
    ).all(),
    env.DB.prepare(
      `SELECT country_code,COUNT(*) AS saved,
         SUM(CASE WHEN json_extract(coverage_json,'$.scorecard')=1
                    AND layouts_json IS NOT NULL
                    AND json_array_length(layouts_json)>0 THEN 1 ELSE 0 END) AS scorecards
       FROM golfcore_catalog_courses GROUP BY country_code`
    ).all()
  ]);
  const countMap = new Map(
    counts.results.map((row) => [row.country_code, row])
  );
  return ADMIN_COUNTRIES.map((country) => ({
    ...country,
    ...states.results.find((state) => state.country_code === country.code) ?? {
      status: "pending",
      next_offset: 0
    },
    saved: Number(countMap.get(country.code)?.saved ?? 0),
    scorecards: Number(countMap.get(country.code)?.scorecards ?? 0)
  }));
}
__name(golfCoreSyncStatus, "golfCoreSyncStatus");


export { golfCoreSourceUrl, fetchGolfCoreDetail, fetchGolfCorePage, golfCoreSyncStatus, syncNextGolfCoreCatalogPage };
