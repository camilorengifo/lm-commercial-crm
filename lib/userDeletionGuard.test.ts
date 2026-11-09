import assert from "node:assert/strict";
import {
  detachResultIsComplete,
  formatAuthDeleteBlockedMessage,
  formatHistoricalDetachError,
} from "./userDeletionGuard";

assert.equal(detachResultIsComplete(["a", "b"], ["b", "a"]), true);
assert.equal(detachResultIsComplete(["a", "b"], ["a"]), false);
assert.equal(detachResultIsComplete(["a"], []), false);

assert.match(
  formatHistoricalDetachError(
    "broker_reminder_logs",
    "user_id",
    "10 of 10 rows could not be cleared.",
  ),
  /broker_reminder_logs\.user_id/,
);
assert.match(
  formatHistoricalDetachError("broker_reminder_logs", "user_id", "permission denied"),
  /No companies, contacts, follow-ups, or activities were removed/,
);

assert.match(
  formatAuthDeleteBlockedMessage("Database error deleting user (unexpected_failure, HTTP 500)"),
  /Database error deleting user/,
);

console.log("user deletion guard checks passed");
