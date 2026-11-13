const COMPANY_NOTE_LIMIT = 900;
const NOTE_LIMIT = 420;
const MAX_CONTACTS = 8;
const MAX_PENDING_FOLLOW_UPS = 8;
const MAX_HISTORY = 12;
const MAX_OPPORTUNITIES = 8;
const MAX_LANES = 8;
const MAX_FEEDBACK = 6;

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

export function compactOutreachContext(source: OutreachPromptSource) {
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
      notes: trimText(item.notes, NOTE_LIMIT),
      occurredAt: item.occurredAt,
    }));

  const history =
    historyFromTimeline.length > 0
      ? historyFromTimeline
      : source.completedFollowUps.map((followUp) => ({
          kind: "follow_up" as const,
          status: "completed",
          title: followUp.title,
          notes: trimText(followUp.notes, NOTE_LIMIT),
          occurredAt: followUp.completedAt,
        }));

  history.sort((left, right) => timeValue(right.occurredAt) - timeValue(left.occurredAt));
  const recentCommercialHistory = history.slice(0, MAX_HISTORY);
  const lastCommunication = recentCommercialHistory[0] ?? null;

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
  if (opportunities.length === 0 && source.lanePatterns.length === 0) {
    missingInformation.push("lanes, commodities, and equipment");
  }

  return {
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
    recentCommercialHistory,
    opportunities,
    lanePatterns: source.lanePatterns.slice(0, MAX_LANES),
    priorDraftFeedback: source.priorDraftFeedback.slice(0, MAX_FEEDBACK),
    omittedCounts: {
      contacts: Math.max(0, source.contacts.length - contacts.length),
      pendingFollowUps: Math.max(
        0,
        source.pendingFollowUps.length - pendingFollowUps.length,
      ),
      commercialHistory: Math.max(0, history.length - recentCommercialHistory.length),
      opportunities: Math.max(0, source.opportunities.length - opportunities.length),
      lanePatterns: Math.max(0, source.lanePatterns.length - MAX_LANES),
    },
    missingInformation,
  };
}
