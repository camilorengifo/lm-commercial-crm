import {
  CUSTOMER_FACING_COMPANY,
  enforceCustomerBrand,
} from "@/lib/customerBrand";

export const OUTREACH_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
] as const;

export type OutreachLanguage = (typeof OUTREACH_LANGUAGES)[number]["value"];

const LANGUAGE_ALIASES: Record<string, OutreachLanguage> = {
  en: "en",
  es: "es",
  english: "en",
  español: "es",
  espanol: "es",
};

export function resolveOutreachLanguage(value: string): OutreachLanguage | null {
  return LANGUAGE_ALIASES[value.trim().toLowerCase()] ?? null;
}

export interface CustomerEmailDraft {
  subject: string;
  body: string;
  signature: typeof CUSTOMER_FACING_COMPANY;
  clarificationQuestion: string | null;
}

const BANNED_SENTENCE =
  /[^.!?\n]*\b(i hope this (?:email|message) finds you well|i wanted to take a moment(?: to reach out)?|we would love the opportunity|potential synergies|we greatly appreciate your consideration|just checking in|following up on my last email|hope you are (?:doing|having) well|touching base|i am reaching out to explore)\b[^.!?\n]*[.!?]?/gi;

const BANNED_HEADING =
  /^(?:subject alternatives|commercial (?:objective|intelligence summary|recommendation|strateg(?:y|ies))|suggested (?:objectives|next step)|ai (?:recommendations?|reasoning|explanations?)|market (?:intelligence|research|analysis|insight)|recommendations?|talking points|research methodology|email draft)\s*:?\s*$/i;

const SOURCE_CITATION =
  /\b(?:according to|as reported by|per|source:)\s+(?:DAT|USDA(?:\s+AMS)?|EIA|NOAA|the National Weather Service|FreightWaves|Transport Topics)\b[:,]?/gi;

const URL_PATTERN = /https?:\/\/\S+/gi;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function cleanLine(value: string): string {
  return enforceCustomerBrand(value)
    .replace(SOURCE_CITATION, "")
    .replace(URL_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function countWords(value: string): number {
  const words = value.trim().match(/[\p{L}\p{N}']+/gu);
  return words?.length ?? 0;
}

const ASKS_FOR_TRANSPORTATION_FACTS =
  /\b(?:what|which)\s+(?:equipment(?:\s+type)?|transportation mode|mode of transport|commodity|shipping lane)\b|\bplease (?:provide|confirm|send)\b[^.]{0,48}\b(?:equipment|commodity|lane|mode)\b/i;

const LANE_INQUIRY_STAGE = "Lane, capacity, commodity or equipment inquiry";

export interface OutreachDraftShape {
  outreachType?: string;
  tone?: string;
  communicationStyle?: string;
}

export function lengthBounds(shape: OutreachDraftShape = {}): {
  min: number;
  max: number;
} {
  if (shape.outreachType === "Front desk referral") return { min: 70, max: 210 };
  if (
    shape.outreachType === "After-call thank-you" ||
    shape.outreachType === "Post-delivery"
  ) {
    return { min: 35, max: 150 };
  }
  if (
    shape.tone === "Concise" ||
    shape.communicationStyle === "Natural and conversational"
  ) {
    return { min: 40, max: 160 };
  }
  return { min: 50, max: 190 };
}

export function shouldRewriteOutreachDraft(
  draft: CustomerEmailDraft,
  shape: OutreachDraftShape = {},
): boolean {
  const words = countWords(draft.body);
  const bounds = lengthBounds(shape);
  if (words < bounds.min || words > bounds.max) return true;
  if (shape.outreachType === LANE_INQUIRY_STAGE) return false;
  return ASKS_FOR_TRANSPORTATION_FACTS.test(draft.body);
}

export function chooseOutreachDraft(
  first: CustomerEmailDraft,
  second: CustomerEmailDraft | null,
  shape: OutreachDraftShape = {},
): CustomerEmailDraft {
  if (!second || countWords(second.body) === 0) return first;
  if (!shouldRewriteOutreachDraft(second, shape)) return second;
  if (
    shouldRewriteOutreachDraft(first, shape) &&
    countWords(second.body) > countWords(first.body)
  ) {
    return second;
  }
  return first;
}

function stripBannedContent(value: string): string {
  const lines = value
    .replace(BANNED_SENTENCE, "")
    .split(/\r?\n/)
    .map((line) => cleanLine(line))
    .filter((line) => line && !BANNED_HEADING.test(line));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function closingFor(language: OutreachLanguage): string {
  return language === "es" ? "Saludos," : "Best,";
}

function ensureClosing(body: string, language: OutreachLanguage): string {
  const withoutSignoff = body
    .replace(
      /\n*(?:best|saludos|sincerely|regards|kind regards|atentamente|un saludo),?\s*$/i,
      "",
    )
    .replace(new RegExp(`\\n*${CUSTOMER_FACING_COMPANY}\\s*$`, "i"), "")
    .trim();
  return `${withoutSignoff}\n\n${closingFor(language)}`;
}

export function presentCustomerEmail(
  value: unknown,
  language: OutreachLanguage,
): CustomerEmailDraft {
  const record = asRecord(value);
  const subject = stripBannedContent(
    typeof record?.subject === "string"
      ? record.subject
      : typeof record?.subjectLine === "string"
        ? record.subjectLine
        : "",
  )
    .replace(/^subject:\s*/i, "")
    .split("\n")[0]
    ?.trim() ?? "";
  const body = stripBannedContent(
    typeof record?.body === "string"
      ? record.body
      : typeof record?.emailDraft === "string"
        ? record.emailDraft
        : "",
  );

  const finishedBody = body ? ensureClosing(body, language) : "";
  return {
    subject:
      subject ||
      (finishedBody
        ? language === "es"
          ? "Embarques"
          : "Your shipments"
        : ""),
    body: finishedBody,
    signature: CUSTOMER_FACING_COMPANY,
    clarificationQuestion: null,
  };
}

export function emailCopyText(draft: CustomerEmailDraft): string {
  if (!draft.body.trim()) return "";
  return [`Subject: ${draft.subject}`, "", draft.body, draft.signature]
    .filter((part) => part !== "")
    .join("\n");
}
