import {
  CUSTOMER_FACING_COMPANY,
  enforceCustomerBrand,
} from "@/lib/customerBrand";

export const OUTREACH_LANGUAGES = ["English", "Español"] as const;

export type OutreachLanguage = (typeof OUTREACH_LANGUAGES)[number];

export function resolveOutreachLanguage(value: string): OutreachLanguage | null {
  if ((OUTREACH_LANGUAGES as readonly string[]).includes(value)) {
    return value as OutreachLanguage;
  }
  return null;
}

export interface CustomerEmailDraft {
  subject: string;
  body: string;
  signature: typeof CUSTOMER_FACING_COMPANY;
  clarificationQuestion: string | null;
}

const BANNED_SENTENCE =
  /[^.!?\n]*\b(i hope this (?:email|message) finds you well|i wanted to take a moment(?: to reach out)?|we would love the opportunity|potential synergies|we greatly appreciate your consideration|just checking in|hope you are (?:doing|having) well|touching base|i am reaching out to explore)\b[^.!?\n]*[.!?]?/gi;

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

function stripBannedContent(value: string): string {
  const lines = value
    .replace(BANNED_SENTENCE, "")
    .split(/\r?\n/)
    .map((line) => cleanLine(line))
    .filter((line) => line && !BANNED_HEADING.test(line));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function closingFor(language: OutreachLanguage): string {
  return language === "Español" ? "Saludos," : "Best,";
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
  const clarification = stripBannedContent(
    typeof record?.clarificationQuestion === "string"
      ? record.clarificationQuestion
      : "",
  );
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

  if (clarification && countWords(body) < 20) {
    return {
      subject: "",
      body: "",
      signature: CUSTOMER_FACING_COMPANY,
      clarificationQuestion: clarification,
    };
  }

  const finishedBody = body ? ensureClosing(body, language) : "";
  return {
    subject:
      subject ||
      (finishedBody
        ? language === "Español"
          ? "Embarques"
          : "Your shipments"
        : ""),
    body: finishedBody,
    signature: CUSTOMER_FACING_COMPANY,
    clarificationQuestion: null,
  };
}

export function emailCopyText(draft: CustomerEmailDraft): string {
  if (draft.clarificationQuestion) return draft.clarificationQuestion;
  return [`Subject: ${draft.subject}`, "", draft.body, draft.signature]
    .filter((part) => part !== "")
    .join("\n");
}
