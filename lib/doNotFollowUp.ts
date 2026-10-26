import { formatDateTime } from "@/lib/crmFormat";
import {
  syncCompanyCommercialDates,
  syncCompanyNextFollowUpAt,
} from "@/lib/followUps";
import {
  doNotFollowUpReasonLabel,
  isDoNotFollowUpReason,
  suppressionChoiceLabel,
  type DoNotFollowUpReason,
  type FollowUpSuppressionChoice,
} from "@/lib/outreachSuppressionRules";
import { supabase } from "@/lib/supabaseClient";

export interface StopFollowUpInput {
  followUpId: string;
  companyId: string;
  ownerUserId: string;
  actorUserId: string;
  asAdmin?: boolean;
  reason: DoNotFollowUpReason;
  notes?: string | null;
  associatedContactId?: string | null;
  associatedContactName?: string | null;
  companyName?: string | null;
  suppression?: FollowUpSuppressionChoice;
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" ||
    (error.message ?? "").toLowerCase().includes("duplicate") ||
    (error.message ?? "").toLowerCase().includes("unique")
  );
}

async function revertStop(input: {
  followUpId: string;
  companyId: string;
  ownerUserId: string;
  asAdmin?: boolean;
  previousContactId: string | null;
  activityId?: string | null;
}): Promise<void> {
  let revertQuery = supabase
    .from("follow_ups")
    .update({
      status: "pending",
      disposition_reason: null,
      disposition_notes: null,
      disposition_at: null,
      disposition_by: null,
      contact_id: input.previousContactId,
    })
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .eq("status", "do_not_follow_up");

  if (!input.asAdmin) {
    revertQuery = revertQuery.eq("user_id", input.ownerUserId);
  }

  await revertQuery;

  if (input.activityId) {
    await supabase.from("activities").delete().eq("id", input.activityId);
  }
}

export async function stopFollowUp(
  input: StopFollowUpInput,
): Promise<{ error: { message?: string } | null }> {
  if (!isDoNotFollowUpReason(input.reason)) {
    return { error: { message: "Choose a reason to stop follow-ups." } };
  }

  const suppression = input.suppression ?? "none";

  if (suppression !== "none" && input.reason !== "customer_requested_no_contact") {
    return {
      error: {
        message:
          "Future outreach can be suppressed only when the customer requested no contact.",
      },
    };
  }

  if (suppression === "contact" && !input.associatedContactId) {
    return {
      error: {
        message:
          "This follow-up has no associated contact. Stop this follow-up only, or suppress the entire company.",
      },
    };
  }

  const { data: current, error: fetchError } = await supabase
    .from("follow_ups")
    .select("id, status, contact_id, user_id")
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError };
  }

  if (!current) {
    return { error: { message: "Follow-up not found." } };
  }

  if (current.status === "do_not_follow_up") {
    return { error: null };
  }

  if (current.status !== "pending") {
    return {
      error: { message: "Only open follow-ups can be closed with Do Not Follow Up." },
    };
  }

  if (suppression === "contact" && input.associatedContactId) {
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, company_id")
      .eq("id", input.associatedContactId)
      .eq("company_id", input.companyId)
      .maybeSingle();

    if (contactError) {
      return { error: contactError };
    }

    if (!contact) {
      return {
        error: { message: "The selected contact is not on this company." },
      };
    }
  }

  const closedAt = new Date().toISOString();
  const dispositionNotes = input.notes?.trim() || null;
  const previousContactId = (current.contact_id as string | null) ?? null;
  const nextContactId =
    suppression === "contact"
      ? input.associatedContactId ?? previousContactId
      : previousContactId;

  let updateQuery = supabase
    .from("follow_ups")
    .update({
      status: "do_not_follow_up",
      completed_at: null,
      contact_id: nextContactId,
      disposition_reason: input.reason,
      disposition_notes: dispositionNotes,
      disposition_at: closedAt,
      disposition_by: input.actorUserId,
    })
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .eq("status", "pending");

  if (!input.asAdmin) {
    updateQuery = updateQuery.eq("user_id", input.ownerUserId);
  }

  const { data: updated, error: updateError } = await updateQuery
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { error: updateError };
  }

  if (!updated) {
    return {
      error: { message: "Only open follow-ups can be closed with Do Not Follow Up." },
    };
  }

  const contactLabel = input.associatedContactName?.trim() || null;
  const companyLabel = input.companyName?.trim() || input.companyId;
  const notes = [
    "Follow-up closed with Do Not Follow Up.",
    `Company: ${companyLabel}.`,
    `Contact: ${contactLabel ?? "No contact on file"}.`,
    `Follow-up ID: ${input.followUpId}.`,
    `Reason: ${doNotFollowUpReasonLabel(input.reason)}.`,
    `Notes: ${dispositionNotes ?? "None"}.`,
    suppressionChoiceLabel(suppression, contactLabel),
    `Closed: ${formatDateTime(closedAt)}.`,
  ].join(" ");

  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .insert({
      user_id: input.actorUserId,
      company_id: input.companyId,
      contact_id: input.associatedContactId ?? null,
      follow_up_id: input.followUpId,
      activity_type: "do_not_follow_up",
      subject: "Do not follow up",
      notes,
      activity_at: closedAt,
    })
    .select("id")
    .maybeSingle();

  if (activityError || !activity) {
    await revertStop({
      followUpId: input.followUpId,
      companyId: input.companyId,
      ownerUserId: input.ownerUserId,
      asAdmin: input.asAdmin,
      previousContactId,
    });
    return {
      error: activityError ?? { message: "Unable to record the follow-up activity." },
    };
  }

  if (suppression !== "none") {
    const { error: suppressionError } = await supabase
      .from("outreach_suppressions")
      .insert({
        user_id: input.ownerUserId,
        company_id: input.companyId,
        contact_id: suppression === "contact" ? input.associatedContactId : null,
        scope: suppression,
        active: true,
        reason: input.reason,
        notes: dispositionNotes,
        source_follow_up_id: input.followUpId,
        created_by: input.actorUserId,
      });

    if (suppressionError && !isUniqueViolation(suppressionError)) {
      await revertStop({
        followUpId: input.followUpId,
        companyId: input.companyId,
        ownerUserId: input.ownerUserId,
        asAdmin: input.asAdmin,
        previousContactId,
        activityId: activity.id as string,
      });
      return { error: suppressionError };
    }
  }

  await syncCompanyNextFollowUpAt(input.companyId, input.ownerUserId);
  await syncCompanyCommercialDates(input.companyId, input.ownerUserId);

  return { error: null };
}

export async function liftOutreachSuppression(input: {
  suppressionId: string;
  actorUserId: string;
  notes?: string | null;
}): Promise<{ error: { message?: string } | null }> {
  const { data: current, error: fetchError } = await supabase
    .from("outreach_suppressions")
    .select("id, company_id, contact_id, scope, active")
    .eq("id", input.suppressionId)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError };
  }

  if (!current) {
    return { error: { message: "Suppression record not found." } };
  }

  if (!current.active) {
    return { error: null };
  }

  const liftedAt = new Date().toISOString();
  const liftNotes = input.notes?.trim() || null;

  const { data: lifted, error: updateError } = await supabase
    .from("outreach_suppressions")
    .update({
      active: false,
      lifted_by: input.actorUserId,
      lifted_at: liftedAt,
      lift_notes: liftNotes,
    })
    .eq("id", input.suppressionId)
    .eq("active", true)
    .select("id, company_id, contact_id, scope")
    .maybeSingle();

  if (updateError) {
    return { error: updateError };
  }

  if (!lifted) {
    return {
      error: {
        message:
          "Only an administrator can change outreach suppression, or it was already lifted.",
      },
    };
  }

  const scopeLabel =
    lifted.scope === "company"
      ? "Company-wide suppression was lifted. New follow-ups can be scheduled again."
      : "Contact suppression was lifted. Follow-ups for this contact can be scheduled again. Other suppression rules are unchanged.";

  const { error: activityError } = await supabase.from("activities").insert({
    user_id: input.actorUserId,
    company_id: lifted.company_id,
    contact_id: lifted.contact_id,
    activity_type: "outreach_suppression",
    subject: "Outreach suppression lifted",
    notes: [
      scopeLabel,
      `Suppression ID: ${lifted.id}.`,
      `Notes: ${liftNotes ?? "None"}.`,
      `Changed: ${formatDateTime(liftedAt)}.`,
    ].join(" "),
    activity_at: liftedAt,
  });

  if (activityError) {
    return { error: activityError };
  }

  return { error: null };
}
