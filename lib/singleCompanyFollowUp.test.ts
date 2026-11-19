import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planSinglePendingFollowUp } from "./singleCompanyFollowUp.ts";

const older = {
  id: "11111111-1111-4111-8111-111111111111",
  companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  dueAt: "2026-11-10T14:00:00.000Z",
  createdAt: "2026-11-01T14:00:00.000Z",
};
const newer = {
  id: "22222222-2222-4222-8222-222222222222",
  companyId: older.companyId,
  dueAt: "2026-11-12T14:00:00.000Z",
  createdAt: "2026-11-02T14:00:00.000Z",
};
const requested = "2026-11-26T16:00:00.000Z";

const scheduled = planSinglePendingFollowUp({
  pending: [older, newer],
  requestedDueAt: requested,
});
assert.equal(scheduled.keepId, newer.id);
assert.equal(scheduled.dueAt, requested);
assert.deepEqual(scheduled.cancelIds, [older.id]);

const explicit = "2026-11-18T14:18:00.000Z";
const matching = { ...older, dueAt: explicit };
const respected = planSinglePendingFollowUp({
  pending: [matching, newer],
  explicitDueAt: explicit,
});
assert.equal(respected.keepId, matching.id);
assert.equal(respected.dueAt, explicit);
assert.deepEqual(respected.cancelIds, [newer.id]);

const moved = planSinglePendingFollowUp({
  pending: [older, newer],
  explicitDueAt: requested,
});
assert.equal(moved.keepId, newer.id);
assert.equal(moved.dueAt, requested);
assert.deepEqual(moved.cancelIds, [older.id]);

const retry = planSinglePendingFollowUp({
  pending: [older, newer],
  preferId: older.id,
  explicitDueAt: requested,
});
assert.equal(retry.keepId, older.id);
assert.equal(retry.dueAt, older.dueAt);
assert.deepEqual(retry.cancelIds, [newer.id]);

const only = planSinglePendingFollowUp({ pending: [older] });
assert.equal(only.keepId, older.id);
assert.deepEqual(only.cancelIds, []);

const migration = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../supabase/migrations/046_one_pending_follow_up_per_company.sql",
  ),
  "utf8",
);
assert.match(migration, /follow_ups_one_pending_per_company_idx/);
assert.match(migration, /activities_one_follow_up_outcome_idx/);
assert.match(migration, /SET status = 'cancelled'/);
assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.follow_ups/i);

console.log("singleCompanyFollowUp tests passed");
