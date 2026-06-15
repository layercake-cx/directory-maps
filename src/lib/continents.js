/**
 * Maps a free-text country value (as stored on listings) to a continent.
 *
 * Listings only carry a `country` string (from CSV / Sheets import), so the
 * continent filter derives the continent here rather than from a dedicated
 * column. Matching is case-insensitive and covers common names, abbreviations
 * and ISO alpha-2 / alpha-3 codes. Returns one of the CONTINENTS values or
 * null when the country is empty or unrecognised.
 */

export const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
  "Antarctica",
];

// Canonical key -> continent. Keys are lowercased and stripped of punctuation.
const COUNTRY_CONTINENT = {
  // ── Europe ──────────────────────────────────────────────────────────
  albania: "Europe", andorra: "Europe", austria: "Europe", belarus: "Europe",
  belgium: "Europe", "bosnia and herzegovina": "Europe", bosnia: "Europe",
  bulgaria: "Europe", croatia: "Europe", cyprus: "Europe", czechia: "Europe",
  "czech republic": "Europe", denmark: "Europe", estonia: "Europe",
  "faroe islands": "Europe", finland: "Europe", france: "Europe", germany: "Europe",
  gibraltar: "Europe", greece: "Europe", guernsey: "Europe", hungary: "Europe",
  iceland: "Europe", ireland: "Europe", "isle of man": "Europe", italy: "Europe",
  jersey: "Europe", kosovo: "Europe", latvia: "Europe", liechtenstein: "Europe",
  lithuania: "Europe", luxembourg: "Europe", malta: "Europe", moldova: "Europe",
  monaco: "Europe", montenegro: "Europe", netherlands: "Europe",
  "the netherlands": "Europe", "north macedonia": "Europe", macedonia: "Europe",
  norway: "Europe", poland: "Europe", portugal: "Europe", romania: "Europe",
  russia: "Europe", "russian federation": "Europe", "san marino": "Europe",
  serbia: "Europe", slovakia: "Europe", slovenia: "Europe", spain: "Europe",
  sweden: "Europe", switzerland: "Europe", ukraine: "Europe",
  "united kingdom": "Europe", uk: "Europe", "great britain": "Europe",
  britain: "Europe", england: "Europe", scotland: "Europe", wales: "Europe",
  "northern ireland": "Europe", "vatican city": "Europe", vatican: "Europe",
  "holy see": "Europe",

  // ── North America ───────────────────────────────────────────────────
  "united states": "North America", "united states of america": "North America",
  usa: "North America", us: "North America", "u s a": "North America",
  america: "North America", canada: "North America", mexico: "North America",
  "costa rica": "North America", cuba: "North America",
  "dominican republic": "North America", "el salvador": "North America",
  guatemala: "North America", haiti: "North America", honduras: "North America",
  jamaica: "North America", nicaragua: "North America", panama: "North America",
  bahamas: "North America", barbados: "North America", belize: "North America",
  bermuda: "North America", greenland: "North America",
  "puerto rico": "North America", "trinidad and tobago": "North America",

  // ── South America ───────────────────────────────────────────────────
  argentina: "South America", bolivia: "South America", brazil: "South America",
  chile: "South America", colombia: "South America", ecuador: "South America",
  guyana: "South America", paraguay: "South America", peru: "South America",
  suriname: "South America", uruguay: "South America", venezuela: "South America",
  "french guiana": "South America",

  // ── Asia ────────────────────────────────────────────────────────────
  afghanistan: "Asia", armenia: "Asia", azerbaijan: "Asia", bahrain: "Asia",
  bangladesh: "Asia", bhutan: "Asia", brunei: "Asia", cambodia: "Asia",
  china: "Asia", "hong kong": "Asia", macau: "Asia", georgia: "Asia",
  india: "Asia", indonesia: "Asia", iran: "Asia", iraq: "Asia", israel: "Asia",
  japan: "Asia", jordan: "Asia", kazakhstan: "Asia", kuwait: "Asia",
  kyrgyzstan: "Asia", laos: "Asia", lebanon: "Asia", malaysia: "Asia",
  maldives: "Asia", mongolia: "Asia", myanmar: "Asia", burma: "Asia",
  nepal: "Asia", "north korea": "Asia", oman: "Asia", pakistan: "Asia",
  palestine: "Asia", philippines: "Asia", qatar: "Asia",
  "saudi arabia": "Asia", singapore: "Asia", "south korea": "Asia",
  korea: "Asia", "sri lanka": "Asia", syria: "Asia", taiwan: "Asia",
  tajikistan: "Asia", thailand: "Asia", "timor leste": "Asia",
  "east timor": "Asia", turkey: "Asia", turkmenistan: "Asia",
  "united arab emirates": "Asia", uae: "Asia", uzbekistan: "Asia",
  vietnam: "Asia", yemen: "Asia",

  // ── Africa ──────────────────────────────────────────────────────────
  algeria: "Africa", angola: "Africa", benin: "Africa", botswana: "Africa",
  "burkina faso": "Africa", burundi: "Africa", cameroon: "Africa",
  "cape verde": "Africa", "central african republic": "Africa", chad: "Africa",
  comoros: "Africa", congo: "Africa", "democratic republic of the congo": "Africa",
  "dr congo": "Africa", "ivory coast": "Africa", "cote d ivoire": "Africa",
  djibouti: "Africa", egypt: "Africa", "equatorial guinea": "Africa",
  eritrea: "Africa", eswatini: "Africa", swaziland: "Africa", ethiopia: "Africa",
  gabon: "Africa", gambia: "Africa", ghana: "Africa", guinea: "Africa",
  "guinea bissau": "Africa", kenya: "Africa", lesotho: "Africa", liberia: "Africa",
  libya: "Africa", madagascar: "Africa", malawi: "Africa", mali: "Africa",
  mauritania: "Africa", mauritius: "Africa", morocco: "Africa", mozambique: "Africa",
  namibia: "Africa", niger: "Africa", nigeria: "Africa", rwanda: "Africa",
  senegal: "Africa", seychelles: "Africa", "sierra leone": "Africa",
  somalia: "Africa", "south africa": "Africa", "south sudan": "Africa",
  sudan: "Africa", tanzania: "Africa", togo: "Africa", tunisia: "Africa",
  uganda: "Africa", zambia: "Africa", zimbabwe: "Africa",

  // ── Oceania ─────────────────────────────────────────────────────────
  australia: "Oceania", fiji: "Oceania", kiribati: "Oceania",
  "marshall islands": "Oceania", micronesia: "Oceania", nauru: "Oceania",
  "new zealand": "Oceania", palau: "Oceania", "papua new guinea": "Oceania",
  samoa: "Oceania", "solomon islands": "Oceania", tonga: "Oceania",
  tuvalu: "Oceania", vanuatu: "Oceania", "new caledonia": "Oceania",
  "french polynesia": "Oceania", guam: "Oceania",

  // ── Antarctica ──────────────────────────────────────────────────────
  antarctica: "Antarctica",

  // ── ISO alpha-2 codes ───────────────────────────────────────────────
  gb: "Europe", ie: "Europe", fr: "Europe", de: "Europe", es: "Europe",
  it: "Europe", nl: "Europe", be: "Europe", ch: "Europe", at: "Europe",
  se: "Europe", no: "Europe", dk: "Europe", fi: "Europe", pt: "Europe",
  pl: "Europe", cz: "Europe", gr: "Europe", ro: "Europe", hu: "Europe",
  ua: "Europe", ru: "Europe",
  us: "North America", ca: "North America", mx: "North America",
  br: "South America", ar: "South America", cl: "South America", co: "South America",
  cn: "Asia", jp: "Asia", in: "Asia", sg: "Asia", kr: "Asia", ae: "Asia",
  sa: "Asia", il: "Asia", tr: "Asia", th: "Asia", my: "Asia", id: "Asia",
  hk: "Asia", tw: "Asia", ph: "Asia", vn: "Asia",
  za: "Africa", eg: "Africa", ng: "Africa", ke: "Africa", ma: "Africa",
  au: "Oceania", nz: "Oceania",
};

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/['`’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the continent for a free-text country, or null if unknown/empty. */
export function continentForCountry(country) {
  const key = normalizeKey(country);
  if (!key) return null;
  if (COUNTRY_CONTINENT[key]) return COUNTRY_CONTINENT[key];
  // Try collapsing common prefixes like "republic of …".
  const stripped = key.replace(/^(the |republic of |kingdom of |state of )/g, "").trim();
  if (stripped !== key && COUNTRY_CONTINENT[stripped]) return COUNTRY_CONTINENT[stripped];
  return null;
}
