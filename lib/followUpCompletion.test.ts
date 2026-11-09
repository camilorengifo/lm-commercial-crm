import assert from "node:assert/strict";
import { isPendingFollowUpStatus } from "./followUpClassification";
import {
  addCalendarDaysPreservingLocalTime,
  automaticNextFollowUpDueAt,
  isFutureDueAt,
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

console.log("followUpCompletion tests passed");
