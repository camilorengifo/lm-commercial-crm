import assert from "node:assert/strict";
import { buildLanePatterns } from "./laneIntelligence";
import { sanitizeMarketFindings } from "./marketResearchRules";

const patterns = buildLanePatterns([
  {
    origin: "McAllen, TX",
    destination: "Bronx, NY",
    equipmentType: "Reefer",
    commodity: "Produce",
    status: "quoted",
    frequency: "Weekly",
    estimatedLoadsPerWeek: 3,
    targetRate: 4200,
    quotedRate: 4500,
    createdAt: "2026-09-01",
    updatedAt: "2026-10-02",
    notes: null,
  },
  {
    origin: "McAllen, TX",
    destination: "Bronx, NY",
    equipmentType: "Reefer",
    commodity: "Avocados",
    status: "lost",
    frequency: null,
    estimatedLoadsPerWeek: null,
    targetRate: null,
    quotedRate: 4700,
    createdAt: "2026-10-20",
    updatedAt: "2026-10-28",
    notes: null,
  },
  {
    origin: null,
    destination: null,
    equipmentType: "Van",
    commodity: null,
    status: "prospecting",
    frequency: null,
    estimatedLoadsPerWeek: null,
    targetRate: null,
    quotedRate: null,
    createdAt: null,
    updatedAt: null,
    notes: null,
  },
]);

assert.equal(patterns.length, 1);
assert.equal(patterns[0]?.repeatedLane, true);
assert.equal(patterns[0]?.quoteCount, 2);
assert.deepEqual(patterns[0]?.commodities, ["Produce", "Avocados"]);
assert.equal(patterns[0]?.closedWithoutAward, true);
assert.deepEqual(patterns[0]?.historicalQuotedRates, [4500, 4700]);

const searchedAt = "2026-11-04T12:00:00.000Z";

const droppedRate = sanitizeMarketFindings(
  {
    findings: [
      {
        insight: "Reefer rates are rising to $4.10 per mile out of McAllen.",
        sourceName: "Example Blog",
        sourceUrl: "https://example.com/rates",
        publishedAt: "2026-11-01",
        relevance: "McAllen to Bronx reefer",
      },
    ],
    limitation: "",
  },
  [],
  searchedAt,
);

assert.equal(droppedRate.findings.length, 0);
assert.equal(droppedRate.status, "unavailable");

const kept = sanitizeMarketFindings(
  {
    findings: [
      {
        insight:
          "USDA reported active avocado crossings at Pharr, Texas during the latest weekly fruit and vegetable shipment summary.",
        sourceName: "USDA AMS",
        sourceUrl: "https://www.ams.usda.gov/mnreports/example.pdf",
        publishedAt: "2026-10-20",
        relevance: "McAllen, TX produce shipments",
      },
    ],
    limitation: "",
  },
  [],
  searchedAt,
);

assert.equal(kept.findings.length, 1);
assert.equal(kept.findings[0]?.scope, "verified");
assert.equal(kept.status, "completed");

const stale = sanitizeMarketFindings(
  {
    findings: [
      {
        insight: "A USDA shipment report listed South Texas produce movement.",
        sourceName: "USDA AMS",
        sourceUrl: "https://www.ams.usda.gov/mnreports/old.pdf",
        publishedAt: "2025-01-01",
        relevance: "McAllen produce",
      },
    ],
    limitation: "",
  },
  [],
  searchedAt,
);

assert.equal(stale.findings[0]?.scope, "observation");

console.log("lane and market sanitizer checks passed");
