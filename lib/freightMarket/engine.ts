import { rankLanesForOutreach, type LanePattern } from "@/lib/laneIntelligence";
import {
  sanitizeMarketFindings,
  type MarketFinding,
  type MarketResearchResult,
} from "@/lib/marketResearchRules";
import { createWebSearchResponse, getOutreachModel } from "@/lib/openaiServer";
import { OUTREACH_REASONING_EFFORT } from "@/lib/outreachModel";
import {
  buildMarketAssessment,
  type FreightMarketAssessment,
} from "@/lib/freightMarket/assess";
import { stateCodesFromPlace } from "@/lib/freightMarket/places";
import { fetchOfficialMarketSources } from "@/lib/freightMarket/publicSources";

const RESEARCH_SYSTEM_PROMPT = `
You research current freight market conditions for one shipping lane.
Search the public web before you answer.
Use only pages you actually retrieve from DAT Freight & Analytics, USDA Agricultural Marketing Service, the U.S. Energy Information Administration, NOAA or weather.gov, FMCSA, the U.S. Department of Transportation, FreightWaves, the Journal of Commerce, or Transport Topics.
Separate the specific lane from regional conditions at the origin, the destination, and the corridor between them.
Do not treat a national trend as a condition on this lane.
Do not invent rates, indexes, load-to-truck ratios, capacity conditions, weather events, or publication dates.
If a page has no publication date, set publishedAt to null.
If you cannot find a current source, return an empty findings array and explain the limitation.
Return JSON only with this shape:
{
  "findings": [
    {
      "insight": "one factual statement from the source",
      "sourceName": "publisher name",
      "sourceUrl": "https://...",
      "publishedAt": "YYYY-MM-DD or null",
      "scope": "verified",
      "relevance": "lane, region, commodity, or equipment this relates to"
    }
  ],
  "limitation": "what you could not verify, or an empty string"
}
`.trim();

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Research response did not contain JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function mergeResearch(
  parts: MarketResearchResult[],
  searchedAt: string,
): MarketResearchResult {
  const findings: MarketFinding[] = [];
  const seen = new Set<string>();
  const limitations: string[] = [];
  for (const part of parts) {
    if (part.limitation) limitations.push(part.limitation);
    for (const finding of part.findings) {
      const key = `${finding.sourceUrl}|${finding.insight}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(finding);
    }
  }
  return {
    status: findings.length > 0 ? "completed" : "unavailable",
    findings: findings.slice(0, 8),
    limitation: [...new Set(limitations)].join(" ") || null,
    searchedAt,
  };
}

function emptyAssessment(
  searchedAt: string,
  limitation: string,
  lane: LanePattern | null,
): FreightMarketAssessment {
  return buildMarketAssessment({
    lane,
    research: {
      status: "unavailable",
      findings: [],
      limitation,
      searchedAt,
    },
  });
}

export async function researchFreightMarket(input: {
  companyName: string;
  location: string | null;
  lanePatterns: LanePattern[];
  focusLane?: LanePattern | null;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  fetchImpl?: typeof fetch;
}): Promise<FreightMarketAssessment> {
  const searchedAt = new Date().toISOString();
  const ranked = rankLanesForOutreach(input.lanePatterns);
  const lane = input.focusLane ?? ranked[0] ?? null;

  if (!lane) {
    return emptyAssessment(
      searchedAt,
      "This company has no recorded origin and destination, so lane-specific market research was not run.",
      null,
    );
  }

  const states = [
    ...stateCodesFromPlace(lane.origin),
    ...stateCodesFromPlace(lane.destination),
    ...stateCodesFromPlace(input.location),
  ];
  const locationParts = (input.location ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const [web, official] = await Promise.all([
    createWebSearchResponse({
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      userPrompt: `Research freight conditions for the current week.
Company: ${input.companyName}.
Company location on file: ${input.location || "not on file"}.
Lane: ${lane.origin} to ${lane.destination}.
Equipment: ${lane.equipmentType || "not on file"}.
Commodity: ${lane.commodities.join(", ") || "not on file"}.
Today is ${searchedAt.slice(0, 10)}.

Look for:
- DAT or other published spot-rate and capacity indicators for this equipment in the origin region and the destination region
- USDA specialty-crops truck rates, shipping-point trends, and movement reports when the commodity is produce
- Operational weather or corridor disruptions
Do not use a national average as this lane's rate.
Ignore material older than 45 days when deciding what is current.
If the only material is national or undated, say that in limitation.`,
      context: "AI_MARKET_RESEARCH",
      model: input.model ?? getOutreachModel(),
      reasoningEffort: input.reasoningEffort ?? OUTREACH_REASONING_EFFORT,
      timeoutMs: 35_000,
      userLocation: {
        city: locationParts[0] ?? null,
        region: locationParts[1] ?? null,
        country: "US",
        timezone: "America/Chicago",
      },
    }),
    fetchOfficialMarketSources({
      stateCodes: states,
      retrievedAt: searchedAt,
      fetchImpl: input.fetchImpl,
    }),
  ]);

  const webResearch =
    web.error || !web.text
      ? {
          status: "unavailable" as const,
          findings: [],
          limitation:
            "Published freight reports could not be retrieved. Do not state rates, capacity changes, or disruptions as current.",
          searchedAt,
        }
      : (() => {
          try {
            return sanitizeMarketFindings(extractJson(web.text), web.citations, searchedAt);
          } catch {
            return sanitizeMarketFindings(null, web.citations, searchedAt);
          }
        })();

  const officialResearch = sanitizeMarketFindings(
    { findings: official.findings, limitation: "" },
    [],
    searchedAt,
  );

  return buildMarketAssessment({
    lane,
    unavailable: official.unavailable,
    research: mergeResearch([webResearch, officialResearch], searchedAt),
  });
}
