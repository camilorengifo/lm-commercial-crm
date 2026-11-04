export interface LaneSource {
  origin: string | null;
  destination: string | null;
  equipmentType: string | null;
  commodity: string | null;
  status: string;
  frequency: string | null;
  estimatedLoadsPerWeek: number | null;
  targetRate: number | null;
  quotedRate: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  notes: string | null;
}

export interface LanePattern {
  origin: string;
  destination: string;
  equipmentType: string | null;
  commodities: string[];
  frequencies: string[];
  statuses: string[];
  quoteCount: number;
  historicalQuotedRates: number[];
  historicalTargetRates: number[];
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  repeatedLane: boolean;
  openStatuses: string[];
  closedWithoutAward: boolean;
}

const CLOSED_WITHOUT_AWARD = new Set(["lost", "closed_lost", "declined"]);
const OPEN_STATUSES = new Set([
  "prospecting",
  "quoted",
  "negotiating",
  "new",
  "open",
]);

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function laneKey(origin: string, destination: string, equipment: string): string {
  return `${origin.toLowerCase()}|${destination.toLowerCase()}|${equipment.toLowerCase()}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function earliest(dates: Array<string | null>): string | null {
  const parsed = dates
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((a, b) => a.time - b.time);
  return parsed[0]?.value ?? null;
}

function latest(dates: Array<string | null>): string | null {
  const parsed = dates
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time);
  return parsed[0]?.value ?? null;
}

export function buildLanePatterns(lanes: LaneSource[]): LanePattern[] {
  const groups = new Map<string, LaneSource[]>();

  for (const lane of lanes) {
    const origin = clean(lane.origin);
    const destination = clean(lane.destination);
    if (!origin && !destination) continue;
    const key = laneKey(origin || "Unknown origin", destination || "Unknown destination", clean(lane.equipmentType));
    const current = groups.get(key) ?? [];
    current.push(lane);
    groups.set(key, current);
  }

  const patterns = [...groups.values()].map((group) => {
    const origin = clean(group[0]?.origin) || "Unknown origin";
    const destination = clean(group[0]?.destination) || "Unknown destination";
    const equipment = clean(group[0]?.equipmentType);
    const statuses = unique(group.map((lane) => clean(lane.status)));
    const quotedRates = unique(
      group
        .map((lane) => lane.quotedRate)
        .filter((rate): rate is number => typeof rate === "number")
        .map((rate) => String(rate)),
    ).map(Number);
    const targetRates = unique(
      group
        .map((lane) => lane.targetRate)
        .filter((rate): rate is number => typeof rate === "number")
        .map((rate) => String(rate)),
    ).map(Number);
    const recordedDates = group.flatMap((lane) => [lane.createdAt, lane.updatedAt]);

    return {
      origin,
      destination,
      equipmentType: equipment || null,
      commodities: unique(group.map((lane) => clean(lane.commodity))),
      frequencies: unique(group.map((lane) => clean(lane.frequency))),
      statuses,
      quoteCount: group.length,
      historicalQuotedRates: quotedRates,
      historicalTargetRates: targetRates,
      firstRecordedAt: earliest(recordedDates),
      lastRecordedAt: latest(recordedDates),
      repeatedLane: group.length >= 2,
      openStatuses: statuses.filter((status) => OPEN_STATUSES.has(status)),
      closedWithoutAward: statuses.some((status) => CLOSED_WITHOUT_AWARD.has(status)),
    };
  });

  return patterns.sort((a, b) => {
    if (a.repeatedLane !== b.repeatedLane) return a.repeatedLane ? -1 : 1;
    return b.quoteCount - a.quoteCount;
  });
}

export function buildCrmFacts(input: {
  companyName: string;
  city: string | null;
  state: string | null;
  country: string | null;
  mainPhone: string | null;
  salesStage: string;
  priority: string;
  notes: string | null;
  contactCount: number;
  opportunityCount: number;
  activityCount: number;
  followUpCount: number;
  lanePatterns: LanePattern[];
}): string[] {
  const location = [input.city, input.state, input.country].filter(Boolean).join(", ");
  const repeated = input.lanePatterns.filter((lane) => lane.repeatedLane);
  const equipment = unique(
    input.lanePatterns
      .map((lane) => lane.equipmentType ?? "")
      .filter(Boolean),
  );

  return [
    `Company: ${input.companyName}`,
    location ? `Location on file: ${location}` : "Location is not on file.",
    input.mainPhone
      ? `Main phone on file: ${input.mainPhone}`
      : "Main phone is not on file.",
    `Sales stage: ${input.salesStage}. Priority: ${input.priority}.`,
    input.notes?.trim()
      ? "Company notes are on file."
      : "Company notes are not on file. Industry is not a separate CRM field.",
    `${input.contactCount} visible contact${input.contactCount === 1 ? "" : "s"}.`,
    `${input.opportunityCount} quotation or opportunity record${input.opportunityCount === 1 ? "" : "s"}.`,
    `${input.activityCount} recent commercial timeline entries and ${input.followUpCount} follow-up records were reviewed.`,
    equipment.length
      ? `Equipment on recorded lanes: ${equipment.join(", ")}.`
      : "No equipment type is recorded on the lanes.",
    repeated.length
      ? `${repeated.length} lane${repeated.length === 1 ? "" : "s"} appear more than once.`
      : "No repeated lane was found in the records reviewed.",
  ];
}
