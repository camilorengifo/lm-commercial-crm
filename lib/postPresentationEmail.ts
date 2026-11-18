export const POST_PRESENTATION_OUTREACH_TYPE = "Post-Presentation Call Follow-up";

export const POST_PRESENTATION_THANK_YOU = {
  en: "Thank you for taking my call today.",
  es: "Muchas gracias por atender mi llamada hoy.",
} as const;

export type PostPresentationLanguage = keyof typeof POST_PRESENTATION_THANK_YOU;

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

const WEEKDAYS: Array<{ fold: string; en: string; es: string }> = [
  { fold: "lunes", en: "Monday", es: "lunes" },
  { fold: "martes", en: "Tuesday", es: "martes" },
  { fold: "miercoles", en: "Wednesday", es: "miércoles" },
  { fold: "jueves", en: "Thursday", es: "jueves" },
  { fold: "viernes", en: "Friday", es: "viernes" },
  { fold: "sabado", en: "Saturday", es: "sábado" },
  { fold: "domingo", en: "Sunday", es: "domingo" },
  { fold: "monday", en: "Monday", es: "lunes" },
  { fold: "tuesday", en: "Tuesday", es: "martes" },
  { fold: "wednesday", en: "Wednesday", es: "miércoles" },
  { fold: "thursday", en: "Thursday", es: "jueves" },
  { fold: "friday", en: "Friday", es: "viernes" },
  { fold: "saturday", en: "Saturday", es: "sábado" },
  { fold: "sunday", en: "Sunday", es: "domingo" },
];

const FUTURE_CALL_PATTERN =
  /me pidio que (?:la|lo|les) llam|pidio que (?:la|lo) llam|quedamos en llamar|asked me to call|give (?:you|her|him) a call|call (?:you|me|her|him) on/;
const FUTURE_DOCUMENTS_PATTERN =
  /please send the documents|send the documents (?:they|you) requested|me pidio (?:los|unos) documentos|enviar los documentos/;

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
  visible: string;
} {
  const language = input.language;
  const reading = readLatestCall(input.timelineNotes ?? []);
  const followUp = followUpParagraph(language, reading);
  const body = [
    greetingLine(language, input.contactName),
    "",
    POST_PRESENTATION_THANK_YOU[language],
    "",
    followUp,
    "",
    signatureBlock(language, input.senderName, input.senderEmail),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const subjects =
    language === "es"
      ? ["Gracias por su tiempo", "Después de nuestra llamada", "Seguimiento de nuestra conversación"]
      : ["Thank you for your time", "After our call", "Following our conversation"];

  return {
    subject: subjects[0],
    subjects,
    body,
    visible: `Subject: ${subjects[0]}\n\n${body}`,
  };
}

export function firstSentenceAfterGreeting(body: string): string {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const greetingIndex = lines.findIndex((line) => /^(hi|hello|hola)\b/i.test(line));
  const line = lines[greetingIndex + 1] ?? "";
  return line.split(/(?<=\.)\s/)[0] ?? line;
}

function followUpParagraph(
  language: PostPresentationLanguage,
  reading: CallReading,
): string {
  const sentences: string[] = [];
  if (reading.callDay) {
    sentences.push(
      language === "es"
        ? `Le llamaré el ${reading.callDay.es}.`
        : `I'll give you a call on ${reading.callDay.en}.`,
    );
  } else if (reading.futureCall) {
    sentences.push(
      language === "es"
        ? "Le llamaré, como quedamos."
        : "I'll give you a call as we discussed.",
    );
  }
  if (reading.sendDocuments) {
    sentences.push(
      language === "es"
        ? "Le enviaré los documentos que me pidió."
        : "I'll send the documents you asked for.",
    );
  }
  for (const url of reading.quoteUrls) {
    sentences.push(
      language === "es"
        ? `Gracias por compartir el enlace de cotización: ${url}`
        : `Thank you for sharing the quoting link: ${url}`,
    );
  }
  if (sentences.length === 0) {
    sentences.push(
      language === "es"
        ? "Fue un gusto conversar, y quedo atento cuando tenga un embarque en el que podamos trabajar juntos."
        : "It was good to connect, and I am here whenever you have a shipment we can work on together.",
    );
  }
  return sentences.join(" ");
}

interface CallReading {
  quoteUrls: string[];
  futureCall: boolean;
  callDay: { en: string; es: string } | null;
  sendDocuments: boolean;
}

function readLatestCall(notes: string[]): CallReading {
  const latest = notes.map(cleanTimelineNote).find(Boolean) ?? "";
  const folded = fold(latest);
  const futureCall = FUTURE_CALL_PATTERN.test(folded);
  return {
    quoteUrls: quoteUrls(latest),
    futureCall,
    callDay: futureCall ? weekday(folded) : null,
    sendDocuments: FUTURE_DOCUMENTS_PATTERN.test(folded),
  };
}

function quoteUrls(note: string): string[] {
  if (!/quote|cotiz|portal|enlace|link|quoting|compart/i.test(note)) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of note.match(URL_PATTERN) ?? []) {
    const url = raw.replace(/[.,;]+$/, "");
    if (seen.has(url) || /supabase\.co|crm\.logisticsmasters\.us/i.test(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function weekday(folded: string): { en: string; es: string } | null {
  let found: { en: string; es: string; index: number } | null = null;
  for (const day of WEEKDAYS) {
    const index = folded.indexOf(day.fold);
    if (index === -1) continue;
    if (!found || index < found.index) found = { en: day.en, es: day.es, index };
  }
  return found ? { en: found.en, es: found.es } : null;
}

function greetingLine(language: PostPresentationLanguage, contactName?: string | null): string {
  const firstName = contactName?.trim().split(/\s+/)[0] ?? "";
  if (language === "es") return firstName ? `Hola ${firstName},` : "Hola,";
  return firstName ? `Hi ${firstName},` : "Hello,";
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

function cleanTimelineNote(note: string): string {
  return note
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\bBroker:\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fold(note: string): string {
  return note
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
