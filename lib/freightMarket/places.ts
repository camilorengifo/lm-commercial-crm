const STATE_NAMES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

const STATE_CODES = new Set(Object.values(STATE_NAMES));

const REGION_HINTS: Record<string, string[]> = {
  TX: ["texas", "south texas", "rio grande", "gulf coast", "mcallen"],
  NY: ["new york", "northeast", "bronx", "mid-atlantic"],
  CA: ["california", "west coast", "southern california"],
  FL: ["florida", "southeast"],
  IL: ["illinois", "chicago", "midwest"],
  GA: ["georgia", "southeast", "atlanta"],
  AZ: ["arizona", "southwest"],
  WA: ["washington", "pacific northwest"],
  PA: ["pennsylvania", "northeast"],
  NJ: ["new jersey", "northeast"],
  OH: ["ohio", "midwest"],
  CO: ["colorado", "rocky mountain"],
  NC: ["north carolina", "southeast"],
};

export function stateCodesFromPlace(place: string | null | undefined): string[] {
  if (!place) return [];
  const lower = place.toLowerCase();
  const codes = new Set<string>();
  const names = Object.keys(STATE_NAMES).sort((left, right) => right.length - left.length);
  for (const name of names) {
    if (name.length === 2) continue;
    if (lower.includes(name)) codes.add(STATE_NAMES[name]);
  }
  for (const token of lower.split(/[^a-z]+/)) {
    const code = token.toUpperCase();
    if (STATE_CODES.has(code)) codes.add(code);
  }
  return [...codes];
}

export function regionHintsForPlace(place: string | null | undefined): string[] {
  const hints = new Set<string>();
  const lower = (place ?? "").toLowerCase();
  for (const city of lower.split(/[^a-z]+/)) {
    if (city.length > 3) hints.add(city);
  }
  for (const code of stateCodesFromPlace(place)) {
    hints.add(code.toLowerCase());
    for (const hint of REGION_HINTS[code] ?? []) hints.add(hint);
  }
  return [...hints];
}
