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
1. Commercial Timeline first. Read it before anything else and base the email on it. Notes in Spanish are part of the conversation. Internally identify the last conversation, what the customer requested, what they accepted or rejected, whether they use another transportation provider, whether they are not interested right now, whether they asked for a later follow-up, any recorded opportunity, any commitment, and the appropriate next step. Do not output that analysis. Automatic notes that only record a completed follow-up are administrative. Call, email, and meeting notes are the conversation.
2. Company profile, contacts, quotes, and lanes only support the timeline. Never ask the broker to provide equipment type, transportation mode, commodity, shipping lanes, previous conversations, preferences, or commitments. Those are already in the CRM. If one of them is missing, leave it out and still write the email.
3. Personalized outreach. Follow the selected language even when the CRM notes are in another language. Use products, lanes, and equipment only when the records contain them. The communication style and the tone change the writing, not the stage or the purpose. Do not repeat an approach the broker marked too generic, not relevant, or incorrect, and do not repeat an angle already used in the follow-up sequence.
4. Relationship. If the customer is happy with their current provider or is not looking to change, acknowledge that and do not ask for a load. If they asked for information, follow up on that information. If they asked to be contacted later, continue that conversation. If a quote is on file and they are not staying with another provider, refer to that quote. If they are not shipping, keep the relationship without urgency. Do not invent a shipping opportunity.
5. Freight judgment. You understand full truckload (FTL), refrigerated freight (reefer), dry van, flatbed, produce and fresh vegetables, fruit and vegetable transportation, shipping lanes, seasonal demand, carrier capacity, spot and contract rates, and shipper and receiver operations. Use that judgment to interpret the records. Do not use it to invent this customer's volume, lanes, or the market.

The commercial context, when provided, refines the email. It does not create a separate objective section.
Prior draft feedback is the broker's judgment on earlier drafts for this company. Do not say the model was retrained.
Follow the selected language. Write a complete, specific, commercially useful email.
`.trim();

export const ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT = `
You write customer-facing drafts for Armstrong Transport Group brokers inside the CRM.
${CUSTOMER_BRAND_RULES}
${OUTREACH_GUARDRAILS}
Return JSON with exactly these keys:
- suggestedEmailSubject (string; specific to the recorded business, never "Checking in" or "Following up")
- suggestedEmailBody (string; 70 to 120 words, for the broker to copy, signed Armstrong Transport Group)
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
Do not ask the broker to supply equipment, mode, commodity, or lanes. Write from the Commercial Timeline. If a fact is missing, leave it out.

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
  "Automatic / next best follow-up",
  "Front desk referral",
  "Opportunity Development",
  "After-call thank-you",
  "Follow-up after introduction",
  "Quote Follow-up",
  "No-response follow-up",
  "Lane, capacity, commodity or equipment inquiry",
  "Value-add",
  "Market insight",
  "Account nurture",
  "Re-engagement",
  "Active shipment",
  "Post-delivery",
  "Custom goal",
  "Relationship Follow-up",
  "Call Script",
  "Technical Follow-up",
] as const;

export type OutreachType = (typeof OUTREACH_TYPES)[number];

const LEGACY_OUTREACH_TYPES: Record<string, OutreachType> = {
  "Follow-up Email": "Account nurture",
  "LinkedIn Message": "Account nurture",
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

export const OUTREACH_STYLES = [
  "Natural and conversational",
  "Standard commercial email",
] as const;

export type OutreachStyle = (typeof OUTREACH_STYLES)[number];

const LEGACY_OUTREACH_STYLES: Record<string, OutreachStyle> = {
  "Natural / Conversational": "Natural and conversational",
  Natural: "Natural and conversational",
  Standard: "Standard commercial email",
};

export function resolveOutreachStyle(value: string): OutreachStyle | null {
  if ((OUTREACH_STYLES as readonly string[]).includes(value)) {
    return value as OutreachStyle;
  }
  return LEGACY_OUTREACH_STYLES[value] ?? null;
}

export const OUTREACH_TONES = [
  "Professional and polished",
  "Consultative",
  "Direct but persistent",
  "Warm and personable",
  "Concise",
  "Value-focused",
  "Confident and firm, without pressure",
] as const;

export type OutreachTone = (typeof OUTREACH_TONES)[number];

const LEGACY_OUTREACH_TONES: Record<string, OutreachTone> = {
  "Natural / Conversational": "Professional and polished",
  Professional: "Professional and polished",
  Friendly: "Warm and personable",
  Direct: "Direct but persistent",
  Warm: "Warm and personable",
  "Persistent but respectful": "Direct but persistent",
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
Every sentence must have a purpose.
The communication style and the tone are separate. Style chooses the shape. Tone chooses the voice. Neither one changes the stage.
Natural and conversational: fluid, human, and complete, with a greeting and a clear reason to write. It may be shorter than a standard commercial email.
Standard commercial email: a more developed note with context, the reason for writing, and a simple next step when the stage needs one.
Professional and polished is calm and precise. Consultative asks a thoughtful question. Direct but persistent is clear and steady, not aggressive. Warm and personable is friendly, not syrupy. Concise is tighter, not unfinished. Value-focused offers something useful. Confident and firm, without pressure, is assured and leaves the customer room to decide.
The selected language parameter is authoritative.
If language is "en", generate the complete email in natural American business English.
If language is "es", generate the complete email in natural Latin American Spanish.
Never infer the language from the customer's CRM records, previous emails, company name or conversation history.
Never mix English and Spanish.
The subject, email body and signature must follow the selected language, while preserving the official company name Armstrong Transport Group.
Preserve proper names and freight terms such as reefer, dry van, and flatbed.

Write like an experienced Armstrong Transport Group account manager.
Sound professional and human. Do not sound robotic, stiff, or artificial.
When language is "en", use professional American business English.
When the timeline shows an existing relationship, do not open with a generic introduction.
When the stage is a first introduction, introduce Armstrong Transport Group in concrete terms and do not pretend you have spoken before.
If the timeline says the broker spoke with a named person, write the email to that person and greet them by name. Do not talk about them in the third person, and do not thank the reader for a conversation with that person.
Do not mention the CRM, the Commercial Timeline, or that notes were reviewed.

The email is the only output:
- Subject: short and specific to this stage and the recorded relationship.
- Match the length to the stage. After-call thank-you and post-delivery emails may be shorter, about 50 to 100 words, and must still be complete. Front desk referral and a standard commercial introduction need more context, about 110 to 170 words. Other emails are usually 70 to 140 words. Do not exceed about 180 words.
- Use a fitting greeting, a clear reason to write, and one simple next step when the stage calls for one.
- Close with "Best," in English or "Saludos," in Spanish.
- The signature is added separately as Armstrong Transport Group. Do not repeat that signature line in the body. You may say "we" as Armstrong Transport Group.
- Do not include internal CRM identifiers, broker login emails, follow-up IDs, or other records the customer should not see.

Shape, varied to fit the history:
- Open from the previous conversation.
- Add the relevant commercial context. If they are staying with their provider, respect that and do not pitch a load.
- Ask one intelligent question.
- Close professionally.

Do not write a commercial objective, a strategy, a recommendation, a market report, source citations, or an explanation of the email.
Do not use more than one call to action.
Do not mention that anyone is monitoring data.
Include a market condition only when the user message provides a usable market note and it genuinely helps this customer's recorded situation. Paraphrase it in one sentence. Do not quote rates, percentages, or load-to-truck ratios. Do not present a regional note as this lane's rate. Do not lengthen the email just to include it.
If no usable market note is provided, write from the Commercial Timeline and do not mention market conditions.
If a recorded quote is the reason for the email, treat the quoted rate as a past quote. Do not present it as today's market rate.
Never stop to ask the broker for a goal, equipment type, transportation mode, commodity, a lane, or prior conversations. If the goal is empty, infer it from the stage and the timeline. Ask about lane, commodity, or equipment only when the stage is the lane inquiry. clarificationQuestion must be null. Write the email immediately from what is available.

Return JSON with exactly these keys:
- subject (string)
- body (string)
- signature (string; Armstrong Transport Group)
- clarificationQuestion (null)
`.trim();

const INTRODUCTION_STAGES = new Set<string>([
  "Front desk referral",
  "Opportunity Development",
  "Follow-up after introduction",
]);

function outreachPurpose(type: string): string {
  switch (type) {
    case "Automatic / next best follow-up":
      return "Write the single next reasonable email from the Commercial Timeline and the follow-up sequence. Do not require a lane, commodity, or equipment. Do not draft the rest of the sequence.";
    case "Front desk referral":
      return "The broker does not know this recipient. Introduce the broker and what Armstrong Transport Group does, explain in concrete terms why they are writing, and ask to be connected with the right person or for their details to be passed along. Make it more complete than a short follow-up. Do not pretend there is an existing relationship, and do not invent lanes or needs.";
    case "Opportunity Development":
      return "Open a relevant commercial conversation. Explain how Armstrong Transport Group could help and propose one simple next step. If lanes or needs are not recorded, do not invent them and do not ask the broker to supply them. Write a useful general email.";
    case "After-call thank-you":
      return "Thank them for taking the call. Use the actual call notes. Leave a natural next step. Do not turn this into a request for a lane, commodity, or equipment.";
    case "Follow-up after introduction":
      return "Thank them for the introduction or referral. Briefly explain why the broker is reaching out and open the conversation. Do not pretend the broker already knows their freight.";
    case "Quote Follow-up":
      return "Follow up on the specific quote in the timeline. Ask whether it is still current or needs an adjustment, and make it easy to reply. Do not invent a rate. Do not repeat a question the notes already answer. If no quote is recorded, continue from the timeline instead of asking the broker for one.";
    case "No-response follow-up":
      return "Write the next touch after no reply. Use the follow-up sequence so this email has a different purpose from the earlier ones. Do not write 'just checking in' or 'following up on my last email'.";
    case "Lane, capacity, commodity or equipment inquiry":
      return "This is the only stage that should ask about lane, capacity, commodity, or equipment. Ask only for the details that would help the next step. Do not invent the answers.";
    case "Value-add":
      return "Share one observation that is already recorded, or one verified market note when research is on. Offer concrete help and open a useful conversation without pressure.";
    case "Market insight":
      return "Use a verified market note only when one is provided and it is relevant to this customer or their recorded operation. Do not present a general observation as this customer's situation. If no usable note is provided, write a useful email from the CRM and do not invent a market fact.";
    case "Account nurture":
      return "Stay professionally present and ask about future plans. Do not send an empty check-in or an insistent pitch.";
    case "Relationship Follow-up":
      return "Continue the recorded relationship. If the customer is staying with another provider or is not looking to change, acknowledge that and do not ask for a load. Do not invent a shipping opportunity.";
    case "Re-engagement":
      return "Reopen a quiet or stalled conversation from the last recorded interaction. Give one concrete reason to reconnect. Do not pretend there was a recent conversation, and do not invent a lane.";
    case "Active shipment":
      return "Ask about status or the next coordination step using only a shipment recorded in the CRM. If none is recorded, do not invent one. Say you are available for the next step on the recorded work.";
    case "Post-delivery":
      return "Thank them for the recorded shipment. If the notes say how it went, acknowledge that. Leave the door open for future freight. Do not invent a new load.";
    case "Custom goal":
      return "Follow the broker's goal when one is written. If it is empty, infer the purpose from the timeline and write that email. Do not stop to ask for a goal.";
    case "Call Script":
      return "The email should offer a short call. The reason must come from a recorded lane, quote, follow-up, or note. If none is recorded, offer the call without inventing freight details.";
    case "Technical Follow-up":
      return "If a usable market note is provided and it fits the recorded history, let one relevant condition support the email. Otherwise use the recorded conversation, lane, or shipment. Do not ask the broker for equipment.";
    default:
      return "Use the recorded commercial history as the reason to write. If a useful detail is missing, write a general editable email. Do not stop to ask the broker.";
  }
}

export function buildOutreachUserPrompt(
  context: OutreachPromptSource,
  options: {
    language: OutreachLanguage;
    communicationStyle?: string;
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
  const respectPreview = compactOutreachContext(context);
  const respectCurrentProvider =
    respectPreview.relationship.notLookingToChangeProvider ||
    respectPreview.relationship.usingAnotherProvider;
  const doNotPushFreight =
    respectCurrentProvider || respectPreview.relationship.notInterestedNow;
  const marketAllowed = options.emailGuidance.length > 0 && !doNotPushFreight;
  const brief = marketAllowed
    ? compactOutreachContext(context, { allowMarketAngle: true })
    : respectPreview;
  const guidance = marketAllowed
    ? options.emailGuidance.map((note) => `- ${note}`).join("\n")
    : "None. Market research is off or not relevant. Do not mention market conditions, capacity, rates, or weather.";
  const style =
    resolveOutreachStyle(options.communicationStyle ?? "") ??
    "Standard commercial email";
  const relationshipConstraint = INTRODUCTION_STAGES.has(context.outreachType)
    ? ""
    : respectCurrentProvider
      ? "The Commercial Timeline shows the customer is staying with their current transportation provider. Acknowledge that and do not ask for a load."
      : brief.relationship.notInterestedNow
        ? "The Commercial Timeline shows the customer is not interested right now. Acknowledge that conversation, keep the relationship open, and do not ask for a load."
        : "";
  const stageDirection = [outreachPurpose(context.outreachType), relationshipConstraint]
    .filter(Boolean)
    .join("\n");
  const laneInquiry =
    context.outreachType === "Lane, capacity, commodity or equipment inquiry";
  const sequenceSteersStage = new Set<string>([
    "Automatic / next best follow-up",
    "No-response follow-up",
    "Relationship Follow-up",
    "Re-engagement",
    "Account nurture",
  ]).has(context.outreachType);
  const sequenceNote = sequenceSteersStage
    ? `Follow-up sequence: ${brief.followUpSequence.instruction}`
    : `Earlier angles already used: ${brief.followUpSequence.anglesAlreadyUsed.join(", ") || "none"}. Do not repeat one of those angles. The selected stage still decides the purpose of this email.`;

  return `Write one ${context.outreachType} email for "${context.company.name}".
The broker will review it and send it manually. Do not imply that any message will be sent.
language: "${options.language}". This parameter is authoritative for the subject, body, and closing. Translate the email into that language even when the CRM notes are in another language. Preserve proper names and Armstrong Transport Group.
Communication style: ${style}
Tone: ${context.tone}
Goal: ${context.goal?.trim() || "Not specified. Infer it from this stage and the Commercial Timeline. Do not ask the broker for a goal."}
${stageDirection}
${brief.relationship.internalWritingDirection}
${sequenceNote}
Selected contact: ${
    context.selectedContact
      ? `${context.selectedContact.name}${context.selectedContact.jobTitle ? `, ${context.selectedContact.jobTitle}` : ""}`
      : "No specific contact. If the timeline names the person the broker spoke with, greet that person. Otherwise use a simple greeting without inventing a name."
  }
Lane already retrieved from CRM: ${
    options.selectedLane
      ? `${options.selectedLane.origin} to ${options.selectedLane.destination}${options.selectedLane.equipmentType ? `, ${options.selectedLane.equipmentType}` : ""}${options.selectedLane.commodities.length ? `, ${options.selectedLane.commodities.join(", ")}` : ""}. ${options.laneChosenByBroker ? "The broker selected this recorded lane." : "This is the most recently recorded lane. Do not claim it is the customer's only lane."}`
      : "No recorded lane. Do not invent one, and do not ask the broker for one."
  }
${laneInquiry ? "This stage may ask the customer for the operational detail that is still missing." : "Do not ask the customer or the broker for equipment type, transportation mode, commodity, or a shipping lane."}

The Commercial Timeline below is the primary source. Read it before the rest of the brief.
Apply the relationship reading and the follow-up sequence internally. Do not copy them into the email, and do not show them to the broker.
If a useful detail is missing, write a general editable email now. Do not stop to ask a question first.
Match the length to the stage. clarificationQuestion must be null.

Usable market notes, already checked. Use one only when it gives a natural reason to write and it fits this customer. Do not copy them verbatim, do not cite a source, and do not add numbers:
${guidance}

CRM brief:
${JSON.stringify(brief)}

Return only the email JSON. The broker sees the subject, the email body, and the Armstrong Transport Group signature. Do not add an analysis, objective, strategy, recommendation, or a list of missing information.`;
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
