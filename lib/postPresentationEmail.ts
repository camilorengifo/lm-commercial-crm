export const POST_PRESENTATION_OUTREACH_TYPE = "Post-Presentation Call Follow-up";

export const POST_PRESENTATION_THANK_YOU = {
  en: "Thank you for taking my call today.",
  es: "Muchas gracias por atender mi llamada hoy.",
} as const;

export type PostPresentationLanguage = keyof typeof POST_PRESENTATION_THANK_YOU;

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const NEXT_STEP_PATTERN =
  /\b(next step|we agreed|agreed to|please send|send (?:me |us )?(?:the |a )?(?:quote|document)|documents?|follow up|quedamos|pr[oó]ximo paso|siguiente paso|enviar|env[ií]e|comparti[oó]|shared (?:a |the )?(?:link|portal|quote)|quoting)\b/i;
const BROKER_QUESTION_PATTERN =
  /\b(which lane|what lane|which commodity|what commodity|which equipment|what equipment|please (?:provide|tell me)|before i (?:can |write)|need the lane|need a lane|lane, commodity|commodity or equipment)\b/i;

export interface PostPresentationEmailInput {
  language: PostPresentationLanguage;
  contactName?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  timelineNotes?: string[];
}

export function resolvePostPresentationLanguage(
  value: string | null | undefined,
): PostPresentationLanguage {
  return value === "es" ? "es" : "en";
}

export function composePostPresentationEmail(input: PostPresentationEmailInput): {
  subject: string;
  subjects: string[];
  body: string;
} {
  const language = input.language;
  const details = timelineDetails(input.timelineNotes ?? []);
  const greeting = greetingLine(language, input.contactName);
  const paragraphs = [
    POST_PRESENTATION_THANK_YOU[language],
    ...details.urls.map((url) => sharedLinkSentence(language, url)),
    ...details.nextSteps.map((step) => nextStepSentence(language, step)),
    availabilitySentence(language),
  ];
  const body = [greeting, "", ...paragraphs.flatMap((paragraph) => [paragraph, ""]), signatureBlock(language, input.senderName, input.senderEmail)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const subjects =
    language === "es"
      ? ["Gracias por su tiempo", "Después de nuestra llamada", "Seguimiento de nuestra conversación"]
      : ["Thank you for your time", "After our call", "Following our conversation"];

  return { subject: subjects[0], subjects, body };
}

export function firstSentenceAfterGreeting(body: string): string {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const greetingIndex = lines.findIndex((line) => /^(hi|hello|hola)\b/i.test(line));
  return lines[greetingIndex + 1] ?? "";
}

function greetingLine(language: PostPresentationLanguage, contactName?: string | null): string {
  const firstName = contactName?.trim().split(/\s+/)[0] ?? "";
  if (language === "es") return firstName ? `Hola ${firstName},` : "Hola,";
  return firstName ? `Hi ${firstName},` : "Hello,";
}

function sharedLinkSentence(language: PostPresentationLanguage, url: string): string {
  return language === "es"
    ? `Gracias por compartir el enlace de cotización: ${url}`
    : `Thank you for sharing the quoting link: ${url}`;
}

function nextStepSentence(language: PostPresentationLanguage, step: string): string {
  return language === "es"
    ? `El siguiente paso de nuestra conversación es: ${step}`
    : `The next step from our conversation is: ${step}`;
}

function availabilitySentence(language: PostPresentationLanguage): string {
  return language === "es"
    ? "Quedo disponible para sus necesidades de transporte."
    : "I remain available for your transportation needs.";
}

function signatureBlock(
  language: PostPresentationLanguage,
  senderName?: string | null,
  senderEmail?: string | null,
): string {
  const lines = [language === "es" ? "Saludos," : "Best,"];
  const name = senderName?.trim() ?? "";
  const email = senderEmail?.trim() ?? "";
  if (name) lines.push(name);
  if (email) lines.push(email);
  return lines.join("\n");
}

function timelineDetails(notes: string[]): { urls: string[]; nextSteps: string[] } {
  const urls: string[] = [];
  const nextSteps: string[] = [];
  const seenUrls = new Set<string>();

  for (const note of notes) {
    const cleaned = cleanTimelineNote(note);
    if (!cleaned) continue;
    const foundUrls = extractUrls(cleaned);
    const mentionsQuoteLink = /quote|cotiz|portal|enlace|link|quoting|compart/i.test(cleaned);
    for (const url of foundUrls) {
      const relevant = mentionsQuoteLink || /quote|cotiz|portal/i.test(url);
      if (!relevant || seenUrls.has(url) || isInternalUrl(url)) continue;
      seenUrls.add(url);
      urls.push(url);
    }

    if (nextSteps.length > 0) continue;
    for (const sentence of sentences(cleaned)) {
      if (foundUrls.some((url) => sentence.includes(url))) continue;
      if (!NEXT_STEP_PATTERN.test(sentence)) continue;
      if (BROKER_QUESTION_PATTERN.test(sentence)) continue;
      nextSteps.push(sentence.replace(/\s+/g, " ").trim());
      break;
    }
  }

  return { urls, nextSteps };
}

function cleanTimelineNote(note: string): string {
  return note
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\bBroker:\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUrls(note: string): string[] {
  return (note.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;]+$/, ""));
}

function isInternalUrl(url: string): boolean {
  return /supabase\.co|crm\.logisticsmasters\.us/i.test(url);
}

function sentences(note: string): string[] {
  return note
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
