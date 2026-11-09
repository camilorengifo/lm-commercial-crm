import assert from "node:assert/strict";
import {
  businessCalendarDate,
  getFollowUpBucket,
  isPendingFollowUpStatus,
} from "./followUpClassification";
import {
  addCalendarDaysPreservingLocalTime,
  automaticNextFollowUpDueAt,
  followUpCompletionPatch,
  isFutureDueAt,
  planMarkCompleteFollowUp,
} from "./followUpScheduling";

assert.equal(isPendingFollowUpStatus("pending"), true);
assert.equal(isPendingFollowUpStatus("completed"), false);
assert.equal(isPendingFollowUpStatus("cancelled"), false);
assert.equal(isPendingFollowUpStatus("do_not_follow_up"), false);
assert.equal(isPendingFollowUpStatus(null), false);

const reference = new Date("2026-11-09T15:00:00.000Z");
const recentDue = "2026-11-08T15:00:00.000Z";
const recentNext = addCalendarDaysPreservingLocalTime(recentDue, 7);
assert.equal(isFutureDueAt(recentNext, reference), true);
assert.equal(automaticNextFollowUpDueAt(recentDue, reference), recentNext);

const oldDue = "2026-07-01T15:00:00.000Z";
const oldPlusWeek = addCalendarDaysPreservingLocalTime(oldDue, 7);
assert.equal(isFutureDueAt(oldPlusWeek, reference), false);
const repaired = automaticNextFollowUpDueAt(oldDue, reference);
assert.equal(isFutureDueAt(repaired, reference), true);
assert.notEqual(repaired, oldPlusWeek);

const original = new Date(oldDue);
const next = new Date(repaired);
assert.equal(next.getHours(), original.getHours());
assert.equal(next.getMinutes(), original.getMinutes());

const fedenicoDueAt = "2026-10-06T15:00:00.000Z";
const completedOnNovember9 = "2026-11-09T14:23:00.000Z";
const markComplete = planMarkCompleteFollowUp({
  originalDueAt: fedenicoDueAt,
  completedAt: completedOnNovember9,
});

assert.equal(markComplete.completedStatus, "completed");
assert.equal(markComplete.nextStatus, "pending");
assert.equal(markComplete.originalDueAt, fedenicoDueAt);
assert.equal(businessCalendarDate(markComplete.originalDueAt), "2026-10-06");
assert.equal(businessCalendarDate(completedOnNovember9), "2026-11-09");
assert.equal(businessCalendarDate(markComplete.nextDueAt), "2026-11-16");
assert.notEqual(
  markComplete.nextDueAt,
  addCalendarDaysPreservingLocalTime(fedenicoDueAt, 7),
);
assert.equal(
  getFollowUpBucket(markComplete.originalDueAt, new Date(completedOnNovember9)),
  "overdue",
);
assert.equal(
  getFollowUpBucket(markComplete.nextDueAt, new Date(completedOnNovember9)),
  "upcoming",
);

const completionPatch = followUpCompletionPatch(completedOnNovember9);
assert.equal(completionPatch.status, "completed");
assert.equal(completionPatch.completed_at, completedOnNovember9);
assert.equal(Object.hasOwn(completionPatch, "due_at"), false);

console.log("followUpCompletion tests passed");
