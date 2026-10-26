/** @typedef {{ko:string,en:string,local:string}} TextVariants */
/** @typedef {{name:TextVariants,address:TextVariants}} Localization */
/** @typedef {{name?:string,address?:string,country_code?:string,localization?:Localization,localized_json?:string,list_region?:string,region_group?:string}} Course */
// Display translations are curated separately from the original source text.
export const REGION_GROUPS = ['경기도','충청도','경상도','전라도','강원도','서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','제주도','미분류'];
/** @type {Array<[string,string[]]>} */
const provinceRules = [
 ['경기도',['경기도','gyeonggi','경기 ']],
 ['충청도',['충청','chungcheong','chungbuk','chungnam','충북','충남']],
 ['경상도',['경상','gyeongsang','gyeongbuk','gyeongnam','경북','경남']],
 ['전라도',['전라','jeolla','jeonbuk','jeonnam','전북','전남','south jeolla','north jeolla']],
 ['강원도',['강원','gangwon']], ['제주도',['제주','jeju']]
];
/** @type {Array<[string,string[]]>} */
const cityRules = [
 ['서울특별시',['서울','seoul']],['부산광역시',['부산','busan','pusan']],
 ['대구광역시',['대구','daegu']],['인천광역시',['인천','incheon']],
 ['광주광역시',['광주광역시','gwangju metropolitan']],['대전광역시',['대전','daejeon']],
 ['울산광역시',['울산','ulsan']],['세종특별자치시',['세종','sejong']]
];
// Unambiguous municipalities only; bare Gwangju is deliberately not guessed.
/** @type {Array<[string,string[]]>} */
const municipalityRules = [
 ['경기도','용인 성남 여주 가평 고양 파주 남양주 화성 시흥 포천 이천 안성 김포 군포 동두천 하남 양평 구리 광명 양주 안산 연천 평택 오산 수원 부천 의정부 의왕 과천'.split(' ').concat('yongin seongnam yeoju gapyeong goyang paju namyangju hwaseong siheung pocheon icheon anseong gimpo gunpo dongducheon hanam yangpyeong guri gwangmyeong yangju ansan yeoncheon pyeongtaek osan suwon bucheon uijeongbu uiwang gwacheon'.split(' '))],
 ['충청도','청주 충주 당진 아산 천안 보은 금산 옥천 진천 청원 제천 공주 서산 논산 홍성 예산 괴산 음성 단양 영동 태안 부여 서천 증평 청양 cheongju chungju dangjin asan cheonan boeun geumsan okcheon jincheon cheongwon jecheon gongju seosan nonsan hongseong yesan goesan eumseong danyang yeongdong taean buyeo seocheon jeungpyeong cheongyang'.split(' ')],
 ['경상도','구미 경주 영주 함안 영천 거제 남해 창원 사천 안동 영덕 포항 거창 양산 진주 하동 경산 예천 창녕 산청 문경 밀양 김해 김천 통영 gumi gyeongju yeongju haman yeongcheon geoje namhae changwon sacheon andong yeongdeok pohang geochang yangsan jinju hadong gyeongsan yecheon changnyeong sancheong mungyeong miryang gimhae gimcheon tongyeong'.replace('','').replace('','').split(' ')],
 ['전라도','순천 목포 광양 보성 장성 담양 영암 강진 나주 고창 익산 전주 곡성 해남 함평 영광 여수 군산 완주 무주 진안 장수 임실 순창 남원 정읍 김제 부안 장흥 보성 화순 고흥 완도 진도 신안 suncheon mokpo gwangyang boseong jangseong damyang yeongam gangjin naju gochang iksan jeonju gokseong haenam hampyeong yeonggwang yeosu gunsan wanju muju jinan jangsu imsil sunchang namwon jeongeup gimje buan jangheung hwasun goheung wando jindo sinan'.split(' ')],
 ['강원도','춘천 원주 횡성 홍천 정선 강릉 평창 속초 양양 인제 철원 화천 양구 영월 태백 삼척 동해 chuncheon wonju hoengseong hongcheon jeongseon gangneung pyeongchang sokcho yangyang inje cheorwon hwacheon yanggu yeongwol taebaek samcheok donghae'.split(' ')],
 ['제주도',['서귀포','seogwipo']], ['대구광역시',['군위','gunwi']]
];
/** @param {string} v */
const quote = (v) => "'" + v.replaceAll("'", "''") + "'";
/** @param {string} expr @param {string[]} terms */
function sqlHas(expr, terms) { return '(' + terms.map(t => 'instr(' + expr + ',' + quote(t) + ')>0').join(' OR ') + ')'; }
export const WORLD_REGION_GROUPS = {"JP": ["Aichi", "Akita", "Aomori", "Chiba", "Ehime", "Fukui", "Fukuoka", "Fukushima", "Gifu", "Gunma", "Hiroshima", "Hokkaido", "Hyogo", "Ibaraki", "Ishikawa", "Iwate", "Kagawa", "Kagoshima", "Kanagawa", "Kochi", "Kumamoto", "Kyoto", "Mie", "Miyagi", "Miyazaki", "Nagano", "Nagasaki", "Nara", "Niigata", "Oita", "Okayama", "Okinawa", "Osaka", "Saga", "Saitama", "Shiga", "Shimane", "Shizuoka", "Tochigi", "Tokushima", "Tokyo", "Tottori", "Toyama", "Wakayama", "Yamagata", "Yamaguchi", "Yamanashi", "미분류"], "CN": ["Anhui", "Beijing", "Chongqing", "Fujian", "Gansu", "Guangdong", "Guangxi", "Guizhou", "Hainan", "Hebei", "Heilongjiang", "Henan", "Hong Kong", "Hubei", "Hunan", "Inner Mongolia", "Jiangsu", "Jiangxi", "Jilin", "Liaoning", "Macau", "Ningxia", "Qinghai", "Shaanxi", "Shandong", "Shanghai", "Shanxi", "Sichuan", "Tianjin", "Tibet", "Xinjiang", "Yunnan", "Zhejiang", "미분류"], "MY": ["Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka", "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya", "Sabah", "Sarawak", "Selangor", "Terengganu", "미분류"], "ID": ["Aceh", "Bali", "Bangka Belitung", "Banten", "Bengkulu", "Gorontalo", "Jakarta", "Jambi", "Jawa Barat", "Jawa Tengah", "Jawa Timur", "Kalimantan Barat", "Kalimantan Selatan", "Kalimantan Tengah", "Kalimantan Timur", "Kalimantan Utara", "Kepulauan Riau", "Lampung", "Maluku", "Maluku Utara", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Papua", "Papua Barat", "Papua Barat Daya", "Papua Pegunungan", "Papua Selatan", "Papua Tengah", "Riau", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tengah", "Sulawesi Tenggara", "Sulawesi Utara", "Sumatera Barat", "Sumatera Selatan", "Sumatera Utara", "Yogyakarta", "미분류"], "TW": ["Changhua", "Chiayi City", "Chiayi County", "Hsinchu City", "Hsinchu County", "Hualien", "Kaohsiung", "Keelung", "Kinmen", "Lienchiang", "Miaoli", "Nantou", "New Taipei", "Penghu", "Pingtung", "Taichung", "Tainan", "Taipei", "Taitung", "Taoyuan", "Yilan", "Yunlin", "미분류"], "TH": ["Amnat Charoen", "Ang Thong", "Ayutthaya", "Bangkok", "Bueng Kan", "Buri Ram", "Chachoengsao", "Chai Nat", "Chaiyaphum", "Chanthaburi", "Chiang Mai", "Chiang Rai", "Chonburi", "Chumphon", "Kalasin", "Kamphaeng Phet", "Kanchanaburi", "Khon Kaen", "Krabi", "Lampang", "Lamphun", "Loei", "Lopburi", "Mae Hong Son", "Maha Sarakham", "Mukdahan", "Nakhon Nayok", "Nakhon Pathom", "Nakhon Phanom", "Nakhon Ratchasima", "Nakhon Sawan", "Nakhon Si Thammarat", "Nan", "Narathiwat", "Nong Bua Lam Phu", "Nong Khai", "Nonthaburi", "Pathum Thani", "Pattani", "Phang Nga", "Phatthalung", "Phayao", "Phetchabun", "Phetchaburi", "Phichit", "Phitsanulok", "Phrae", "Phuket", "Prachinburi", "Prachuap Khiri Khan", "Ranong", "Ratchaburi", "Rayong", "Roi Et", "Sa Kaeo", "Sakon Nakhon", "Samut Prakan", "Samut Sakhon", "Samut Songkhram", "Saraburi", "Satun", "Si Sa Ket", "Sing Buri", "Songkhla", "Sukhothai", "Suphan Buri", "Surat Thani", "Surin", "Tak", "Trang", "Trat", "Ubon Ratchathani", "Udon Thani", "Uthai Thani", "Uttaradit", "Yala", "Yasothon", "미분류"], "VN": ["An Giang", "Bac Ninh", "Ca Mau", "Can Tho", "Cao Bang", "Da Nang", "Dak Lak", "Dien Bien", "Dong Nai", "Dong Thap", "Gia Lai", "Ha Tinh", "Hai Phong", "Hanoi", "Ho Chi Minh", "Hue", "Hung Yen", "Khanh Hoa", "Lai Chau", "Lam Dong", "Lang Son", "Lao Cai", "Nghe An", "Ninh Binh", "Phu Tho", "Quang Ngai", "Quang Ninh", "Quang Tri", "Son La", "Tay Ninh", "Thai Nguyen", "Thanh Hoa", "Tuyen Quang", "Vinh Long", "미분류"], "PH": ["BARMM", "Bicol", "CALABARZON", "CAR", "Cagayan Valley", "Caraga", "Central Luzon", "Central Visayas", "Davao", "Eastern Visayas", "Ilocos", "MIMAROPA", "NCR", "Negros Island", "Northern Mindanao", "SOCCSKSARGEN", "Western Visayas", "Zamboanga Peninsula", "미분류"]};
export const REGION_GROUPS_BY_COUNTRY = {KR:REGION_GROUPS,...WORLD_REGION_GROUPS};
export function regionGroupSQL(prefix = '', withOverride = true) {
 /** @param {string} name */
 const col = name => prefix + name;
 const area = `lower(COALESCE(${col('region')},'')||' '||COALESCE(${col('city')},'')||' '||COALESCE(${col('address')},''))`;
 const municipality = `lower(COALESCE(${col('city')},''))`;
 // A province in the full address resolves ambiguous municipality names first.
 const clauses = [...provinceRules,...cityRules].map(([label, terms]) => `WHEN ${sqlHas(area,terms)} THEN ${quote(label)}`);
 for (const [label, terms] of municipalityRules) {
  const variants = terms.flatMap(t => /[가-힣]/.test(t) ? [t,t+'시',t+'군'] : [t,t+'-si',t+'-gun',t+' county']);
  clauses.push(`WHEN ${municipality} IN (${variants.map(quote).join(',')}) THEN ${quote(label)}`);
 }
 // Qualify every outer column: lookup table has a country_code column too.
 const outer = prefix || (withOverride ? 'courses.' : 'golfcore_catalog_courses.');
 const lookups = ['address','region','city'].map(field => `(SELECT rgm.region_group FROM course_region_mappings AS rgm WHERE rgm.country_code=${outer}country_code AND rgm.field=${quote(field)} AND rgm.source_value=lower(trim(COALESCE(${outer}${field},''))))`);
 const automatic = `(CASE WHEN ${col('country_code')}='KR' THEN (CASE ${clauses.join(' ')} ELSE '미분류' END) WHEN ${col('country_code')} IN (${Object.keys(WORLD_REGION_GROUPS).map(quote).join(',')}) THEN COALESCE(${lookups.join(',')},'미분류') ELSE COALESCE(NULLIF(${col('region')},''),NULLIF(${col('city')},''),'미분류') END)`;
 return withOverride ? `COALESCE(NULLIF(${col('region_group')},''),${automatic})` : automatic;
}
/** @param {unknown} raw @param {string | undefined} country @returns {TextVariants} */
export function inferredText(raw, country) {
 const value = String(raw || '').trim();
 const result = {ko:'',en:'',local:''};
 if (/[가-힣]/u.test(value)) result.ko = value;
 else if (/[\u3040-\u30ff\u3400-\u9fff\u0e00-\u0e7f]/u.test(value)) result.local = value;
 else if (country === 'VN' && /[^\x00-\x7f]/u.test(value)) result.local = value;
 else if (value) result.en = value;
 return result;
}
/** @param {Course} course @returns {Localization} */
export function localizationFor(course) {
 /** @type {Partial<Localization> | undefined} */
 let saved = course.localization;
 if (!saved && course.localized_json) { try { saved = JSON.parse(course.localized_json); } catch { saved = {}; } }
 const result = {name:inferredText(course.name,course.country_code),address:inferredText(course.address,course.country_code)};
 for (const field of /** @type {Array<'name'|'address'>} */ (['name','address'])) result[field] = { ...inferredText(course[field],course.country_code), ...(saved?.[field] || {}) };
 return result;
}
// Standalone so the very same function can be embedded in the admin client.
/** @param {Course} course @param {"name"|"address"} field @param {string} viewerRegion */
export function formatCourseText(course, field, viewerRegion) {
 const p = course.localization?.[field] || {ko:'',en:'',local:''};
 const raw = String(course[field] || '').trim();
 /** @param {unknown} x */
 const normalize = x => String(x || '').trim().normalize('NFC');
 const ko = normalize(p.ko), en = normalize(p.en);
 const local = course.country_code === 'KR' ? (ko || normalize(p.local)) : normalize(p.local);
 const values = (viewerRegion === 'KR' ? [ko,en,local] : [en,local]).filter(Boolean);
 const unique = [...new Map(values.map(v => [v.toLowerCase(),v])).values()];
 if (!unique.length) return raw;
 return unique[0] + (unique.length > 1 ? '(' + unique.slice(1).join(', ') + ')' : '');
}
/** @param {Course} course */
export function presentCourse(course, viewerRegion = '') {
 const localization = localizationFor(course);
 const source = {...course, localization};
 return {
  localization,
  region_group: course.list_region || course.region_group || '',
  region_group_override: course.region_group || '',
  display_name: formatCourseText(source,'name',viewerRegion),
  display_address: formatCourseText(source,'address',viewerRegion),
  translation_missing: /** @type {Array<'name'|'address'>} */ (['name','address']).filter(f => course[f] && (!localization[f].en || (viewerRegion === 'KR' && !localization[f].ko)))
 };
}
/** @param {Request} request */
export function viewerRegion(request, defaultRegion = '') {
 const value = new URL(request.url).searchParams.get('viewer_region') ?? request.headers.get('X-Device-Region');
 return typeof value === 'string' && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : defaultRegion;
}
/** @param {unknown} value */
export function validateLocalization(value) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_localization');
 const data = /** @type {Record<string,unknown>} */ (value);
 const out = {name:{ko:'',en:'',local:''},address:{ko:'',en:'',local:''}};
 for (const f of /** @type {Array<'name'|'address'>} */ (['name','address'])) {
  if (!data[f] || typeof data[f] !== 'object' || Array.isArray(data[f])) throw new Error('invalid_localization');
  const part = /** @type {Record<string,unknown>} */ (data[f]);
  for (const language of /** @type {Array<'ko'|'en'|'local'>} */ (['ko','en','local'])) {
   const s = part[language] ?? '';
   if (typeof s !== 'string' || /[\u0000-\u001f\u007f]/u.test(s) || [...s].length > (f === 'name' ? 160 : 500)) throw new Error('invalid_localization');
   out[f][language] = s.trim().normalize('NFC');
  }
 }
 return JSON.stringify(out);
}

/** Search actual values, not JSON keys such as "ko", "en" or "local".
 * @param {string} prefix */
export function courseSearchSQL(prefix = '') {
 const columns = ['name','region','city','address'].map(field => `COALESCE(${prefix}${field},'')`);
 for (const field of ['name','address']) for (const language of ['ko','en','local'])
  columns.push(`COALESCE(json_extract(${prefix}localized_json,'$.${field}.${language}'),'')`);
 return `lower(${columns.join("||' '||")})`;
}
