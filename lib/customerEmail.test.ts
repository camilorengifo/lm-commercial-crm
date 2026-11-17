import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CUSTOMER_FACING_COMPANY } from "./customerBrand.ts";
import {
  chooseOutreachDraft,
  countWords,
  emailCopyText,
  presentCustomerEmail,
  resolveOutreachLanguage,
  shouldRewriteOutreachDraft,
} from "./customerEmail.ts";
import {
  buildMarketAssessment,
  classifyMarketDirection,
  selectEmailGuidance,
  stripMarketStatistics,
} from "./freightMarket/assess.ts";
import { parseEiaDiesel, parseNoaaAlerts } from "./freightMarket/publicSources.ts";
import { rankLanesForOutreach } from "./laneIntelligence.ts";
import { sanitizeMarketFindings } from "./marketResearchRules.ts";
import type { LanePattern } from "./laneIntelligence.ts";
import type { MarketFinding } from "./marketResearchRules.ts";

const lane: LanePattern = {
  origin: "McAllen, TX",
  destination: "Bronx, NY",
  equipmentType: "Reefer",
  commodities: ["Produce"],
  frequencies: ["Weekly"],
  statuses: ["quoted"],
  quoteCount: 2,
  historicalQuotedRates: [],
  historicalTargetRates: [],
  firstRecordedAt: "2026-10-02",
  lastRecordedAt: "2026-11-12",
  repeatedLane: true,
  openStatuses: ["quoted"],
  closedWithoutAward: false,
};

const scenarios = [
  ["Reefer capacity", "Hi John,\n\nWe've been seeing tighter reefer capacity around South Texas this week. Are you expecting any additional produce shipments out of McAllen?\n\nHappy to help with any upcoming loads."],
  ["Shipping opportunities", "Hi John,\n\nWe've been seeing some additional truck availability in your region lately.\n\nAre you planning any upcoming shipments where we could help with capacity or pricing?"],
  ["Upcoming produce", "Hi John,\n\nWith produce movement picking up in the region, I wanted to check whether you have any additional shipments coming up.\n\nAnything we can help you cover this week?"],
  ["McAllen to Bronx", "Hi Maria,\n\nAre you still moving avocados from McAllen to the Bronx on reefer equipment?\n\nDo you have anything we can help cover this week?"],
  ["Quote follow-up", "Hi Maria,\n\nI wanted to see what happened with the McAllen to Bronx reefer quote we sent in October.\n\nAre you still reviewing that lane?"],
  ["Quiet account", "Hi John,\n\nIt has been a few weeks since we last spoke about your Bronx produce loads.\n\nDo you have any shipments coming up that we should look at?"],
  ["Dry van", "Hi John,\n\nAre you moving any dry van freight out of Dallas this week?\n\nHappy to take a look if something is coming up."],
  ["Flatbed", "Hi John,\n\nDo you have any flatbed freight scheduled out of Houston?\n\nWe can help cover a load if the timing works."],
  ["Call offer", "Hi John,\n\nDo you have ten minutes this week to talk through the McAllen reefer lane?\n\nI can work around your schedule."],
  ["Friendly", "Hi John,\n\nHope your harvest week is going smoothly. Are any extra produce loads coming off the McAllen dock?\n\nSend them over if you want help covering them."],
  ["Direct", "Hi John,\n\nDo you have produce moving from McAllen to the Bronx this week?\n\nIf you do, I can work on coverage."],
  ["Professional", "Hi Maria,\n\nI am checking whether Valley Produce still needs reefer coverage from McAllen to the Bronx.\n\nWould you like us to review the next shipment?"],
  ["No name", "Hello,\n\nAre you planning any reefer shipments from South Texas this week?\n\nWe can help with coverage if a load is ready."],
  ["Spanish produce", "Hola María,\n\n¿Tienes embarques de producto saliendo de McAllen hacia el Bronx esta semana?\n\nCon gusto revisamos la cobertura en reefer."],
  ["Spanish capacity", "Hola Juan,\n\nEsta semana hay menos equipo reefer disponible en el sur de Texas.\n\n¿Esperas cargas adicionales de producto desde McAllen?"],
  ["Spanish quote", "Hola María,\n\nQuería saber cómo quedó la cotización de reefer de McAllen al Bronx que revisamos en octubre.\n\n¿Sigues viendo ese carril esta semana?"],
  ["Spanish reconnect", "Hola Juan,\n\nHace algunas semanas hablamos de tus embarques al Bronx.\n\n¿Tienes algo en movimiento esta semana?"],
  ["Spanish direct", "Hola Juan,\n\n¿Hay producto saliendo de McAllen esta semana?\n\nSi lo hay, lo podemos revisar hoy."],
  ["Spanish friendly", "Hola María,\n\n¿Cómo va la semana de cosecha? Si sale alguna carga extra de McAllen, la podemos revisar.\n\n¿Tienes algo programado?"],
  ["Spanish van", "Hola Juan,\n\n¿Tienes cargas de dry van saliendo de Dallas?\n\nAvísame si quieres que revisemos alguna."],
] as const;

assert.equal(scenarios.length, 20);
assert.equal(resolveOutreachLanguage("en"), "en");
assert.equal(resolveOutreachLanguage("es"), "es");
assert.equal(resolveOutreachLanguage("English"), "en");
assert.equal(resolveOutreachLanguage("Español"), "es");
assert.equal(resolveOutreachLanguage("fr"), null);

for (const [index, [subject, body]] of scenarios.entries()) {
  const language = index >= 13 ? "es" : "en";
  const presented = presentCustomerEmail(
    {
      subject,
      body: `${body}\n\nI hope this email finds you well.\nLogistics Masters`,
      signature: "Logistics Masters",
      commercialSummary: "This should never be shown.",
      clarificationQuestion: null,
    },
    language,
  );
  assert.equal(presented.signature, CUSTOMER_FACING_COMPANY);
  assert.equal(presented.clarificationQuestion, null);
  assert.equal(Object.keys(presented).sort().join(), "body,clarificationQuestion,signature,subject");
  const copy = emailCopyText(presented);
  assert.doesNotMatch(copy, /Logistics Masters/i);
  assert.doesNotMatch(copy, /Commercial Objective|Market Intelligence|AI Recommendations|commercialSummary/i);
  assert.doesNotMatch(copy, /I hope this email finds you well/i);
  assert.match(copy, new RegExp(CUSTOMER_FACING_COMPANY));
  assert.match(copy, /^Subject:/);
  if (language === "en") assert.match(presented.body, /Best,/);
  if (language === "es") {
    assert.match(presented.body, /Saludos,/);
    assert.doesNotMatch(presented.body, /\nBest,/);
  }
  assert.ok(countWords(presented.body) >= 12, `scenario ${index} was too short`);
  assert.ok(countWords(presented.body) <= 160, `scenario ${index} was too long`);
}

const question = presentCustomerEmail(
  {
    subject: "Equipment",
    body: "",
    clarificationQuestion: "What equipment type should this email use?",
  },
  "en",
);
assert.equal(question.clarificationQuestion, null);
assert.equal(question.body, "");
assert.equal(emailCopyText(question), "");
assert.doesNotMatch(emailCopyText(question), /equipment type/i);

const kept = presentCustomerEmail(
  {
    subject: "Following our conversation",
    body: "Hellen, thank you for the time last week. I understand A Martinez Produce is in a good spot with its current transportation provider, and I will not crowd that relationship. I will stay available if anything changes on your end, and I would like to keep the conversation open for later in the season. Would it be useful if I checked back in a few months, or is there a better time for you? I appreciate the straightforward update.",
    clarificationQuestion: "What equipment type should I ask for?",
  },
  "en",
);
assert.equal(kept.clarificationQuestion, null);
assert.match(kept.body, /current transportation provider/);
assert.match(kept.body, /Best,/);
assert.ok(countWords(kept.body) >= 60);
assert.ok(countWords(kept.body) <= 150);
assert.equal(shouldRewriteOutreachDraft(kept), false);
assert.equal(
  shouldRewriteOutreachDraft({
    ...kept,
    body: "Hi Hellen, do you have a minute?",
  }),
  true,
);
assert.equal(
  shouldRewriteOutreachDraft({
    ...kept,
    body: `${kept.body}\n\nWhat equipment type should we plan for?`,
  }),
  true,
);
const rewritten = chooseOutreachDraft(
  { ...kept, body: "Too short." },
  kept,
);
assert.equal(rewritten, kept);

const searchedAt = "2026-11-17T12:00:00.000Z";
const verifiedTight: MarketFinding = {
  insight: "Reefer capacity has been tighter across South Texas this week.",
  sourceName: "DAT Trendlines",
  sourceUrl: "https://www.dat.com/trendlines/reefer",
  publishedAt: "2026-11-16",
  scope: "verified",
  relevance: "South Texas reefer capacity",
  sourceType: "spot_rates",
};

const sanitized = sanitizeMarketFindings(
  { findings: [verifiedTight], limitation: "" },
  [{ url: "https://www.dat.com/trendlines/reefer", title: "DAT" }],
  searchedAt,
);
assert.equal(sanitized.findings[0]?.scope, "verified");
assert.equal(sanitized.findings[0]?.sourceType, "spot_rates");
assert.notEqual(sanitized.findings[0]?.publishedAt, sanitized.findings[0]?.retrievedAt);

const aged = sanitizeMarketFindings(
  {
    findings: [
      {
        ...verifiedTight,
        publishedAt: "2026-10-20",
        insight: "A USDA shipment report listed South Texas produce movement.",
        sourceUrl: "https://www.ams.usda.gov/mnreports/older.pdf",
        sourceName: "USDA AMS",
      },
    ],
  },
  [],
  searchedAt,
);
assert.equal(aged.findings[0]?.scope, "observation");

const invented = sanitizeMarketFindings(
  {
    findings: [
      {
        insight: "The McAllen to Bronx reefer lane is paying $4.10 per mile.",
        sourceName: "Example",
        sourceUrl: "https://example.com/rates",
        publishedAt: "2026-11-16",
        relevance: "McAllen to Bronx",
      },
    ],
  },
  [],
  searchedAt,
);
assert.equal(invented.findings.length, 0);

const guidance = selectEmailGuidance([verifiedTight], lane, "firming");
assert.equal(guidance.length, 1);
assert.doesNotMatch(guidance[0] ?? "", /\$|DAT|https?:|per mile|load-to-truck/i);

const rated = selectEmailGuidance(
  [
    {
      ...verifiedTight,
      insight: "DAT Trendlines showed South Texas reefer spot rates at $2.40 per mile, with tighter capacity.",
    },
  ],
  lane,
  "firming",
);
assert.doesNotMatch(rated.join(" "), /\$|2\.40|DAT|per mile/);

const national = selectEmailGuidance(
  [
    {
      insight: "National reefer rates were firmer this week.",
      sourceName: "DAT",
      sourceUrl: "https://www.dat.com/trendlines/national",
      publishedAt: "2026-11-16",
      scope: "verified",
      relevance: "United States national spot market",
      sourceType: "spot_rates",
    },
  ],
  lane,
  "firming",
);
assert.deepEqual(national, []);

const mixed = classifyMarketDirection([
  verifiedTight,
  {
    ...verifiedTight,
    insight: "Reefer capacity is softer across South Texas this week.",
    relevance: "South Texas reefer",
  },
]);
assert.equal(mixed.direction, "mixed");
assert.equal(selectEmailGuidance([verifiedTight], lane, "mixed").length, 0);

const assessment = buildMarketAssessment({
  lane,
  now: new Date("2026-11-17T12:00:00.000Z"),
  research: {
    status: "completed",
    findings: [verifiedTight],
    limitation: null,
    searchedAt,
  },
});
assert.equal(assessment.direction, "firming");
assert.equal(assessment.origin, "McAllen, TX");
assert.equal(assessment.equipment, "Reefer");
assert.ok(assessment.periodStart <= "2026-11-17");
assert.doesNotMatch(
  stripMarketStatistics("Rates rose 8% to $3.50 per mile."),
  /\$|8%|3\.50|per mile/,
);

const alerts = parseNoaaAlerts(
  {
    features: [
      {
        properties: {
          event: "Flood Warning",
          headline: "Flood Warning for Hidalgo County through Wednesday.",
          sent: "2026-11-17T08:00:00-06:00",
          areaDesc: "Hidalgo, TX",
          id: "https://api.weather.gov/alerts/example",
        },
      },
      {
        properties: {
          event: "Heat Advisory",
          headline: "Heat Advisory",
          sent: "2026-11-17T08:00:00-06:00",
        },
      },
    ],
  },
  "TX",
  searchedAt,
);
assert.equal(alerts.length, 1);
assert.match(alerts[0]?.sourceUrl ?? "", /weather\.gov/);

const diesel = parseEiaDiesel(
  {
    response: {
      data: [
        { period: "2026-11-16", value: 3.689, "area-name": "U.S." },
        { period: "2026-11-09", value: 3.64, "area-name": "U.S." },
      ],
    },
  },
  searchedAt,
);
assert.equal(diesel[0]?.sourceType, "diesel");
assert.match(diesel[0]?.sourceUrl ?? "", /eia\.gov/);
assert.equal(
  selectEmailGuidance(diesel, lane, "insufficient_data").length,
  0,
);

const ranked = rankLanesForOutreach([
  { ...lane, origin: "Dallas, TX", quoteCount: 5, lastRecordedAt: "2026-09-01" },
  lane,
]);
assert.equal(ranked[0]?.origin, "McAllen, TX");

const here = import.meta.dirname;
const assistant = readFileSync(
  join(here, "../components/ai-outreach-assistant-section.tsx"),
  "utf8",
);
const route = readFileSync(join(here, "../app/api/ai/outreach/route.ts"), "utf8");
const sql = readFileSync(
  join(here, "../supabase/migrations/046_market_research_reports.sql"),
  "utf8",
);
assert.match(assistant, />\s*Language\s*</);
assert.match(assistant, /language: current\.language/);
assert.match(assistant, /language: "en"/);
assert.doesNotMatch(assistant, /Outreach Language/);
assert.match(assistant, /Enable Market Research/);
assert.match(assistant, /Commercial Timeline/);
assert.doesNotMatch(assistant, /Equipment type|Transportation mode/);
assert.doesNotMatch(assistant, /draft\.clarificationQuestion/);
assert.match(assistant, /CUSTOMER_FACING_COMPANY/);
assert.match(assistant, /does not send email/i);
assert.doesNotMatch(
  assistant,
  /Commercial Intelligence Summary|Market insights|Commercial Recommendation|Subject alternatives|AI Recommendations/,
);
assert.doesNotMatch(route, /commercialSummary|marketInsight|fullDraft|intelligence/);
assert.match(route, /emailGuidance/);
assert.match(route, /getOutreachModel/);
assert.doesNotMatch(route, /resend|chat\.completions/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /user_owns_active_company/);
assert.match(sql, /market_research_sources/);
assert.doesNotMatch(sql, /FOR UPDATE|FOR DELETE/);

console.log("customer email and market intelligence checks passed");
