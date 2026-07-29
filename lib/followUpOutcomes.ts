import {
  ACTIVITY_TYPE_LABELS,
  updatesLastContactAt,
  type ActivityType,
} from "@/lib/crmConstants";
import { formatDateTime } from "@/lib/crmFormat";
import {
  createFollowUp,
  syncCompanyCommercialDates,
  type FollowUpEnriched,
  type FollowUpRecord,
} from "@/lib/followUps";
import {
  followUpTypeFormFromRecord,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import { supabase } from "@/lib/supabaseClient";

export type FollowUpCompletionOutcome = "completed_contact" | "no_response";

export type ScheduleNextMode = "automatic_week" | "choose_datetime";

export interface CompleteAndScheduleNextInput {
  followUp: Pick<
    FollowUpEnriched,
    | "id"
    | "user_id"
    | "company_id"
    | "title"
    | "notes"
    | "due_at"
    | "follow_up_type"
    | "reminder_lead_days"
    | "seasonal_context"
    | "contactId"
    | "contactName"
    | "companyName"
    | "companyOwnerUserId"
  >;
  outcome: FollowUpCompletionOutcome;
  actorUserId: string;
  newDueAt: string;
  scheduleMode: ScheduleNextMode;
  asAdmin?: boolean;
}

function outcomeActivityType(outcome: FollowUpCompletionOutcome): ActivityType {
  return outcome === "no_response"
    ? "follow_up_no_response"
    : "follow_up_rescheduled_contact";
}

function buildOutcomeSubject(outcome: FollowUpCompletionOutcome): string {
  return outcome === "no_response"
    ? "Follow-up attempt — no response"
    : "Follow-up completed — contact made";
}

function buildOutcomeNotes(input: {
  outcome: FollowUpCompletionOutcome;
  previousDueAt: string;
  newDueAt: string;
  scheduleMode: ScheduleNextMode;
  contactName?: string | null;
  companyName?: string | null;
  completedFollowUpId: string;
  nextFollowUpId: string;
}): string {
  const previousLabel = formatDateTime(input.previousDueAt);
  const newLabel = formatDateTime(input.newDueAt);
  const contactPart = input.contactName?.trim()
    ? ` Contact: ${input.contactName.trim()}.`
    : "";
  const companyPart = input.companyName?.trim()
    ? ` Company: ${input.companyName.trim()}.`
    : "";
  const schedulePart =
    input.scheduleMode === "automatic_week"
      ? " Next follow-up was scheduled automatically for one week later (same local time)."
      : " Next follow-up was scheduled manually.";

  if (input.outcome === "no_response") {
    return (
      `Contact was attempted but no response was received.${companyPart}${contactPart}` +
      ` Completed follow-up due date: ${previousLabel}.` +
      `${schedulePart} New follow-up due: ${newLabel}.` +
      ` Completed follow-up ID: ${input.completedFollowUpId}.` +
      ` New follow-up ID: ${input.nextFollowUpId}.`
    );
  }

  return (
    `Customer was contacted successfully and the follow-up was completed.${companyPart}${contactPart}` +
    ` Completed follow-up due date: ${previousLabel}.` +
    `${schedulePart} New follow-up due: ${newLabel}.` +
    ` Completed follow-up ID: ${input.completedFollowUpId}.` +
    ` New follow-up ID: ${input.nextFollowUpId}.`
  );
}

/** Add calendar days in local time, preserving the scheduled hour/minute. */
export function addCalendarDaysPreservingLocalTime(
  isoDueAt: string,
  days: number,
): string {
  const date = new Date(isoDueAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid follow-up due date.");
  }

  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function isFutureDueAt(
  isoDueAt: string,
  reference: Date = new Date(),
): boolean {
  const date = new Date(isoDueAt);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > reference.getTime();
}

async function findSuccessorFollowUp(
  sourceFollowUpId: string,
): Promise<{ id: string; due_at: string } | null> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("id, due_at")
    .eq("source_follow_up_id", sourceFollowUpId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as { id: string; due_at: string };
}

async function findOutcomeActivity(input: {
  followUpId: string;
  activityType: ActivityType;
}): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("activities")
    .select("id")
    .eq("follow_up_id", input.followUpId)
    .eq("activity_type", input.activityType)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as { id: string };
}

async function completeSourceFollowUp(input: {
  followUpId: string;
  ownerUserId: string;
  companyId: string;
  asAdmin?: boolean;
}): Promise<{ error: { message?: string } | null; alreadyCompleted: boolean }> {
  const { data: current, error: fetchError } = await supabase
    .from("follow_ups")
    .select("id, status")
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError, alreadyCompleted: false };
  }

  if (!current) {
    return { error: { message: "Follow-up not found." }, alreadyCompleted: false };
  }

  if (current.status === "completed") {
    return { error: null, alreadyCompleted: true };
  }

  if (current.status !== "pending") {
    return {
      error: { message: "Only pending follow-ups can be completed." },
      alreadyCompleted: false,
    };
  }

  let query = supabase
    .from("follow_ups")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .eq("status", "pending");

  if (!input.asAdmin) {
    query = query.eq("user_id", input.ownerUserId);
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    return { error, alreadyCompleted: false };
  }

  if (!data) {
    // Concurrent completion
    return { error: null, alreadyCompleted: true };
  }

  return { error: null, alreadyCompleted: false };
}

async function insertOutcomeActivity(input: {
  outcome: FollowUpCompletionOutcome;
  actorUserId: string;
  companyId: string;
  completedFollowUpId: string;
  nextFollowUpId: string;
  previousDueAt: string;
  newDueAt: string;
  scheduleMode: ScheduleNextMode;
  contactId?: string | null;
  contactName?: string | null;
  companyName?: string | null;
}): Promise<{ error: { message?: string } | null }> {
  const activityType = outcomeActivityType(input.outcome);

  const existing = await findOutcomeActivity({
    followUpId: input.completedFollowUpId,
    activityType,
  });

  if (existing) {
    return { error: null };
  }

  const { error } = await supabase.from("activities").insert({
    user_id: input.actorUserId,
    company_id: input.companyId,
    contact_id: input.contactId?.trim() || null,
    follow_up_id: input.completedFollowUpId,
    activity_type: activityType,
    subject: buildOutcomeSubject(input.outcome),
    notes: buildOutcomeNotes({
      outcome: input.outcome,
      previousDueAt: input.previousDueAt,
      newDueAt: input.newDueAt,
      scheduleMode: input.scheduleMode,
      contactName: input.contactName,
      companyName: input.companyName,
      completedFollowUpId: input.completedFollowUpId,
      nextFollowUpId: input.nextFollowUpId,
    }),
    activity_at: new Date().toISOString(),
    scheduled_follow_up_at: input.newDueAt,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: null };
    }
    return { error };
  }

  return { error: null };
}

function buildCarriedTypeFields(
  followUp: CompleteAndScheduleNextInput["followUp"],
): FollowUpTypeFormValues {
  return followUpTypeFormFromRecord({
    follow_up_type: followUp.follow_up_type,
    reminder_lead_days: followUp.reminder_lead_days,
    seasonal_context: followUp.seasonal_context,
  });
}

/**
 * Completes the current follow-up, logs the outcome activity, and creates a
 * new pending follow-up. Cancel/close before confirm leaves the original open.
 */
export async function completeFollowUpAndScheduleNext(
  input: CompleteAndScheduleNextInput,
): Promise<{
  error: { message?: string } | null;
  newDueAt: string;
  nextFollowUpId: string | null;
}> {
  if (!input.newDueAt.trim()) {
    return {
      error: { message: "A next follow-up date is required." },
      newDueAt: "",
      nextFollowUpId: null,
    };
  }

  if (
    input.scheduleMode === "choose_datetime" &&
    !isFutureDueAt(input.newDueAt)
  ) {
    return {
      error: { message: "Choose a future date and time." },
      newDueAt: input.newDueAt,
      nextFollowUpId: null,
    };
  }

  const ownerUserId =
    input.followUp.companyOwnerUserId ?? input.followUp.user_id;
  const completedFollowUpId = input.followUp.id;
  const previousDueAt = input.followUp.due_at;
  const newDueAt = input.newDueAt;

  async function ensureOutcomeActivity(nextFollowUpId: string, dueAtForNotes: string) {
    await insertOutcomeActivity({
      outcome: input.outcome,
      actorUserId: input.actorUserId,
      companyId: input.followUp.company_id,
      completedFollowUpId,
      nextFollowUpId,
      previousDueAt,
      newDueAt: dueAtForNotes,
      scheduleMode: input.scheduleMode,
      contactId: input.followUp.contactId,
      contactName: input.followUp.contactName,
      companyName: input.followUp.companyName,
    });
  }

  const existingSuccessor = await findSuccessorFollowUp(completedFollowUpId);
  if (existingSuccessor) {
    await ensureOutcomeActivity(existingSuccessor.id, existingSuccessor.due_at);
    await syncCompanyCommercialDates(input.followUp.company_id, ownerUserId);
    return {
      error: null,
      newDueAt: existingSuccessor.due_at,
      nextFollowUpId: existingSuccessor.id,
    };
  }

  const completeResult = await completeSourceFollowUp({
    followUpId: completedFollowUpId,
    ownerUserId,
    companyId: input.followUp.company_id,
    asAdmin: input.asAdmin,
  });

  if (completeResult.error) {
    return {
      error: completeResult.error,
      newDueAt,
      nextFollowUpId: null,
    };
  }

  // Re-check successor after completion (retry / race).
  const successorAfterComplete = await findSuccessorFollowUp(completedFollowUpId);
  if (successorAfterComplete) {
    await ensureOutcomeActivity(
      successorAfterComplete.id,
      successorAfterComplete.due_at,
    );
    await syncCompanyCommercialDates(input.followUp.company_id, ownerUserId);

    return {
      error: null,
      newDueAt: successorAfterComplete.due_at,
      nextFollowUpId: successorAfterComplete.id,
    };
  }

  const createResult = await createFollowUp({
    userId: ownerUserId,
    companyId: input.followUp.company_id,
    title: input.followUp.title,
    notes: input.followUp.notes,
    dueAt: newDueAt,
    typeFields: buildCarriedTypeFields(input.followUp),
    sourceFollowUpId: completedFollowUpId,
  });

  if (createResult.error && !createResult.followUpId) {
    // Unique source race: load successor if another request created it.
    if (
      createResult.error.message?.includes("follow_ups_one_successor") ||
      createResult.error.code === "23505"
    ) {
      const racedSuccessor = await findSuccessorFollowUp(completedFollowUpId);
      if (racedSuccessor) {
        await ensureOutcomeActivity(racedSuccessor.id, racedSuccessor.due_at);
        await syncCompanyCommercialDates(
          input.followUp.company_id,
          ownerUserId,
        );
        return {
          error: null,
          newDueAt: racedSuccessor.due_at,
          nextFollowUpId: racedSuccessor.id,
        };
      }
    }

    // Reopen the source follow-up if we completed it but could not schedule next.
    if (!completeResult.alreadyCompleted) {
      let reopenQuery = supabase
        .from("follow_ups")
        .update({ status: "pending", completed_at: null })
        .eq("id", completedFollowUpId)
        .eq("company_id", input.followUp.company_id)
        .eq("status", "completed");

      if (!input.asAdmin) {
        reopenQuery = reopenQuery.eq("user_id", ownerUserId);
      }

      await reopenQuery;
      await syncCompanyCommercialDates(input.followUp.company_id, ownerUserId);
    }

    return {
      error: createResult.error,
      newDueAt,
      nextFollowUpId: null,
    };
  }

  const nextFollowUpId = createResult.followUpId;
  if (!nextFollowUpId) {
    return {
      error: {
        message:
          createResult.error?.message ??
          "Next follow-up was created but no ID was returned.",
      },
      newDueAt,
      nextFollowUpId: null,
    };
  }

  const activityResult = await insertOutcomeActivity({
    outcome: input.outcome,
    actorUserId: input.actorUserId,
    companyId: input.followUp.company_id,
    completedFollowUpId,
    nextFollowUpId,
    previousDueAt,
    newDueAt,
    scheduleMode: input.scheduleMode,
    contactId: input.followUp.contactId,
    contactName: input.followUp.contactName,
    companyName: input.followUp.companyName,
  });

  if (activityResult.error) {
    return {
      error: activityResult.error,
      newDueAt,
      nextFollowUpId,
    };
  }

  const syncResult = await syncCompanyCommercialDates(
    input.followUp.company_id,
    ownerUserId,
  );

  if (syncResult.error) {
    return {
      error: syncResult.error,
      newDueAt,
      nextFollowUpId,
    };
  }

  return { error: null, newDueAt, nextFollowUpId };
}

export function describeFollowUpOutcomeActivityType(type: ActivityType): string {
  return ACTIVITY_TYPE_LABELS[type];
}

export function shouldUpdateLastContactForActivityType(type: string): boolean {
  return updatesLastContactAt(type);
}

export type { FollowUpRecord };
