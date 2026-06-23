import type { AccountCrmSummary, BrokerCrmSummary } from "@/lib/aiCrmContext";

const SHARED_RULES = `
You are the AI commercial assistant for a freight broker CRM called Logistics Masters AI Commercial Assistant.
Analyze ONLY the CRM data provided in the user message.
Do not invent facts, activities, contacts, lanes, rates, or outcomes that are not present in the data.
If information is missing or insufficient, say that clearly in your output.
Be practical, direct, and professional. Use freight brokerage language.
Keep each bullet concise. Do not write long essays.
Reference company names from the data when relevant.
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

Summarize what is happening, the next best action, risks, opportunity notes, and a suggested follow-up timing with reason.`;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
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
  "Follow-up Email",
  "LinkedIn Message",
  "Re-engagement Message",
  "Quote Follow-up",
  "General Prospecting Message",
] as const;

export type OutreachType = (typeof OUTREACH_TYPES)[number];

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
  sections: Array<{ title: string; content: string }>;
  fullDraft: string;
}

export const OUTREACH_SYSTEM_PROMPT = `
You are the AI outreach assistant for a freight broker CRM called Logistics Masters AI Commercial Assistant.
This tool is ASSISTIVE ONLY. You produce drafts and scripts for the broker to review and use manually.
You do NOT send email, WhatsApp, SMS, LinkedIn messages, or any outreach. You do NOT run campaigns or contact customers.
Write outreach drafts using ONLY the CRM context provided.
Do not invent quotes, calls, lanes, rates, relationships, or prior conversations unless they appear in the CRM data.
If CRM data is limited, write an honest, general message without pretending there was prior contact.
Use natural freight brokerage language. Be concise, practical, and human — not robotic.
Do not overpromise capacity, rates, service levels, or coverage not supported by the CRM data.
Do not quote specific rates or make binding commitments unless a quoted rate appears in CRM opportunity data — and even then, frame it as a draft for broker review.
Do not claim emails or messages were already sent unless recorded in activities or follow-ups.
Do not instruct the broker to click send, post, or automate anything — only to review, edit, and reach out manually.
Return valid JSON only with these keys:
- subjectLine (string or null; required for email draft types, null for call scripts and LinkedIn drafts)
- sections (array of { title, content } with the structured parts of the draft)
- fullDraft (string: the complete copy-ready text the broker can paste into their own email, phone, or LinkedIn app)
`.trim();

export function buildOutreachUserPrompt(
  context: import("@/lib/aiCrmContext").OutreachCrmContext,
): string {
  const isCallScript = context.outreachType === "Call Script";

  return `Generate a ${context.outreachType} DRAFT for company "${context.company.name}".
The broker will review this text and reach out manually. Do not imply anything will be sent automatically.

Tone: ${context.tone}
Broker goal: ${context.goal?.trim() || "Not specified — infer a sensible goal from CRM context."}
Selected contact: ${context.selectedContact?.name ?? "No specific contact"}

CRM context:
${JSON.stringify(
  {
    company: context.company,
    selectedContact: context.selectedContact,
    contacts: context.contacts,
    pendingFollowUps: context.pendingFollowUps,
    completedFollowUps: context.completedFollowUps,
    recentActivities: context.recentActivities,
    opportunities: context.opportunities,
  },
  null,
  2,
)}

${
  isCallScript
    ? `Structure sections as: Opening line, Reason for calling, Discovery questions, Value proposition, Closing / next step.
Discovery questions should be an ordered list inside the content field.`
    : `Structure sections as: Subject line (if email), Message body, Optional follow-up line.
Put the subject in both subjectLine and a section when outreach type is Follow-up Email or Quote Follow-up.`
}`;
}

export function normalizeOutreachDraft(value: unknown): OutreachDraftResponse {
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

  const fullDraft =
    typeof record.fullDraft === "string" ? record.fullDraft.trim() : "";

  const subjectLine =
    typeof record.subjectLine === "string" && record.subjectLine.trim()
      ? record.subjectLine.trim()
      : null;

  if (fullDraft) {
    return { subjectLine, sections, fullDraft };
  }

  const assembled = sections
    .map((section) => `${section.title}\n${section.content}`)
    .join("\n\n");

  return {
    subjectLine,
    sections,
    fullDraft: assembled || "No outreach draft was generated.",
  };
}
