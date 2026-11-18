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
assert.equal(
  composePostPresentationEmail({
    language: "en",
    tone: "Natural",
    contactName: "Gaby",
    ...sender,
    timelineNotes: [gabyNote],
  }).body,
  gabyEnglish.body,
);

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

assert.deepEqual(
  selectRecordedFreight([
    { lane: "— → —", equipmentType: "Dry Van", commodity: "Limes", updatedAt: "2026-11-18" },
    { lane: "McAllen, TX → Bronx, NY", equipmentType: "Reefer", commodity: "Avocados", updatedAt: "2026-10-02" },
  ]),
  { lane: "McAllen, TX → Bronx, NY", equipment: "Reefer", commodity: "Avocados" },
);

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
