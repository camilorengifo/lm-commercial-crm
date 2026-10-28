import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVITY_UNCHANGED_MESSAGE,
  activityEditIsUnchanged,
  canChangeActivityType,
  ACTIVITY_DELETED_MESSAGE,
  canDeleteCommercialActivity,
  canEditCommercialActivity,
  commercialActivityDeleteBody,
  commercialActivityUpdateBody,
  supportsCommercialActivityDeletion,
  validateActivityEdit,
  validateActivityTypeChange,
} from "./activityEdit";

const broker = "11111111-1111-4111-8111-111111111111";
const otherBroker = "22222222-2222-4222-8222-222222222222";

assert.equal(
  canEditCommercialActivity({
    canManage: true,
    isAdmin: false,
    viewerUserId: broker,
    activityUserId: broker,
  }),
  true,
);

assert.equal(
  canEditCommercialActivity({
    canManage: true,
    isAdmin: false,
    viewerUserId: broker,
    activityUserId: otherBroker,
  }),
  false,
);

assert.equal(
  canEditCommercialActivity({
    canManage: false,
    isAdmin: false,
    viewerUserId: broker,
    activityUserId: broker,
  }),
  false,
);

assert.equal(
  canEditCommercialActivity({
    canManage: true,
    isAdmin: true,
    viewerUserId: broker,
    activityUserId: otherBroker,
  }),
  true,
);

assert.equal(
  canEditCommercialActivity({
    canManage: false,
    isAdmin: true,
    viewerUserId: broker,
    activityUserId: otherBroker,
  }),
  false,
);

assert.equal(canChangeActivityType("call"), true);
assert.equal(canChangeActivityType("note"), true);
assert.equal(canChangeActivityType("follow_up_no_response"), false);
assert.equal(canChangeActivityType("follow_up_rescheduled_contact"), false);
assert.equal(canChangeActivityType("do_not_follow_up"), false);
assert.equal(canChangeActivityType("outreach_suppression"), false);

assert.equal(
  validateActivityEdit({
    draft: { subject: "Called back", notes: "   ", activityType: "call" },
    originalActivityType: "call",
  }),
  "Comment is required.",
);

assert.equal(
  validateActivityEdit({
    draft: {
      subject: "Corrected",
      notes: "Spoke with the shipping manager.",
      activityType: "email",
    },
    originalActivityType: "call",
  }),
  null,
);

assert.equal(
  validateActivityTypeChange({
    originalActivityType: "follow_up_no_response",
    nextActivityType: "call",
  }),
  "This activity type cannot be changed.",
);

assert.equal(
  validateActivityTypeChange({
    originalActivityType: "call",
    nextActivityType: "do_not_follow_up",
  }),
  "This activity type cannot be changed.",
);

assert.equal(
  validateActivityEdit({
    draft: {
      subject: "Follow-up attempt — no response",
      notes: "Corrected the comment.",
      activityType: "follow_up_no_response",
    },
    originalActivityType: "follow_up_no_response",
  }),
  null,
);

assert.equal(
  activityEditIsUnchanged({
    originalSubject: "Call",
    originalNotes: "Left a voicemail.",
    originalActivityType: "call",
    draft: {
      subject: "  Call  ",
      notes: "Left a voicemail.",
      activityType: "call",
    },
  }),
  true,
);

assert.equal(
  activityEditIsUnchanged({
    originalSubject: "Call",
    originalNotes: "Left a voicemail.",
    originalActivityType: "call",
    draft: {
      subject: "Call",
      notes: "Reached the warehouse manager.",
      activityType: "call",
    },
  }),
  false,
);

const body = commercialActivityUpdateBody({
  activityId: broker,
  companyId: otherBroker,
  draft: {
    subject: "  Quote follow-up  ",
    notes: "  Sent the corrected rate note.  ",
    activityType: "email",
  },
});

assert.deepEqual(Object.keys(body).sort(), [
  "activityId",
  "activityType",
  "companyId",
  "notes",
  "subject",
]);
assert.equal(body.subject, "Quote follow-up");
assert.equal(body.notes, "Sent the corrected rate note.");
assert.equal(body.activityType, "email");
assert.equal("activity_at" in body, false);
assert.equal("contact_id" in body, false);
assert.equal("user_id" in body, false);
assert.equal("follow_up_id" in body, false);
assert.equal("scheduled_follow_up_at" in body, false);

const sql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../supabase/migrations/036_activity_comment_edit_audit.sql",
  ),
  "utf8",
);

assert.match(sql, /SECURITY INVOKER/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.audit_activity_content_edit\(\)/);
assert.match(sql, /SECURITY DEFINER/);
assert.match(sql, /previous_notes/);
assert.match(sql, /new_notes/);
assert.match(sql, /editor_user_id/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /activity_edit_audits_select_admin/);
assert.match(sql, /REVOKE ALL ON TABLE public\.activity_edit_audits FROM authenticated/);
assert.match(sql, /GRANT SELECT ON TABLE public\.activity_edit_audits TO authenticated/);
assert.doesNotMatch(sql, /activity_edit_audits_insert/);
assert.doesNotMatch(sql, /activity_edit_audits_update/);
assert.doesNotMatch(sql, /activity_edit_audits_delete/);
assert.doesNotMatch(sql, /INSERT INTO public\.activities/);
assert.doesNotMatch(sql, /INSERT INTO public\.follow_ups/);
assert.doesNotMatch(sql, /UPDATE public\.follow_ups/);
assert.match(sql, /You do not have permission to edit this activity/);
assert.match(sql, /This activity type cannot be changed/);
assert.match(sql, /char_length\(v_next_notes\) > 20000/);
assert.match(sql, /char_length\(v_next_subject\) > 2000/);

const updateSql = sql.slice(
  sql.indexOf("-- activity_content_columns:"),
  sql.indexOf("GET DIAGNOSTICS v_updated"),
);
assert.match(updateSql, /subject = v_next_subject/);
assert.match(updateSql, /notes = v_next_notes/);
assert.match(updateSql, /activity_type = p_activity_type::public\.activity_type/);
assert.doesNotMatch(updateSql, /activity_at/);
assert.doesNotMatch(updateSql, /contact_id/);
assert.doesNotMatch(updateSql, /user_id/);
assert.doesNotMatch(updateSql, /follow_up_id/);
assert.doesNotMatch(updateSql, /scheduled_follow_up_at/);
assert.doesNotMatch(updateSql, /created_at/);
assert.doesNotMatch(updateSql, /updated_by/);

assert.equal(ACTIVITY_UNCHANGED_MESSAGE, "No changes to save.");

assert.equal(supportsCommercialActivityDeletion("call"), true);
assert.equal(supportsCommercialActivityDeletion("note"), true);
assert.equal(supportsCommercialActivityDeletion("follow_up_no_response"), false);
assert.equal(
  supportsCommercialActivityDeletion("follow_up_rescheduled_contact"),
  false,
);
assert.equal(supportsCommercialActivityDeletion("do_not_follow_up"), false);
assert.equal(supportsCommercialActivityDeletion("outreach_suppression"), false);

assert.equal(
  canDeleteCommercialActivity({
    canManage: true,
    isAdmin: false,
    viewerUserId: broker,
    activityUserId: broker,
    activityType: "call",
  }),
  true,
);

assert.equal(
  canDeleteCommercialActivity({
    canManage: true,
    isAdmin: true,
    viewerUserId: broker,
    activityUserId: otherBroker,
    activityType: "email",
  }),
  true,
);

assert.equal(
  canDeleteCommercialActivity({
    canManage: true,
    isAdmin: true,
    viewerUserId: broker,
    activityUserId: broker,
    activityType: "follow_up_no_response",
  }),
  false,
);

assert.equal(
  canDeleteCommercialActivity({
    canManage: true,
    isAdmin: false,
    viewerUserId: broker,
    activityUserId: otherBroker,
    activityType: "note",
  }),
  false,
);

assert.equal(
  canDeleteCommercialActivity({
    canManage: false,
    isAdmin: false,
    viewerUserId: broker,
    activityUserId: broker,
    activityType: "note",
  }),
  false,
);

const deleteBody = commercialActivityDeleteBody({
  activityId: broker,
  companyId: otherBroker,
});
assert.deepEqual(Object.keys(deleteBody).sort(), ["activityId", "companyId"]);
assert.equal("follow_up_id" in deleteBody, false);
assert.equal("notes" in deleteBody, false);

const deleteSql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../supabase/migrations/037_delete_commercial_activity.sql",
  ),
  "utf8",
);

assert.match(deleteSql, /SECURITY DEFINER/);
assert.match(deleteSql, /SET search_path = public/);
assert.match(deleteSql, /This timeline entry cannot be deleted/);
assert.match(deleteSql, /You do not have permission to delete this activity/);
assert.doesNotMatch(deleteSql, /DELETE FROM public\.follow_ups/);
assert.doesNotMatch(deleteSql, /UPDATE public\.follow_ups/);
assert.doesNotMatch(deleteSql, /DELETE FROM public\.companies/);
assert.doesNotMatch(deleteSql, /DELETE FROM public\.contacts/);
assert.ok(
  deleteSql.indexOf("This timeline entry cannot be deleted.") <
    deleteSql.indexOf("DELETE FROM public.activities"),
);

const deleteAuditsSql = deleteSql.slice(
  deleteSql.indexOf("DELETE FROM public.activity_edit_audits"),
  deleteSql.indexOf("DELETE FROM public.activities"),
);
assert.match(deleteAuditsSql, /activity_id = p_activity_id/);
assert.match(deleteAuditsSql, /company_id = p_company_id/);

const deleteActivitySql = deleteSql.slice(
  deleteSql.indexOf("DELETE FROM public.activities"),
  deleteSql.indexOf("GET DIAGNOSTICS v_deleted"),
);
assert.match(deleteActivitySql, /id = p_activity_id/);
assert.match(deleteActivitySql, /company_id = p_company_id/);

const contactRefreshSql = deleteSql.slice(
  deleteSql.indexOf("-- company_last_contact_refresh:"),
);
assert.match(contactRefreshSql, /SET last_contact_at/);
assert.match(contactRefreshSql, /last_contact_at IS NOT DISTINCT FROM v_activity_at/);
assert.doesNotMatch(contactRefreshSql, /next_follow_up_at/);
assert.doesNotMatch(contactRefreshSql, /DELETE FROM/);

assert.equal(ACTIVITY_DELETED_MESSAGE, "Timeline entry deleted.");

console.log("activity edit tests passed");
