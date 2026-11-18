import assert from "node:assert/strict";
import {
  ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT,
  buildAccountOutreachQuickUserPrompt,
  buildOutreachUserPrompt,
  OUTREACH_STYLES,
  OUTREACH_SYSTEM_PROMPT,
  OUTREACH_TONES,
  OUTREACH_TYPES,
  resolveOutreachStyle,
  resolveOutreachTone,
  resolveOutreachType,
} from "./aiPrompts.ts";
import { compactOutreachContext, type OutreachPromptSource } from "./outreachContext.ts";

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
assert.match(brief.commercialTimeline[0]?.notes ?? "", /too high/);
assert.equal(brief.lastCommunication?.occurredAt, "2026-10-20");
assert.equal(brief.opportunities[0]?.commodity, "Avocados");
assert.equal(brief.relationship.usingAnotherProvider, true);
assert.match(brief.relationship.internalWritingDirection, /do not ask for a load/i);
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
assert.equal(trimmed.commercialTimeline.length, 16);
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
assert.equal(
  sparse.missingInformation.includes("lanes, commodities, and equipment"),
  false,
);
assert.match(sparse.relationship.internalWritingDirection, /do not ask the broker/i);

assert.match(OUTREACH_SYSTEM_PROMPT, /Armstrong Transport Group/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Full truckload \(FTL\)/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /reefer/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /dry van/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /flatbed/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /produce/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /Do not invent/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /do NOT send email/i);
assert.match(OUTREACH_SYSTEM_PROMPT, /70 to 140 words/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Direct but persistent/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Natural and conversational/);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /40 to 90/);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /leave subject and body empty/);
assert.match(OUTREACH_SYSTEM_PROMPT, /clarificationQuestion must be null/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Commercial Timeline/);
assert.match(OUTREACH_SYSTEM_PROMPT, /selected language parameter is authoritative/);
assert.match(OUTREACH_SYSTEM_PROMPT, /If language is "en"/);
assert.match(OUTREACH_SYSTEM_PROMPT, /If language is "es"/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Never infer the language/);
assert.match(OUTREACH_SYSTEM_PROMPT, /Armstrong Transport Group/);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /Commercial Objective|Market Intelligence|AI Recommendations/);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /temperature|top_p/);
assert.doesNotMatch(OUTREACH_SYSTEM_PROMPT, /Logistics Masters is the customer's/);

const promptOptions = {
  language: "en" as const,
  emailGuidance: [],
  selectedLane: {
    origin: "McAllen, TX",
    destination: "Bronx, NY",
    equipmentType: "Reefer",
    commodities: ["Avocados"],
  },
  laneChosenByBroker: true,
};

const prompt = buildOutreachUserPrompt(source(), promptOptions);
assert.match(prompt, /Valley Produce Co/);
assert.match(prompt, /too high/);
assert.match(prompt, /current broker/);
assert.match(prompt, /Avocados/);
assert.match(prompt, /McAllen, TX/);
assert.match(prompt, /Do not imply that any message will be sent/);
assert.match(prompt, /missingInformation/);
assert.match(prompt, /language: "en"/);
assert.doesNotMatch(prompt, /956-555-0199/);
assert.doesNotMatch(prompt, /Commercial Objective|Market Intelligence/);

const objectionPrompt = buildOutreachUserPrompt(
  source({ outreachType: "Quote Follow-up" }),
  promptOptions,
);
assert.match(objectionPrompt, /Quote Follow-up/);
assert.match(objectionPrompt, /4500/);
assert.match(objectionPrompt, /too high/);
assert.match(objectionPrompt, /do not ask for a load/i);
assert.doesNotMatch(objectionPrompt, /sections must be/);

const quoteOnlyPrompt = buildOutreachUserPrompt(
  source({
    outreachType: "Quote Follow-up",
    commercialTimeline: [
      {
        kind: "activity",
        status: "call",
        title: "Quote sent",
        notes: "Sent the McAllen to Bronx reefer quote and asked Maria to review it.",
        occurredAt: "2026-10-20",
      },
    ],
  }),
  promptOptions,
);
assert.match(quoteOnlyPrompt, /recorded quote/i);

const spanishPrompt = buildOutreachUserPrompt(source(), {
  ...promptOptions,
  language: "es",
});
assert.match(spanishPrompt, /language: "es"/);
assert.match(spanishPrompt, /parameter is authoritative/);

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
  {
    language: "en",
    emailGuidance: [],
    selectedLane: null,
    laneChosenByBroker: false,
  },
);
assert.match(incompletePrompt, /Blank Shipper/);
assert.match(incompletePrompt, /company notes/);
assert.match(incompletePrompt, /Do not mention market conditions/);
assert.match(incompletePrompt, /Do not invent one/);
assert.match(incompletePrompt, /do not ask the broker for one/i);

const martinezPrompt = buildOutreachUserPrompt(
  source({
    outreachType: "Relationship Follow-up",
    tone: "Natural / Conversational",
    goal: null,
    selectedContact: {
      name: "Hellen",
      email: "hellen@amartinezproduce.example",
      phone: null,
      jobTitle: null,
    },
    company: {
      ...source().company,
      name: "A Martinez Produce Corporation",
      generalNotes: "Produce shipper.",
    },
    contacts: [
      {
        name: "Hellen",
        email: "hellen@amartinezproduce.example",
        phone: null,
        jobTitle: null,
        isPrimary: true,
      },
    ],
    pendingFollowUps: [],
    opportunities: [],
    lanePatterns: [],
    commercialTimeline: [
      {
        kind: "activity",
        status: "call",
        title: "Call with Hellen",
        notes:
          "Spoke with Hellen at A Martinez Produce Corporation. She said they are happy with their current transportation provider and are not looking to change providers right now. She asked us to stay in touch. No new shipping opportunity was discussed.",
        occurredAt: "2026-11-12",
        contactName: "Hellen",
      },
    ],
  }),
  {
    language: "en",
    emailGuidance: ["Reefer capacity has been tighter across South Texas this week."],
    selectedLane: null,
    laneChosenByBroker: false,
  },
);
assert.match(martinezPrompt, /A Martinez Produce Corporation/);
assert.match(martinezPrompt, /Hellen/);
assert.match(martinezPrompt, /not looking to change providers/);
assert.match(martinezPrompt, /happy with their current transportation provider/);
assert.match(martinezPrompt, /Commercial Timeline/);
assert.match(martinezPrompt, /do not ask for a load/i);
assert.match(martinezPrompt, /do not invent a shipping opportunity/i);
assert.match(martinezPrompt, /equipment type/i);
assert.match(martinezPrompt, /Match the length to the stage/);
assert.match(martinezPrompt, /clarificationQuestion must be null/);
assert.match(martinezPrompt, /Armstrong Transport Group/);
assert.match(martinezPrompt, /Do not mention market conditions/);
assert.doesNotMatch(martinezPrompt, /tighter across South Texas/);
assert.doesNotMatch(martinezPrompt, /Commercial Objective|Market Intelligence|AI Recommendations/);

const spanishLoyalty = compactOutreachContext(
  source({
    commercialTimeline: [
      {
        kind: "activity",
        status: "call",
        title: "Llamada con Hellen",
        notes:
          "Hellen dijo que están contentos con su transportista actual y no quieren cambiar de proveedor.",
        occurredAt: "2026-11-12",
        contactName: "Hellen",
      },
    ],
    opportunities: [],
    lanePatterns: [],
  }),
);
assert.equal(spanishLoyalty.relationship.notLookingToChangeProvider, true);
assert.equal(spanishLoyalty.relationship.usingAnotherProvider, true);

const hellenSource = source({
  company: {
    ...source().company,
    name: "A Martinez produce Coorporation",
  },
  selectedContact: {
    name: "Hellen",
    email: null,
    phone: null,
    jobTitle: null,
  },
  opportunities: [],
  lanePatterns: [],
  pendingFollowUps: [],
  commercialTimeline: [
    {
      kind: "activity",
      status: "call",
      title: "Call",
      notes:
        "hable con Hellen, me dijo que ahorita no estan interesados pero que envie el correo por si en el futuro necesitan algo",
      occurredAt: "2026-11-10",
      contactName: "Hellen",
    },
  ],
});
const hellenCall = compactOutreachContext(hellenSource);
assert.equal(hellenCall.relationship.notInterestedNow, true);
assert.equal(hellenCall.relationship.notLookingToChangeProvider, false);
assert.equal(hellenCall.relationship.futureFollowUpRequested, true);
assert.match(hellenCall.relationship.internalWritingDirection, /not interested right now/i);
assert.match(
  hellenCall.relationship.internalWritingDirection,
  /do not invent a shipping opportunity/i,
);
const hellenPrompt = buildOutreachUserPrompt(hellenSource, {
  language: "en",
  emailGuidance: ["Reefer capacity has been tighter across South Texas this week."],
  selectedLane: null,
  laneChosenByBroker: false,
});
assert.match(OUTREACH_SYSTEM_PROMPT, /write the email to that person/);
assert.match(hellenPrompt, /not interested right now/i);
assert.match(hellenPrompt, /do not ask for a load/i);
assert.match(hellenPrompt, /no estan interesados/);
assert.doesNotMatch(hellenPrompt, /staying with their current transportation provider/);
assert.doesNotMatch(hellenPrompt, /tighter across South Texas/);

const quick = buildAccountOutreachQuickUserPrompt(source());
assert.match(ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT, /do NOT send email/i);
assert.match(quick, /Valley Produce Co/);
assert.match(quick, /Logistics Manager/);
assert.match(quick, /Do not imply anything will be sent automatically/);

assert.equal(resolveOutreachType("Relationship Follow-up"), "Relationship Follow-up");
assert.equal(resolveOutreachType("Follow-up Email"), "Account nurture");
assert.equal(resolveOutreachTone("Direct"), "Direct but persistent");
assert.equal(resolveOutreachTone("Direct but persistent"), "Direct but persistent");
assert.equal(resolveOutreachStyle("Natural / Conversational"), "Natural and conversational");
assert.equal(resolveOutreachStyle(""), null);
assert.ok(OUTREACH_TYPES.includes("Opportunity Development"));
assert.ok(OUTREACH_TYPES.includes("Front desk referral"));
assert.ok(OUTREACH_TYPES.includes("After-call thank-you"));
assert.ok(OUTREACH_TYPES.includes("Automatic / next best follow-up"));
assert.ok(OUTREACH_TYPES.includes("Call Script"));
assert.ok(OUTREACH_STYLES.includes("Standard commercial email"));
assert.ok(OUTREACH_TONES.includes("Warm and personable"));
assert.ok(OUTREACH_TONES.includes("Concise"));

const stageOptions = {
  language: "en" as const,
  communicationStyle: "Standard commercial email",
  emailGuidance: [],
  selectedLane: null,
  laneChosenByBroker: false,
};
const opportunityPrompt = buildOutreachUserPrompt(
  source({
    outreachType: "Opportunity Development",
    tone: "Professional and polished",
    goal: null,
    opportunities: [],
    lanePatterns: [],
  }),
  stageOptions,
);
assert.match(opportunityPrompt, /do not invent them/i);
assert.match(opportunityPrompt, /Goal: Not specified/);
assert.match(opportunityPrompt, /do not ask the broker for one/i);
assert.match(opportunityPrompt, /do not ask the broker to supply them/i);

const frontDeskPrompt = buildOutreachUserPrompt(
  source({ outreachType: "Front desk referral", goal: null, lanePatterns: [] }),
  { ...stageOptions, communicationStyle: "Natural and conversational" },
);
assert.match(frontDeskPrompt, /does not know this recipient/i);
assert.match(frontDeskPrompt, /Communication style: Natural and conversational/);
assert.match(frontDeskPrompt, /Armstrong Transport Group/);

const afterCallPrompt = buildOutreachUserPrompt(
  source({ outreachType: "After-call thank-you", goal: null }),
  stageOptions,
);
assert.match(afterCallPrompt, /Do not turn this into a request for a lane/);

const automaticPrompt = buildOutreachUserPrompt(
  source({ outreachType: "Automatic / next best follow-up", goal: null, lanePatterns: [] }),
  stageOptions,
);
assert.match(automaticPrompt, /single next reasonable email/);
assert.match(automaticPrompt, /Do not require a lane/);

const varied = compactOutreachContext(
  source({
    commercialTimeline: [
      {
        kind: "activity",
        status: "email",
        title: "Thank you",
        notes: "Thank you for the call yesterday.",
        occurredAt: "2026-11-01",
        contactName: null,
      },
      {
        kind: "activity",
        status: "email",
        title: "Quote",
        notes: "Sent the recorded quote and asked whether it still works.",
        occurredAt: "2026-11-08",
        contactName: null,
      },
      {
        kind: "activity",
        status: "note",
        title: "Admin",
        notes:
          "Completed follow-up ID 8f52c294-d3aa-4c80-a037-da8784f2972\nBroker: camilo@armstrongtransport.com\nHellen asked for a future email.",
        occurredAt: "2026-11-17",
        contactName: "Hellen",
      },
    ],
  }),
);
assert.equal(varied.followUpSequence.priorTouchCount, 3);
assert.ok(varied.followUpSequence.anglesAlreadyUsed.includes("thank-or-recap-a-call"));
assert.ok(varied.followUpSequence.anglesAlreadyUsed.includes("quote-or-mentioned-need"));
assert.notEqual(varied.followUpSequence.nextAngle, "thank-or-recap-a-call");
assert.notEqual(varied.followUpSequence.nextAngle, "quote-or-mentioned-need");
const adminNotes = varied.commercialTimeline.find((item) => item.title === "Admin")?.notes ?? "";
assert.match(adminNotes, /future email/);
assert.doesNotMatch(adminNotes, /8f52c294/);
assert.doesNotMatch(adminNotes, /camilo@/);

console.log("outreach prompt checks passed");
