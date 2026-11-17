import {
  adapterForUrl,
  findingFreshness,
} from "@/lib/freightMarket/adapters";

export type MarketFindingScope = "verified" | "observation";

export interface MarketFinding {
  insight: string;
  sourceName: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  retrievedAt?: string | null;
  scope: MarketFindingScope;
  relevance: string;
  sourceType?: string;
  cadence?: "daily" | "weekly" | "monthly";
}

export interface MarketResearchResult {
  status: "completed" | "unavailable";
  findings: MarketFinding[];
  limitation: string | null;
  searchedAt: string;
}

const UNSUPPORTED_CLAIM =
  /tight(en|ening)|rates? (are |is )?(up|increas|rising|higher)|capacity (is |remains )?(tight|short|constrained)|shortage of trucks|truck shortage/i;

const RATE_FIGURE = /\$\s?\d|\b\d{3,5}\s?(per mile|\/mi|rpm)\b/i;

function sameResource(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.hostname === b.hostname && a.pathname === b.pathname;
  } catch {
    return false;
  }
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
    const adapter = sourceUrl ? adapterForUrl(sourceUrl) : null;
    if (!sourceUrl || !adapter) {
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

    const freshness = findingFreshness(publishedAt, searchedAt, adapter);
    const current = freshness === "current";
    const hasUnsupportedClaim = UNSUPPORTED_CLAIM.test(insight) || RATE_FIGURE.test(insight);

    if (hasUnsupportedClaim && !current) {
      limitationParts.push(
        "A rate or capacity claim was omitted because it was not tied to a current dated source.",
      );
      continue;
    }
    if (freshness === "undated" && hasUnsupportedClaim) {
      limitationParts.push(
        "A rate or capacity claim was omitted because the source had no publication date.",
      );
      continue;
    }
    if (freshness === "monthly") {
      limitationParts.push(
        "A monthly indicator was kept for internal context and is not a current weekly lane condition.",
      );
    }

    findings.push({
      insight,
      sourceName: sourceName || adapter.sourceName,
      sourceUrl,
      publishedAt,
      retrievedAt: searchedAt,
      scope: current ? "verified" : "observation",
      relevance,
      sourceType: adapter.sourceType,
      cadence: adapter.cadence,
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
    findings: findings.slice(0, 8),
    limitation,
    searchedAt,
  };
}
