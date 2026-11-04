import type { AccountCrmSummary, BrokerCrmSummary } from "@/lib/aiCrmContext";

const SHARED_RULES = `
You are the AI commercial assistant for a freight broker CRM called Logistics Masters AI Commercial Assistant.
Analyze ONLY the CRM data provided in the user message.
Do not invent facts, activities, contacts, lanes, rates, or outcomes that are not present in the data.
If information is missing or insufficient, say that clearly in your output.
Be practical, direct, and professional. Use freight brokerage language.
Keep each bullet concise. Do not write long essays.
Reference company names from the data when relevant.
If the data marks a company or contact as outreach-suppressed, do not recommend calling, emailing, messaging, or scheduling a follow-up with that company or contact. Say that follow-up is stopped.
Return valid JSON only.
`.trim();

export interface BrokerRecommendationsResponse {
  topPriorities: string[];
  accountsAtRisk: string[];
  followUpSuggestions: string[];
  opportunitySuggestions: string[];
  generalCoaching: string[];
}

export interface AccountSummaryResponse {
  accountSummary: string[];
  nextBestAction: string[];
  risks: string[];
  opportunityNotes: string[];
  suggestedFollowUp: string[];
}

export const BROKER_SYSTEM_PROMPT = `${SHARED_RULES}

Return JSON with exactly these keys, each an array of strings:
- topPriorities (3 to 7 actionable bullets)
- accountsAtRisk
- followUpSuggestions
- opportunitySuggestions
- generalCoaching`;

export const ACCOUNT_SYSTEM_PROMPT = `${SHARED_RULES}

Return JSON with exactly these keys, each an array of strings:
- accountSummary
- nextBestAction
- risks
- opportunityNotes
- suggestedFollowUp`;

export function buildBrokerUserPrompt(summary: BrokerCrmSummary): string {
  return `Generate broker-wide recommendations from this CRM summary:

${JSON.stringify(summary, null, 2)}

Focus on:
- Overdue and due-today follow-ups
- Inactive companies
- Repeated activity without pipeline progress
- Quoted and new load opportunities needing action
- New Lead accounts with no activity
- In Follow-up accounts with no upcoming follow-up
- Dormant accounts with recent opportunity activity
- Customer accounts without recent activity`;
}

export function buildAccountUserPrompt(summary: AccountCrmSummary): string {
  return `Generate an account-level summary for company "${summary.company.name}" from this CRM data:

${JSON.stringify(summary, null, 2)}

Summarize what is happening, the next best action, risks, opportunity notes, and a suggested follow-up timing with reason.
If outreachSuppression is present, do not recommend contacting the suppressed company or contacts and do not propose a new follow-up date for them.`;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface AssistantGeneratePriority {
  companyId: string;
  companyName: string;
  priority: string;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  openOpportunityCount: number;
  reason: string;
  suggestedAction: string;
}

export interface AssistantGenerateResponse {
  actionPlan: string;
  priorities: AssistantGeneratePriority[];
  whatToDoFirst: string[];
  whoToContact: string[];
  crmUpdates: string[];
  risks: string[];
  commercialFocus: string[];
}

export const ASSISTANT_GENERATE_SYSTEM_PROMPT = `${SHARED_RULES}

This is an ASSISTIVE freight brokerage sales command center. You recommend actions only.
You do NOT send email, WhatsApp, SMS, or contact customers. You do NOT claim outreach was sent.
Use ONLY the CRM context provided. If data is missing, say so and suggest logging better CRM notes.

Return JSON with exactly these keys:
- actionPlan (string: 2-4 sentence practical daily summary for the broker)
- priorities (array of up to 5 objects with: companyId, companyName, priority, lastContactAt, nextFollowUpAt, openOpportunityCount, reason, suggestedAction)
- whatToDoFirst (array of 3-5 short strings)
- whoToContact (array of strings naming companies/contacts to reach out to manually)
- crmUpdates (array of strings for CRM hygiene tasks)
- risks (array of strings for accounts needing attention)
- commercialFocus (array of 2-4 strings for today's commercial focus)`;

export function buildAssistantGenerateUserPrompt(
  context: Record<string, unknown>,
): string {
  return `Generate a daily freight brokerage AI action plan from this CRM context:

${JSON.stringify(context, null, 2)}

Be practical, direct, and sales-oriented. Reference real company names from the data.
priorities must use companyId values from the context when available.`;
}

function normalizeAssistantPriority(value: unknown): AssistantGeneratePriority | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const companyName = normalizeString(record.companyName);
  if (!companyName) return null;

  return {
    companyId: normalizeString(record.companyId),
    companyName,
    priority: normalizeString(record.priority) || "Medium",
    lastContactAt:
      typeof record.lastContactAt === "string" ? record.lastContactAt : null,
    nextFollowUpAt:
      typeof record.nextFollowUpAt === "string" ? record.nextFollowUpAt : null,
    openOpportunityCount:
      typeof record.openOpportunityCount === "number"
        ? record.openOpportunityCount
        : 0,
    reason: normalizeString(record.reason) || "Review this account today.",
    suggestedAction:
      normalizeString(record.suggestedAction) || "Plan the next commercial touch.",
  };
}

export function normalizeAssistantGenerateResponse(
  value: unknown,
): AssistantGenerateResponse {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const priorities = Array.isArray(record.priorities)
    ? record.priorities
        .map(normalizeAssistantPriority)
        .filter((item): item is AssistantGeneratePriority => item !== null)
        .slice(0, 5)
    : [];

  const actionPlan =
    normalizeString(record.actionPlan) ||
    "Review your prioritized accounts and overdue follow-ups to plan your day.";

  return {
    actionPlan,
    priorities,
    whatToDoFirst: normalizeStringArray(record.whatToDoFirst),
    whoToContact: normalizeStringArray(record.whoToContact),
    crmUpdates: normalizeStringArray(record.crmUpdates),
    risks: normalizeStringArray(record.risks),
    commercialFocus: normalizeStringArray(record.commercialFocus),
  };
}

export interface BrokerActionPlanAccount {
  companyName: string;
  whyItMatters: string;
  recommendedAction: string;
  emailDraft: string;
  callOpener: string;
}

export interface BrokerActionPlanResponse {
  dailySummary: string[];
  topAccountsToday: BrokerActionPlanAccount[];
  riskWarnings: string[];
  quickWins: string[];
  followUpDisciplineReminders: string[];
}

export interface AccountOutreachQuickResponse {
  suggestedEmailSubject: string;
  suggestedEmailBody: string;
  linkedInMessage: string;
  callOpener: string;
  followUpReason: string;
}

export const BROKER_ACTION_PLAN_SYSTEM_PROMPT = `${SHARED_RULES}

This is an ASSISTIVE sales planning tool only. You draft suggestions for the broker to review and execute manually.
You do NOT send email, messages, or calls. You do NOT claim anything was already sent or that outreach will happen automatically.
If CRM data is missing, say what is missing and suggest logging better notes or contact info.

Return JSON with exactly these keys:
- dailySummary (array of 2 to 5 concise strings summarizing the broker's day)
- topAccountsToday (array of up to 5 objects, each with: companyName, whyItMatters, recommendedAction, emailDraft, callOpener)
- riskWarnings (array of strings)
- quickWins (array of strings)
- followUpDisciplineReminders (array of strings)`;

export const ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT = `
You are the AI outreach assistant for a freight broker CRM called Logistics Masters AI Commercial Assistant.
This tool is ASSISTIVE ONLY. You produce drafts for the broker to review and use manually.
You do NOT send email, WhatsApp, SMS, LinkedIn messages, or any outreach.
Use ONLY the CRM context provided. Do not invent facts, lanes, rates, or prior conversations.
If data is limited, write honest general outreach and note what is missing.
Do not claim emails or messages were sent.
Return valid JSON only with these keys:
- suggestedEmailSubject (string)
- suggestedEmailBody (string)
- linkedInMessage (string)
- callOpener (string)
- followUpReason (string)
`.trim();

export function buildBrokerActionPlanUserPrompt(input: {
  focus: import("@/lib/brokerAssistant").BrokerAssistantFocus;
  prioritizedAccounts: Array<Record<string, unknown>>;
}): string {
  return `Generate a daily freight brokerage action plan from this prioritized CRM snapshot.

Today's focus metrics:
${JSON.stringify(input.focus, null, 2)}

Top prioritized accounts (deterministic scoring — use these as your primary guide):
${JSON.stringify(input.prioritizedAccounts, null, 2)}

Requirements:
- Pick the top 5 accounts from the data that deserve work today
- whyItMatters must reference real CRM signals (follow-ups, opportunities, inactivity, priority)
- emailDraft and callOpener are DRAFTS for manual use — never imply they were sent
- Be direct, professional, and freight-broker focused
- quickWins should be same-day actions with low friction
- followUpDisciplineReminders should coach on overdue items and scheduling discipline
- When seasonalFollowUps > 0, include seasonal / future opportunity timing in priorities`;
}

export function buildAccountOutreachQuickUserPrompt(
  context: import("@/lib/aiCrmContext").OutreachCrmContext,
): string {
  return `Generate outreach DRAFTS for company "${context.company.name}".
The broker will review and reach out manually. Do not imply anything will be sent automatically.

CRM context:
${JSON.stringify(
  {
    company: context.company,
    contacts: context.contacts,
    pendingFollowUps: context.pendingFollowUps,
    recentActivities: context.recentActivities,
    opportunities: context.opportunities,
    lanePatterns: context.lanePatterns,
  },
  null,
  2,
)}

Primary contact: ${context.contacts.find((c) => c.isPrimary)?.name ?? context.contacts[0]?.name ?? "No contact on file"}

Write practical freight brokerage outreach. If contact info is missing, say so in followUpReason.`;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAccountPlanItem(value: unknown): BrokerActionPlanAccount | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const companyName = normalizeString(record.companyName);
  if (!companyName) return null;

  return {
    companyName,
    whyItMatters: normalizeString(record.whyItMatters) || "Review CRM signals for this account.",
    recommendedAction:
      normalizeString(record.recommendedAction) || "Review account and plan next touch.",
    emailDraft: normalizeString(record.emailDraft) || "Draft unavailable — add more CRM context.",
    callOpener: normalizeString(record.callOpener) || "Draft unavailable — add more CRM context.",
  };
}

export function normalizeBrokerActionPlan(
  value: unknown,
): BrokerActionPlanResponse {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const topAccountsToday = Array.isArray(record.topAccountsToday)
    ? record.topAccountsToday
        .map(normalizeAccountPlanItem)
        .filter((item): item is BrokerActionPlanAccount => item !== null)
        .slice(0, 5)
    : [];

  return {
    dailySummary: normalizeStringArray(record.dailySummary),
    topAccountsToday,
    riskWarnings: normalizeStringArray(record.riskWarnings),
    quickWins: normalizeStringArray(record.quickWins),
    followUpDisciplineReminders: normalizeStringArray(
      record.followUpDisciplineReminders,
    ),
  };
}

export function normalizeAccountOutreachQuick(
  value: unknown,
): AccountOutreachQuickResponse {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    suggestedEmailSubject:
      normalizeString(record.suggestedEmailSubject) || "Follow-up on freight capacity",
    suggestedEmailBody:
      normalizeString(record.suggestedEmailBody) ||
      "Add more CRM notes to generate a stronger email draft.",
    linkedInMessage:
      normalizeString(record.linkedInMessage) ||
      "Add contact details to personalize LinkedIn outreach.",
    callOpener:
      normalizeString(record.callOpener) ||
      "Hi — I wanted to follow up on your freight needs.",
    followUpReason:
      normalizeString(record.followUpReason) ||
      "Scheduled follow-up based on CRM priority.",
  };
}

export function normalizeBrokerRecommendations(
  value: unknown,
): BrokerRecommendationsResponse {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    topPriorities: normalizeStringArray(record.topPriorities),
    accountsAtRisk: normalizeStringArray(record.accountsAtRisk),
    followUpSuggestions: normalizeStringArray(record.followUpSuggestions),
    opportunitySuggestions: normalizeStringArray(record.opportunitySuggestions),
    generalCoaching: normalizeStringArray(record.generalCoaching),
  };
}

export function normalizeAccountSummary(
  value: unknown,
): AccountSummaryResponse {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    accountSummary: normalizeStringArray(record.accountSummary),
    nextBestAction: normalizeStringArray(record.nextBestAction),
    risks: normalizeStringArray(record.risks),
    opportunityNotes: normalizeStringArray(record.opportunityNotes),
    suggestedFollowUp: normalizeStringArray(record.suggestedFollowUp),
  };
}

export const OUTREACH_TYPES = [
  "Call Script",
  "Relationship Follow-up",
  "Technical Follow-up",
  "Quote Follow-up",
  "Re-engagement",
  "Opportunity Development",
] as const;

export type OutreachType = (typeof OUTREACH_TYPES)[number];

const LEGACY_OUTREACH_TYPES: Record<string, OutreachType> = {
  "Follow-up Email": "Relationship Follow-up",
  "LinkedIn Message": "Relationship Follow-up",
  "Re-engagement Message": "Re-engagement",
  "General Prospecting Message": "Opportunity Development",
};

export function resolveOutreachType(value: string): OutreachType | null {
  if ((OUTREACH_TYPES as readonly string[]).includes(value)) {
    return value as OutreachType;
  }
  return LEGACY_OUTREACH_TYPES[value] ?? null;
}

export function isEmailOutreachType(type: string): boolean {
  return type !== "Call Script";
}

export const OUTREACH_FEEDBACK_RATINGS = [
  { id: "useful", label: "Useful" },
  { id: "not_relevant", label: "Not relevant" },
  { id: "too_generic", label: "Too generic" },
  { id: "incorrect", label: "Incorrect information" },
] as const;

export type OutreachFeedbackRating =
  (typeof OUTREACH_FEEDBACK_RATINGS)[number]["id"];

export function isOutreachFeedbackRating(
  value: string,
): value is OutreachFeedbackRating {
  return OUTREACH_FEEDBACK_RATINGS.some((rating) => rating.id === value);
}

export const OUTREACH_TONES = [
  "Professional",
  "Friendly",
  "Direct",
  "Warm",
  "Persistent but respectful",
] as const;

export type OutreachTone = (typeof OUTREACH_TONES)[number];

export interface OutreachDraftResponse {
  subjectLine: string | null;
  subjectAlternatives: string[];
  commercialSummary: string | null;
  marketInsight: string | null;
  commercialRecommendation: string | null;
  suggestedNextStep: string | null;
  emailDraft: string | null;
  sections: Array<{ title: string; content: string }>;
  fullDraft: string;
}

export const OUTREACH_SYSTEM_PROMPT = `
You are the commercial intelligence assistant for a freight broker CRM called Logistics Masters AI Commercial Assistant.
This tool is ASSISTIVE ONLY. You produce drafts for the broker to review, edit, and use manually.
You do NOT send email, WhatsApp, SMS, LinkedIn messages, or any outreach. You do NOT contact customers or run campaigns.
Use ONLY the CRM records and the market research payload in the user message.
Do not invent companies, contacts, calls, emails, lanes, commodities, equipment, frequencies, quotes, rates, objections, or outcomes.
If a field is missing, say it is not on file.
Historical quoted rates in the CRM are past quotes recorded by the broker. They are not current market rates.
Never invent a current freight rate. Never say capacity is tightening or rates are increasing unless that exact claim appears in a market finding whose scope is "verified".
A finding whose scope is "observation" is general or dated context. Do not present it as a current lane condition.
If market research status is "unavailable" or there are no findings, say that current market research was not available. Do not fill the gap with generic produce or freight commentary.
Do not treat a national trend as a condition on one of this customer's lanes.
Do not write "just checking in", "hope you are doing well", or "touching base" as the reason for contact.
The broker goal, when provided, refines the selected outreach type. It does not replace that type's objective.
Prior draft feedback is broker judgment on earlier drafts for this company. Use it to avoid repeating approaches marked not_relevant, too_generic, or incorrect. Do not say the model was retrained.
Write in English. Be specific, professional, and commercially useful.
Return valid JSON only with these keys:
- subjectLine (string or null; the strongest subject, null for Call Script)
- subjectAlternatives (array of exactly 3 distinct strings for every type except Call Script; empty array for Call Script)
- commercialSummary (string or null)
- marketInsight (string or null; required for Technical Follow-up, otherwise null)
- commercialRecommendation (string or null)
- suggestedNextStep (string)
- emailDraft (string or null; the email body for email types, null for Call Script)
- sections (array of { title, content })
- fullDraft (string; the complete text the broker can copy)
`.trim();

function outreachStrategy(type: string): string {
  switch (type) {
    case "Call Script":
      return `Objective: prepare a live phone conversation.
Sections must be: Opening line, Reason for calling, Discovery questions, Value proposition, Closing / next step.
The reason for calling must come from a recorded lane, quote, follow-up, or note. Discovery questions must be an ordered list inside that section's content.
subjectLine is null. subjectAlternatives is empty. emailDraft is null. marketInsight is null.`;
    case "Relationship Follow-up":
      return `Objective: continue a real commercial relationship.
Use a recorded interaction, open follow-up, quote, or lane as the reason to reconnect.
Write a natural conversation that can lead to more business over time.
Do not send a generic check-in. If there is no recorded reason to call, say what is missing instead of inventing warmth.
marketInsight is null.`;
    case "Technical Follow-up":
      return `Objective: give the customer a useful market reason to talk, as a freight market analyst and commercial advisor.
Every point must connect to a recorded lane, region, commodity, or equipment type for this company.
commercialSummary explains the freight pattern found in the CRM.
marketInsight restates only the supplied market findings, with source name, publication date, and whether each item is verified or an observation. If research is unavailable, say so in marketInsight.
commercialRecommendation explains why the finding matters to this customer and how the broker should open the conversation.
emailDraft is a short professional email that shares that specific insight and invites a conversation. It must not fit any generic produce company.
suggestedNextStep is the broker's practical next action.
sections must be: Commercial Intelligence Summary, Market Insight, Commercial Recommendation, Email Draft, Suggested Next Step.`;
    case "Quote Follow-up":
      return `Objective: follow up on a recorded quotation.
Name the recorded lane, equipment, commodity when present, and the date of the quote. Use the recorded quoted rate only as a past quote, framed for broker review.
Ask what happened with that freight. Do not present the old quote as today's market rate.
marketInsight is null.`;
    case "Re-engagement":
      return `Objective: reopen a quiet account using its actual history.
Refer to the last recorded interaction, quote, or lane and the gap since then. Acknowledge that the account has gone quiet when the dates show that.
Do not pretend there was a recent conversation.
marketInsight is null.`;
    case "Opportunity Development":
      return `Objective: develop the next commercial opportunity from patterns already in the CRM.
Point to a repeated lane, a lost or quoted opportunity, or a geographic concentration. Propose a specific conversation about that freight.
Do not invent a new lane the customer has never requested.
marketInsight is null.`;
    default:
      return "Use the CRM records to write a specific draft. marketInsight is null.";
  }
}

export function buildOutreachUserPrompt(
  context: import("@/lib/aiCrmContext").OutreachCrmContext,
  marketResearch: import("@/lib/marketResearchRules").MarketResearchResult | null,
): string {
  const emailType = isEmailOutreachType(context.outreachType);

  return `Generate a ${context.outreachType} DRAFT for company "${context.company.name}".
The broker will review this text and reach out manually. Do not imply that any message will be sent.

Tone: ${context.tone}
Broker goal: ${context.goal?.trim() || "Not specified. Use the outreach type's commercial objective."}
Selected contact: ${
    context.selectedContact
      ? `${context.selectedContact.name}${context.selectedContact.jobTitle ? `, ${context.selectedContact.jobTitle}` : ""}`
      : "No specific contact"
  }

Strategy:
${outreachStrategy(context.outreachType)}

Subject rules for email drafts:
- Write exactly 3 subject alternatives.
- Each subject must be specific to this company's recorded business. Use a lane, commodity, equipment type, or verified market finding when one exists.
- Do not use "Checking in", "Following up", "Quick question", or "Hope you are well".
- No clickbait and no claims the research payload does not support.
- Put the best subject in subjectLine as well as subjectAlternatives.

CRM context:
${JSON.stringify(
  {
    company: context.company,
    selectedContact: context.selectedContact,
    contacts: context.contacts,
    pendingFollowUps: context.pendingFollowUps,
    completedFollowUps: context.completedFollowUps,
    commercialTimeline: context.commercialTimeline,
    opportunities: context.opportunities,
    lanePatterns: context.lanePatterns,
    priorDraftFeedback: context.priorDraftFeedback,
  },
  null,
  2,
)}

Market research payload:
${JSON.stringify(marketResearch, null, 2)}

${
  emailType
    ? "fullDraft must include the three subject alternatives, then the email body, then the suggested next step."
    : "fullDraft is the call script the broker can read on the phone."
}`;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueSubjects(subjects: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const subject of subjects) {
    const key = subject.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(subject);
  }
  return unique.slice(0, 3);
}

export function normalizeOutreachDraft(
  value: unknown,
  outreachType: string,
): OutreachDraftResponse {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const sections = Array.isArray(record.sections)
    ? record.sections
        .filter(
          (item): item is { title: string; content: string } =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof (item as { title?: unknown }).title === "string" &&
                typeof (item as { content?: unknown }).content === "string",
            ),
        )
        .map((item) => ({
          title: item.title.trim(),
          content: item.content.trim(),
        }))
        .filter((item) => item.title && item.content)
    : [];

  const emailType = isEmailOutreachType(outreachType);
  const subjectAlternatives = emailType
    ? uniqueSubjects(normalizeStringList(record.subjectAlternatives))
    : [];
  const subjectLine = emailType
    ? (typeof record.subjectLine === "string" && record.subjectLine.trim()
        ? record.subjectLine.trim()
        : null) ?? subjectAlternatives[0] ?? null
    : null;
  const normalizedSubjects =
    emailType && subjectLine
      ? uniqueSubjects([subjectLine, ...subjectAlternatives])
      : subjectAlternatives;

  const textOrNull = (key: string): string | null => {
    const text = typeof record[key] === "string" ? record[key].trim() : "";
    return text || null;
  };

  const commercialSummary = textOrNull("commercialSummary");
  const marketInsight =
    outreachType === "Technical Follow-up" ? textOrNull("marketInsight") : null;
  const commercialRecommendation = textOrNull("commercialRecommendation");
  const suggestedNextStep = textOrNull("suggestedNextStep");
  const emailDraft = emailType ? textOrNull("emailDraft") : null;

  let fullDraft = typeof record.fullDraft === "string" ? record.fullDraft.trim() : "";
  if (!fullDraft) {
    const parts = [
      commercialSummary ? `Commercial Intelligence Summary\n${commercialSummary}` : "",
      marketInsight ? `Market Insight\n${marketInsight}` : "",
      commercialRecommendation
        ? `Commercial Recommendation\n${commercialRecommendation}`
        : "",
      normalizedSubjects.length
        ? `Subject alternatives\n${normalizedSubjects.map((subject, index) => `${index + 1}. ${subject}`).join("\n")}`
        : "",
      emailDraft ? `Email draft\n${emailDraft}` : "",
      suggestedNextStep ? `Suggested next step\n${suggestedNextStep}` : "",
      sections.map((section) => `${section.title}\n${section.content}`).join("\n\n"),
    ].filter(Boolean);
    fullDraft = parts.join("\n\n") || "No outreach draft was generated.";
  }

  return {
    subjectLine,
    subjectAlternatives: normalizedSubjects,
    commercialSummary,
    marketInsight,
    commercialRecommendation,
    suggestedNextStep,
    emailDraft,
    sections,
    fullDraft,
  };
}
