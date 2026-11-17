import type { AccountCrmSummary, BrokerCrmSummary } from "@/lib/aiCrmContext";
import { CUSTOMER_BRAND_RULES, enforceCustomerBrand } from "@/lib/customerBrand";
import {
  presentCustomerEmail,
  type CustomerEmailDraft,
  type OutreachLanguage,
} from "@/lib/customerEmail";
import {
  compactOutreachContext,
  type OutreachPromptSource,
} from "./outreachContext.ts";

const SHARED_RULES = `
You are the AI commercial assistant for a freight broker CRM called Logistics Masters AI Commercial Assistant.
${CUSTOMER_BRAND_RULES}
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

const OUTREACH_GUARDRAILS = `
This tool is ASSISTIVE ONLY. You prepare a draft for the broker to review, edit, and send manually.
You do NOT send email, WhatsApp, SMS, LinkedIn messages, or any other outreach. You do NOT contact customers, book freight, quote a live rate, or run campaigns.
You do NOT say that a message was sent, will be sent automatically, or that you contacted the customer.

Use ONLY the CRM records and the usable market notes in the user message.
Do not invent companies, contacts, job titles, calls, emails, lanes, commodities, equipment, frequencies, volumes, quotes, rates, objections, preferences, seasons, or outcomes.
There is no separate industry field. Describe the customer's business only from company notes, commodities, and opportunity notes. If those do not state an industry or product, leave it out of the customer email.
Do not fill missing facts with plausible freight details.
Historical quoted rates and target rates are past figures recorded by the broker. They are not current market rates. Never invent a current freight rate, index, capacity condition, or market statistic.
Never say capacity is tightening or rates are increasing unless a usable market note supports that condition.
Do not treat a national trend as a condition on one of this customer's lanes.
Do not tell the customer that research was or was not available.
Do not open with "just checking in", "hope you are doing well", "I hope this email finds you well", or "touching base".

How to think:
1. Customer intelligence. Read the sales stage, priority, location, notes, contact roles, last communication, follow-ups, and load history.
2. Personalized outreach. Follow the selected language. Use the customer's actual products, lanes, and equipment when they are on file. Match the requested tone. Do not repeat an approach the broker marked too generic, not relevant, or incorrect.
3. Follow-up. Let the recorded history decide the one question in the email. Do not repeat an ask that earlier notes already made. When the account is quiet or the last note shows resistance, keep the ask light.
4. Sales intelligence. Name an objection only when a note records it. Use Armstrong Transport Group when the draft speaks as the company.
5. Freight judgment. You understand full truckload (FTL), refrigerated freight (reefer), dry van, flatbed, produce and fresh vegetables, fruit and vegetable transportation, shipping lanes, seasonal demand, carrier capacity, spot and contract rates, and shipper and receiver operations. Use that judgment to interpret the records. Do not use it to invent this customer's volume, lanes, or the market.

The commercial context, when provided, refines the email. It does not create a separate objective section.
Prior draft feedback is the broker's judgment on earlier drafts for this company. Do not say the model was retrained.
Follow the selected language. Be specific, concise, and commercially useful.
`.trim();

export const ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT = `
You write customer-facing drafts for Armstrong Transport Group brokers inside the CRM.
${CUSTOMER_BRAND_RULES}
${OUTREACH_GUARDRAILS}
Return JSON with exactly these keys:
- suggestedEmailSubject (string; specific to the recorded business, never "Checking in" or "Following up")
- suggestedEmailBody (string; about 40 to 90 words, for the broker to copy, signed Armstrong Transport Group)
- linkedInMessage (string; shorter than the email, same facts)
- callOpener (string; one or two sentences the broker can say)
- followUpReason (string; why this touch is the right next action, including any missing CRM information)
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
  context: OutreachPromptSource,
): string {
  const brief = compactOutreachContext(context);
  return `Generate outreach DRAFTS for company "${context.company.name}".
Language: English.
The broker will review and reach out manually. Do not imply anything will be sent automatically.
If missingInformation is not empty, acknowledge those gaps in followUpReason and do not invent them.

CRM brief:
${JSON.stringify(brief)}

Primary contact: ${brief.selectedContact?.name ?? brief.contacts.find((contact) => contact.isPrimary)?.name ?? brief.contacts[0]?.name ?? "No contact on file"}`;
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
    emailDraft:
      enforceCustomerBrand(normalizeString(record.emailDraft)) ||
      "Draft unavailable — add more CRM context.",
    callOpener:
      enforceCustomerBrand(normalizeString(record.callOpener)) ||
      "Draft unavailable — add more CRM context.",
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
      enforceCustomerBrand(normalizeString(record.suggestedEmailSubject)) ||
      "Follow-up on freight capacity",
    suggestedEmailBody:
      enforceCustomerBrand(normalizeString(record.suggestedEmailBody)) ||
      "Add more CRM notes to generate a stronger email draft.",
    linkedInMessage:
      enforceCustomerBrand(normalizeString(record.linkedInMessage)) ||
      "Add contact details to personalize LinkedIn outreach.",
    callOpener:
      enforceCustomerBrand(normalizeString(record.callOpener)) ||
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
  "Natural / Conversational",
  "Professional",
  "Friendly",
  "Direct",
] as const;

export type OutreachTone = (typeof OUTREACH_TONES)[number];

const LEGACY_OUTREACH_TONES: Record<string, OutreachTone> = {
  Warm: "Friendly",
  "Persistent but respectful": "Direct",
};

export function resolveOutreachTone(value: string): OutreachTone | null {
  if ((OUTREACH_TONES as readonly string[]).includes(value)) {
    return value as OutreachTone;
  }
  return LEGACY_OUTREACH_TONES[value] ?? null;
}

export type OutreachDraftResponse = CustomerEmailDraft;

export const OUTREACH_SYSTEM_PROMPT = `
You are an experienced freight broker writing one customer email for Armstrong Transport Group.
${CUSTOMER_BRAND_RULES}
${OUTREACH_GUARDRAILS}

Write like a real freight broker, not an AI assistant.
Be direct, conversational, concise, and commercially intelligent.
Every sentence must have a purpose.
The selected language parameter is authoritative.
If language is "en", generate the complete email in natural American business English.
If language is "es", generate the complete email in natural Latin American Spanish.
Never infer the language from the customer's CRM records, previous emails, company name or conversation history.
Never mix English and Spanish.
The subject, email body and signature must follow the selected language, while preserving the official company name Armstrong Transport Group.
Preserve proper names and freight terms such as reefer, dry van, and flatbed.

The email is the only output:
- Subject: short and specific.
- Body: usually 40 to 90 words, 1 to 3 short paragraphs, one simple question.
- Close with "Best," in English or "Saludos," in Spanish.
- Do not put the company name in the body. The signature is added separately as Armstrong Transport Group.

Do not write commercial objectives, strategies, recommendations, market reports, source citations, or an explanation of the email.
Do not use more than one call to action.
Do not mention that anyone is monitoring data.
Include a market condition only when the user message provides a usable market note and it helps this customer. Paraphrase it in one sentence. Do not quote rates, percentages, or load-to-truck ratios. Do not present a regional note as this lane's rate.
If no usable market note is provided, write from the CRM history and do not mention market conditions.
If a recorded quote is the reason for the email, treat the quoted rate as a past quote. Do not present it as today's market rate.
If the request cannot be answered without inventing a lane, quote, or contact, leave subject and body empty and put one short clarification question in clarificationQuestion. Otherwise clarificationQuestion is null.

Return JSON with exactly these keys:
- subject (string)
- body (string)
- signature (string; Armstrong Transport Group)
- clarificationQuestion (string or null)
`.trim();

function outreachPurpose(type: string): string {
  switch (type) {
    case "Call Script":
      return "The email should offer a short call. The reason must come from a recorded lane, quote, follow-up, or note.";
    case "Relationship Follow-up":
      return "Continue the recorded relationship. If the last note shows resistance or the account is quiet, keep the ask light.";
    case "Technical Follow-up":
      return "If a usable market note is provided, let one relevant condition be the reason to write. Otherwise use the recorded lane or shipment.";
    case "Quote Follow-up":
      return "Follow up on a recorded quote. Mention the recorded lane and equipment. Ask what happened with that freight. Do not restate the old rate as today's market.";
    case "Re-engagement":
      return "Reopen a quiet account from the last recorded interaction or lane. Do not pretend there was a recent conversation.";
    case "Opportunity Development":
      return "Ask about a lane, commodity, or equipment already recorded. Do not invent a new lane.";
    default:
      return "Use the recorded commercial history as the reason to write.";
  }
}

export function buildOutreachUserPrompt(
  context: OutreachPromptSource,
  options: {
    language: OutreachLanguage;
    emailGuidance: string[];
    selectedLane: {
      origin: string;
      destination: string;
      equipmentType: string | null;
      commodities: string[];
    } | null;
    laneChosenByBroker: boolean;
  },
): string {
  const brief = compactOutreachContext(context);
  const guidance =
    options.emailGuidance.length > 0
      ? options.emailGuidance.map((note) => `- ${note}`).join("\n")
      : "None. Do not mention market conditions, capacity, rates, or weather.";

  return `Write one ${context.outreachType} email for "${context.company.name}".
The broker will review it and send it manually. Do not imply that any message will be sent.
language: "${options.language}". This parameter is authoritative for the subject, body, and closing.
Tone: ${context.tone}
Commercial context: ${context.goal?.trim() || "Not specified."}
${outreachPurpose(context.outreachType)}
Selected contact: ${
    context.selectedContact
      ? `${context.selectedContact.name}${context.selectedContact.jobTitle ? `, ${context.selectedContact.jobTitle}` : ""}`
      : "No specific contact. Use a simple greeting without inventing a name."
  }
Lane for this email: ${
    options.selectedLane
      ? `${options.selectedLane.origin} to ${options.selectedLane.destination}${options.selectedLane.equipmentType ? `, ${options.selectedLane.equipmentType}` : ""}${options.selectedLane.commodities.length ? `, ${options.selectedLane.commodities.join(", ")}` : ""}. ${options.laneChosenByBroker ? "The broker selected this lane." : "This is the most recently recorded lane. Do not claim it is the customer's only lane."}`
      : "No recorded lane. Do not invent one."
  }

Usable market notes, already checked. Do not copy them verbatim, do not cite a source, and do not add numbers:
${guidance}

CRM brief:
${JSON.stringify(brief)}

Return only the email JSON. Do not add a commercial objective, market report, or recommendation.`;
}

export function normalizeOutreachDraft(
  value: unknown,
  language: OutreachLanguage,
): OutreachDraftResponse {
  return presentCustomerEmail(value, language);
}

export const OUTREACH_DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body", "signature", "clarificationQuestion"],
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    signature: { type: "string" },
    clarificationQuestion: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
};

export const ACCOUNT_OUTREACH_QUICK_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "suggestedEmailSubject",
    "suggestedEmailBody",
    "linkedInMessage",
    "callOpener",
    "followUpReason",
  ],
  properties: {
    suggestedEmailSubject: { type: "string" },
    suggestedEmailBody: { type: "string" },
    linkedInMessage: { type: "string" },
    callOpener: { type: "string" },
    followUpReason: { type: "string" },
  },
};
