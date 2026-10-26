import { countryLabels } from "../../shared/country-labels";
export function countryName(code: string, language: "ko" | "en") {
  return countryLabels[code]?.[language] ?? code;
}
export function courseName(course: { name: string; display_name?: string }) {
  return course.display_name?.trim() || course.name;
}
