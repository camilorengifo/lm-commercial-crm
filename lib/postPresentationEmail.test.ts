import assert from "node:assert/strict";
import {
  composePostPresentationEmail,
  firstSentenceAfterGreeting,
  POST_PRESENTATION_THANK_YOU,
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

console.log("\n--- Gaby note, English ---");
console.log(gabyEnglish.visible);
console.log("\n--- Gaby note, Spanish ---");
console.log(gabySpanish.visible);
console.log("\n--- Agreed call on Thursday, English ---");
console.log(thursdayEnglish.visible);
console.log("\n--- Agreed call on Thursday, Spanish ---");
console.log(thursdaySpanish.visible);
console.log("\npost-presentation email checks passed");
