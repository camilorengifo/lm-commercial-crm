import assert from "node:assert/strict";
import {
  STATUS_CHANGE_ACTIVITY_SUBJECTS,
  companyFollowUpTimelinePath,
  countFollowUpActivitiesByCompany,
  followUpCountBadgeClass,
  followUpCountLabel,
  isCompletedFollowUpActivity,
  type FollowUpActivityCountRow,
} from "./followUpActivityCount";

function row(
  partial: Partial<FollowUpActivityCountRow> &
    Pick<FollowUpActivityCountRow, "id" | "activity_type">,
): FollowUpActivityCountRow {
  return {
    company_id: partial.company_id ?? "company-a",
    subject: partial.subject ?? null,
    follow_up_id: partial.follow_up_id ?? null,
    ...partial,
  };
}

assert.equal(isCompletedFollowUpActivity(row({ id: "1", activity_type: "call" })), true);
assert.equal(isCompletedFollowUpActivity(row({ id: "2", activity_type: "email" })), true);
assert.equal(
  isCompletedFollowUpActivity(row({ id: "3", activity_type: "meeting" })),
  true,
);
assert.equal(isCompletedFollowUpActivity(row({ id: "4", activity_type: "visit" })), true);
assert.equal(
  isCompletedFollowUpActivity(
    row({ id: "5", activity_type: "note", subject: "Follow-up contact" }),
  ),
  true,
);
assert.equal(
  isCompletedFollowUpActivity(
    row({ id: "6", activity_type: "other", subject: "Left a voicemail" }),
  ),
  true,
);
assert.equal(
  isCompletedFollowUpActivity(
    row({ id: "7", activity_type: "follow_up_no_response", follow_up_id: "fu-1" }),
  ),
  true,
);
assert.equal(
  isCompletedFollowUpActivity(
    row({
      id: "8",
      activity_type: "follow_up_rescheduled_contact",
      follow_up_id: "fu-2",
    }),
  ),
  true,
);

assert.equal(
  isCompletedFollowUpActivity(
    row({ id: "9", activity_type: "do_not_follow_up", follow_up_id: "fu-3" }),
  ),
  false,
);
assert.equal(
  isCompletedFollowUpActivity(
    row({ id: "10", activity_type: "outreach_suppression" }),
  ),
  false,
);

for (const subject of STATUS_CHANGE_ACTIVITY_SUBJECTS) {
  assert.equal(
    isCompletedFollowUpActivity(
      row({ id: `status-${subject}`, activity_type: "note", subject }),
    ),
    false,
    subject,
  );
}

const counts = countFollowUpActivitiesByCompany([
  row({ id: "call-1", activity_type: "call", company_id: "acme", subject: "Call" }),
  row({
    id: "call-1",
    activity_type: "call",
    company_id: "acme",
    subject: "Call",
  }),
  row({
    id: "email-jane",
    activity_type: "email",
    company_id: "acme",
    subject: "Email",
  }),
  row({
    id: "email-sam",
    activity_type: "email",
    company_id: "acme",
    subject: "Email",
  }),
  row({
    id: "outcome-a",
    activity_type: "follow_up_no_response",
    company_id: "acme",
    follow_up_id: "fu-9",
  }),
  row({
    id: "outcome-b",
    activity_type: "follow_up_no_response",
    company_id: "acme",
    follow_up_id: "fu-9",
  }),
  row({
    id: "outcome-other-company",
    activity_type: "follow_up_no_response",
    company_id: "other",
    follow_up_id: "fu-9",
  }),
  row({
    id: "status",
    activity_type: "note",
    company_id: "acme",
    subject: "Company details updated",
  }),
  row({
    id: "closed",
    activity_type: "do_not_follow_up",
    company_id: "acme",
    follow_up_id: "fu-closed",
  }),
  row({
    id: "note-1",
    activity_type: "note",
    company_id: "beta",
    subject: "Called the warehouse",
  }),
]);

assert.equal(counts.acme, 4);
assert.equal(counts.other, 1);
assert.equal(counts.beta, 1);
assert.equal(counts["missing"], undefined);

assert.equal(
  countFollowUpActivitiesByCompany([
    row({
      id: "manual",
      activity_type: "call",
      follow_up_id: "fu-1",
    }),
    row({
      id: "outcome",
      activity_type: "follow_up_rescheduled_contact",
      follow_up_id: "fu-1",
    }),
  ])["company-a"],
  2,
);

const withoutDeleted = countFollowUpActivitiesByCompany([
  row({ id: "keep", activity_type: "call" }),
]);
assert.equal(withoutDeleted["company-a"], 1);

assert.equal(followUpCountLabel(0), "↻ 0 Follow-ups");
assert.equal(followUpCountLabel(1), "↻ 1 Follow-up");
assert.equal(followUpCountLabel(7), "↻ 7 Follow-ups");

assert.match(followUpCountBadgeClass(0), /slate/);
assert.match(followUpCountBadgeClass(1), /blue/);
assert.match(followUpCountBadgeClass(5), /blue/);
assert.match(followUpCountBadgeClass(6), /yellow/);
assert.match(followUpCountBadgeClass(9), /yellow/);
assert.match(followUpCountBadgeClass(10), /orange/);
assert.match(followUpCountBadgeClass(12), /orange/);
assert.match(followUpCountBadgeClass(13), /red/);
assert.match(followUpCountBadgeClass(40), /red/);

assert.equal(
  companyFollowUpTimelinePath("company-1"),
  "/companies/company-1?tab=timeline&timeline=follow-ups",
);
