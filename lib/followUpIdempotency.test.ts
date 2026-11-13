import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { countFollowUpActivitiesByCompany } from "./followUpActivityCount.ts";
import {
  activityCreationKey,
  completionActivityCreationKey,
  createActivityLedger,
  createFollowUpLedger,
  followUpCreationKey,
  groupSuspectedAccidentalDuplicates,
  isMissingColumnError,
  isUniqueViolation,
} from "./followUpIdempotency.ts";
import { createSingleFlightGate } from "./singleFlight.ts";

const here = dirname(fileURLToPath(import.meta.url));
const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const brokerA = "55555555-5555-4555-8555-555555555555";
const brokerB = "66666666-6666-4666-8666-666666666666";
const requestA = "11111111-1111-4111-8111-111111111111";
const requestB = "22222222-2222-4222-8222-222222222222";
const requestC = "33333333-3333-4333-8333-333333333333";
const sourceId = "44444444-4444-4444-8444-444444444444";
const dueMonday = "2026-12-07T15:00:00.000Z";
const dueWednesday = "2026-12-09T15:00:00.000Z";

const oneSave = createFollowUpLedger();
const created = oneSave.insert({
  companyId,
  userId: brokerA,
  dueAt: dueMonday,
  title: "Call follow-up",
  clientRequestId: requestA,
});
assert.equal(created.created, true);
assert.equal(oneSave.rows.length, 1);

const gate = createSingleFlightGate();
const doubleClick = createFollowUpLedger();
const firstClick = gate.tryBegin("company-log:call:2026-12-07");
const secondClick = gate.tryBegin("company-log:call:2026-12-07");
assert.equal(firstClick.ok, true);
assert.equal(secondClick.ok, false);
if (firstClick.ok) {
  doubleClick.insert({
    companyId,
    userId: brokerA,
    dueAt: dueMonday,
    title: "Call follow-up",
    clientRequestId: firstClick.clientRequestId,
  });
  doubleClick.insert({
    companyId,
    userId: brokerA,
    dueAt: dueMonday,
    title: "Call follow-up",
    clientRequestId: firstClick.clientRequestId,
  });
}
assert.equal(doubleClick.rows.length, 1);

gate.finish("rejected");
const retry = gate.tryBegin("company-log:call:2026-12-07");
assert.equal(retry.ok, true);
if (firstClick.ok && retry.ok) {
  assert.equal(retry.clientRequestId, firstClick.clientRequestId);
  doubleClick.insert({
    companyId,
    userId: brokerA,
    dueAt: dueMonday,
    title: "Call follow-up",
    clientRequestId: retry.clientRequestId,
  });
}
assert.equal(doubleClick.rows.length, 1);

gate.finish("committed");
const secondSchedule = gate.tryBegin("company-log:call:2026-12-09");
assert.equal(secondSchedule.ok, true);
if (secondSchedule.ok && firstClick.ok) {
  assert.notEqual(secondSchedule.clientRequestId, firstClick.clientRequestId);
  const second = doubleClick.insert({
    companyId,
    userId: brokerA,
    dueAt: dueWednesday,
    title: "Call follow-up",
    clientRequestId: secondSchedule.clientRequestId,
  });
  assert.equal(second.created, true);
}
assert.equal(doubleClick.rows.length, 2);
assert.notEqual(doubleClick.rows[0].dueAt, doubleClick.rows[1].dueAt);

const sameRequest = createFollowUpLedger();
sameRequest.insert({
  companyId,
  userId: brokerA,
  dueAt: dueMonday,
  title: "Email follow-up",
  clientRequestId: requestA,
});
const repeated = sameRequest.insert({
  companyId,
  userId: brokerA,
  dueAt: dueMonday,
  title: "Email follow-up",
  clientRequestId: requestA,
});
assert.equal(repeated.created, false);
assert.equal(sameRequest.rows.length, 1);
assert.equal(sameRequest.rows[0].id, repeated.id);

const completion = createFollowUpLedger();
const completed = completion.insert({
  companyId,
  userId: brokerA,
  dueAt: dueWednesday,
  title: "Call follow-up",
  sourceFollowUpId: sourceId,
  clientRequestId: requestA,
});
const completedAgain = completion.insert({
  companyId,
  userId: brokerA,
  dueAt: dueWednesday,
  title: "Call follow-up",
  sourceFollowUpId: sourceId,
  clientRequestId: requestB,
});
assert.equal(completed.created, true);
assert.equal(completedAgain.created, false);
assert.equal(completedAgain.id, completed.id);
assert.equal(completion.rows.length, 1);
assert.equal(
  followUpCreationKey({
    sourceFollowUpId: sourceId,
    clientRequestId: requestA,
  }),
  `successor:${sourceId}`,
);

const noResponse = createFollowUpLedger();
noResponse.insert({
  companyId,
  userId: brokerA,
  dueAt: dueWednesday,
  title: "Call follow-up",
  sourceFollowUpId: sourceId,
  clientRequestId: requestA,
});
noResponse.insert({
  companyId,
  userId: brokerA,
  dueAt: "2026-12-16T15:00:00.000Z",
  title: "Call follow-up",
  sourceFollowUpId: sourceId,
  clientRequestId: requestC,
});
assert.equal(noResponse.rows.length, 1);
assert.equal(noResponse.rows[0].dueAt, dueWednesday);

const beforeRefresh = noResponse.rows.length;
noResponse.list();
assert.equal(noResponse.rows.length, beforeRefresh);

const brokers = createFollowUpLedger();
brokers.insert({
  companyId,
  userId: brokerA,
  dueAt: dueMonday,
  title: "Broker A follow-up",
  clientRequestId: requestA,
});
brokers.insert({
  companyId,
  userId: brokerB,
  dueAt: dueWednesday,
  title: "Broker B follow-up",
  clientRequestId: requestB,
});
assert.equal(brokers.rows.length, 2);
assert.deepEqual(
  brokers.rows.map((row) => row.userId).sort(),
  [brokerA, brokerB].sort(),
);

const activities = createActivityLedger();
const logKey = activityCreationKey({
  purpose: "log",
  clientRequestId: requestA,
});
const completionKey = completionActivityCreationKey(sourceId);
assert.equal(completionKey, completionActivityCreationKey(sourceId));
activities.insert({
  companyId,
  activityType: "call",
  subject: "Call",
  creationKey: logKey,
});
activities.insert({
  companyId,
  activityType: "call",
  subject: "Call",
  creationKey: logKey,
});
activities.insert({
  companyId,
  activityType: "call",
  subject: "Completed follow-up: Call",
  followUpId: sourceId,
  creationKey: completionKey,
});
activities.insert({
  companyId,
  activityType: "call",
  subject: "Completed follow-up: Call",
  followUpId: sourceId,
  creationKey: completionKey,
});
assert.equal(activities.rows.length, 2);
const counts = countFollowUpActivitiesByCompany(
  activities.rows.map((row) => ({
    id: row.id,
    company_id: row.companyId,
    activity_type: row.activityType,
    subject: row.subject,
    follow_up_id: row.followUpId,
  })),
);
assert.equal(counts[companyId], 2);

const suspected = groupSuspectedAccidentalDuplicates([
  {
    id: "old-1",
    companyId,
    contactId: null,
    dueAt: dueMonday,
    title: "Call follow-up",
    status: "pending",
    createdAt: "2026-11-01T15:00:00.000Z",
  },
  {
    id: "old-2",
    companyId,
    contactId: null,
    dueAt: dueMonday,
    title: "Call follow-up",
    status: "pending",
    createdAt: "2026-11-01T15:00:01.000Z",
  },
  {
    id: "legit",
    companyId,
    contactId: null,
    dueAt: dueWednesday,
    title: "Call follow-up",
    status: "pending",
    createdAt: "2026-11-01T15:00:02.000Z",
  },
]);
assert.equal(suspected.length, 1);
assert.deepEqual(
  suspected[0].map((row) => row.id),
  ["old-1", "old-2"],
);
assert.equal(
  brokers.rows.some((row) => row.id === "old-1" || row.id === "old-2"),
  false,
);

assert.equal(isUniqueViolation({ code: "23505" }), true);
assert.equal(
  isUniqueViolation({ message: "duplicate key value violates unique constraint" }),
  true,
);
assert.equal(
  isMissingColumnError(
    {
      code: "PGRST204",
      message: "Could not find the 'creation_key' column of 'follow_ups' in the schema cache",
    },
    "creation_key",
  ),
  true,
);
assert.equal(
  isMissingColumnError(
    { message: "new row violates check constraint follow_ups_creation_key_len_chk" },
    "creation_key",
  ),
  false,
);

function effectBodies(source: string): string[] {
  const bodies: string[] = [];
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const start = source.indexOf("useEffect(", searchFrom);
    if (start < 0) break;
    let depth = 0;
    let end = start + "useEffect".length;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          bodies.push(source.slice(start, end + 1));
          searchFrom = end + 1;
          break;
        }
      }
    }
    if (end >= source.length) break;
  }
  return bodies;
}

const createCall =
  /logCommercialActivity|completeFollowUpWithActivity|completeFollowUpAndScheduleNext|createFollowUp\(|createActivityNote\(/;

for (const relativePath of [
  "../components/follow-ups-page.tsx",
  "../components/company-follow-ups-section.tsx",
]) {
  const source = readFileSync(join(here, relativePath), "utf8");
  const effects = effectBodies(source);
  assert.ok(effects.length > 0, relativePath);
  for (const effect of effects) {
    assert.equal(createCall.test(effect), false, relativePath);
  }
}

const migration = readFileSync(
  join(here, "../supabase/migrations/045_follow_up_creation_idempotency.sql"),
  "utf8",
);
const migrationSql = migration
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
assert.equal(/DELETE\s+FROM/i.test(migrationSql), false);
assert.equal(/UPDATE\s+public\.follow_ups/i.test(migrationSql), false);
assert.match(migration, /follow_ups_creation_key_uidx/);
assert.match(migration, /activities_creation_key_uidx/);
assert.doesNotMatch(migration, /UNIQUE\s*\(\s*company_id/i);
