export type MarketFindingScope = "verified" | "observation";

export interface MarketFinding {
  insight: string;
  sourceName: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  scope: MarketFindingScope;
  relevance: string;
}

export interface MarketResearchResult {
  status: "completed" | "unavailable";
  findings: MarketFinding[];
  limitation: string | null;
  searchedAt: string;
}

const ALLOWED_HOST_SUFFIXES = [
  "dat.com",
  "usda.gov",
  "weather.gov",
  "noaa.gov",
  "fmcsa.dot.gov",
  "dot.gov",
  "freightwaves.com",
  "joc.com",
  "ttnews.com",
  "bls.gov",
  "atri-online.org",
];

const CURRENT_WINDOW_DAYS = 45;

const UNSUPPORTED_CLAIM =
  /tight(en|ening)|rates? (are |is )?(up|increas|rising|higher)|capacity (is |remains )?(tight|short|constrained)|shortage of trucks|truck shortage/i;

const RATE_FIGURE = /\$\s?\d|\b\d{3,5}\s?(per mile|\/mi|rpm)\b/i;

function hostAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function sameResource(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.hostname === b.hostname && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function sanitizeMarketFindings(
  value: unknown,
  citations: Array<{ url: string; title: string }>,
  searchedAt: string,
): MarketResearchResult {
  const record = asRecord(value);
  const rawFindings = Array.isArray(record?.findings) ? record.findings : [];
  const limitationParts: string[] = [];
  const statedLimitation =
    typeof record?.limitation === "string" ? record.limitation.trim() : "";
  if (statedLimitation) limitationParts.push(statedLimitation);

  const findings: MarketFinding[] = [];
  const citedUrls = citations.map((citation) => citation.url).filter(Boolean);

  for (const item of rawFindings) {
    const finding = asRecord(item);
    if (!finding) continue;
    const insight = typeof finding.insight === "string" ? finding.insight.trim() : "";
    const relevance =
      typeof finding.relevance === "string" ? finding.relevance.trim() : "";
    const sourceName =
      typeof finding.sourceName === "string" ? finding.sourceName.trim() : "";
    const publishedAt =
      typeof finding.publishedAt === "string" && finding.publishedAt.trim()
        ? finding.publishedAt.trim()
        : null;
    const sourceUrl =
      typeof finding.sourceUrl === "string" && finding.sourceUrl.trim()
        ? finding.sourceUrl.trim()
        : null;

    if (!insight || !relevance) continue;
    if (!sourceUrl || !hostAllowed(sourceUrl)) {
      limitationParts.push(
        "A market statement was omitted because it did not cite an allowed freight source URL.",
      );
      continue;
    }
    if (
      citedUrls.length > 0 &&
      !citedUrls.some((url) => sameResource(url, sourceUrl))
    ) {
      limitationParts.push(
        "A market statement was omitted because its URL was not in the search citations.",
      );
      continue;
    }

    const publishedTime = parseDate(publishedAt);
    const ageDays =
      publishedTime === null
        ? null
        : (Date.parse(searchedAt) - publishedTime) / 86_400_000;
    const current = ageDays !== null && ageDays >= -1 && ageDays <= CURRENT_WINDOW_DAYS;
    const hasUnsupportedClaim = UNSUPPORTED_CLAIM.test(insight) || RATE_FIGURE.test(insight);

    if (hasUnsupportedClaim && !current) {
      limitationParts.push(
        "A rate or capacity claim was omitted because it was not tied to a current dated source.",
      );
      continue;
    }

    findings.push({
      insight,
      sourceName: sourceName || new URL(sourceUrl).hostname,
      sourceUrl,
      publishedAt,
      scope: current ? "verified" : "observation",
      relevance,
    });
  }

  const uniqueLimitations = [...new Set(limitationParts.filter(Boolean))];
  const limitation =
    findings.length === 0
      ? uniqueLimitations.join(" ") ||
        "No current source tied to this customer's recorded lanes was retrieved. Do not state rates, capacity, or weather disruptions as current."
      : uniqueLimitations.join(" ") || null;

  return {
    status: findings.length > 0 ? "completed" : "unavailable",
    findings: findings.slice(0, 5),
    limitation,
    searchedAt,
  };
}
