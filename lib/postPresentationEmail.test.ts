import assert from "node:assert/strict";
import {
  composePostPresentationEmail,
  firstSentenceAfterGreeting,
  POST_PRESENTATION_THANK_YOU,
  selectRecordedFreight,
} from "./postPresentationEmail.ts";

const sender = {
  senderName: "Camilo Rengifo",
  senderEmail: "camilo@armstrongtransport.com",
};

const english = composePostPresentationEmail({
  language: "en",
  contactName: "Hellen Martinez",
  ...sender,
  timelineNotes: [],
});

assert.equal(firstSentenceAfterGreeting(english.body), POST_PRESENTATION_THANK_YOU.en);
assert.match(english.body, /^Hi Hellen,/);
assert.match(english.body, /It was good to connect, and I am here whenever you have a shipment we can work on together\./);
assert.match(english.body, /Best,\nCamilo Rengifo\ncamilo@armstrongtransport\.com$/);
assert.doesNotMatch(english.body, /\b(lane|commodity|equipment|phone)\b/i);
assert.doesNotMatch(english.body, /555-/);
assert.equal(english.visible, `Subject: ${english.subject}\n\n${english.body}`);

const spanish = composePostPresentationEmail({
  language: "es",
  contactName: "Hellen Martinez",
  ...sender,
  timelineNotes: [],
});

assert.equal(firstSentenceAfterGreeting(spanish.body), POST_PRESENTATION_THANK_YOU.es);
assert.match(spanish.body, /^Hola Hellen,/);
assert.match(spanish.body, /Fue un gusto conversar, y quedo atento cuando tenga un embarque en el que podamos trabajar juntos\./);
assert.match(spanish.body, /Saludos,\nCamilo Rengifo\ncamilo@armstrongtransport\.com$/);

const gabyNote = "Hablé con Gaby, me puse a sus órdenes y le envié un correo";
const gabyEnglish = composePostPresentationEmail({
  language: "en",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote.normalize("NFD"), "Older note: please send the documents they requested."],
});
assert.equal(firstSentenceAfterGreeting(gabyEnglish.body), POST_PRESENTATION_THANK_YOU.en);
assert.match(gabyEnglish.body, /^Hi Gaby,/);
assert.match(gabyEnglish.body, /It was good to connect/);
assert.doesNotMatch(gabyEnglish.visible, /The next step from our conversation is/);
assert.doesNotMatch(gabyEnglish.visible, /Hablé|órdenes|envié|correo|envie/);
assert.doesNotMatch(gabyEnglish.visible, /documents you asked for/);

const gabySpanish = composePostPresentationEmail({
  language: "es",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
});
assert.equal(firstSentenceAfterGreeting(gabySpanish.body), POST_PRESENTATION_THANK_YOU.es);
assert.match(gabySpanish.body, /^Hola Gaby,/);
assert.match(gabySpanish.body, /Fue un gusto conversar/);
assert.doesNotMatch(gabySpanish.visible, /The next step|I'll give you a call|It was good to connect/);
assert.doesNotMatch(gabySpanish.visible, /Hablé con Gaby, me puse/);

const thursdayNote = "Gaby me pidió que la llamara el jueves";
const thursdayEnglish = composePostPresentationEmail({
  language: "en",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [thursdayNote],
});
assert.match(thursdayEnglish.body, /I'll give you a call on Thursday\./);
assert.doesNotMatch(thursdayEnglish.visible, /pidió|llamara|The next step/);

const thursdaySpanish = composePostPresentationEmail({
  language: "es",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [thursdayNote],
});
assert.match(thursdaySpanish.body, /Le llamaré el jueves\./);
assert.doesNotMatch(thursdaySpanish.visible, /I'll give you a call|pidió que la llamara/);

const quoteUrl = "https://portal.example.com/quote/4821";
const withTimeline = composePostPresentationEmail({
  language: "en",
  contactName: null,
  senderName: null,
  senderEmail: "camilo@armstrongtransport.com",
  timelineNotes: [
    `Call today. They shared the quoting portal ${quoteUrl}. Please send the documents they requested.`,
  ],
});

assert.equal(firstSentenceAfterGreeting(withTimeline.body), POST_PRESENTATION_THANK_YOU.en);
assert.match(withTimeline.body, /^Hello,/);
assert.ok(withTimeline.body.includes(quoteUrl));
assert.match(withTimeline.body, /Thank you for sharing the quoting link: https:\/\/portal\.example\.com\/quote\/4821/);
assert.match(withTimeline.body, /I'll send the documents you asked for\./);
assert.doesNotMatch(withTimeline.body, /The next step from our conversation is/);
assert.doesNotMatch(withTimeline.body, /Please send the documents they requested/);
assert.match(withTimeline.body, /Best,\ncamilo@armstrongtransport\.com$/);
assert.doesNotMatch(withTimeline.body, /Camilo Rengifo/);

const gabyConversational = composePostPresentationEmail({
  language: "en",
  tone: "Conversational",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
});
assert.equal(gabyConversational.body, gabyEnglish.body);

const gabyNatural = composePostPresentationEmail({
  language: "en",
  tone: "Natural",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
});
assert.match(gabyNatural.body, /^Hi Gaby,\n\nThanks for the call\./);
assert.match(gabyNatural.body, /reply with the origin, destination, and the day/);
assert.match(gabyNatural.body, /Best,\nCamilo Rengifo\ncamilo@armstrongtransport\.com$/);
assert.equal(gabyNatural.subject, "Thanks for the call");
assert.doesNotMatch(gabyNatural.body, /Thank you for taking my call today/);
assert.doesNotMatch(gabyNatural.body, /It was good to connect/);
assert.doesNotMatch(gabyNatural.visible, /Hablé|órdenes|envié/);
assert.notEqual(gabyNatural.body, gabyConversational.body);
assert.ok(bodySentenceCount(gabyNatural.body) >= 1 && bodySentenceCount(gabyNatural.body) <= 3);

const gabyNaturalSpanish = composePostPresentationEmail({
  language: "es",
  tone: "Natural",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
});
assert.match(gabyNaturalSpanish.body, /^Hola Gaby,\n\nGracias por la llamada\./);
assert.match(gabyNaturalSpanish.body, /respóndame con el origen, el destino y el día/);
assert.match(gabyNaturalSpanish.body, /Saludos,\nCamilo Rengifo\ncamilo@armstrongtransport\.com$/);
assert.doesNotMatch(gabyNaturalSpanish.body, /Thank you|Thanks for the call|It was good to connect/);
assert.doesNotMatch(gabyNaturalSpanish.visible, /Hablé con Gaby/);
assert.ok(bodySentenceCount(gabyNaturalSpanish.body) <= 3);

const naturalVoicemail = composePostPresentationEmail({
  language: "en",
  tone: "Natural",
  contactName: "Gaby",
  ...sender,
  timelineNotes: ["Left a voicemail for Gaby."],
});
assert.match(naturalVoicemail.body, /I left you a voicemail/);
assert.doesNotMatch(naturalVoicemail.body, /Thanks for the call|Thank you for taking my call/);

const gabyProfessional = composePostPresentationEmail({
  language: "en",
  tone: "Professional",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
});
assert.equal(firstSentenceAfterGreeting(gabyProfessional.body), POST_PRESENTATION_THANK_YOU.en);
assert.match(gabyProfessional.body, /After our call, I can prepare a quote for you to review/);
assert.match(gabyProfessional.body, /Reply with those details, or with a time for a short call/);
assert.match(gabyProfessional.body, /Best,\nCamilo Rengifo\ncamilo@armstrongtransport\.com$/);
assert.doesNotMatch(gabyProfessional.body, /It was good to connect, and I am here whenever/);
assert.doesNotMatch(gabyProfessional.visible, /Hablé|órdenes|envié|correo|The next step/);
assert.doesNotMatch(gabyProfessional.body, /Thursday|documents you asked for|https?:\/\//);
assert.notEqual(coreDraft(gabyProfessional.body), coreDraft(gabyConversational.body));

const gabyDirect = composePostPresentationEmail({
  language: "en",
  tone: "Direct",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
});
const gabyWarm = composePostPresentationEmail({
  language: "en",
  tone: "Warm",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
});
assert.notEqual(gabyDirect.body, gabyProfessional.body);
assert.notEqual(gabyWarm.body, gabyProfessional.body);
assert.match(gabyDirect.body, /I can prepare a quote from the origin/);
assert.match(gabyWarm.body, /I enjoyed the conversation/);
assert.ok(gabyWarm.body.length > gabyDirect.body.length);

const gabySpanishProfessional = composePostPresentationEmail({
  language: "es",
  tone: "Professional",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
});
assert.equal(firstSentenceAfterGreeting(gabySpanishProfessional.body), POST_PRESENTATION_THANK_YOU.es);
assert.match(gabySpanishProfessional.body, /puedo prepararle una cotización/i);
assert.match(gabySpanishProfessional.body, /Saludos,\nCamilo Rengifo\ncamilo@armstrongtransport\.com$/);
assert.doesNotMatch(gabySpanishProfessional.visible, /Thank you for taking|It was good to connect|Hablé con Gaby/);
assert.notEqual(coreDraft(gabySpanishProfessional.body), coreDraft(gabySpanish.body));

const voicemail = composePostPresentationEmail({
  language: "en",
  tone: "Professional",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [{ status: "call", title: "Call", notes: "Left a voicemail for Gaby." }],
});
assert.match(voicemail.body, /I called today and reached your voicemail/);
assert.doesNotMatch(voicemail.body, /Thank you for taking my call today/);
assert.doesNotMatch(voicemail.body, /It was good to connect|I enjoyed the conversation/);

const unanswered = composePostPresentationEmail({
  language: "en",
  tone: "Conversational",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [{ status: "follow_up_no_response", title: "Call", notes: "No answer." }],
});
assert.match(unanswered.body, /I called today and was not able to reach you/);
assert.doesNotMatch(unanswered.body, /Thank you for taking my call today/);

const thursdayProfessional = composePostPresentationEmail({
  language: "en",
  tone: "Professional",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [thursdayNote],
});
assert.match(thursdayProfessional.body, /I'll give you a call on Thursday\./);
assert.match(thursdayProfessional.body, /If that time changes, reply with another one/);
assert.doesNotMatch(thursdayProfessional.body, /or with a time for a short call/);

const withLane = composePostPresentationEmail({
  language: "en",
  tone: "Professional",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
  recordedFreight: {
    lane: "McAllen, TX → Bronx, NY",
    equipment: "Reefer",
    commodity: "Avocados",
  },
});
assert.match(withLane.body, /McAllen, TX → Bronx, NY, Reefer, Avocados/);
assert.doesNotMatch(withLane.body, /4500|target rate|\$/);
const conversationalWithLane = composePostPresentationEmail({
  language: "en",
  tone: "Conversational",
  contactName: "Gaby",
  ...sender,
  timelineNotes: [gabyNote],
  recordedFreight: {
    lane: "McAllen, TX → Bronx, NY",
    equipment: "Reefer",
    commodity: "Avocados",
  },
});
assert.equal(conversationalWithLane.body, gabyConversational.body);
assert.doesNotMatch(conversationalWithLane.body, /McAllen/);

const yearEndGoal =
  "Me dice que ahora no están agregando carriers por ser final de año, incluye esto en el correo.";
const januaryGoal = "Me pidió que le escribiera en enero para revisar una ruta de Miami a Atlanta";
const yearEndSpanish = composePostPresentationEmail({
  language: "es",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: yearEndGoal,
});
assert.match(yearEndSpanish.body, /Muchas gracias por atender mi llamada hoy\./);
assert.match(yearEndSpanish.body, /por el cierre de año, la empresa no está incorporando nuevos transportistas/);
assert.match(yearEndSpanish.body, /Cuando quiera retomar la conversación/);
assert.doesNotMatch(yearEndSpanish.visible, /incluye esto|origen|destino|cotizaci|enero|quedamos|acordamos|Me bastan/i);
assert.equal(yearEndSpanish.visible, `Subject: ${yearEndSpanish.subject}\n\n${yearEndSpanish.body}`);

const yearEndEnglish = composePostPresentationEmail({
  language: "en",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: yearEndGoal,
});
assert.match(yearEndEnglish.body, /Thank you for taking my call today\./);
assert.match(yearEndEnglish.body, /year-end close/);
assert.match(yearEndEnglish.body, /not adding new carriers/);
assert.match(yearEndEnglish.body, /pick the conversation back up/);
assert.doesNotMatch(yearEndEnglish.visible, /incluye esto|origin|destination|equipment|quote|January|agreed|carriers por/i);

const januarySpanish = composePostPresentationEmail({
  language: "es",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: januaryGoal,
});
assert.match(januarySpanish.body, /en enero/);
assert.match(januarySpanish.body, /ruta de Miami a Atlanta/);
assert.match(januarySpanish.body, /como me lo pidió/);
assert.doesNotMatch(januarySpanish.visible, /cierre de año|origen, el destino|Me bastan|quedamos|acordamos/i);
assert.notEqual(januarySpanish.body, yearEndSpanish.body);

const januaryEnglish = composePostPresentationEmail({
  language: "en",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: januaryGoal,
});
assert.match(januaryEnglish.body, /in January/);
assert.match(januaryEnglish.body, /Miami to Atlanta route/);
assert.match(januaryEnglish.body, /as you asked/);
assert.doesNotMatch(januaryEnglish.visible, /year-end|origin, destination|we agreed/i);

const informal = composePostPresentationEmail({
  language: "es",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: `${yearEndGoal} habla de tú`,
});
assert.match(informal.body, /Te agradezco que hayas tomado mi llamada/);
assert.match(informal.body, /por el cierre de año, la empresa no está incorporando nuevos transportistas/);
assert.match(informal.body, /Cuando quieras retomar la conversación/);
assert.match(informal.visible, /Gracias por tu tiempo/);
assert.doesNotMatch(informal.visible, /habla de tú|tutéa|Le agradezco|haya tomado|Cuando quiera\b|su tiempo|como me lo pidió|\busted\b|\b[Ll]e\b/i);

const formal = composePostPresentationEmail({
  language: "es",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: `${yearEndGoal} hable de usted`,
});
assert.match(formal.body, /Le agradezco que haya tomado mi llamada/);
assert.match(formal.body, /por el cierre de año, la empresa no está incorporando nuevos transportistas/);
assert.match(formal.body, /Cuando quiera retomar la conversación/);
assert.match(formal.visible, /Gracias por su tiempo/);
assert.doesNotMatch(formal.visible, /hable de usted|Te agradezco|hayas tomado|Cuando quieras|tu tiempo/i);

const reeferGoal = composePostPresentationEmail({
  language: "es",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: "Me dice que el equipo que usan es reefer",
});
assert.match(reeferGoal.body, /Entiendo que el equipo que usan es reefer/);
assert.doesNotMatch(reeferGoal.visible, /Me bastan|origen, el destino|cotizaci/i);

const mangoGoal = composePostPresentationEmail({
  language: "en",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: "Preguntar por la temporada de mango",
});
assert.match(mangoGoal.body, /mango season/i);
assert.doesNotMatch(mangoGoal.visible, /origin, destination|Preguntar por/i);

const addressOnly = composePostPresentationEmail({
  language: "es",
  tone: "Professional",
  contactName: "Maria Jose",
  ...sender,
  goal: "tutéala",
});
assert.match(addressOnly.body, /Te agradezco que hayas tomado mi llamada/);
assert.match(addressOnly.body, /origen, el destino/);
assert.doesNotMatch(addressOnly.visible, /tutéa|Le agradezco|\busted\b|\b[Ll]e\b|\bsu\b/i);

assert.deepEqual(
  selectRecordedFreight([
    { lane: "— → —", equipmentType: "Dry Van", commodity: "Limes", updatedAt: "2026-11-18" },
    { lane: "McAllen, TX → Bronx, NY", equipmentType: "Reefer", commodity: "Avocados", updatedAt: "2026-10-02" },
  ]),
  { lane: "McAllen, TX → Bronx, NY", equipment: "Reefer", commodity: "Avocados" },
);

function bodySentenceCount(body: string): number {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const greetingIndex = lines.findIndex((line) => /^(hi|hello|hola)\b/i.test(line));
  const closingIndex = lines.findIndex((line) => /^(best|saludos),?$/i.test(line));
  const middle = lines.slice(greetingIndex + 1, closingIndex === -1 ? undefined : closingIndex);
  return middle.join(" ").split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;
}

function coreDraft(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^(hi|hello|hola)\b/i.test(line.trim()))
    .join("\n")
    .replace(POST_PRESENTATION_THANK_YOU.en, "")
    .replace(POST_PRESENTATION_THANK_YOU.es, "")
    .trim();
}

console.log("\n--- Gaby note, English, Conversational ---");
console.log(gabyConversational.visible);
console.log("\n--- Gaby note, English, Professional ---");
console.log(gabyProfessional.visible);
console.log("\n--- Gaby note, Spanish, Professional ---");
console.log(gabySpanishProfessional.visible);
console.log("\n--- Agreed call on Thursday, English ---");
console.log(thursdayEnglish.visible);
console.log("\n--- Agreed call on Thursday, Spanish ---");
console.log(thursdaySpanish.visible);
console.log("\npost-presentation email checks passed");
