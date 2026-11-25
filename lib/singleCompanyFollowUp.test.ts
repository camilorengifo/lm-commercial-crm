import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planCompanyFollowUpCompletion,
  planSinglePendingFollowUp,
} from "./singleCompanyFollowUp.ts";

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
const companyId = older.companyId;
const otherCompanyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const overdueId = "33333333-3333-4333-8333-333333333333";
const todayId = "44444444-4444-4444-8444-444444444444";
const otherCompanyFollowUpId = "55555555-5555-4555-8555-555555555555";
const nextId = "66666666-6666-4666-8666-666666666666";
const requestedDueAt = "2026-12-02T16:31:00.000Z";
const completedAt = "2026-11-25T16:31:00.000Z";

const freshCycle = planCompanyFollowUpCompletion({
  companyId,
  target: {
    id: overdueId,
    companyId,
    status: "completed",
    completedAt,
  },
  pending: [
    {
      id: todayId,
      companyId,
      dueAt: "2026-11-25T15:00:00.000Z",
      createdAt: "2026-11-20T15:00:00.000Z",
      sourceFollowUpId: overdueId,
    },
    {
      id: otherCompanyFollowUpId,
      companyId: otherCompanyId,
      dueAt: "2026-11-25T15:00:00.000Z",
      createdAt: "2026-11-20T15:00:00.000Z",
      sourceFollowUpId: null,
    },
  ],
  requestedDueAt,
  activityExists: false,
});

assert.equal(freshCycle.ok, true);
assert.equal(freshCycle.completeTarget, false);
assert.equal(freshCycle.createSuccessor, true);
assert.equal(freshCycle.keepSuccessorId, null);
assert.equal(freshCycle.dueAt, requestedDueAt);
assert.deepEqual(freshCycle.cancelIds, [todayId]);
assert.equal(freshCycle.recordActivity, true);

const openCycle = planCompanyFollowUpCompletion({
  companyId,
  target: {
    id: overdueId,
    companyId,
    status: "pending",
    completedAt: null,
  },
  pending: [
    {
      id: overdueId,
      companyId,
      dueAt: "2026-11-18T16:00:00.000Z",
      createdAt: "2026-11-01T16:00:00.000Z",
      sourceFollowUpId: null,
    },
    {
      id: todayId,
      companyId,
      dueAt: "2026-11-25T15:00:00.000Z",
      createdAt: "2026-11-20T15:00:00.000Z",
      sourceFollowUpId: overdueId,
    },
  ],
  requestedDueAt,
  activityExists: false,
});

assert.equal(openCycle.createSuccessor, true);
assert.equal(openCycle.keepSuccessorId, null);
assert.deepEqual(openCycle.cancelIds, [todayId]);
assert.equal(openCycle.recordActivity, true);

const retryCycle = planCompanyFollowUpCompletion({
  companyId,
  target: {
    id: overdueId,
    companyId,
    status: "completed",
    completedAt,
  },
  pending: [
    {
      id: nextId,
      companyId,
      dueAt: requestedDueAt,
      createdAt: "2026-11-25T16:31:02.000Z",
      sourceFollowUpId: overdueId,
    },
    {
      id: todayId,
      companyId,
      dueAt: "2026-11-25T15:00:00.000Z",
      createdAt: "2026-11-20T15:00:00.000Z",
      sourceFollowUpId: null,
    },
  ],
  requestedDueAt: "2026-12-02T16:31:08.000Z",
  activityExists: true,
  activityScheduledDueAt: requestedDueAt,
});

assert.equal(retryCycle.createSuccessor, false);
assert.equal(retryCycle.keepSuccessorId, nextId);
assert.equal(retryCycle.dueAt, requestedDueAt);
assert.deepEqual(retryCycle.cancelIds, [todayId]);
assert.equal(retryCycle.recordActivity, false);

const staleActivity = planCompanyFollowUpCompletion({
  companyId,
  target: {
    id: overdueId,
    companyId,
    status: "completed",
    completedAt,
  },
  pending: [
    {
      id: todayId,
      companyId,
      dueAt: "2026-11-25T15:00:00.000Z",
      createdAt: "2026-11-20T15:00:00.000Z",
      sourceFollowUpId: overdueId,
    },
  ],
  requestedDueAt,
  activityExists: true,
  activityScheduledDueAt: "2026-11-25T15:00:00.000Z",
});

assert.equal(staleActivity.createSuccessor, true);
assert.equal(staleActivity.keepSuccessorId, null);
assert.deepEqual(staleActivity.cancelIds, [todayId]);
assert.equal(staleActivity.recordActivity, false);

assert.match(migration, /follow_ups_one_pending_per_company_idx/);
assert.match(migration, /activities_one_follow_up_outcome_idx/);
assert.match(migration, /SET status = 'cancelled'/);
assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.follow_ups/i);

console.log("singleCompanyFollowUp tests passed");
