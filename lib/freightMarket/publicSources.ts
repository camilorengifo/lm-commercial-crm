import type { MarketFinding } from "@/lib/marketResearchRules";

const OPERATIONAL_WEATHER =
  /blizzard|winter storm|ice storm|flood|hurricane|tropical storm|high wind|tornado|freezing rain|dense fog|severe thunderstorm|wind advisory|winter weather|storm warning|coastal flood/i;

const EIA_PAGE = "https://www.eia.gov/petroleum/gasdiesel/";

interface NoaaFeature {
  properties?: {
    event?: string;
    headline?: string;
    sent?: string;
    effective?: string;
    areaDesc?: string;
    id?: string;
  };
}

export function parseNoaaAlerts(
  payload: unknown,
  areaCode: string,
  retrievedAt: string,
): MarketFinding[] {
  const features = Array.isArray((payload as { features?: unknown })?.features)
    ? ((payload as { features: NoaaFeature[] }).features ?? [])
    : [];
  const findings: MarketFinding[] = [];

  for (const feature of features) {
    const properties = feature.properties;
    const event = properties?.event?.trim() ?? "";
    const headline = properties?.headline?.trim() || event;
    if (!event || !OPERATIONAL_WEATHER.test(`${event} ${headline}`)) continue;
    const alertId = properties?.id?.trim() ?? "";
    const sourceUrl = alertId.startsWith("https://api.weather.gov/")
      ? alertId
      : `https://api.weather.gov/alerts/active?area=${areaCode}`;
    findings.push({
      insight: headline,
      sourceName: "National Weather Service",
      sourceUrl,
      publishedAt: (properties?.sent || properties?.effective || "").slice(0, 10) || null,
      scope: "verified",
      relevance: `${properties?.areaDesc || areaCode} transportation weather`,
      sourceType: "weather",
      retrievedAt,
    });
    if (findings.length >= 2) break;
  }

  return findings;
}

export function parseEiaDiesel(
  payload: unknown,
  retrievedAt: string,
): MarketFinding[] {
  const rows = (payload as { response?: { data?: unknown[] } })?.response?.data;
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const parsed = rows
    .map((row) => {
      const record = row as {
        period?: string;
        value?: number | string;
        "area-name"?: string;
        duoarea?: string;
      };
      const value = typeof record.value === "number" ? record.value : Number(record.value);
      const period = record.period?.slice(0, 10) ?? "";
      if (!period || !Number.isFinite(value)) return null;
      return {
        period,
        value,
        area: record["area-name"] || record.duoarea || "U.S.",
      };
    })
    .filter((row): row is { period: string; value: number; area: string } => row !== null);

  if (parsed.length === 0) return [];
  const latest = parsed[0];
  const previous = parsed[1];
  const change =
    previous && previous.value !== latest.value
      ? ` The prior published weekly observation was ${previous.value.toFixed(3)} on ${previous.period}.`
      : "";

  return [
    {
      insight: `EIA published the weekly on-highway diesel price for ${latest.area} at ${latest.value.toFixed(3)} dollars per gallon for the week of ${latest.period}.${change} This is not a lane rate.`,
      sourceName: "U.S. Energy Information Administration",
      sourceUrl: EIA_PAGE,
      publishedAt: latest.period,
      scope: "verified",
      relevance: `${latest.area} weekly diesel price, not a shipping-lane rate`,
      sourceType: "diesel",
      retrievedAt,
    },
  ];
}

async function readJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown | null> {
  const response = await fetchImpl(url, init);
  if (!response.ok) return null;
  return response.json();
}

export async function fetchOfficialMarketSources(input: {
  stateCodes: string[];
  retrievedAt: string;
  fetchImpl?: typeof fetch;
}): Promise<{ findings: MarketFinding[]; unavailable: string[] }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const unavailable: string[] = [];
  const findings: MarketFinding[] = [];
  const states = [...new Set(input.stateCodes)].slice(0, 4);

  const weatherTasks = states.map(async (area) => {
    try {
      const payload = await readJson(
        `https://api.weather.gov/alerts/active?area=${area}`,
        {
          headers: {
            Accept: "application/geo+json",
            "User-Agent": "lm-commercial-crm (internal freight research)",
          },
          signal: AbortSignal.timeout(8_000),
        },
        fetchImpl,
      );
      if (!payload) {
        unavailable.push(`Weather alerts for ${area} were not available.`);
        return;
      }
      findings.push(...parseNoaaAlerts(payload, area, input.retrievedAt));
    } catch {
      unavailable.push(`Weather alerts for ${area} were not available.`);
    }
  });

  const dieselTask = (async () => {
    const apiKey = process.env.EIA_API_KEY?.trim();
    if (!apiKey) {
      unavailable.push("Weekly diesel prices were not retrieved.");
      return;
    }
    const url = new URL("https://api.eia.gov/v2/petroleum/pri/gnd/data/");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("frequency", "weekly");
    url.searchParams.append("data[]", "value");
    url.searchParams.append("facets[product][]", "EPD2D");
    url.searchParams.append("facets[duoarea][]", "NUS");
    url.searchParams.set("sort[0][column]", "period");
    url.searchParams.set("sort[0][direction]", "desc");
    url.searchParams.set("length", "2");
    try {
      const payload = await readJson(
        url.toString(),
        { signal: AbortSignal.timeout(8_000) },
        fetchImpl,
      );
      const diesel = payload ? parseEiaDiesel(payload, input.retrievedAt) : [];
      if (diesel.length === 0) {
        unavailable.push("Weekly diesel prices were not retrieved.");
        return;
      }
      findings.push(...diesel);
    } catch {
      unavailable.push("Weekly diesel prices were not retrieved.");
    }
  })();

  await Promise.all([...weatherTasks, dieselTask]);
  return { findings, unavailable };
}
