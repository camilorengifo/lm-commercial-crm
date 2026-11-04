import type { LanePattern } from "@/lib/laneIntelligence";
import {
  sanitizeMarketFindings,
  type MarketResearchResult,
} from "@/lib/marketResearchRules";
import { createWebSearchResponse } from "@/lib/openaiServer";

export type {
  MarketFinding,
  MarketFindingScope,
  MarketResearchResult,
} from "@/lib/marketResearchRules";
export { sanitizeMarketFindings } from "@/lib/marketResearchRules";

const RESEARCH_SYSTEM_PROMPT = `
You research current freight market conditions for a freight broker.
Search the public web before you answer.
Use only pages you actually retrieve from reputable transportation sources such as DAT Freight & Analytics, USDA Agricultural Marketing Service, NOAA or weather.gov, FMCSA, the U.S. Department of Transportation, Bureau of Labor Statistics, FreightWaves, the Journal of Commerce, Transport Topics, or ATRI.
Do not invent rates, indexes, capacity conditions, weather events, or publication dates.
Do not describe a national trend as a condition on a specific lane.
If a page has no publication date, set publishedAt to null.
If you cannot find a current source tied to the customer's recorded lanes, regions, commodities, or equipment, return an empty findings array and explain the limitation.
Return JSON only with this shape:
{
  "findings": [
    {
      "insight": "one factual statement from the source",
      "sourceName": "publisher name",
      "sourceUrl": "https://...",
      "publishedAt": "YYYY-MM-DD or null",
      "scope": "verified",
      "relevance": "which recorded lane, region, commodity, or equipment this relates to"
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

export async function researchFreightMarket(input: {
  companyName: string;
  location: string | null;
  lanePatterns: LanePattern[];
}): Promise<MarketResearchResult> {
  const searchedAt = new Date().toISOString();
  const lanes = input.lanePatterns.slice(0, 8).map((lane) => ({
    origin: lane.origin,
    destination: lane.destination,
    equipmentType: lane.equipmentType,
    commodities: lane.commodities,
    lastRecordedAt: lane.lastRecordedAt,
    quoteCount: lane.quoteCount,
  }));

  if (lanes.length === 0) {
    return {
      status: "unavailable",
      findings: [],
      limitation:
        "This company has no recorded origin and destination, so lane-specific market research was not run.",
      searchedAt,
    };
  }

  const locationParts = (input.location ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const { text, citations, error } = await createWebSearchResponse({
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    userPrompt: `Research current freight conditions that are relevant to ${input.companyName}.
Company location on file: ${input.location || "not on file"}.
Recorded lanes and equipment, from CRM only:
${JSON.stringify(lanes, null, 2)}

Search for conditions on these specific regions, corridors, commodities, and equipment types.
Today is ${searchedAt.slice(0, 10)}.
Ignore articles older than 45 days when deciding what is current.
If the only available material is older or national, say that in limitation and do not present it as a current lane condition.`,
    context: "AI_MARKET_RESEARCH",
    userLocation: {
      city: locationParts[0] ?? null,
      region: locationParts[1] ?? null,
      country: "US",
      timezone: "America/Bogota",
    },
  });

  if (error || !text) {
    return {
      status: "unavailable",
      findings: [],
      limitation:
        "Current market research could not be retrieved. Do not state rates, capacity changes, or weather disruptions as current.",
      searchedAt,
    };
  }

  try {
    return sanitizeMarketFindings(extractJson(text), citations, searchedAt);
  } catch {
    return sanitizeMarketFindings(null, citations, searchedAt);
  }
}
