import assert from "node:assert/strict";
import {
  ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT,
  buildAccountOutreachQuickUserPrompt,
  buildOutreachUserPrompt,
  normalizeOutreachDraft,
  OUTREACH_SYSTEM_PROMPT,
  OUTREACH_TONES,
  OUTREACH_TYPES,
  resolveOutreachType,
} from "./aiPrompts.ts";
import { resolveOutreachTone } from "./outreachTone.ts";
import { POST_PRESENTATION_THANK_YOU } from "./postPresentationEmail.ts";
import { compactOutreachContext, type OutreachPromptSource } from "./outreachContext.ts";
import {
  applyCommercialBrand,
  COMMERCIAL_COMPANY_NAME,
  correctOutreachSenderContent,
} from "./commercialBrand.ts";

function source(overrides: Partial<OutreachPromptSource> = {}): OutreachPromptSource {
  return {
    outreachType: "Relationship Follow-up",
    tone: "Professional",
    goal: "Reopen the McAllen reefer conversation",
    selectedContact: {
      name: "Maria Alvarez",
      email: "maria@valleyproduce.example",
      phone: "956-555-0100",
      jobTitle: "Logistics Manager",
    },
    company: {
      name: "Valley Produce Co",
      salesStage: "In Follow-up",
      priority: "High",
      city: "McAllen",
      state: "TX",
      country: "USA",
      generalNotes: "Ships avocados and tomatoes from the Rio Grande Valley.",
      mainPhone: "956-555-0199",
      lastContactAt: "2026-10-20",
      nextFollowUpAt: "2026-11-14",
    },
    contacts: [
      {
        name: "Maria Alvarez",
        email: "maria@valleyproduce.example",
        phone: "956-555-0100",
        jobTitle: "Logistics Manager",
        isPrimary: true,
      },
    ],
    pendingFollowUps: [
      {
        title: "Call Maria about the Bronx reefer quote",
        dueAt: "2026-11-14",
        notes: "She asked us to wait until after their peak harvest week.",
      },
    ],
    completedFollowUps: [],
    commercialTimeline: [
      {
        kind: "activity",
        status: "call",
        title: "Quote follow-up call",
        notes:
          "Customer said the quoted rate was too high and they stayed with their current broker.",
        occurredAt: "2026-10-20",
      },
      {
        kind: "follow_up",
        status: "completed",
        title: "Sent McAllen to Bronx reefer quote",
        notes: "Quoted reefer, avocados, McAllen TX to Bronx NY.",
        occurredAt: "2026-10-02",
      },
    ],
    opportunities: [
      {
        status: "quoted",
        lane: "McAllen, TX → Bronx, NY",
        equipmentType: "Reefer",
        commodity: "Avocados",
        targetRate: 4200,
        quotedRate: 4500,
        notes: "Weekly during harvest.",
        updatedAt: "2026-10-02",
        frequency: "Weekly",
        estimatedLoadsPerWeek: 3,
        name: "Valley harvest reefer",
      },
    ],
    lanePatterns: [
      {
        origin: "McAllen, TX",
        destination: "Bronx, NY",
        equipmentType: "Reefer",
        commodities: ["Avocados"],
      },
    ],
    priorDraftFeedback: [],
    ...overrides,
  };
}

const brief = compactOutreachContext(source());

assert.equal(brief.company.name, "Valley Produce Co");
assert.equal(brief.company.mainPhoneOnFile, true);
assert.equal("mainPhone" in brief.company, false);
assert.equal(brief.contacts[0]?.emailOnFile, true);
assert.equal("email" in (brief.contacts[0] ?? {}), false);
assert.match(brief.recentCommercialHistory[0]?.notes ?? "", /too high/);
assert.equal(brief.lastCommunication?.occurredAt, "2026-10-20");
assert.equal(brief.opportunities[0]?.commodity, "Avocados");
assert.deepEqual(brief.missingInformation, []);

const longNotes = "x".repeat(2000);
const trimmed = compactOutreachContext(
  source({
    company: { ...source().company, generalNotes: longNotes },
    commercialTimeline: Array.from({ length: 20 }, (_, index) => ({
      kind: "activity" as const,
      status: "note",
      title: `Touch ${index}`,
      notes: "Repeated check-in with no new freight.",
      occurredAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
    })),
  }),
);
assert.ok((trimmed.company.generalNotes?.length ?? 0) < 1000);
assert.equal(trimmed.recentCommercialHistory.length, 12);
assert.ok(trimmed.omittedCounts.commercialHistory > 0);

const sparse = compactOutreachContext(
  source({
    company: {
      ...source().company,
      generalNotes: null,
      city: null,
      state: null,
      mainPhone: null,
    },
    contacts: [],
    selectedContact: null,
    pendingFollowUps: [],
    commercialTimeline: [],
    opportunities: [],
    lanePatterns: [],
  }),
);
assert.ok(sparse.missingInformation.includes("company notes"));
assert.ok(sparse.missingInformation.includes("commercial history"));
assert.ok(sparse.missingInformation.includes("lanes, commodities, and equipment"));

assert.equal(resolveOutreachTone("Natural"), "Natural");
assert.equal(resolveOutreachTone("natural"), "Natural");
assert.equal(resolveOutreachTone("Conversational / Natural"), "Conversational");
assert.equal(resolveOutreachTone("conversational"), "Conversational");
assert.equal(resolveOutreachTone("Professional"), "Professional");
assert.equal(resolveOutreachTone("Warm"), "Warm");
assert.equal(resolveOutreachTone(""), null);
assert.equal(
  OUTREACH_TONES.indexOf("Natural"),
  OUTREACH_TONES.indexOf("Conversational") + 1,
);
assert.ok(OUTREACH_TONES.includes("Conversational"));
assert.ok(OUTREACH_TONES.includes("Natural"));
assert.ok(OUTREACH_TONES.includes("Direct"));
assert.ok(OUTREACH_TONES.includes("Friendly"));
assert.ok(OUTREACH_TONES.includes("Persistent but respectful"));

assert.match(OUTREACH_SYSTEM_PROMPT, /senior Business Development Director/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Conversational emails are two or three sentences/);
assert.match(OUTREACH_SYSTEM_PROMPT, /must not be collapsed into the Conversational or Natural form/);
assert.match(OUTREACH_SYSTEM_PROMPT, /only when Natural is selected/);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /90 to 160/);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /Write in English/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Full truckload \(FTL\)/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /reefer/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /dry van/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /flatbed/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /produce/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /Do not invent/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /do NOT send email/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /not on file/i);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /temperature|top_p/);

const prompt = buildOutreachUserPrompt(source(), null);
assert.match(prompt, /Valley Produce Co/);
assert.match(prompt, /too high/);
assert.match(prompt, /current broker/);
assert.match(prompt, /Avocados/);
assert.match(prompt, /McAllen, TX/);
assert.match(prompt, /Do not imply that any message will be sent/);
assert.match(prompt, /missingInformation/);
assert.doesNotMatch(prompt, /956-555-0199/);

const objectionPrompt = buildOutreachUserPrompt(
  source({ outreachType: "Quote Follow-up" }),
  null,
);
assert.match(objectionPrompt, /sections must be: Recorded quote/);
assert.match(objectionPrompt, /Quote Follow-up/);
assert.match(objectionPrompt, /4500/);
assert.match(objectionPrompt, /too high/);

const incompletePrompt = buildOutreachUserPrompt(
  source({
    company: {
      ...source().company,
      name: "Blank Shipper",
      generalNotes: null,
      city: null,
      state: null,
    },
    contacts: [],
    selectedContact: null,
    commercialTimeline: [],
    pendingFollowUps: [],
    opportunities: [],
    lanePatterns: [],
  }),
  { status: "unavailable", findings: [], limitation: "No lanes on file.", searchedAt: "2026-11-13" },
);
assert.match(incompletePrompt, /Blank Shipper/);
assert.match(incompletePrompt, /company notes/);
assert.match(incompletePrompt, /unavailable/);
assert.match(incompletePrompt, /Do not invent those facts/);

const quick = buildAccountOutreachQuickUserPrompt(source());
assert.match(ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT, /do NOT send email/i);
assert.match(quick, /Valley Produce Co/);
assert.match(quick, /Logistics Manager/);
assert.match(quick, /Do not imply anything will be sent automatically/);

assert.equal(
  resolveOutreachType("Post-Presentation Call Follow-up"),
  "Post-Presentation Call Follow-up",
);
assert.ok(OUTREACH_TYPES.includes("Post-Presentation Call Follow-up"));
assert.deepEqual(OUTREACH_TYPES.slice(0, 6), [
  "Call Script",
  "Relationship Follow-up",
  "Technical Follow-up",
  "Quote Follow-up",
  "Re-engagement",
  "Opportunity Development",
]);

const postPresentationPrompt = buildOutreachUserPrompt(
  source({
    outreachType: "Post-Presentation Call Follow-up",
    goal: null,
    commercialTimeline: [
      {
        kind: "activity",
        status: "call",
        title: "Presentation call",
        notes: "They shared the quoting link https://portal.example.com/quote/4821.",
        occurredAt: "2026-11-18",
      },
    ],
    opportunities: [],
    lanePatterns: [],
  }),
  null,
  { language: "en", sender: { name: "Camilo Rengifo", email: "camilo@armstrongtransport.com" } },
);
assert.match(postPresentationPrompt, /Post-Presentation Call Follow-up/);
assert.match(postPresentationPrompt, /Thank you for taking my call today\./);
assert.match(postPresentationPrompt, /Muchas gracias por atender mi llamada hoy\./);
assert.match(postPresentationPrompt, /Do not ask the broker for a lane, commodity, equipment/);
assert.match(postPresentationPrompt, /https:\/\/portal\.example\.com\/quote\/4821/);
assert.match(postPresentationPrompt, /A phone number is not configured/);

const shaped = normalizeOutreachDraft(
  {
    emailDraft: "Which lane, commodity, or equipment should I mention?",
    sections: [{ title: "Email draft", content: "Need a lane before I write." }],
    fullDraft: "Need a lane before I write.",
  },
  "Post-Presentation Call Follow-up",
  {
    language: "es",
    contactName: "Hellen Martinez",
    senderName: "Camilo Rengifo",
    senderEmail: "camilo@armstrongtransport.com",
    timelineNotes: [],
  },
);
assert.match(shaped.emailDraft ?? "", /Muchas gracias por atender mi llamada hoy\./);
assert.equal(shaped.emailDraft, shaped.fullDraft);
assert.equal(shaped.sections[0]?.content, shaped.fullDraft);
assert.doesNotMatch(shaped.emailDraft ?? "", /\b(lane|commodity|equipment)\b/i);
assert.match(shaped.fullDraft, /Subject: Gracias por su tiempo/);
assert.match(shaped.emailDraft ?? "", /Fue un gusto conversar/);

const professionalPost = normalizeOutreachDraft(
  {
    emailDraft: "Short note for every tone.",
    fullDraft: "Short note for every tone.",
  },
  "Post-Presentation Call Follow-up",
  {
    language: "en",
    tone: "Professional",
    contactName: "Gaby",
    senderName: "Camilo Rengifo",
    senderEmail: "camilo@armstrongtransport.com",
    timelineNotes: ["Hablé con Gaby, me puse a sus órdenes y le envié un correo"],
  },
);
assert.match(professionalPost.fullDraft, /After our call, I can prepare a quote/);
assert.doesNotMatch(professionalPost.fullDraft, /Short note for every tone/);
assert.doesNotMatch(professionalPost.fullDraft, /It was good to connect, and I am here whenever/);

const spanishRelationship = buildOutreachUserPrompt(
  source({ outreachType: "Relationship Follow-up", tone: "Warm" }),
  null,
  { language: "es" },
);
assert.match(spanishRelationship, /Relationship Follow-up/);
assert.match(spanishRelationship, /Language: Spanish/);
assert.match(spanishRelationship, /Selected tone: Warm/);
assert.match(spanishRelationship, /two or three short paragraphs/i);
assert.match(spanishRelationship, /Do not shorten this tone to two or three sentences/);
assert.match(spanishRelationship, /too high/);
assert.doesNotMatch(spanishRelationship, /90 to 160/);

const spanishConversational = buildOutreachUserPrompt(
  source({ outreachType: "Quote Follow-up", tone: "Conversational" }),
  null,
  { language: "es" },
);
assert.match(spanishConversational, /Quote Follow-up/);
assert.match(spanishConversational, /Language: Spanish/);
assert.match(spanishConversational, /Selected tone: Conversational/);
assert.match(spanishConversational, /two or three sentences/);
assert.doesNotMatch(spanishConversational, /Do not shorten this tone to two or three sentences/);
assert.doesNotMatch(spanishConversational, /90 to 160/);
assert.doesNotMatch(spanishConversational, /Selected tone: Natural/);

const spanishNatural = buildOutreachUserPrompt(
  source({ outreachType: "Relationship Follow-up", tone: "Natural" }),
  null,
  { language: "es" },
);
assert.match(spanishNatural, /Relationship Follow-up/);
assert.match(spanishNatural, /Language: Spanish/);
assert.match(spanishNatural, /Selected tone: Natural/);
assert.match(spanishNatural, /one to three short sentences/i);
assert.match(spanishNatural, /first person/i);
assert.doesNotMatch(spanishNatural, /two or three short paragraphs are enough/i);

const englishNatural = buildOutreachUserPrompt(
  source({ outreachType: "Post-Presentation Call Follow-up", tone: "Natural" }),
  null,
  { language: "en", sender: { name: "Camilo Rengifo", email: "camilo@armstrongtransport.com" } },
);
assert.match(englishNatural, /Language: English/);
assert.match(englishNatural, /Selected tone: Natural/);
assert.match(englishNatural, /do not force that stock sentence/i);

const directEnglish = buildOutreachUserPrompt(
  source({ outreachType: "Opportunity Development", tone: "Direct" }),
  null,
  { language: "en" },
);
assert.match(directEnglish, /Opportunity Development/);
assert.match(directEnglish, /Language: English/);
assert.match(directEnglish, /Selected tone: Direct/);
assert.match(directEnglish, /reach the proposal in the first paragraph/);
assert.doesNotMatch(directEnglish, /Selected tone: Natural/);
assert.match(directEnglish, /Do not use the Natural voice/);

assert.equal(COMMERCIAL_COMPANY_NAME, "Armstrong Transport Group");
assert.match(OUTREACH_SYSTEM_PROMPT, /Business Development Director at Armstrong Transport Group/);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /Director at Logistics Masters,/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Logistics Masters AI Commercial Assistant/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Naming the company is optional/);
assert.match(OUTREACH_SYSTEM_PROMPT, /does not override "Armstrong Transport Group"/);
assert.match(ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT, /Armstrong Transport Group/);
assert.doesNotMatch(ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT, /Director at Logistics Masters,/);

for (const sample of [
  source({ outreachType: "Relationship Follow-up", tone: "Natural" }),
  source({ outreachType: "Quote Follow-up", tone: "Direct" }),
  source({ outreachType: "Re-engagement", tone: "Warm" }),
  source({ outreachType: "Call Script", tone: "Conversational" }),
]) {
  const brandedPrompt = buildOutreachUserPrompt(sample, null, { language: "es" });
  assert.match(brandedPrompt, /Armstrong Transport Group/);
  assert.match(brandedPrompt, /Naming the company is optional/);
  assert.match(brandedPrompt, /overrides every historical company label/);
}

const historicalPrompt = buildOutreachUserPrompt(
  source({
    commercialTimeline: [
      {
        kind: "activity",
        status: "note",
        title: "Introduced the company",
        notes: "Told Katie we work at Logistics Masters.",
        occurredAt: "2026-11-01",
      },
    ],
  }),
  null,
  { language: "en" },
);
assert.match(historicalPrompt, /Told Katie we work at Logistics Masters\./);
assert.match(historicalPrompt, /Keep those notes as internal context/);

const katieBody =
  "Hi Katie,\n\nI'm your contact at Logistics Masters and would be happy to help with a quote when your next load comes up.\n\nBest,\nCamilo Rengifo\nLogistics Masters\ncamilo@armstrongtransport.com";
const katieDraft = normalizeOutreachDraft(
  {
    subjectLine: "Caribbean Waterworks — your Logistics Masters contact",
    subjectAlternatives: [
      "Caribbean Waterworks — your Logistics Masters contact",
      "Katie, a note from Logistics Masters",
      "Quote help from logistics masters",
    ],
    emailDraft: katieBody,
    sections: [{ title: "Email draft", content: katieBody }],
    fullDraft: `Subject: Caribbean Waterworks — your Logistics Masters contact\n\n${katieBody}`,
    commercialSummary: "Logistics Masters can quote the next load.",
  },
  "Relationship Follow-up",
);
assert.equal(
  katieDraft.subjectLine,
  "Caribbean Waterworks — your Armstrong Transport Group contact",
);
assert.deepEqual(katieDraft.subjectAlternatives, [
  "Caribbean Waterworks — your Armstrong Transport Group contact",
  "Katie, a note from Armstrong Transport Group",
  "Quote help from Armstrong Transport Group",
]);
assert.match(
  katieDraft.emailDraft ?? "",
  /I'm your contact at Armstrong Transport Group and would be happy to help with a quote when your next load comes up\./,
);
assert.match(katieDraft.emailDraft ?? "", /camilo@armstrongtransport\.com/);
assert.doesNotMatch(katieDraft.fullDraft, /Logistics Masters/i);
assert.doesNotMatch(katieDraft.emailDraft ?? "", /Logistics Masters/i);
assert.doesNotMatch(katieDraft.sections.map((section) => section.content).join("\n"), /Logistics Masters/i);
assert.equal(applyCommercialBrand(katieDraft.fullDraft), katieDraft.fullDraft);

const katieSpanish = normalizeOutreachDraft(
  {
    subjectLine: "Caribbean Waterworks — su contacto en Logistics Masters",
    subjectAlternatives: [
      "Caribbean Waterworks — su contacto en Logistics Masters",
      "Katie, un mensaje de Logistics Masters",
      "Cotización con Logistics Masters",
    ],
    emailDraft:
      "Hola Katie,\n\nSoy su contacto en Logistics Masters y con gusto le ayudo con una cotización cuando tenga la próxima carga.\n\nSaludos,\nCamilo Rengifo\ncamilo@armstrongtransport.com",
    fullDraft:
      "Asunto: Caribbean Waterworks — su contacto en Logistics Masters\n\nHola Katie,\n\nSoy su contacto en Logistics Masters y con gusto le ayudo con una cotización cuando tenga la próxima carga.\n\nSaludos,\nCamilo Rengifo\ncamilo@armstrongtransport.com",
  },
  "Re-engagement",
);
assert.equal(
  katieSpanish.subjectLine,
  "Caribbean Waterworks — su contacto en Armstrong Transport Group",
);
assert.doesNotMatch(JSON.stringify(katieSpanish), /Logistics Masters/i);
assert.match(katieSpanish.emailDraft ?? "", /camilo@armstrongtransport\.com/);

const unnamed = normalizeOutreachDraft(
  {
    subjectLine: "Caribbean Waterworks — next load",
    subjectAlternatives: [
      "Caribbean Waterworks — next load",
      "When the next load is ready",
      "Quote for the next shipment",
    ],
    emailDraft:
      "Hi Katie,\n\nHappy to help with a quote when your next load comes up.\n\nBest,\nCamilo Rengifo\ncamilo@armstrongtransport.com",
    fullDraft:
      "Hi Katie,\n\nHappy to help with a quote when your next load comes up.\n\nBest,\nCamilo Rengifo\ncamilo@armstrongtransport.com",
  },
  "Opportunity Development",
);
assert.equal(unnamed.subjectLine, "Caribbean Waterworks — next load");
assert.doesNotMatch(unnamed.emailDraft ?? "", /Armstrong Transport Group/);
assert.match(unnamed.emailDraft ?? "", /camilo@armstrongtransport\.com/);
assert.equal(
  applyCommercialBrand("Portal: https://crm.logisticsmasters.us"),
  "Portal: https://crm.logisticsmasters.us",
);

const reopened = correctOutreachSenderContent({
  draft: {
    subjectLine: "Caribbean Waterworks — your Logistics Masters contact",
    subjectAlternatives: ["Caribbean Waterworks — your Logistics Masters contact"],
    commercialSummary: null,
    marketInsight: null,
    commercialRecommendation: null,
    suggestedNextStep: null,
    emailDraft: katieBody,
    sections: [{ title: "Email draft", content: katieBody }],
    fullDraft: katieBody,
  },
  editedSubjects: ["Caribbean Waterworks — your Logistics Masters contact"],
  editedEmail: katieBody,
  editedFullDraft: `Subject: Caribbean Waterworks — your Logistics Masters contact\n\n${katieBody}`,
  editedSummary: "",
  editedMarketInsight: "",
  editedRecommendation: "",
  editedNextStep: "",
});
assert.equal(
  reopened.editedSubjects[0],
  "Caribbean Waterworks — your Armstrong Transport Group contact",
);
assert.equal(
  reopened.draft?.subjectLine,
  "Caribbean Waterworks — your Armstrong Transport Group contact",
);
assert.doesNotMatch(reopened.editedFullDraft, /Logistics Masters/i);
assert.match(reopened.editedFullDraft, /camilo@armstrongtransport\.com/);
assert.equal(correctOutreachSenderContent(reopened), reopened);

console.log("outreach prompt checks passed");
