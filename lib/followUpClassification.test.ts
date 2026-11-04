import assert from "node:assert/strict";
import {
  bucketFollowUpsWithCompanies,
  businessCalendarDate,
  getDayBounds,
  getDaysOverdue,
  getFollowUpBucket,
  getWeekBounds,
  selectFollowUpsForAssignedCompanies,
} from "./followUpClassification";

// Wednesday, Nov 4, 2026, 8:54 AM in America/Bogota (UTC−5).
const reference = new Date("2026-11-04T13:54:39.762Z");

assert.equal(
  businessCalendarDate(reference),
  "2026-11-04",
);

// Live follow-ups the Dashboard showed as due today.
assert.equal(
  getFollowUpBucket("2026-11-04T14:37:00+00:00", reference),
  "today",
);
assert.equal(
  getFollowUpBucket("2026-11-04T14:38:00+00:00", reference),
  "today",
);
assert.equal(
  getFollowUpBucket("2026-11-04T17:19:00+00:00", reference),
  "today",
);

// UTC calendar date is still today, but Bogota is still the previous evening.
assert.equal(
  getFollowUpBucket("2026-11-04T04:59:00+00:00", reference),
  "overdue",
);
assert.equal(getDaysOverdue("2026-11-04T04:59:00+00:00", reference), 1);

// UTC calendar date is tomorrow, but Bogota is still this evening.
assert.equal(
  getFollowUpBucket("2026-11-05T04:59:59+00:00", reference),
  "today",
);

// First instant of the next business day.
assert.equal(
  getFollowUpBucket("2026-11-05T05:00:00+00:00", reference),
  "upcoming",
);

assert.equal(getFollowUpBucket("not-a-date", reference), "upcoming");
assert.equal(getDaysOverdue("2026-11-04T14:37:00+00:00", reference), 0);
assert.equal(getDaysOverdue("2026-11-02T05:00:00.000Z", reference), 2);

const day = getDayBounds(reference);
assert.equal(day.start.toISOString(), "2026-11-04T05:00:00.000Z");
assert.equal(day.end.toISOString(), "2026-11-05T04:59:59.999Z");

const week = getWeekBounds(reference);
assert.equal(week.start.toISOString(), "2026-11-02T05:00:00.000Z");
assert.equal(week.end.toISOString(), "2026-11-09T04:59:59.999Z");

const buckets = bucketFollowUpsWithCompanies(
  [
    { id: "old", due_at: "2026-07-01T15:00:00.000Z" },
    { id: "alamo", due_at: "2026-11-04T14:37:00.000Z" },
    { id: "afton", due_at: "2026-11-04T14:38:00.000Z" },
    { id: "caribbean", due_at: "2026-11-04T17:19:00.000Z" },
    { id: "later", due_at: "2026-11-10T15:00:00.000Z" },
  ],
  reference,
);

assert.deepEqual(
  buckets.today.map((row) => row.id),
  ["alamo", "afton", "caribbean"],
);
assert.deepEqual(
  buckets.overdue.map((row) => row.id),
  ["old"],
);
assert.deepEqual(
  buckets.upcoming.map((row) => row.id),
  ["later"],
);

// The Work Center used to keep only the oldest 200 pending rows before
// applying the viewer. Those rows are overdue, so due-today records disappear.
const pending = [
  ...Array.from({ length: 200 }, (_, index) => ({
    id: `overdue-${index}`,
    user_id: index < 6 ? "admin" : "other",
    due_at: "2026-10-01T15:00:00.000Z",
  })),
  {
    id: "alamo",
    user_id: "admin",
    due_at: "2026-11-04T14:37:00.000Z",
  },
];

const truncated = pending
  .slice()
  .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
  .slice(0, 200)
  .filter((row) => row.user_id === "admin");

assert.equal(
  truncated.filter((row) => getFollowUpBucket(row.due_at, reference) === "today")
    .length,
  0,
);

const fullAdminSet = pending.filter((row) => row.user_id === "admin");
assert.equal(
  fullAdminSet.filter(
    (row) => getFollowUpBucket(row.due_at, reference) === "today",
  ).length,
  1,
);

const assignedFollowUp = {
  id: "pending-1",
  company_id: "company-a",
  status: "pending",
  due_at: "2026-11-04T14:37:00.000Z",
};
const brokerA = new Set(["company-a"]);
const brokerB = new Set(["company-b"]);

assert.deepEqual(
  selectFollowUpsForAssignedCompanies([assignedFollowUp], brokerA).map(
    (row) => row.id,
  ),
  ["pending-1"],
);
assert.deepEqual(
  selectFollowUpsForAssignedCompanies([assignedFollowUp], brokerB),
  [],
);

const reassigned = selectFollowUpsForAssignedCompanies(
  [assignedFollowUp],
  new Set(["company-a"]),
);
assert.equal(reassigned.length, 1);
assert.equal(reassigned[0]?.id, assignedFollowUp.id);

console.log("followUpClassification tests passed");
