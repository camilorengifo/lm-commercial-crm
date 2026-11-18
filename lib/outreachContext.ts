import {
  interpretCommercialRelationship,
  planFollowUpSequence,
  stripInternalCrmDetails,
} from "./commercialRelationship.ts";

const COMPANY_NOTE_LIMIT = 2500;
const RECENT_NOTE_CAP = 1200;
const COMMERCIAL_NOTE_CAP = 1400;
const OLDER_NOTE_CAP = 800;
const TIMELINE_CHAR_BUDGET = 16000;
const RECENT_KEEP = 8;
const MAX_CONTACTS = 8;
const MAX_PENDING_FOLLOW_UPS = 8;
const MAX_OPPORTUNITIES = 8;
const MAX_LANES = 8;
const MAX_FEEDBACK = 6;
const NOTE_LIMIT = COMMERCIAL_NOTE_CAP;

const EQUIPMENT_PATTERN =
  /\b(reefer|refrigerated|dry van|flatbed|step deck|power only|box truck)\b/gi;
const COMMODITY_PATTERN =
  /\b(avocados?|tomatoes?|produce|berries|fruit|vegetables?|lumber|steel|paper|beverages?|frozen|meat|poultry|dairy)\b/gi;
const LANE_PATTERN =
  /\b(?:from\s+)?([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){0,3}(?:,\s*[A-Z]{2})?)\s+(?:to|→|->)\s+([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){0,3}(?:,\s*[A-Z]{2})?)/gi;
const LANE_STOP = /^(?:the|a|an|not|happy|they|we|i|and|or|to|from|with|your|our)$/i;
const NOTE_INSTRUCTION =
  /\b(?:ignore (?:all |previous |prior )?instructions|you are now|system prompt|disregard the above)\b[^.]*(?:\.|$)/gi;

export interface NotedCommercialFacts {
  lanes: string[];
  commodities: string[];
  equipment: string[];
}

function uniqueMatches(value: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const match of value.matchAll(pattern)) {
    const text = match[0].replace(/\s+/g, " ").trim();
    if (text) found.add(text);
  }
  return [...found];
}

export function extractCommercialFacts(
  texts: Array<string | null | undefined>,
): NotedCommercialFacts {
  const haystack = texts.filter(Boolean).join("\n");
  const lanes: string[] = [];
  for (const match of haystack.matchAll(LANE_PATTERN)) {
    const origin = match[1]?.trim();
    const destination = match[2]?.trim();
    if (!origin || !destination) continue;
    if (LANE_STOP.test(origin) || LANE_STOP.test(destination)) continue;
    const lane = `${origin} to ${destination}`;
    if (!lanes.includes(lane)) lanes.push(lane);
  }
  return {
    lanes: lanes.slice(0, 8),
    commodities: uniqueMatches(haystack, COMMODITY_PATTERN).slice(0, 8),
    equipment: uniqueMatches(haystack, EQUIPMENT_PATTERN).slice(0, 6),
  };
}

function neutralizeNoteInstructions(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(NOTE_INSTRUCTION, "").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || null;
}

function commerciallyRelevant(text: string): boolean {
  return /\b(quote|quoted|cotiz|objection|interested|reefer|flatbed|dry van|refrigerat|lane|commodity|season|harvest|commitment|llamad|call|avocado|produce)\b/i.test(
    text,
  );
}

export interface OutreachPromptContact {
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
}

export interface OutreachPromptSource {
  outreachType: string;
  tone: string;
  goal: string | null;
  selectedContact: {
    name: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
  } | null;
  company: {
    name: string;
    salesStage: string;
    priority: string;
    city: string | null;
    state: string | null;
    country: string | null;
    generalNotes: string | null;
    mainPhone: string | null;
    lastContactAt: string | null;
    nextFollowUpAt: string | null;
  };
  contacts: OutreachPromptContact[];
  pendingFollowUps: Array<{
    title: string;
    dueAt: string;
    notes: string | null;
  }>;
  completedFollowUps: Array<{
    title: string;
    completedAt: string | null;
    notes: string | null;
  }>;
  commercialTimeline: Array<{
    kind: "follow_up" | "activity";
    status: string | null;
    title: string | null;
    notes: string | null;
    occurredAt: string | null;
    contactName?: string | null;
  }>;
  opportunities: Array<{
    status: string;
    lane: string;
    equipmentType: string | null;
    commodity: string | null;
    targetRate: number | null;
    quotedRate: number | null;
    notes: string | null;
    updatedAt: string;
    frequency: string | null;
    estimatedLoadsPerWeek: number | null;
    name: string | null;
  }>;
  lanePatterns: unknown[];
  priorDraftFeedback: Array<{
    rating: string;
    outreachType: string;
    createdAt: string;
  }>;
}

function trimText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function timeValue(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function compactOutreachContext(
  source: OutreachPromptSource,
  options?: { allowMarketAngle?: boolean },
) {
  const selectedName = source.selectedContact?.name.trim().toLowerCase() ?? "";
  const orderedContacts = [...source.contacts].sort((left, right) => {
    const leftSelected =
      selectedName && left.name.trim().toLowerCase() === selectedName ? 1 : 0;
    const rightSelected =
      selectedName && right.name.trim().toLowerCase() === selectedName ? 1 : 0;
    if (leftSelected !== rightSelected) return rightSelected - leftSelected;
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

  const contacts = orderedContacts.slice(0, MAX_CONTACTS).map((contact) => ({
    name: contact.name,
    jobTitle: contact.jobTitle,
    isPrimary: contact.isPrimary,
    emailOnFile: Boolean(contact.email?.trim()),
    phoneOnFile: Boolean(contact.phone?.trim()),
  }));

  const pendingFollowUps = source.pendingFollowUps
    .slice(0, MAX_PENDING_FOLLOW_UPS)
    .map((followUp) => ({
      title: followUp.title,
      dueAt: followUp.dueAt,
      notes: trimText(followUp.notes, NOTE_LIMIT),
    }));

  const historyFromTimeline = source.commercialTimeline
    .filter((item) => !(item.kind === "follow_up" && item.status === "pending"))
    .map((item) => ({
      kind: item.kind,
      status: item.status,
      title: item.title,
      notes: neutralizeNoteInstructions(stripInternalCrmDetails(item.notes)),
      occurredAt: item.occurredAt,
      contactName: item.contactName ?? null,
    }));

  const history =
    historyFromTimeline.length > 0
      ? historyFromTimeline
      : source.completedFollowUps.map((followUp) => ({
          kind: "follow_up" as const,
          status: "completed",
          title: followUp.title,
          notes: neutralizeNoteInstructions(stripInternalCrmDetails(followUp.notes)),
          occurredAt: followUp.completedAt,
          contactName: null as string | null,
        }));

  history.sort((left, right) => timeValue(right.occurredAt) - timeValue(left.occurredAt));
  const followUpSequence = planFollowUpSequence(history, {
    allowMarketAngle: options?.allowMarketAngle === true,
  });
  const relationship = interpretCommercialRelationship({
    commercialTimeline: history,
    companyNotes: source.company.generalNotes,
    pendingFollowUps: source.pendingFollowUps,
    opportunities: source.opportunities,
  });
  const rankedHistory = [
    ...history.filter((_, index) => index < RECENT_KEEP),
    ...history.filter(
      (item, index) =>
        index >= RECENT_KEEP &&
        commerciallyRelevant(`${item.title ?? ""} ${item.notes ?? ""}`),
    ),
    ...history.filter(
      (item, index) =>
        index >= RECENT_KEEP &&
        !commerciallyRelevant(`${item.title ?? ""} ${item.notes ?? ""}`),
    ),
  ];
  let timelineChars = 0;
  let omittedHistory = 0;
  const keptTimeline: typeof history = [];
  for (const item of rankedHistory) {
    const originalIndex = history.indexOf(item);
    const relevant = commerciallyRelevant(`${item.title ?? ""} ${item.notes ?? ""}`);
    const recent = originalIndex < RECENT_KEEP;
    const cap = recent ? RECENT_NOTE_CAP : relevant ? COMMERCIAL_NOTE_CAP : OLDER_NOTE_CAP;
    const notes = trimText(item.notes, cap);
    const size = (item.title?.length ?? 0) + (notes?.length ?? 0);
    if (!recent && timelineChars + size > TIMELINE_CHAR_BUDGET) {
      omittedHistory += 1;
      continue;
    }
    timelineChars += size;
    keptTimeline.push({ ...item, notes });
  }
  const recentCommercialHistory = keptTimeline.sort(
    (left, right) => timeValue(right.occurredAt) - timeValue(left.occurredAt),
  );
  const lastCommunication = recentCommercialHistory[0] ?? null;
  const notedCommercialFacts = extractCommercialFacts([
    source.company.generalNotes,
    ...history.map((item) => `${item.title ?? ""}\n${item.notes ?? ""}`),
    ...source.opportunities.map(
      (opportunity) =>
        `${opportunity.lane} ${opportunity.commodity ?? ""} ${opportunity.equipmentType ?? ""} ${opportunity.notes ?? ""}`,
    ),
  ]);

  const opportunities = source.opportunities.slice(0, MAX_OPPORTUNITIES).map((opportunity) => ({
    name: opportunity.name,
    status: opportunity.status,
    lane: opportunity.lane,
    equipmentType: opportunity.equipmentType,
    commodity: opportunity.commodity,
    frequency: opportunity.frequency,
    estimatedLoadsPerWeek: opportunity.estimatedLoadsPerWeek,
    historicalTargetRate: opportunity.targetRate,
    historicalQuotedRate: opportunity.quotedRate,
    updatedAt: opportunity.updatedAt,
    notes: trimText(opportunity.notes, NOTE_LIMIT),
  }));

  const companyNotes = trimText(source.company.generalNotes, COMPANY_NOTE_LIMIT);
  const missingInformation: string[] = [];
  if (!companyNotes) missingInformation.push("company notes");
  if (!source.company.city && !source.company.state) {
    missingInformation.push("company location");
  }
  if (contacts.length === 0 && !source.selectedContact) {
    missingInformation.push("contacts");
  }
  if (recentCommercialHistory.length === 0) {
    missingInformation.push("commercial history");
  }

  return {
    commercialTimeline: recentCommercialHistory,
    relationship,
    followUpSequence,
    notedCommercialFacts,
    company: {
      name: source.company.name,
      salesStage: source.company.salesStage,
      priority: source.company.priority,
      city: source.company.city,
      state: source.company.state,
      country: source.company.country,
      generalNotes: companyNotes,
      mainPhoneOnFile: Boolean(source.company.mainPhone?.trim()),
      lastContactAt: source.company.lastContactAt,
      nextFollowUpAt: source.company.nextFollowUpAt,
    },
    selectedContact: source.selectedContact
      ? {
          name: source.selectedContact.name,
          jobTitle: source.selectedContact.jobTitle,
          email: source.selectedContact.email,
          phone: source.selectedContact.phone,
        }
      : null,
    contacts,
    pendingFollowUps,
    lastCommunication,
    opportunities,
    lanePatterns: source.lanePatterns.slice(0, MAX_LANES),
    priorDraftFeedback: source.priorDraftFeedback.slice(0, MAX_FEEDBACK),
    omittedCounts: {
      contacts: Math.max(0, source.contacts.length - contacts.length),
      pendingFollowUps: Math.max(
        0,
        source.pendingFollowUps.length - pendingFollowUps.length,
      ),
      commercialHistory: omittedHistory,
      opportunities: Math.max(0, source.opportunities.length - opportunities.length),
      lanePatterns: Math.max(0, source.lanePatterns.length - MAX_LANES),
    },
    missingInformation,
  };
}
