export type GoalAddress = "tu" | "usted";

export type GoalMessage =
  | { type: "not_adding_carriers"; yearEnd: boolean }
  | {
      type: "follow_up";
      verb: "write" | "call" | "send" | "review";
      when: { es: string; en: string } | null;
      route: { origin: string; destination: string } | null;
      purpose: "review" | "quote" | "discuss" | null;
      requested: boolean;
      agreement: boolean;
    }
  | { type: "statement"; text: string; sourceLanguage: "es" | "en" }
  | { type: "note"; text: string; sourceLanguage: "es" | "en" };

export interface GoalReading {
  address: GoalAddress | null;
  messages: GoalMessage[];
}

const MONTHS: Array<{ fold: string; es: string; en: string }> = [
  { fold: "enero", es: "en enero", en: "in January" },
  { fold: "febrero", es: "en febrero", en: "in February" },
  { fold: "marzo", es: "en marzo", en: "in March" },
  { fold: "abril", es: "en abril", en: "in April" },
  { fold: "mayo", es: "en mayo", en: "in May" },
  { fold: "junio", es: "en junio", en: "in June" },
  { fold: "julio", es: "en julio", en: "in July" },
  { fold: "agosto", es: "en agosto", en: "in August" },
  { fold: "septiembre", es: "en septiembre", en: "in September" },
  { fold: "octubre", es: "en octubre", en: "in October" },
  { fold: "noviembre", es: "en noviembre", en: "in November" },
  { fold: "diciembre", es: "en diciembre", en: "in December" },
  { fold: "january", es: "en enero", en: "in January" },
  { fold: "february", es: "en febrero", en: "in February" },
  { fold: "march", es: "en marzo", en: "in March" },
  { fold: "april", es: "en abril", en: "in April" },
  { fold: "may", es: "en mayo", en: "in May" },
  { fold: "june", es: "en junio", en: "in June" },
  { fold: "july", es: "en julio", en: "in July" },
  { fold: "august", es: "en agosto", en: "in August" },
  { fold: "september", es: "en septiembre", en: "in September" },
  { fold: "october", es: "en octubre", en: "in October" },
  { fold: "november", es: "en noviembre", en: "in November" },
  { fold: "december", es: "en diciembre", en: "in December" },
];

const TU_PHRASES: Array<[string, string]> = [
  ["le agradezco que haya tomado mi llamada", "te agradezco que hayas tomado mi llamada"],
  ["muchas gracias por atender mi llamada hoy", "te agradezco que hayas tomado mi llamada"],
  ["llamé hoy y llegué a su buzón de voz", "llamé hoy y llegué a tu buzón de voz"],
  ["llamé hoy y no pude comunicarme con usted", "llamé hoy y no pude comunicarme contigo"],
  ["lo llamé hoy y no pude hablar con usted", "te llamé hoy y no pude hablar contigo"],
  ["le dejé un mensaje en el buzón", "te dejé un mensaje en el buzón"],
  ["le enviaré los documentos que me pidió", "te enviaré los documentos que me pediste"],
  ["le envío los documentos que me pidió", "te envío los documentos que me pediste"],
  ["los documentos que me pidió", "los documentos que me pediste"],
  ["como me lo pidió", "como me lo pediste"],
  ["lo llamo, como quedamos", "te llamo, como quedamos"],
  ["le llamaré, como quedamos", "te llamaré, como quedamos"],
  ["lo llamo el", "te llamo el"],
  ["le llamaré el", "te llamaré el"],
  ["le dejé un mensaje", "te dejé un mensaje"],
  ["gracias por su tiempo", "gracias por tu tiempo"],
  ["cuando le quede cómodo", "cuando te quede cómodo"],
  ["cuando le quede bien", "cuando te quede bien"],
  ["se la envío para su revisión", "te la envío para tu revisión"],
  ["para su revisión", "para tu revisión"],
  ["sigo su indicación", "sigo tu indicación"],
  ["puedo prepararle", "puedo prepararte"],
  ["enviarle la cotización", "enviarte la cotización"],
  ["para que la revise", "para que la revises"],
  ["quiero dejarle", "quiero dejarte"],
  ["si le sirve", "si te sirve"],
  ["con usted", "contigo"],
  ["que le funcione", "que te funcione"],
  ["ya no le funciona", "ya no te funciona"],
  ["que le cotice", "que te cotice"],
  ["si necesita", "si necesitas"],
  ["si prefiere", "si prefieres"],
  ["si quiere", "si quieres"],
  ["si la quiere", "si la quieres"],
  ["cuando quiera", "cuando quieras"],
  ["cuando pueda", "cuando puedas"],
  ["cuando los tenga", "cuando los tengas"],
  ["respóndame", "respóndeme"],
  ["envíeme", "envíame"],
  ["indíqueme", "indícame"],
  ["dígame", "dime"],
  ["responda", "responde"],
  ["preguntarle", "preguntarte"],
  ["comentarle", "comentarte"],
  ["mencionarle", "mencionarte"],
  ["confirmarle", "confirmarte"],
  ["decirle", "decirte"],
  ["escribirle", "escribirte"],
  ["le escribo", "te escribo"],
  ["le llamaré", "te llamaré"],
  ["le llamo", "te llamo"],
  ["le envío", "te envío"],
  ["le enviaré", "te enviaré"],
  ["le reviso", "te reviso"],
  ["le cotizo", "te cotizo"],
  ["por su tiempo", "por tu tiempo"],
  ["su buzón", "tu buzón"],
  ["su tiempo", "tu tiempo"],
  ["su indicación", "tu indicación"],
];

const INSTRUCTION =
  /\b(?:por favor[, ]*)?(?:incluye(?:lo)? esto(?: en el (?:correo|email|mensaje))?|incluya esto(?: en el (?:correo|email|mensaje))?|menciona(?:lo)? esto(?: en el correo)?|include this(?: in the (?:email|message))?|(?:habla|hable|hablale) de tu|(?:habla|hable|hablale) de usted|tutea(?:rla|rlo|rle|la|lo|le|me|nos)?|trat(?:ala|alo|ale|ela|elo|ele|a|e) de tu|trat(?:ala|alo|ale|ela|elo|ele|a|e) de usted|(?:usa el|en el|con el|en|con) tuteo|tuteo)\b[.,;]?/gi;

const TU_INSTRUCTION =
  /\b(?:habla|hable|hablale) de tu\b|\btutea(?:rla|rlo|rle|la|lo|le|me|nos)?\b|\btrat(?:ala|alo|ale|ela|elo|ele|a|e) de tu\b|\b(?:usa el|en el|con el|en|con) tuteo\b|\btuteo\b/g;

const USTED_INSTRUCTION =
  /\b(?:habla|hable|hablale) de usted\b|\btrat(?:ala|alo|ale|ela|elo|ele|a|e) de usted\b/g;

const NOT_ADDING =
  /no\s+(?:estan|esta|vamos|van)\s+(?:a\s+)?(?:agregando|agregar|sumando|sumar|anadiendo|anadir|incorporando|incorporar|aceptando|aceptar|tomando|tomar)\s+(?:a\s+)?(?:nuevos?\s+|new\s+)?(?:carriers?|transportistas?|proveedores?|vendors?|brokers?)|(?:are not|aren'?t|is not|isn'?t|not)\s+(?:adding|onboarding|taking on|bringing on)\s+(?:any\s+|new\s+)?(?:carriers?|vendors?|brokers?|transportistas?)/;

const YEAR_END =
  /final de ano|fin de ano|cierre de ano|cierre del ano|year[\s-]*end|end of (?:the )?year/;

const ROUTE =
  /(?:ruta|route|lane|trayecto)\s+(?:de\s+|from\s+)?([\p{L}][\p{L}\s.'-]*?)\s+(?:a|to|hacia)\s+([\p{L}][\p{L}\s.'-]*?)(?=\s+(?:por|para|en|con|el|la|los|las|y|o|como)\b|[,.]|$)/iu;

export function readPostPresentationGoal(goal: string | null | undefined): GoalReading | null {
  const original = goal?.trim() ?? "";
  if (!original) return null;

  const folded = fold(original);
  const address = latestAddress(folded);
  const cleaned = stripInstructions(original).replace(/^[,;.\s]+|[,;.\s]+$/g, "").trim();
  if (!cleaned) {
    return address ? { address, messages: [] } : null;
  }

  const messages = interpretContent(cleaned);
  if (!address && messages.length === 0) return null;
  return { address, messages };
}

export function renderGoalSentence(message: GoalMessage, language: "en" | "es"): string {
  if (message.type === "not_adding_carriers") {
    if (language === "es") {
      return message.yearEnd
        ? "Entiendo que, por el cierre de año, la empresa no está incorporando nuevos transportistas."
        : "Entiendo que la empresa no está incorporando nuevos transportistas.";
    }
    return message.yearEnd
      ? "I understand that, because of the year-end close, the company is not adding new carriers."
      : "I understand that the company is not adding new carriers.";
  }

  if (message.type === "follow_up") return renderFollowUp(message, language);

  const fact =
    message.sourceLanguage === language
      ? cleanupFact(message.text)
      : translateFact(message.text, language);
  if (message.type === "note") return renderNote(fact, message.text, language);
  return language === "es" ? `Entiendo que ${lowerFirst(fact)}` : `I understand that ${lowerFirst(fact)}`;
}

export function renderGoalClose(messages: GoalMessage[], language: "en" | "es"): string {
  const followUp = messages.find((message) => message.type === "follow_up");
  if (followUp?.type === "follow_up") {
    if (followUp.when) {
      return language === "es"
        ? "Si necesita algo antes, con gusto lo vemos."
        : "If you need anything before then, I am glad to help.";
    }
    return language === "es"
      ? "Si necesita algo más, con gusto lo vemos."
      : "If you need anything else, I am glad to help.";
  }
  return language === "es"
    ? "Cuando quiera retomar la conversación, aquí estaré."
    : "Whenever you want to pick the conversation back up, I will be here.";
}

export function applySpanishTu(text: string): string {
  const pairs = [...TU_PHRASES].sort((left, right) => right[0].length - left[0].length);
  let next = text;
  for (const [from, to] of pairs) {
    next = replacePhrase(next, from, to);
  }
  next = next
    .replace(/(?<![\p{L}])usted(?![\p{L}])/giu, (match) => matchCase(match, "tú"))
    .replace(/(?<![\p{L}])sus(?![\p{L}])/giu, (match) => matchCase(match, "tus"))
    .replace(/(?<![\p{L}])su(?![\p{L}])/giu, (match) => matchCase(match, "tu"))
    .replace(/(?<![\p{L}])les(?![\p{L}])/giu, (match) => matchCase(match, "te"))
    .replace(/(?<![\p{L}])le(?![\p{L}])/giu, (match) => matchCase(match, "te"));
  return next;
}

export function explicitUstedOpening(text: string): string {
  return text.replaceAll(
    "Muchas gracias por atender mi llamada hoy.",
    "Le agradezco que haya tomado mi llamada.",
  );
}

function interpretContent(cleaned: string): GoalMessage[] {
  const { folded, toOriginal } = foldWithMap(cleaned);
  const kind = speechKind(folded);
  const rest = speechRest(cleaned, folded, toOriginal, kind) ?? cleaned;
  const restFolded = fold(rest);
  const messages: GoalMessage[] = [];
  const notAdding = NOT_ADDING.test(restFolded);
  const followUp = readFollowUp(rest, restFolded, kind);

  if (notAdding && kind !== "request" && kind !== "agreement") {
    messages.push({ type: "not_adding_carriers", yearEnd: YEAR_END.test(restFolded) });
  }
  if (followUp && !(notAdding && kind !== "request" && kind !== "agreement" && !followUp.requested && !followUp.agreement)) {
    messages.push(followUp);
  }
  if (messages.length > 0) return messages;

  const sourceLanguage = textLanguage(rest);
  if (kind === "note" && startsWithInfinitive(restFolded)) {
    return [{ type: "note", text: rest, sourceLanguage }];
  }
  return [{ type: "statement", text: rest, sourceLanguage }];
}

function readFollowUp(
  rest: string,
  folded: string,
  kind: "statement" | "request" | "agreement" | "note",
): Extract<GoalMessage, { type: "follow_up" }> | null {
  const verb = firstVerb(folded);
  const when = readWhen(folded);
  const route = readRoute(rest);
  const purpose = readPurpose(folded);
  const requested = kind === "request";
  const agreement = kind === "agreement";
  const actionable = requested || agreement || Boolean(verb && (when || route || purpose));
  if (!actionable || !verb && !when && !route) return null;
  return {
    type: "follow_up",
    verb: verb ?? (purpose === "quote" ? "write" : "review"),
    when,
    route,
    purpose,
    requested,
    agreement,
  };
}

function renderFollowUp(message: Extract<GoalMessage, { type: "follow_up" }>, language: "en" | "es"): string {
  const route = message.route;
  const time = message.when ? ` ${language === "es" ? message.when.es : message.when.en}` : "";
  const tag = message.agreement
    ? language === "es"
      ? ", como quedamos"
      : ", as we agreed"
    : message.requested
      ? language === "es"
        ? ", como me lo pidió"
        : ", as you asked"
      : "";

  if (language === "es") {
    const yo = { write: "escribo", call: "llamo", send: "envío", review: "reviso" }[message.verb];
    if (message.verb === "review" && route) {
      return `Le reviso${time} la ruta de ${route.origin} a ${route.destination}${tag}.`;
    }
    const about = route ? ` ${purposeLead("es", message.purpose)} la ruta de ${route.origin} a ${route.destination}` : "";
    return `Le ${yo}${time}${about}${tag}.`;
  }

  if (message.verb === "review" && route) {
    return `I will review the ${route.origin} to ${route.destination} route${time}${tag}.`;
  }
  const verb = { write: "write", call: "call", send: "send", review: "review" }[message.verb];
  const about = route
    ? ` ${purposeLead("en", message.purpose)} the ${route.origin} to ${route.destination} route`
    : "";
  return `I will ${verb}${time}${about}${tag}.`;
}

function purposeLead(language: "en" | "es", purpose: "review" | "quote" | "discuss" | null): string {
  if (language === "es") {
    if (purpose === "quote") return "para cotizar";
    if (purpose === "discuss") return "para hablar de";
    return "para revisar";
  }
  if (purpose === "quote") return "to quote";
  if (purpose === "discuss") return "to discuss";
  return "to review";
}

function renderNote(fact: string, source: string, language: "en" | "es"): string {
  const infinitive = leadingInfinitive(source);
  if (!infinitive) {
    return language === "es" ? `Entiendo que ${lowerFirst(fact)}` : `I understand that ${lowerFirst(fact)}`;
  }
  if (language === "es") {
    const verb = spanishInfinitivePronoun(infinitive.verb);
    const rest = infinitive.rest ? ` ${infinitive.rest}` : "";
    return ensurePeriod(`Quisiera ${verb}${rest}`);
  }
  const englishVerb = englishInfinitive(infinitive.verb, infinitive.rest);
  return ensurePeriod(`I would like to ${englishVerb}`);
}

function latestAddress(folded: string): GoalAddress | null {
  let winner: { address: GoalAddress; index: number } | null = null;
  for (const match of folded.matchAll(TU_INSTRUCTION)) {
    const index = match.index ?? 0;
    if (!winner || index >= winner.index) winner = { address: "tu", index };
  }
  for (const match of folded.matchAll(USTED_INSTRUCTION)) {
    const index = match.index ?? 0;
    if (!winner || index >= winner.index) winner = { address: "usted", index };
  }
  return winner?.address ?? null;
}

function stripInstructions(text: string): string {
  const { folded, toOriginal } = foldWithMap(text);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const match of folded.matchAll(INSTRUCTION)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
  if (!ranges.length) return text;
  ranges.sort((left, right) => left.start - right.start);
  let cursor = 0;
  let kept = "";
  for (const range of ranges) {
    if (range.start < cursor) continue;
    kept += originalSlice(text, toOriginal, cursor, range.start);
    cursor = range.end;
  }
  kept += originalSlice(text, toOriginal, cursor, folded.length);
  return kept.replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
}

function speechKind(folded: string): "statement" | "request" | "agreement" | "note" {
  if (/^(?:quedamos(?:\s+en)?|acordamos|we agreed(?:\s+to)?)\b/.test(folded)) return "agreement";
  if (/^(?:me\s+)?(?:pidio|pide|pido|solicito|solicita|pidieron)\s+que\b/.test(folded)) return "request";
  if (/^(?:they|she|he|the contact|the customer)\s+asked me to\b/.test(folded)) return "request";
  if (/^(?:me\s+)?(?:dice|dijo|comenta|comento|indica|indico|cuenta|conto|explica|explico)\s+que\b/.test(folded)) {
    return "statement";
  }
  if (/^(?:they|she|he|the contact|the customer)\s+(?:said|told me|mentioned)\s+(?:that\s+)?/.test(folded)) {
    return "statement";
  }
  if (/^(?:dile|digale|comentale|cuentale|explicale|mencionale)\s+que\b/.test(folded)) return "statement";
  return "note";
}

function speechRest(
  text: string,
  folded: string,
  toOriginal: number[],
  kind: "statement" | "request" | "agreement" | "note",
): string | null {
  const pattern =
    kind === "agreement"
      ? /^(?:quedamos(?:\s+en(?:\s+que)?)?|acordamos(?:\s+que)?|we agreed(?:\s+to)?)\s+(.+)$/
      : kind === "request"
        ? /^(?:(?:me\s+)?(?:pidio|pide|pido|solicito|solicita|pidieron)\s+que|(?:they|she|he|the contact|the customer)\s+asked me to)\s+(.+)$/
        : kind === "statement"
          ? /^(?:(?:me\s+)?(?:dice|dijo|comenta|comento|indica|indico|cuenta|conto|explica|explico)\s+que|(?:they|she|he|the contact|the customer)\s+(?:said|told me|mentioned)\s+(?:that\s+)?|(?:dile|digale|comentale|cuentale|explicale|mencionale)\s+que)\s*(.+)$/
          : null;
  if (!pattern) return null;
  const match = pattern.exec(folded);
  if (!match?.[1]) return null;
  const restStart = match[0].length - match[1].length;
  return originalSlice(text, toOriginal, restStart, folded.length).trim();
}

function firstVerb(folded: string): "write" | "call" | "send" | "review" | null {
  const found = [
    { verb: "write" as const, index: folded.search(/\b(?:escrib\w*|write|email)\b/) },
    { verb: "call" as const, index: folded.search(/\b(?:llam\w*|call)\b/) },
    { verb: "send" as const, index: folded.search(/\b(?:envi\w*|mand\w*|send)\b/) },
    { verb: "review" as const, index: folded.search(/\b(?:revis\w*|review)\b/) },
  ]
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  return found[0]?.verb ?? null;
}

function readWhen(folded: string): { es: string; en: string } | null {
  if (/\b(?:la proxima semana|next week)\b/.test(folded)) {
    return { es: "la próxima semana", en: "next week" };
  }
  if (/\b(?:manana|tomorrow)\b/.test(folded)) return { es: "mañana", en: "tomorrow" };
  let found: { es: string; en: string; index: number } | null = null;
  for (const month of MONTHS) {
    const index = folded.indexOf(month.fold);
    if (index < 0) continue;
    const before = index === 0 || !/\p{L}/u.test(folded[index - 1] ?? "");
    const after = index + month.fold.length >= folded.length || !/\p{L}/u.test(folded[index + month.fold.length] ?? "");
    if (!before || !after) continue;
    if (!found || index < found.index) found = { es: month.es, en: month.en, index };
  }
  return found ? { es: found.es, en: found.en } : null;
}

function readRoute(text: string): { origin: string; destination: string } | null {
  const match = ROUTE.exec(text);
  if (!match?.[1] || !match[2]) return null;
  const origin = cleanPlace(match[1]);
  const destination = cleanPlace(match[2]);
  if (!origin || !destination) return null;
  return { origin, destination };
}

function readPurpose(folded: string): "review" | "quote" | "discuss" | null {
  if (/\b(?:para cotizar|to quote|para una cotizacion)\b/.test(folded)) return "quote";
  if (/\b(?:para hablar|para conversar|to discuss|to talk)\b/.test(folded)) return "discuss";
  if (/\b(?:para revisar|to review|para ver)\b/.test(folded)) return "review";
  return null;
}

function startsWithInfinitive(folded: string): boolean {
  return /^(?:preguntar|comentar|confirmar|mencionar|revisar|cotizar|enviar|llamar|escribir|hablar|decir)\b/.test(
    folded,
  );
}

function leadingInfinitive(text: string): { verb: string; rest: string } | null {
  const match =
    /^(preguntar|comentar|confirmar|mencionar|revisar|cotizar|enviar|llamar|escribir|hablar|decir)\b\s*(.*)$/i.exec(
      text.trim(),
    );
  if (!match?.[1]) return null;
  return { verb: fold(match[1]), rest: match[2].trim() };
}

function spanishInfinitivePronoun(verb: string): string {
  switch (verb) {
    case "preguntar":
      return "preguntarle";
    case "comentar":
      return "comentarle";
    case "confirmar":
      return "confirmarle";
    case "mencionar":
      return "mencionarle";
    case "enviar":
      return "enviarle";
    case "llamar":
      return "llamarle";
    case "escribir":
      return "escribirle";
    case "hablar":
      return "hablarle";
    case "decir":
      return "decirle";
    default:
      return verb;
  }
}

function englishInfinitive(verb: string, rest: string): string {
  const translated = translateFact(rest, "en");
  switch (verb) {
    case "preguntar":
      return `ask about ${translated.replace(/^(?:about|for|por)\s+/i, "")}`;
    case "comentar":
    case "mencionar":
    case "decir":
      return `mention ${translated}`;
    case "confirmar":
      return `confirm ${translated}`;
    case "revisar":
      return `review ${translated}`;
    case "cotizar":
      return `quote ${translated}`;
    case "enviar":
      return `send ${translated}`;
    case "llamar":
      return `call ${translated}`;
    case "escribir":
      return `write ${translated}`;
    case "hablar":
      return `talk ${translated}`;
    default:
      return translated;
  }
}

function translateFact(text: string, language: "en" | "es"): string {
  if (language === "es") return cleanupFact(text);
  let next = ` ${cleanupFact(text)} `;
  const phrases: Array<[RegExp, string]> = [
    [/por la temporada de ([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/gi, "the $1 season"],
    [/la temporada de ([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/gi, "the $1 season"],
    [/el equipo que usan es/gi, "the equipment they use is"],
    [/el equipo que usa es/gi, "the equipment you use is"],
    [/por el cierre de año/gi, "because of the year-end close"],
    [/por ser (?:el )?final de año/gi, "because of the year-end close"],
    [/cierre de año/gi, "year-end close"],
    [/final de año/gi, "year-end"],
    [/nuevos transportistas/gi, "new carriers"],
    [/transportistas/gi, "carriers"],
    [/la empresa no está incorporando/gi, "the company is not adding"],
    [/no están agregando/gi, "are not adding"],
    [/una ruta de/gi, "a route from"],
    [/la ruta de/gi, "the route from"],
    [/para revisar/gi, "to review"],
    [/para cotizar/gi, "to quote"],
  ];
  for (const [pattern, replacement] of phrases) {
    next = next.replace(pattern, replacement);
  }
  return cleanupFact(next);
}

function textLanguage(text: string): "es" | "en" {
  const folded = fold(text);
  const spanish = folded.match(/\b(que|por|para|con|una|los|las|esta|estan|como|porque|el|la|me|no)\b/g)?.length ?? 0;
  const english = folded.match(/\b(the|and|for|with|that|from|your|please|about|route|year|they|she)\b/g)?.length ?? 0;
  return spanish > english ? "es" : "en";
}

function cleanupFact(text: string): string {
  return text.replace(/\s+/g, " ").replace(/^[,\s]+|[.\s]+$/g, "").trim();
}

function ensurePeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function lowerFirst(text: string): string {
  const trimmed = text.trim().replace(/[.]+$/g, "");
  const first = trimmed.split(/\s+/)[0] ?? "";
  if (!/^(el|la|los|las|un|una|ahora|no|que|por|para|the|a|an)$/i.test(first)) {
    return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  }
  return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}.`;
}

function cleanPlace(value: string): string {
  return value.replace(/^(?:de|from|the|la|el)\s+/i, "").replace(/\s+/g, " ").trim();
}

function replacePhrase(text: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return text.replace(new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu"), (match) => matchCase(match, to));
}

function matchCase(sample: string, replacement: string): string {
  if (!sample) return replacement;
  if (sample[0] === sample[0].toUpperCase() && sample[0] !== sample[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement.charAt(0).toLowerCase() + replacement.slice(1);
}

function originalSlice(text: string, toOriginal: number[], start: number, end: number): string {
  if (start >= end) return "";
  const from = toOriginal[start] ?? text.length;
  const to = end >= toOriginal.length ? text.length : (toOriginal[end] ?? text.length);
  return text.slice(from, to);
}

function foldWithMap(text: string): { folded: string; toOriginal: number[] } {
  let folded = "";
  const toOriginal: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const base = text[index].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (const char of base) {
      folded += char;
      toOriginal.push(index);
    }
  }
  return { folded, toOriginal };
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
