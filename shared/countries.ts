const ADMIN_COUNTRIES = [
  {
    code: "KR",
    golfCoreCode: "kr",
    nameKo: "\uD55C\uAD6D",
    nameEn: "South Korea",
  },
  { code: "JP", golfCoreCode: "jp", nameKo: "\uC77C\uBCF8", nameEn: "Japan" },
  { code: "CN", golfCoreCode: "cn", nameKo: "\uC911\uAD6D", nameEn: "China" },
  { code: "TW", golfCoreCode: "tw", nameKo: "\uB300\uB9CC", nameEn: "Taiwan" },
  {
    code: "PH",
    golfCoreCode: "ph",
    nameKo: "\uD544\uB9AC\uD540",
    nameEn: "Philippines",
  },
  {
    code: "VN",
    golfCoreCode: "vn",
    nameKo: "\uBCA0\uD2B8\uB0A8",
    nameEn: "Vietnam",
  },
  {
    code: "TH",
    golfCoreCode: "th",
    nameKo: "\uD0DC\uAD6D",
    nameEn: "Thailand",
  },
  {
    code: "MY",
    golfCoreCode: "my",
    nameKo: "\uB9D0\uB808\uC774\uC2DC\uC544",
    nameEn: "Malaysia",
  },
  {
    code: "ID",
    golfCoreCode: "id",
    nameKo: "\uC778\uB3C4\uB124\uC2DC\uC544",
    nameEn: "Indonesia",
  },
];
const WORLD_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";
const WORLD_COUNTRY_CODES = WORLD_CODES.split(" ");
const worldCountrySet = new Set(WORLD_COUNTRY_CODES);
const adminCountrySet = new Set(ADMIN_COUNTRIES.map((item) => item.code));
function isWorldCountryCode(value: string) {
  return worldCountrySet.has(value.toUpperCase());
}
function isAdminCountryCode(value: string) {
  return adminCountrySet.has(value.toUpperCase());
}

export {
  ADMIN_COUNTRIES,
  WORLD_COUNTRY_CODES,
  isWorldCountryCode,
  isAdminCountryCode,
};
