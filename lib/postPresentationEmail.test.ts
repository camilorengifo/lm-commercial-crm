import assert from "node:assert/strict";
import {
  composePostPresentationEmail,
  firstSentenceAfterGreeting,
  POST_PRESENTATION_THANK_YOU,
} from "./postPresentationEmail.ts";

const english = composePostPresentationEmail({
  language: "en",
  contactName: "Hellen Martinez",
  senderName: "Camilo Rengifo",
  senderEmail: "camilo@armstrongtransport.com",
  timelineNotes: [],
});

assert.equal(firstSentenceAfterGreeting(english.body), POST_PRESENTATION_THANK_YOU.en);
assert.match(english.body, /^Hi Hellen,/);
assert.match(english.body, /I remain available for your transportation needs\./);
assert.match(english.body, /Best,\nCamilo Rengifo\ncamilo@armstrongtransport\.com$/);
assert.doesNotMatch(english.body, /\b(lane|commodity|equipment|phone)\b/i);
assert.doesNotMatch(english.body, /555-/);

const spanish = composePostPresentationEmail({
  language: "es",
  contactName: "Hellen Martinez",
  senderName: "Camilo Rengifo",
  senderEmail: "camilo@armstrongtransport.com",
  timelineNotes: [],
});

assert.equal(firstSentenceAfterGreeting(spanish.body), POST_PRESENTATION_THANK_YOU.es);
assert.match(spanish.body, /^Hola Hellen,/);
assert.match(spanish.body, /Quedo disponible para sus necesidades de transporte\./);
assert.match(spanish.body, /Saludos,\nCamilo Rengifo\ncamilo@armstrongtransport\.com$/);

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
assert.match(withTimeline.body, /Thank you for sharing the quoting link:/);
assert.match(withTimeline.body, /The next step from our conversation is: Please send the documents they requested\./);
assert.match(withTimeline.body, /Best,\ncamilo@armstrongtransport\.com$/);
assert.doesNotMatch(withTimeline.body, /Camilo Rengifo/);

console.log("post-presentation email checks passed");
