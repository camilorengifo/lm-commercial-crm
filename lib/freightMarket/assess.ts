import type { LanePattern } from "@/lib/laneIntelligence";
import type { MarketFinding, MarketResearchResult } from "@/lib/marketResearchRules";
import { regionHintsForPlace } from "@/lib/freightMarket/places";

export type MarketDirection =
  | "firming"
  | "softening"
  | "mixed"
  | "insufficient_data";

export interface FreightMarketAssessment extends MarketResearchResult {
  direction: MarketDirection;
  emailGuidance: string[];
  origin: string | null;
  destination: string | null;
  equipment: string | null;
  commodity: string | null;
  periodStart: string;
  periodEnd: string;
  unavailable: string[];
  conflicts: string[];
}

const TIGHT =
  /tight(?:er|ening)?|firm(?:ing|er)|shortage|limited (?:truck |reefer |capacity)|upward|rising demand|stronger demand|increased demand/i;
const SOFT =
  /soft(?:er|ened|ening)|loos(?:e|er)|more (?:available )?(?:[\w-]+ )?(?:trucks?|capacity)|additional (?:trucks?|capacity)|ample capacity|weaker demand|declining demand|downward/i;
const SEASONAL =
  /harvest|produce|shipping point|specialty crop|avocado|tomato|season|movement|crossings/i;
const WEATHER =
  /blizzard|winter storm|ice storm|flood|hurricane|tropical storm|high wind|tornado|freezing rain|dense fog|severe thunderstorm|closure|delay/i;
const STATISTICS =
  /\$\s?\d|\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?percent\b|\b\d+(?:\.\d+)?\s?(?:per mile|\/mi|rpm)\b|\bload-to-truck\b/i;
const PUBLISHER =
  /\b(?:DAT(?: Trendlines)?|USDA(?: AMS)?|EIA|NOAA|FreightWaves|Transport Topics|Journal of Commerce|National Weather Service)\b/gi;

export function currentResearchPeriod(now = new Date()): {
  start: string;
  end: string;
} {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(utc);
  start.setUTCDate(utc.getUTCDate() + mondayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return { start: format(start), end: format(end) };
}

function hayHasHint(hay: string, hint: string): boolean {
  if (hint.length < 2) return false;
  if (hint.length <= 3) return new RegExp(`\\b${hint}\\b`, "i").test(hay);
  return hay.includes(hint);
}

function relevantToLane(finding: MarketFinding, lane: LanePattern | null): boolean {
  if (!lane) return false;
  const hay = `${finding.relevance} ${finding.insight}`.toLowerCase();
  const hints = [
    ...regionHintsForPlace(lane.origin),
    ...regionHintsForPlace(lane.destination),
  ];
  const namesRegion = hints.some((hint) => hayHasHint(hay, hint));
  if (
    /\bnational\b|\bnationwide\b|\bunited states\b|\bu\.s\.\b/.test(hay) &&
    !namesRegion
  ) {
    return false;
  }
  return namesRegion;
}

export function stripMarketStatistics(value: string): string {
  return value
    .replace(PUBLISHER, "")
    .replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, "")
    .replace(/\b\d+(?:\.\d+)?\s?(?:%|percent\b)/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s?(?:dollars? per gallon|per mile|\/mi|rpm)\b/gi, "")
    .replace(/\b(?:per mile|\/mi|rpm|dollars per gallon)\b/gi, "")
    .replace(/\bload-to-truck(?: ratio)?\b[^.]*/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/\bat\s*,/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function signal(text: string): "firming" | "softening" | "other" {
  const tight = TIGHT.test(text);
  const soft = SOFT.test(text);
  if (tight && soft) return "other";
  if (tight) return "firming";
  if (soft) return "softening";
  return "other";
}

export function classifyMarketDirection(findings: MarketFinding[]): {
  direction: MarketDirection;
  conflicts: string[];
} {
  let firming = 0;
  let softening = 0;
  for (const finding of findings) {
    if (finding.scope !== "verified") continue;
    if (finding.sourceType === "diesel" || finding.sourceType === "weather") continue;
    const kind = signal(`${finding.insight} ${finding.relevance}`);
    if (kind === "firming") firming += 1;
    if (kind === "softening") softening += 1;
  }
  if (firming > 0 && softening > 0) {
    return {
      direction: "mixed",
      conflicts: [
        "Verified sources point in different directions. Do not state a single market direction.",
      ],
    };
  }
  if (firming > 0) return { direction: "firming", conflicts: [] };
  if (softening > 0) return { direction: "softening", conflicts: [] };
  return { direction: "insufficient_data", conflicts: [] };
}

function guidanceFrom(finding: MarketFinding): string | null {
  if (finding.scope !== "verified") return null;
  if (finding.sourceType === "diesel") return null;
  const text = `${finding.insight} ${finding.relevance}`;
  const useful =
    finding.sourceType === "weather"
      ? WEATHER.test(text)
      : TIGHT.test(text) || SOFT.test(text) || SEASONAL.test(text) || WEATHER.test(text);
  if (!useful) return null;
  const cleaned = stripMarketStatistics(finding.insight).replace(/^[,.:;\s]+|[,.:;\s]+$/g, "");
  if (cleaned.length < 24 || STATISTICS.test(cleaned)) return null;
  return cleaned;
}

export function selectEmailGuidance(
  findings: MarketFinding[],
  lane: LanePattern | null,
  direction: MarketDirection,
): string[] {
  const ranked = findings
    .filter((finding) => relevantToLane(finding, lane))
    .map((finding) => ({ finding, text: guidanceFrom(finding) }))
    .filter((item): item is { finding: MarketFinding; text: string } => Boolean(item.text))
    .sort((left, right) => {
      const score = (finding: MarketFinding) =>
        finding.sourceType === "weather" ? 0 : TIGHT.test(finding.insight) || SOFT.test(finding.insight) ? 1 : 2;
      return score(left.finding) - score(right.finding);
    });

  const selected =
    direction === "mixed"
      ? ranked.filter((item) => item.finding.sourceType === "weather")
      : direction === "insufficient_data"
        ? ranked.filter(
            (item) =>
              item.finding.sourceType === "weather" ||
              SEASONAL.test(`${item.finding.insight} ${item.finding.relevance}`),
          )
        : ranked;

  return [...new Set(selected.map((item) => item.text))].slice(0, 2);
}

export function buildMarketAssessment(input: {
  research: MarketResearchResult;
  lane: LanePattern | null;
  unavailable?: string[];
  now?: Date;
}): FreightMarketAssessment {
  const period = currentResearchPeriod(input.now);
  const classified = classifyMarketDirection(input.research.findings);
  const commodity = input.lane?.commodities[0] ?? null;
  return {
    ...input.research,
    direction: classified.direction,
    conflicts: classified.conflicts,
    emailGuidance: selectEmailGuidance(
      input.research.findings,
      input.lane,
      classified.direction,
    ),
    origin: input.lane?.origin ?? null,
    destination: input.lane?.destination ?? null,
    equipment: input.lane?.equipmentType ?? null,
    commodity,
    periodStart: period.start,
    periodEnd: period.end,
    unavailable: input.unavailable ?? [],
  };
}
