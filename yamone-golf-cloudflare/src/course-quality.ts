import { ApiError, json, type Env } from "./shared";
import { isWorldCountryCode } from "../../shared/countries";
import { presentCourse, regionGroupSQL } from "./course-presentation.js";
type Row = {
  course_id: string;
  name: string;
  country_code: string;
  region: string;
  city: string;
  address: string;
  localized_json: string;
  region_group: string;
  list_region: string;
  segments_json: string;
  active: number;
  audit_total: number;
};
/** Read-only candidates for human review. No name-based merges or guessed PARs. */
export async function courseQualityAudit(env: Env, url: URL) {
  const country = (url.searchParams.get("country") ?? "").toUpperCase();
  if (country && !isWorldCountryCode(country))
    throw new ApiError("invalid_country");
  const limit = 5000;
  const where =
    "(?='' OR c.country_code=?) AND NOT EXISTS(SELECT 1 FROM course_deleted_items d WHERE d.course_id=c.course_id)";
  // One statement keeps the total and checked rows in the same D1 snapshot.
  const rows = await env.DB.prepare(
    `SELECT c.course_id,c.name,c.country_code,c.region,c.city,c.address,c.localized_json,c.region_group,${regionGroupSQL("c.")} AS list_region,c.segments_json,c.active,COUNT(*) OVER() AS audit_total FROM courses c WHERE ${where} ORDER BY c.course_id LIMIT ?`,
  )
    .bind(country, country, limit)
    .all<Row>();
  const total = Number(rows.results[0]?.audit_total ?? 0);
  const counts = {
    country_missing: 0,
    country_invalid: 0,
    region_unclassified: 0,
    translation_missing: 0,
    invalid_par: 0,
    duplicate_segment: 0,
  };
  const issues: {
    course_id: string;
    name: string;
    country_code: string;
    active: boolean;
    reasons: string[];
  }[] = [];
  const names = new Map<string, { course_id: string; name: string }[]>();
  for (const row of rows.results) {
    const reasons: (keyof typeof counts)[] = [];
    if (!row.country_code) reasons.push("country_missing");
    else if (
      !isWorldCountryCode(row.country_code) ||
      row.country_code !== row.country_code.toUpperCase()
    )
      reasons.push("country_invalid");
    if (!row.list_region || row.list_region === "미분류")
      reasons.push("region_unclassified");
    if (presentCourse(row, "KR").translation_missing.length)
      reasons.push("translation_missing");
    let segments: unknown;
    try {
      segments = JSON.parse(row.segments_json);
    } catch {
      segments = null;
    }
    if (
      !Array.isArray(segments) ||
      !segments.length ||
      segments.length > 9 ||
      segments.some(
        (s) =>
          !s ||
          typeof s !== "object" ||
          typeof s.name !== "string" ||
          !s.name.trim() ||
          !Array.isArray(s.pars) ||
          s.pars.length !== 9 ||
          s.pars.some(
            (p: unknown) =>
              typeof p !== "number" || !Number.isInteger(p) || p < 3 || p > 7,
          ),
      )
    )
      reasons.push("invalid_par");
    if (Array.isArray(segments)) {
      const segmentNames = segments
        .filter((s) => s && typeof s.name === "string")
        .map((s) => s.name.normalize("NFC").trim().toLowerCase());
      if (new Set(segmentNames).size !== segmentNames.length)
        reasons.push("duplicate_segment");
    }
    for (const reason of reasons) counts[reason]++;
    if (reasons.length && issues.length < 100)
      issues.push({
        course_id: row.course_id,
        name: row.name,
        country_code: row.country_code,
        active: row.active === 1,
        reasons,
      });
    const key =
      row.country_code +
      "\0" +
      row.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const group = names.get(key) ?? [];
    group.push({ course_id: row.course_id, name: row.name });
    names.set(key, group);
  }
  const duplicates = [...names.values()].filter((group) => group.length > 1);
  return json({
    country_code: country,
    total: total,
    checked: rows.results.length,
    complete: total <= limit,
    counts,
    duplicate_groups: duplicates.length,
    duplicates: duplicates
      .slice(0, 50)
      .map((group) => ({ count: group.length, courses: group.slice(0, 8) })),
    issues,
    issue_sample_limit: 100,
    duplicate_sample_limit: 50,
  });
}
