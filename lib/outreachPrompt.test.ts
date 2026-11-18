import assert from "node:assert/strict";
import {
  ACCOUNT_OUTREACH_QUICK_SYSTEM_PROMPT,
  buildAccountOutreachQuickUserPrompt,
  buildOutreachUserPrompt,
  normalizeOutreachDraft,
  OUTREACH_SYSTEM_PROMPT,
  OUTREACH_TYPES,
  resolveOutreachType,
} from "./aiPrompts.ts";
import { POST_PRESENTATION_THANK_YOU } from "./postPresentationEmail.ts";
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

assert.match(OUTREACH_SYSTEM_PROMPT, /senior Business Development Director/);
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

console.log("outreach prompt checks passed");
