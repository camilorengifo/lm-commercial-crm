import assert from "node:assert/strict";
import {
  decideAfterSlowReassignment,
  deletionAllowedAfterReassignment,
  EMPTY_REASSIGNMENT_COUNTS,
  formatCrmRemovalMessage,
  mandatoryOwnershipRemaining,
  parseReassignmentCounts,
  formatOwnershipBlockMessage,
  STILL_OWNS_CRM_RECORDS_MESSAGE,
  USER_READY_FOR_PERMANENT_DELETION_MESSAGE,
  type CrmReassignmentCounts,
} from "./crmOwnership";

function counts(partial: Partial<CrmReassignmentCounts>): CrmReassignmentCounts {
  return { ...EMPTY_REASSIGNMENT_COUNTS, ...partial };
}

const camilo = counts({});

assert.equal(deletionAllowedAfterReassignment(camilo), true);
assert.equal(
  deletionAllowedAfterReassignment(counts({ companies: 2, contacts: 1 })),
  false,
);
assert.equal(mandatoryOwnershipRemaining(counts({ activities: 4 })), 4);
assert.equal(
  mandatoryOwnershipRemaining(counts({ brokerReminderLogs: 9, userCarriers: 2 })),
  0,
);

const waiting = decideAfterSlowReassignment({
  inProgress: true,
  counts: counts({ companies: 10 }),
  accountDeleted: false,
});
assert.equal(waiting.action, "wait");
assert.equal(waiting.autoRetry, false);

const retry = decideAfterSlowReassignment({
  inProgress: false,
  counts: counts({ contacts: 2 }),
  accountDeleted: false,
});
assert.equal(retry.action, "retry-allowed");
assert.equal(retry.autoRetry, false);
assert.match(retry.message, /2 required CRM records/);

const done = decideAfterSlowReassignment({
  inProgress: false,
  counts: camilo,
  accountDeleted: false,
});
assert.equal(done.action, "complete");
assert.equal(done.autoRetry, false);
assert.match(done.message, /still active/);

const deleted = decideAfterSlowReassignment({
  inProgress: false,
  counts: counts({ companies: 3 }),
  accountDeleted: true,
});
assert.equal(deleted.action, "complete");
assert.equal(deleted.autoRetry, false);

const summary = formatCrmRemovalMessage({
  counts: counts({
    companies: 1,
    contacts: 2,
    activities: 0,
    followUps: 1,
    loadOpportunities: 0,
  }),
  accountDeleted: false,
  destinationName: "Camilo Rengifo",
});
assert.match(summary, /1 company/);
assert.match(summary, /2 contacts/);
assert.match(summary, /Camilo Rengifo/);
assert.match(summary, /still active/);

const deletedSummary = formatCrmRemovalMessage({
  counts: counts({ companies: 3 }),
  accountDeleted: true,
  destinationName: "Camilo Rengifo",
});
assert.match(deletedSummary, /was deleted/);

assert.equal(parseReassignmentCounts(null), null);
assert.equal(parseReassignmentCounts({ companies: -1 }), null);
assert.deepEqual(
  parseReassignmentCounts({ ...EMPTY_REASSIGNMENT_COUNTS, companies: 4 }),
  counts({ companies: 4 }),
);
assert.equal(
  STILL_OWNS_CRM_RECORDS_MESSAGE,
  "This user still owns CRM records. Please reassign all records before deleting.",
);
assert.equal(
  USER_READY_FOR_PERMANENT_DELETION_MESSAGE,
  "All CRM records have been reassigned. This user can now be permanently deleted.",
);
assert.equal(
  formatOwnershipBlockMessage(counts({ brokerReminderLogs: 94 })),
  STILL_OWNS_CRM_RECORDS_MESSAGE,
);
assert.match(
  formatOwnershipBlockMessage(
    counts({ companies: 3, contacts: 2, activities: 5, followUps: 5 }),
  ),
  /Still assigned: 3 companies, 2 contacts, 5 activities, 5 follow-ups\./,
);

console.log("crm ownership checks passed");
