import { outreachVoice, type OutreachVoice } from "./outreachTone.ts";

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
const VOICEMAIL_PATTERN =
  /voicemail|voice mail|buzon de voz|buzon|mensaje de voz|left a message|deje un mensaje|deje mensaje|dejo un mensaje/;
const UNANSWERED_PATTERN =
  /no contest|sin respuesta|no answer|did not answer|didn't answer|no me atend|no pudo atender|not able to reach|could not reach|couldn't reach|no logre hablar|unable to reach|no response/;
const ANSWERED_PATTERN =
  /hable con|hablamos|spoke with|talked with|we spoke|we talked|atendi|atendio|took my call|on the phone|tuvimos una llamada/;
const NOT_INTERESTED_PATTERN =
  /no estan interesados|no esta interesado|not interested|no interesados|not a fit|no quieren por ahora/;

export interface RecordedFreight {
  lane: string;
  equipment: string | null;
  commodity: string | null;
}

export interface PostPresentationTimelineNote {
  status?: string | null;
  title?: string | null;
  notes?: string | null;
}

export interface PostPresentationEmailInput {
  language: PostPresentationLanguage;
  contactName?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  timelineNotes?: Array<string | PostPresentationTimelineNote>;
  tone?: string | null;
  recordedFreight?: RecordedFreight | null;
}

type DevelopedVoice = Exclude<OutreachVoice, "conversational" | "natural">;
type CallKind = "answered" | "voicemail" | "unanswered";

export function resolvePostPresentationLanguage(
  value: string | null | undefined,
): PostPresentationLanguage {
  return value === "es" ? "es" : "en";
}

export function selectRecordedFreight(
  opportunities: Array<{
    lane?: string | null;
    equipmentType?: string | null;
    commodity?: string | null;
    updatedAt?: string | null;
  }>,
): RecordedFreight | null {
  const usable = opportunities.filter((item) => {
    const lane = item.lane?.trim() ?? "";
    return Boolean(lane) && !/^—\s*→\s*—$/.test(lane) && lane !== "→";
  });
  if (!usable.length) return null;
  const ranked = [...usable].sort((left, right) => {
    const rightTime = Date.parse(right.updatedAt ?? "") || 0;
    const leftTime = Date.parse(left.updatedAt ?? "") || 0;
    return rightTime - leftTime;
  });
  const picked = ranked[0];
  return {
    lane: picked.lane!.trim(),
    equipment: picked.equipmentType?.trim() || null,
    commodity: picked.commodity?.trim() || null,
  };
}

export function composePostPresentationEmail(input: PostPresentationEmailInput): {
  subject: string;
  subjects: string[];
  body: string;
  visible: string;
} {
  const language = input.language;
  const reading = readLatestCall(input.timelineNotes ?? []);
  const voice = outreachVoice(input.tone);
  const recordedLane = freightLabel(input.recordedFreight);
  const paragraphs =
    voice === "conversational"
      ? [openingSentence(language, reading.kind), conversationalCloser(language, reading)]
      : voice === "natural"
        ? [naturalMessage(language, reading, recordedLane)]
        : [
            openingSentence(language, reading.kind),
            ...developedParagraphs(language, voice, reading, recordedLane),
          ];
  const body = [
    greetingLine(language, input.contactName),
    "",
    paragraphs.join("\n\n"),
    "",
    signatureBlock(language, input.senderName, input.senderEmail),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const subjects = subjectLines(language, voice, reading.kind);

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

function subjectLines(
  language: PostPresentationLanguage,
  voice: OutreachVoice,
  kind: CallKind,
): string[] {
  if (voice !== "natural") {
    return language === "es"
      ? ["Gracias por su tiempo", "Después de nuestra llamada", "Seguimiento de nuestra conversación"]
      : ["Thank you for your time", "After our call", "Following our conversation"];
  }
  if (kind === "voicemail" || kind === "unanswered") {
    return language === "es"
      ? ["Le dejé un mensaje", "Sobre mi llamada", "Cuando pueda"]
      : ["I left you a message", "About my call", "When you have a minute"];
  }
  return language === "es"
    ? ["Gracias por la llamada", "Después de hablar", "Una nota breve"]
    : ["Thanks for the call", "After we talked", "A short note"];
}

function naturalMessage(
  language: PostPresentationLanguage,
  reading: CallReading,
  recordedLane: string | null,
): string {
  const spanish = language === "es";
  const sentences: string[] = [];
  if (reading.kind === "voicemail") {
    sentences.push(spanish ? "Le dejé un mensaje en el buzón." : "I left you a voicemail.");
  } else if (reading.kind === "unanswered") {
    sentences.push(
      spanish ? "Lo llamé hoy y no pude hablar con usted." : "I called today and didn't reach you.",
    );
  } else {
    sentences.push(spanish ? "Gracias por la llamada." : "Thanks for the call.");
  }

  if (reading.callDay || reading.futureCall) {
    sentences.push(
      reading.callDay
        ? spanish
          ? `Lo llamo el ${reading.callDay.es}, como quedamos.`
          : `I'll call you on ${reading.callDay.en}, as we said.`
        : spanish
          ? "Lo llamo, como quedamos."
          : "I'll call you, as we said.",
    );
  } else if (reading.sendDocuments) {
    sentences.push(
      spanish ? "Le envío los documentos que me pidió." : "I'll send the documents you asked for.",
    );
  } else if (reading.quoteUrls[0]) {
    sentences.push(
      spanish
        ? `Gracias por el enlace de cotización: ${reading.quoteUrls[0]}`
        : `Thanks for the quoting link: ${reading.quoteUrls[0]}`,
    );
  } else if (reading.notInterested) {
    sentences.push(
      spanish
        ? "Cuando tenga un embarque, escríbame y lo vemos."
        : "When you have a shipment, write me and we'll look at it.",
    );
  } else if (recordedLane && reading.kind === "answered") {
    sentences.push(
      spanish
        ? `Si quiere, le cotizo esta ruta: ${recordedLane}.`
        : `If you want, I can price this lane: ${recordedLane}.`,
    );
  } else if (reading.kind === "answered") {
    sentences.push(
      spanish
        ? "Si quiere que le cotice un embarque, respóndame con el origen, el destino y el día."
        : "If you want me to price a shipment, reply with the origin, destination, and the day.",
    );
  } else {
    sentences.push(
      spanish ? "Cuando pueda, respóndame y lo retomamos." : "Reply when you can and I'll pick it up.",
    );
  }

  if (reading.quoteUrls[0] && reading.sendDocuments && sentences.length < 3) {
    sentences.push(
      spanish
        ? `También uso el enlace que compartió: ${reading.quoteUrls[0]}`
        : `I'll also use the link you shared: ${reading.quoteUrls[0]}`,
    );
  }

  return sentences.slice(0, 3).join(" ");
}

function conversationalCloser(language: PostPresentationLanguage, reading: CallReading): string {
  const facts = factSentences(language, reading);
  if (facts.length > 0) return facts.join(" ");
  if (reading.kind === "voicemail") {
    return language === "es"
      ? "Cuando pueda, responda este correo y con gusto lo retomamos."
      : "Reply when you can, and I will be glad to pick it up from there.";
  }
  if (reading.kind === "unanswered") {
    return language === "es"
      ? "Cuando pueda, responda este correo y con gusto hablamos."
      : "Reply when you can, and I will be glad to talk then.";
  }
  return language === "es"
    ? "Fue un gusto conversar, y quedo atento cuando tenga un embarque en el que podamos trabajar juntos."
    : "It was good to connect, and I am here whenever you have a shipment we can work on together.";
}

function developedParagraphs(
  language: PostPresentationLanguage,
  voice: DevelopedVoice,
  reading: CallReading,
  recordedLane: string | null,
): string[] {
  const facts = factSentences(language, reading).join(" ");
  const offer = offerLine(language, voice, reading, recordedLane);
  const invitation = invitationLine(language, voice, reading, recordedLane);
  const development = [facts, offer].filter(Boolean).join(" ");
  return invitation ? [development, invitation] : [development];
}

function offerLine(
  language: PostPresentationLanguage,
  voice: DevelopedVoice,
  reading: CallReading,
  recordedLane: string | null,
): string {
  const spanish = language === "es";
  const missed = reading.kind !== "answered";
  const agreed = Boolean(reading.callDay || reading.futureCall);
  const details = spanish
    ? "el origen, el destino, el tipo de equipo y el día en que necesita moverse"
    : "the origin, destination, equipment, and the day the freight needs to move";

  if (agreed) {
    if (voice === "direct") {
      return spanish
        ? `Si quiere una cotización lista para esa llamada, responda con ${details}. Si esa hora cambia, responda con otra.`
        : `If you want a quote ready for that call, reply with ${details}. If that time changes, reply with another one.`;
    }
    if (recordedLane && (voice === "professional" || voice === "warm")) {
      return spanish
        ? `Puedo usar esa llamada para revisar una cotización nueva de esta ruta registrada: ${recordedLane}. Si prefiere cotizar otro embarque, envíeme ${details}.`
        : `I can use that call to review a new quote for this recorded lane: ${recordedLane}. If you would rather price a different shipment, send ${details}.`;
    }
    if (voice === "friendly") {
      return spanish
        ? `Puedo llevar una cotización a esa conversación si me envía ${details}.`
        : `I can bring a quote to that conversation if you send ${details}.`;
    }
    if (voice === "warm") {
      return spanish
        ? `Puedo usar ese momento para revisar una cotización con usted. Me bastan ${details}.`
        : `I can use that time to walk through a quote with you. ${capitalize(details)} are enough for me to come prepared.`;
    }
    if (voice === "persistent") {
      return spanish
        ? `Mantengo ese acuerdo. Si quiere la cotización antes, me bastan ${details}. No hace falta decidir nada más ahora.`
        : `I will keep that commitment. If you want a quote ready beforehand, ${details} are enough. Nothing else needs to be decided now.`;
    }
    return spanish
      ? `Puedo usar esa llamada para cotizar un embarque si quiere tener una cotización a la vista. Me bastan ${details}.`
      : `I can use that call to price a shipment if you want a quote in front of you. ${capitalize(details)} are enough for me to come prepared.`;
  }

  if (reading.quoteUrls.length > 0) {
    if (voice === "direct") {
      return spanish
        ? `Si quiere cotizar un embarque con ese enlace, responda con ${details}.`
        : `If you want a shipment priced through that link, reply with ${details}.`;
    }
    if (voice === "warm") {
      return spanish
        ? `Puedo usar ese enlace cuando arme la cotización, y con ${details} la dejo lista para que la revise con calma.`
        : `I can use that link when I build the quote, and ${details} are enough for me to leave it with you to review.`;
    }
    return spanish
      ? `Usaré ese enlace cuando prepare la cotización. Si quiere cotizar un embarque por ahí, envíeme ${details}.`
      : `I will use that link when I prepare pricing. If you want a shipment priced through it, send ${details}.`;
  }

  if (reading.sendDocuments) {
    if (voice === "direct") {
      return spanish
        ? `También puedo preparar una cotización con ${details}. Responda con esos datos si la quiere.`
        : `I can also prepare a quote from ${details}. Reply with those details if you want it.`;
    }
    return spanish
      ? `También puedo preparar una cotización con ${details}.`
      : `I can also prepare a quote from ${details}.`;
  }

  if (recordedLane) {
    if (voice === "direct") {
      return spanish
        ? `Puedo preparar una cotización nueva para esta ruta registrada: ${recordedLane}. Responda si quiere esa, o envíe otro origen, destino, tipo de equipo y día.`
        : `I can prepare a new quote for this recorded lane: ${recordedLane}. Reply if you want that one, or send a different origin, destination, equipment, and day.`;
    }
    if (voice === "friendly") {
      return spanish
        ? `Si le sirve, puedo cotizar esta ruta registrada: ${recordedLane}. Si prefiere otro embarque, envíeme ${details}.`
        : `If it is useful, I can price this recorded lane: ${recordedLane}. If you would rather look at a different shipment, send ${details}.`;
    }
    if (voice === "warm") {
      return spanish
        ? `Quiero dejarle algo concreto de la conversación: una cotización nueva para esta ruta registrada, ${recordedLane}. Si prefiere otro embarque, con ${details} la preparo igual.`
        : `I want to leave you with something concrete from the conversation: a new quote for this recorded lane, ${recordedLane}. If you would rather price a different shipment, ${details} are enough.`;
    }
    const lead = missed
      ? spanish
        ? "Puedo preparar"
        : "I can prepare"
      : spanish
        ? "Después de nuestra llamada, puedo preparar"
        : "After our call, I can prepare";
    return spanish
      ? `${lead} una cotización nueva para esta ruta registrada: ${recordedLane}. Si prefiere cotizar otro embarque, envíeme ${details}.`
      : `${lead} a new quote for this recorded lane: ${recordedLane}. If you would rather price a different shipment, send ${details}.`;
  }

  if (voice === "direct") {
    return spanish
      ? `Puedo prepararle una cotización con ${details}. Responda con esos datos y se la envío para su revisión.`
      : `I can prepare a quote from ${details}. Reply with those details and I will send it for your review.`;
  }
  if (voice === "friendly") {
    return missed
      ? spanish
        ? `Cuando le quede bien, puedo cotizar un embarque con ${details}.`
        : `When you have a moment, I can price one shipment from ${details}.`
      : spanish
        ? `Fue un gusto conversar. Si le sirve tener un número a la vista, puedo cotizar un embarque con ${details}.`
        : `It was good to connect. If you want a number to look at, I can price one shipment from ${details}.`;
  }
  if (voice === "warm") {
    return missed
      ? spanish
        ? `Quiero dejarle algo práctico para cuando hablemos. Puedo cotizar un embarque y enviarle la cotización para que la revise. Me bastan ${details}.`
        : `I wanted to leave you something practical for when we talk. I can price a shipment and send the quote for you to review. ${capitalize(details)} are enough.`
      : spanish
        ? `Me quedó muy bien la conversación y quiero dejarle algo práctico. Puedo cotizar un embarque y enviarle la cotización para que la revise cuando le quede cómodo. Me bastan ${details}.`
        : `I enjoyed the conversation and wanted to leave you with something practical. I can price a shipment and send the quote for you to review on your own time. ${capitalize(details)} are enough.`;
  }
  if (voice === "persistent") {
    return missed
      ? spanish
        ? `Le escribo para que la llamada sea fácil de retomar. Puedo preparar una cotización cuando me comparta ${details}. No hace falta decidir nada en este correo.`
        : `I am writing so the call is easy to pick up. I can prepare a quote when you share ${details}. Nothing needs to be decided in this email.`
      : spanish
        ? `Le escribo para que la conversación siga siendo fácil de retomar. Puedo preparar una cotización cuando me comparta ${details}. No hace falta decidir nada en este correo.`
        : `I am writing so our conversation stays easy to continue. I can prepare a quote when you share ${details}. Nothing needs to be decided in this email.`;
  }
  return missed
    ? spanish
      ? `Puedo prepararle una cotización para que la revise. Me bastan ${details}.`
      : `I can prepare a quote for you to review. ${capitalize(details)} are enough.`
    : spanish
      ? `Después de nuestra llamada, puedo prepararle una cotización para que la revise. Me bastan ${details}.`
      : `After our call, I can prepare a quote for you to review. ${capitalize(details)} are enough.`;
}

function invitationLine(
  language: PostPresentationLanguage,
  voice: DevelopedVoice,
  reading: CallReading,
  recordedLane: string | null,
): string | null {
  if (voice === "direct") return null;
  const spanish = language === "es";
  const missed = reading.kind !== "answered";
  const agreed = Boolean(reading.callDay || reading.futureCall);

  if (agreed) {
    if (voice === "warm") {
      return spanish
        ? "Si necesita mover esa llamada, indíqueme otro día y busco el espacio."
        : "If you need to move that call, name another day and I will make the time.";
    }
    if (voice === "friendly") {
      return spanish
        ? "Si ese día cambia, dígame otra hora que le funcione."
        : "If that day changes, tell me another time that works.";
    }
    if (voice === "persistent") {
      return spanish
        ? "Si esa hora ya no le funciona, responda con otra."
        : "If that time no longer works, reply with another one.";
    }
    return spanish
      ? "Si esa hora cambia, responda con otra."
      : "If that time changes, reply with another one.";
  }

  if (reading.sendDocuments && voice === "professional") {
    return spanish
      ? "Responda si también quiere la cotización, o si con los documentos es suficiente por ahora."
      : "Reply if you want the quote as well, or if the documents are all you need for now.";
  }

  if (reading.quoteUrls.length > 0 && voice === "professional") {
    return spanish
      ? "Con esos datos me alcanza para prepararla."
      : "A reply with those details is enough.";
  }

  if (recordedLane && voice === "professional") {
    return missed
      ? spanish
        ? "Responda qué embarque quiere cotizar, o con una hora para hablar."
        : "Reply with which shipment you want priced, or with a time to talk."
      : spanish
        ? "Responda qué embarque quiere cotizar, o con una hora para una llamada corta."
        : "Reply with which shipment you want priced, or with a time for a short call.";
  }

  if (voice === "friendly") {
    return missed
      ? spanish
        ? "Envíeme esos datos cuando pueda, o dígame una hora para hablar."
        : "Send those details when you can, or tell me a good time to talk."
      : spanish
        ? "Envíeme esos datos cuando los tenga, o dígame una hora para una llamada breve."
        : "Send those details when you have them, or tell me a good time for a quick call.";
  }
  if (voice === "warm") {
    return spanish
      ? "Responda con esos datos, o indíqueme un día si prefiere que lo veamos juntos."
      : "Reply with those details, or name a day if you would rather walk through one shipment together.";
  }
  if (voice === "persistent") {
    return missed
      ? spanish
        ? "Cuando pueda, responda con esos datos o con una hora para hablar."
        : "When you are ready, reply with those details or with a time to talk."
      : spanish
        ? "Cuando le quede bien, responda con esos datos o con una hora que le funcione."
        : "When you are ready, reply with those details or with a time that works for you.";
  }
  return missed
    ? spanish
      ? "Responda con esos datos, o con una hora para hablar, y sigo su indicación."
      : "Reply with those details, or with a time to talk, and I will follow your lead."
    : spanish
      ? "Responda con esos datos, o con una hora para una llamada corta, y la preparo."
      : "Reply with those details, or with a time for a short call, and I will put the quote together.";
}

function openingSentence(language: PostPresentationLanguage, kind: CallKind): string {
  if (kind === "voicemail") {
    return language === "es"
      ? "Llamé hoy y llegué a su buzón de voz."
      : "I called today and reached your voicemail.";
  }
  if (kind === "unanswered") {
    return language === "es"
      ? "Llamé hoy y no pude comunicarme con usted."
      : "I called today and was not able to reach you.";
  }
  return POST_PRESENTATION_THANK_YOU[language];
}

function factSentences(language: PostPresentationLanguage, reading: CallReading): string[] {
  const sentences: string[] = [];
  if (reading.callDay) {
    sentences.push(
      language === "es"
        ? `Le llamaré el ${reading.callDay.es}.`
        : `I'll give you a call on ${reading.callDay.en}.`,
    );
  } else if (reading.futureCall) {
    sentences.push(
      language === "es" ? "Le llamaré, como quedamos." : "I'll give you a call as we discussed.",
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
  return sentences;
}

interface CallReading {
  quoteUrls: string[];
  futureCall: boolean;
  callDay: { en: string; es: string } | null;
  sendDocuments: boolean;
  notInterested: boolean;
  kind: CallKind;
}

function readLatestCall(notes: Array<string | PostPresentationTimelineNote>): CallReading {
  const latest = notes
    .map((note) => ({
      text: cleanTimelineNote(timelineText(note)),
      status: timelineStatus(note),
    }))
    .find((note) => note.text);
  const text = latest?.text ?? "";
  const folded = fold(text);
  const futureCall = FUTURE_CALL_PATTERN.test(folded);
  return {
    quoteUrls: quoteUrls(text),
    futureCall,
    callDay: futureCall ? weekday(folded) : null,
    sendDocuments: FUTURE_DOCUMENTS_PATTERN.test(folded),
    notInterested: NOT_INTERESTED_PATTERN.test(folded),
    kind: callKind(folded, latest?.status ?? ""),
  };
}

function callKind(foldedNote: string, status: string): CallKind {
  const statusFold = fold(status).replace(/_/g, " ");
  if (VOICEMAIL_PATTERN.test(foldedNote) || VOICEMAIL_PATTERN.test(statusFold)) {
    return "voicemail";
  }
  const missed =
    UNANSWERED_PATTERN.test(foldedNote) ||
    UNANSWERED_PATTERN.test(statusFold) ||
    statusFold.includes("no response");
  if (missed && !ANSWERED_PATTERN.test(foldedNote)) return "unanswered";
  return "answered";
}

function timelineText(note: string | PostPresentationTimelineNote): string {
  if (typeof note === "string") return note;
  return [note.title, note.notes].filter((part) => part?.trim()).join(". ");
}

function timelineStatus(note: string | PostPresentationTimelineNote): string {
  if (typeof note === "string") return "";
  return note.status?.trim() ?? "";
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

function freightLabel(freight: RecordedFreight | null | undefined): string | null {
  const lane = freight?.lane.trim() ?? "";
  if (!lane) return null;
  return [lane, freight?.equipment?.trim(), freight?.commodity?.trim()].filter(Boolean).join(", ");
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
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
