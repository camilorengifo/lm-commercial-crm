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

const BROKER_TRANSPORT_QUESTION =
  /\b(?:what|which)\s+(?:lane|lanes|commodity|commodities|equipment(?:\s+type)?|transportation mode|mode)\b[^?.!]{0,90}\b(?:should I|should this|do you want me|can you (?:tell|give)|please (?:provide|confirm|share)|before I|to mention|to include|to use)\b|\b(?:I need(?: to know)?|please (?:provide|tell me|confirm)|before I write)\b[^?.!]{0,70}\b(?:lane|commodity|equipment)\b/i;

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
    shape.outreachType === "Post-delivery" ||
    shape.outreachType === "Post-Presentation Call Follow-up"
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

export function draftAsksBrokerBeforeWriting(draft: CustomerEmailDraft): boolean {
  const body = draft.body.trim();
  if (!body) return true;
  return countWords(body) < 80 && BROKER_TRANSPORT_QUESTION.test(body);
}

export function shouldRewriteOutreachDraft(
  draft: CustomerEmailDraft,
  shape: OutreachDraftShape = {},
): boolean {
  if (draftAsksBrokerBeforeWriting(draft)) return true;
  const words = countWords(draft.body);
  const bounds = lengthBounds(shape);
  if (words < bounds.min || words > bounds.max) return true;
  if (shape.outreachType === LANE_INQUIRY_STAGE) return false;
  if (
    shape.outreachType === "Opportunity Development" ||
    shape.outreachType === "Post-Presentation Call Follow-up"
  ) {
    return false;
  }
  return ASKS_FOR_TRANSPORTATION_FACTS.test(draft.body);
}

export function timelineReferenceUrls(
  texts: Array<string | null | undefined>,
): string[] {
  const found: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
      const url = match[0].replace(/[.,;]+$/, "");
      const around = text.slice(
        Math.max(0, (match.index ?? 0) - 80),
        (match.index ?? 0) + url.length + 80,
      );
      const relevant = /quote|cotiz|portal|enlace|link/i.test(`${around} ${url}`);
      if (relevant && !found.includes(url)) found.push(url);
    }
  }
  return found.slice(0, 4);
}

export function keepQuoteLinks(
  draft: CustomerEmailDraft,
  urls: string[],
  language: OutreachLanguage,
): CustomerEmailDraft {
  const missing = urls.filter((url) => url && !draft.body.includes(url));
  if (!draft.body.trim() || missing.length === 0) return draft;
  const lines = missing
    .map((url) =>
      language === "es"
        ? `El enlace para cotizar que quedó de la conversación es ${url}.`
        : `The quoting link from our conversation is ${url}.`,
    )
    .join("\n");
  const marker = language === "es" ? "Saludos," : "Best,";
  const body = draft.body.includes(marker)
    ? draft.body.replace(marker, `${lines}\n\n${marker}`)
    : `${draft.body}\n\n${lines}`;
  return { ...draft, body };
}

export function postPresentationCallFallback(input: {
  contactName: string | null;
  language: OutreachLanguage;
  senderName?: string | null;
  senderEmail?: string | null;
  referenceUrl?: string | null;
}): CustomerEmailDraft {
  const name = input.contactName?.trim();
  const senderName = input.senderName?.trim() || "";
  const senderEmail = input.senderEmail?.trim() || "";
  const referenceUrl = input.referenceUrl?.trim() || "";
  const senderLines = [senderName, senderEmail].filter(Boolean).join("\n");
  const draft =
    input.language === "es"
      ? presentCustomerEmail(
          {
            subject: "Gracias por su tiempo",
            body: `${name ? `Hola ${name},` : "Hola,"}\n\nGracias por su tiempo y por atender la llamada. Le agradezco la conversación.\n\nQuedo atento a sus necesidades de transporte y con gusto le ayudo cuando lo necesite.\n\nMis datos de contacto aparecen abajo.${senderLines ? `\n${senderLines}` : ""}`,
          },
          "es",
        )
      : presentCustomerEmail(
          {
            subject: "Thank you for your time",
            body: `${name ? `Hi ${name},` : "Hi,"}\n\nThank you for your time and for taking the call. I appreciate the conversation.\n\nI will stay available if you need help with transportation.\n\nMy contact details are below.${senderLines ? `\n${senderLines}` : ""}`,
          },
          "en",
        );
  if (!referenceUrl) return draft;
  const linkLine =
    input.language === "es"
      ? `El enlace para cotizar que quedó de la conversación es ${referenceUrl}.`
      : `The quoting link from our conversation is ${referenceUrl}.`;
  const marker =
    input.language === "es"
      ? "Mis datos de contacto aparecen abajo."
      : "My contact details are below.";
  return {
    ...draft,
    body: draft.body.replace(marker, `${linkLine}\n\n${marker}`),
  };
}

export function generalOutreachFallback(input: {
  companyName: string;
  contactName: string | null;
  language: OutreachLanguage;
}): CustomerEmailDraft {
  const company = input.companyName.trim() || "your company";
  const name = input.contactName?.trim();
  if (input.language === "es") {
    const greeting = name ? `Hola ${name},` : "Hola,";
    return presentCustomerEmail(
      {
        subject: "Conversación sobre su transporte",
        body: `${greeting}\n\nLe escribo de Armstrong Transport Group. Ayudamos a las empresas con su carga y quería abrir una conversación sobre cómo podríamos ser útiles para ${company}.\n\nNo voy a asumir un carril ni un producto. Si tiene embarques en camino, o si le sirve contar con otra opción de transporte, me gustaría conocer qué está planeando.\n\n¿Le parece bien contarme cómo maneja su carga hoy?`,
      },
      "es",
    );
  }
  const greeting = name ? `Hi ${name},` : "Hi,";
  return presentCustomerEmail(
    {
      subject: "A conversation about your freight",
      body: `${greeting}\n\nI am writing from Armstrong Transport Group. We help companies move their freight, and I wanted to open a conversation about whether we can be useful to ${company}.\n\nI will not assume a lane or a product. If you have shipments coming up, or if another transportation option would help, I would like to hear what you are planning.\n\nWould you be open to sharing how you handle freight today?`,
    },
    "en",
  );
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
  return [`Subject: ${draft.subject}`, "", draft.body].filter((part) => part !== "").join("\n");
}
