import { isOpenOpportunityStage } from "./crmConstants.ts";

export interface RelationshipTimelineEntry {
  title?: string | null;
  notes?: string | null;
  occurredAt?: string | null;
  contactName?: string | null;
}

export interface RelationshipOpportunity {
  status: string;
  lane: string;
  name?: string | null;
  commodity?: string | null;
  equipmentType?: string | null;
  notes?: string | null;
}

export interface CommercialRelationshipReading {
  lastConversation: {
    occurredAt: string | null;
    title: string | null;
    contactName: string | null;
    notes: string | null;
  } | null;
  customerRequests: string[];
  accepted: string[];
  rejected: string[];
  usingAnotherProvider: boolean;
  notLookingToChangeProvider: boolean;
  notInterestedNow: boolean;
  providerEvidence: string | null;
  futureFollowUpRequested: boolean;
  futureFollowUpEvidence: string | null;
  notCurrentlyShipping: boolean;
  outstandingOpportunities: string[];
  commitments: string[];
  internalWritingDirection: string;
}

const HAPPY_WITH_CURRENT =
  /(?:happy|satisfied|pleased|content|contento|contenta|contentos|contentas|satisfech[oa]s?).{0,70}(?:current|existing|actual|su).{0,40}(?:broker|carrier|provider|transportation|transportista|proveedor)/i;

const NOT_LOOKING_TO_CHANGE =
  /not (?:currently |right now )?looking to (?:change|switch) (?:transportation |freight )?(?:providers?|brokers?|carriers?)|no (?:quiere|quieren|piensa|piensan|busca|buscan|van a) cambiar de (?:proveedor|transportista|broker)|no (?:est[aá]n? )?buscando cambiar/i;

const NOT_INTERESTED_NOW =
  /no (?:est[aá]n?|estan) interesad|not interested (?:right now|at this time|currently|for now|at the moment)|ahorita no .{0,40}interesad/i;

const USING_ANOTHER =
  /(?:another|a different|their current|su) (?:transportation )?(?:broker|carrier|provider|transportista|proveedor)|ya (?:tiene|tienen) (?:proveedor|transportista|broker)/i;

const NOT_SHIPPING =
  /not (?:currently |right now )?shipping|no (?:active |current )?(?:loads|freight|shipments)(?: right now| at this time)?|not moving (?:freight|loads|product)|no (?:est[aá]n? )?embarcando|no (?:tiene|tienen) (?:cargas|embarques)/i;

const FUTURE_FOLLOW_UP =
  /stay in touch|(?:follow up|check back|reach out|call (?:me|us|her|him|them)|contact (?:me|us|her|him|them)).{0,50}(?:later|next|in a|after|few|month|week)|(?:asked|requested).{0,40}(?:follow up|call back|check back|stay in touch)|seguir en contacto|(?:contact|llam)(?:ar|emos|en|ame|anos|arla).{0,40}(?:m[aá]s adelante|despu[eé]s|el pr[oó]ximo)|en el futuro|por si .{0,50}(?:necesitan|necesita|need)/i;

const REJECTED =
  /too (?:high|expensive)|(?:declined|rejected|passed on|not interested|went with)|rechaz|no le interes|muy (?:caro|alto)/i;

const ACCEPTED =
  /(?:accepted|awarded|booked with us|we (?:won|got) the)|acept[oó]|adjudic/i;

const REQUESTED =
  /(?:asked|requested|wanted).{0,70}(?:quote|rate|pricing|capacity|information|info)|(?:pidi[oó]|solicit[oó]).{0,50}(?:cotiz|informaci|tarifa|precio)/i;

const COMMITMENT =
  /(?:we agreed|i (?:told|promised)|committed to|will (?:send|call|follow))|(?:quedamos|me compromet|le (?:dije|promet))/i;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sentencesFrom(value: string | null | undefined): string[] {
  const text = clean(value);
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 8);
}

function matching(sentences: string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const sentence of sentences) {
    if (!pattern.test(sentence)) continue;
    found.push(sentence.slice(0, 280));
    if (found.length === 4) break;
  }
  return found;
}

function opportunityLabel(opportunity: RelationshipOpportunity): string {
  return [
    opportunity.name,
    opportunity.lane,
    opportunity.commodity,
    opportunity.equipmentType,
    opportunity.status,
  ]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(" · ");
}

const FOLLOW_UP_ANGLES = [
  "thank-or-recap-a-call",
  "quote-or-mentioned-need",
  "upcoming-plans",
  "concrete-help",
  "verified-market-note",
  "brief-direct-reminder",
  "cordial-close",
] as const;

export type FollowUpAngle = (typeof FOLLOW_UP_ANGLES)[number];

export interface FollowUpSequencePlan {
  priorTouchCount: number;
  anglesAlreadyUsed: FollowUpAngle[];
  nextAngle: FollowUpAngle;
  instruction: string;
}

function anglesIn(text: string): FollowUpAngle[] {
  const found: FollowUpAngle[] = [];
  const add = (angle: FollowUpAngle, pattern: RegExp) => {
    if (pattern.test(text) && !found.includes(angle)) found.push(angle);
  };
  add("thank-or-recap-a-call", /thank|agradec|llamad|spoke with|habl[eé] con|after (?:our|the) call/i);
  add("quote-or-mentioned-need", /\bquote|cotiz|quoted rate|tarifa/i);
  add("upcoming-plans", /when (?:should|would)|upcoming|planes|reconect|en el futuro|next season|timing is right/i);
  add("concrete-help", /happy to help|podemos ayudar|how we (?:can|might) help|coverage/i);
  add("verified-market-note", /market condition|spot market|capacity has been|mercado/i);
  add("brief-direct-reminder", /just checking in|following up on my last email|touching base|solo (?:para )?dar seguimiento/i);
  add("cordial-close", /close the loop|last note from me|cerrar el ciclo|unless I hear/i);
  return found;
}

export function planFollowUpSequence(
  entries: Array<{ title?: string | null; notes?: string | null }>,
  options?: { allowMarketAngle?: boolean },
): FollowUpSequencePlan {
  const used = new Set<FollowUpAngle>();
  let priorTouchCount = 0;
  for (const entry of entries) {
    const text = `${entry.title ?? ""} ${entry.notes ?? ""}`.trim();
    if (!text) continue;
    priorTouchCount += 1;
    for (const angle of anglesIn(text)) used.add(angle);
  }

  const allowMarket = options?.allowMarketAngle === true;
  let nextAngle: FollowUpAngle = "thank-or-recap-a-call";
  if (priorTouchCount >= 8 && !used.has("cordial-close")) {
    nextAngle = "cordial-close";
  } else {
    nextAngle =
      FOLLOW_UP_ANGLES.find(
        (angle) => !used.has(angle) && (allowMarket || angle !== "verified-market-note"),
      ) ?? "cordial-close";
  }

  const usedList = FOLLOW_UP_ANGLES.filter((angle) => used.has(angle));
  return {
    priorTouchCount,
    anglesAlreadyUsed: usedList,
    nextAngle,
    instruction:
      priorTouchCount === 0
        ? "No earlier outreach is recorded. Write the one email this stage calls for. Do not draft a series."
        : `This is touch ${priorTouchCount + 1} for this relationship. Write only this email, using the angle "${nextAngle}". Angles already used: ${usedList.join(", ") || "none"}. Do not repeat one of those angles when another fits. A sequence may eventually run from 5 to 12 touches, but do not write the later emails now.`,
  };
}

export function stripInternalCrmDetails(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/^.*\b(?:completed follow-up ID|new follow-up ID|follow-up ID)\b.*$/gim, "")
    .replace(/^Broker:\s*\S+@\S+\s*$/gim, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}

export function interpretCommercialRelationship(input: {
  commercialTimeline: RelationshipTimelineEntry[];
  companyNotes?: string | null;
  pendingFollowUps?: Array<{ title?: string | null; notes?: string | null }>;
  opportunities?: RelationshipOpportunity[];
}): CommercialRelationshipReading {
  const timelineSentences = input.commercialTimeline.flatMap((entry) => [
    ...sentencesFrom(entry.title),
    ...sentencesFrom(entry.notes),
  ]);
  const followUpSentences = (input.pendingFollowUps ?? []).flatMap((followUp) => [
    ...sentencesFrom(followUp.title),
    ...sentencesFrom(followUp.notes),
  ]);
  const otherSentences = [
    ...sentencesFrom(input.companyNotes),
    ...(input.opportunities ?? []).flatMap((opportunity) => sentencesFrom(opportunity.notes)),
  ];
  const sentences = [...timelineSentences, ...followUpSentences, ...otherSentences];

  const providerEvidence =
    matching(sentences, HAPPY_WITH_CURRENT)[0] ??
    matching(sentences, NOT_LOOKING_TO_CHANGE)[0] ??
    matching(sentences, USING_ANOTHER)[0] ??
    null;
  const notInterestedNow = matching(sentences, NOT_INTERESTED_NOW).length > 0;
  const notLookingToChangeProvider = Boolean(
    matching(sentences, NOT_LOOKING_TO_CHANGE)[0] ||
      matching(sentences, HAPPY_WITH_CURRENT)[0],
  );
  const usingAnotherProvider = Boolean(
    providerEvidence &&
      (notLookingToChangeProvider || matching(sentences, USING_ANOTHER)[0]),
  );
  const futureMatches = [
    ...matching(timelineSentences, FUTURE_FOLLOW_UP),
    ...matching(followUpSentences, FUTURE_FOLLOW_UP),
  ];
  const futureFollowUpRequested =
    futureMatches.length > 0 || (input.pendingFollowUps ?? []).length > 0;
  const notCurrentlyShipping = matching(sentences, NOT_SHIPPING).length > 0;
  const customerRequests = matching(sentences, REQUESTED);
  const accepted = matching(sentences, ACCEPTED);
  const rejected = matching(sentences, REJECTED);
  const commitments = matching(sentences, COMMITMENT);
  const outstandingOpportunities = (input.opportunities ?? [])
    .filter((opportunity) => isOpenOpportunityStage(opportunity.status))
    .map(opportunityLabel)
    .filter(Boolean)
    .slice(0, 6);

  const last = input.commercialTimeline[0] ?? null;
  const respectCurrentProvider = notLookingToChangeProvider || usingAnotherProvider;

  let internalWritingDirection: string;
  if (respectCurrentProvider) {
    internalWritingDirection =
      "The customer is not looking to change transportation providers. Acknowledge the previous conversation and that relationship. Do not ask for a load, do not invent a shipping opportunity, and do not ask for equipment, mode, commodity, or a lane.";
  } else if (notInterestedNow) {
    internalWritingDirection =
      "The customer said they are not interested right now. Acknowledge that conversation and keep the door open for later. Do not ask for a load, do not invent a shipping opportunity, and do not ask for equipment, mode, commodity, or a lane.";
  } else if (customerRequests.length > 0) {
    internalWritingDirection =
      "Follow up on the specific information the customer requested. Do not introduce a different opportunity.";
  } else if (outstandingOpportunities.length > 0) {
    internalWritingDirection =
      "Focus on the recorded quote or opportunity. Do not invent a different lane, and do not present an old rate as today's market.";
  } else if (notCurrentlyShipping) {
    internalWritingDirection =
      "The customer is not currently shipping. Maintain the relationship without creating urgency or inventing a load.";
  } else if (futureFollowUpRequested) {
    internalWritingDirection =
      "The customer asked to be contacted again. Reference the previous conversation and continue it naturally.";
  } else if (last) {
    internalWritingDirection =
      "Continue from the last recorded conversation. Do not reintroduce Armstrong Transport Group, and do not invent a lane, equipment type, or shipping opportunity.";
  } else {
    internalWritingDirection =
      "Little commercial history is on file. Write the email now from the company profile. Missing lane, commodity, or equipment does not stop the email. Do not invent lanes, equipment, commodities, quotes, calls, or referrals, and do not ask the broker to supply them.";
  }

  return {
    lastConversation: last
      ? {
          occurredAt: last.occurredAt ?? null,
          title: last.title ?? null,
          contactName: last.contactName ?? null,
          notes: clean(last.notes).slice(0, 1400) || null,
        }
      : null,
    customerRequests,
    accepted,
    rejected,
    usingAnotherProvider,
    notLookingToChangeProvider,
    notInterestedNow,
    providerEvidence,
    futureFollowUpRequested,
    futureFollowUpEvidence: futureMatches[0] ?? null,
    notCurrentlyShipping,
    outstandingOpportunities,
    commitments,
    internalWritingDirection,
  };
}
