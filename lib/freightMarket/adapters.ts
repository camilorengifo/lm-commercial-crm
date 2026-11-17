export type SourceCadence = "daily" | "weekly" | "monthly";

export interface SourceAdapter {
  id: string;
  sourceName: string;
  sourceType: "spot_rates" | "produce" | "diesel" | "weather" | "disruption" | "other";
  hosts: string[];
  cadence: SourceCadence;
  maxAgeDays: number;
}

export const SOURCE_ADAPTERS: SourceAdapter[] = [
  {
    id: "dat",
    sourceName: "DAT Trendlines",
    sourceType: "spot_rates",
    hosts: ["dat.com"],
    cadence: "weekly",
    maxAgeDays: 10,
  },
  {
    id: "usda",
    sourceName: "USDA Agricultural Marketing Service",
    sourceType: "produce",
    hosts: ["usda.gov"],
    cadence: "weekly",
    maxAgeDays: 10,
  },
  {
    id: "eia",
    sourceName: "U.S. Energy Information Administration",
    sourceType: "diesel",
    hosts: ["eia.gov"],
    cadence: "weekly",
    maxAgeDays: 10,
  },
  {
    id: "noaa",
    sourceName: "National Weather Service",
    sourceType: "weather",
    hosts: ["weather.gov", "noaa.gov"],
    cadence: "daily",
    maxAgeDays: 2,
  },
  {
    id: "dot",
    sourceName: "U.S. Department of Transportation",
    sourceType: "disruption",
    hosts: ["dot.gov"],
    cadence: "weekly",
    maxAgeDays: 10,
  },
  {
    id: "freightwaves",
    sourceName: "FreightWaves",
    sourceType: "spot_rates",
    hosts: ["freightwaves.com"],
    cadence: "weekly",
    maxAgeDays: 10,
  },
  {
    id: "joc",
    sourceName: "Journal of Commerce",
    sourceType: "other",
    hosts: ["joc.com"],
    cadence: "weekly",
    maxAgeDays: 10,
  },
  {
    id: "ttnews",
    sourceName: "Transport Topics",
    sourceType: "other",
    hosts: ["ttnews.com"],
    cadence: "weekly",
    maxAgeDays: 10,
  },
  {
    id: "bls",
    sourceName: "Bureau of Labor Statistics",
    sourceType: "other",
    hosts: ["bls.gov"],
    cadence: "monthly",
    maxAgeDays: 45,
  },
  {
    id: "atri",
    sourceName: "ATRI",
    sourceType: "other",
    hosts: ["atri-online.org"],
    cadence: "monthly",
    maxAgeDays: 45,
  },
];

export function adapterForUrl(url: string): SourceAdapter | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  const matches = SOURCE_ADAPTERS.filter((adapter) =>
    adapter.hosts.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    ),
  );
  matches.sort((left, right) => {
    const leftHost = Math.max(...left.hosts.map((item) => item.length));
    const rightHost = Math.max(...right.hosts.map((item) => item.length));
    return rightHost - leftHost;
  });
  return matches[0] ?? null;
}

export function ageInDays(publishedAt: string | null, retrievedAt: string): number | null {
  if (!publishedAt) return null;
  const published = Date.parse(publishedAt);
  const retrieved = Date.parse(retrievedAt);
  if (Number.isNaN(published) || Number.isNaN(retrieved)) return null;
  return (retrieved - published) / 86_400_000;
}

export type FindingFreshness = "current" | "stale" | "undated" | "monthly";

export function findingFreshness(
  publishedAt: string | null,
  retrievedAt: string,
  adapter: SourceAdapter | null,
): FindingFreshness {
  if (!adapter) return "undated";
  if (adapter.cadence === "monthly") return "monthly";
  const age = ageInDays(publishedAt, retrievedAt);
  if (age === null) return "undated";
  if (age < -1) return "undated";
  return age <= adapter.maxAgeDays ? "current" : "stale";
}
