import { getLocales } from "expo-localization";
import { isWorldCountryCode } from "../../shared/countries";
export function deviceCountry() {
  const country = getLocales()[0]?.regionCode?.toUpperCase() ?? "";
  return isWorldCountryCode(country) ? country : "";
}
