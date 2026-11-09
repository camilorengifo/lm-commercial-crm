import {
  ACTIVITY_TYPE_LABELS,
  updatesLastContactAt,
  type ActivityType,
} from "@/lib/crmConstants";
import { formatDateTime } from "@/lib/crmFormat";
import {
  createFollowUp,
  markFollowUpCompleted,
  syncCompanyCommercialDates,
  type FollowUpEnriched,
  type FollowUpRecord,
} from "@/lib/followUps";
import {
  followUpTypeFormFromRecord,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import {
  addCalendarDaysInTimeZone,
  businessCalendarDate,
} from "@/lib/followUpClassification";
import {
  MARK_COMPLETE_INTERVAL_DAYS,
  automaticNextFollowUpDueAt,
  isFutureDueAt,
  nextFollowUpDueAtFromCompletion,
} from "@/lib/followUpScheduling";
import { supabase } from "@/lib/supabaseClient";

export {
  addCalendarDaysPreservingLocalTime,
  automaticNextFollowUpDueAt,
  isFutureDueAt,
  nextFollowUpDueAtFromCompletion,
  planMarkCompleteFollowUp,
} from "@/lib/followUpScheduling";

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
    | "contact_id"
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
      ? input.outcome === "completed_contact"
        ? " Next follow-up was scheduled automatically for seven calendar days after completion. The original due date was not changed."
        : " Next follow-up was scheduled automatically for one week later (same local time)."
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
  companyId: string;
  asAdmin?: boolean;
}): Promise<{
  error: { message?: string } | null;
  alreadyCompleted: boolean;
  completedAt: string | null;
  assigneeUserId: string | null;
}> {
  return markFollowUpCompleted({
    followUpId: input.followUpId,
    companyId: input.companyId,
    asAdmin: input.asAdmin,
  });
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

export interface CompleteAndScheduleNextResult {
  error: { message?: string } | null;
  newDueAt: string;
  nextFollowUpId: string | null;
  /** Set only after the database row is status completed with completed_at. */
  completedAt: string | null;
  completedFollowUpId: string | null;
  /** Original due date confirmed on the closed row. Never rewritten by Mark Complete. */
  originalDueAt: string | null;
}

function unfinishedResult(
  error: { message?: string } | null,
  newDueAt: string,
): CompleteAndScheduleNextResult {
  return {
    error,
    newDueAt,
    nextFollowUpId: null,
    completedAt: null,
    completedFollowUpId: null,
    originalDueAt: null,
  };
}

function scheduledSevenDaysAfterCompletion(
  completedAt: string,
  nextDueAt: string,
): boolean {
  try {
    const expected = businessCalendarDate(
      addCalendarDaysInTimeZone(completedAt, MARK_COMPLETE_INTERVAL_DAYS),
    );
    return Boolean(expected) && expected === businessCalendarDate(nextDueAt);
  } catch {
    return false;
  }
}

function sameInstant(left: string | null | undefined, right: string): boolean {
  if (!left) return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return (
    !Number.isNaN(leftTime) &&
    !Number.isNaN(rightTime) &&
    leftTime === rightTime
  );
}

async function readStoredCompletion(input: {
  followUpId: string;
  companyId: string;
  originalDueAt: string;
  nextFollowUpId: string;
  requireCompletionPlusWeek: boolean;
}): Promise<CompleteAndScheduleNextResult | null> {
  const { data: closed, error: closedError } = await supabase
    .from("follow_ups")
    .select("id, status, due_at, completed_at, company_id")
    .eq("id", input.followUpId)
    .eq("company_id", input.companyId)
    .maybeSingle();

  if (closedError) {
    return unfinishedResult(closedError, "");
  }

  const closedRow = closed as {
    id: string;
    status: string;
    due_at: string;
    completed_at: string | null;
  } | null;

  if (!closedRow || closedRow.status !== "completed" || !closedRow.completed_at) {
    return unfinishedResult(
      { message: "Follow-up could not be marked complete. It is still open." },
      "",
    );
  }

  if (!sameInstant(closedRow.due_at, input.originalDueAt)) {
    return {
      error: {
        message:
          "The original due date changed during completion. Refresh and review this follow-up before trying again.",
      },
      newDueAt: "",
      nextFollowUpId: null,
      completedAt: closedRow.completed_at,
      completedFollowUpId: closedRow.id,
      originalDueAt: closedRow.due_at,
    };
  }

  const { data: next, error: nextError } = await supabase
    .from("follow_ups")
    .select("id, status, due_at, company_id, source_follow_up_id")
    .eq("id", input.nextFollowUpId)
    .maybeSingle();

  if (nextError) {
    return {
      error: nextError,
      newDueAt: "",
      nextFollowUpId: null,
      completedAt: closedRow.completed_at,
      completedFollowUpId: closedRow.id,
      originalDueAt: closedRow.due_at,
    };
  }

  const nextRow = next as {
    id: string;
    status: string;
    due_at: string;
    company_id: string;
    source_follow_up_id: string | null;
  } | null;

  if (
    !nextRow ||
    nextRow.id === closedRow.id ||
    nextRow.status !== "pending" ||
    nextRow.company_id !== input.companyId ||
    nextRow.source_follow_up_id !== closedRow.id
  ) {
    return {
      error: {
        message: "The next follow-up was not created as a separate pending record.",
      },
      newDueAt: nextRow?.due_at ?? "",
      nextFollowUpId: nextRow?.id ?? null,
      completedAt: closedRow.completed_at,
      completedFollowUpId: closedRow.id,
      originalDueAt: closedRow.due_at,
    };
  }

  if (
    input.requireCompletionPlusWeek &&
    !scheduledSevenDaysAfterCompletion(closedRow.completed_at, nextRow.due_at)
  ) {
    return {
      error: {
        message:
          "The next follow-up was not scheduled seven days after completion.",
      },
      newDueAt: nextRow.due_at,
      nextFollowUpId: nextRow.id,
      completedAt: closedRow.completed_at,
      completedFollowUpId: closedRow.id,
      originalDueAt: closedRow.due_at,
    };
  }

  if (!input.requireCompletionPlusWeek && !isFutureDueAt(nextRow.due_at)) {
    return {
      error: { message: "The next follow-up date is not in the future." },
      newDueAt: nextRow.due_at,
      nextFollowUpId: nextRow.id,
      completedAt: closedRow.completed_at,
      completedFollowUpId: closedRow.id,
      originalDueAt: closedRow.due_at,
    };
  }

  return {
    error: null,
    newDueAt: nextRow.due_at,
    nextFollowUpId: nextRow.id,
    completedAt: closedRow.completed_at,
    completedFollowUpId: closedRow.id,
    originalDueAt: closedRow.due_at,
  };
}

function missingScheduleNextRpc(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "PGRST202") return true;
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("complete_follow_up_and_schedule_next") &&
    (message.includes("could not find") ||
      message.includes("does not exist") ||
      message.includes("schema cache"))
  );
}

interface ScheduleNextRpcPayload {
  status?: string;
  completedAt?: string | null;
  dueAt?: string | null;
  nextFollowUpId?: string | null;
  nextDueAt?: string | null;
}

/**
 * Close the current follow-up and insert its successor in one transaction.
 * Returns null when the database function is not deployed yet.
 */
async function completeAndScheduleInDatabase(input: {
  followUpId: string;
  companyId: string;
  outcome: FollowUpCompletionOutcome;
  scheduleMode: ScheduleNextMode;
  newDueAt: string | null;
  originalDueAt: string;
}): Promise<CompleteAndScheduleNextResult | null> {
  const { data, error } = await supabase.rpc(
    "complete_follow_up_and_schedule_next",
    {
      p_follow_up_id: input.followUpId,
      p_company_id: input.companyId,
      p_outcome: input.outcome,
      p_schedule_mode: input.scheduleMode,
      p_new_due_at: input.newDueAt,
    },
  );

  if (error) {
    if (missingScheduleNextRpc(error)) return null;
    return unfinishedResult(error, input.newDueAt ?? "");
  }

  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = null;
    }
  }

  const payload = (parsed ?? null) as ScheduleNextRpcPayload | null;
  if (
    !payload ||
    payload.status !== "completed" ||
    !payload.completedAt ||
    !payload.nextFollowUpId ||
    !payload.nextDueAt
  ) {
    return unfinishedResult(
      {
        message:
          "Follow-up could not be marked complete and the next follow-up was not created.",
      },
      payload?.nextDueAt ?? input.newDueAt ?? "",
    );
  }

  if (payload.dueAt && !sameInstant(payload.dueAt, input.originalDueAt)) {
    return {
      error: {
        message:
          "The original due date changed during completion. Refresh and review this follow-up before trying again.",
      },
      newDueAt: payload.nextDueAt,
      nextFollowUpId: payload.nextFollowUpId,
      completedAt: payload.completedAt,
      completedFollowUpId: input.followUpId,
      originalDueAt: payload.dueAt,
    };
  }

  return {
    error: null,
    newDueAt: payload.nextDueAt,
    nextFollowUpId: payload.nextFollowUpId,
    completedAt: payload.completedAt,
    completedFollowUpId: input.followUpId,
    originalDueAt: payload.dueAt ?? input.originalDueAt,
  };
}

/**
 * Completes the current follow-up, logs the outcome activity, and creates a
 * new pending follow-up. Cancel/close before confirm leaves the original open.
 * Success is returned only when the source row is confirmed completed.
 */
export async function completeFollowUpAndScheduleNext(
  input: CompleteAndScheduleNextInput,
): Promise<CompleteAndScheduleNextResult> {
  const previousDueAt = input.followUp.due_at;
  const markCompleteAutomatic =
    input.scheduleMode === "automatic_week" &&
    input.outcome === "completed_contact";
  let newDueAt = input.newDueAt;

  if (markCompleteAutomatic) {
    // The next due date is seven days after the saved completion timestamp.
    newDueAt = "";
  } else if (input.scheduleMode === "automatic_week") {
    try {
      newDueAt = automaticNextFollowUpDueAt(previousDueAt);
    } catch {
      return unfinishedResult(
        { message: "Unable to calculate the automatic next follow-up date." },
        input.newDueAt,
      );
    }
  } else if (!newDueAt.trim()) {
    return unfinishedResult(
      { message: "A next follow-up date is required." },
      "",
    );
  } else if (!isFutureDueAt(newDueAt)) {
    return unfinishedResult(
      { message: "Choose a future date and time." },
      newDueAt,
    );
  }

  const ownerUserId =
    input.followUp.companyOwnerUserId ?? input.followUp.user_id;
  const completedFollowUpId = input.followUp.id;

  async function recordOutcome(
    nextFollowUpId: string,
    dueAtForNotes: string,
  ): Promise<{ message?: string } | null> {
    const activityResult = await insertOutcomeActivity({
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
    if (activityResult.error) {
      return activityResult.error;
    }

    const syncResult = await syncCompanyCommercialDates(
      input.followUp.company_id,
      ownerUserId,
    );
    return syncResult.error;
  }

  async function finishFromStoredPair(
    nextFollowUpId: string,
  ): Promise<CompleteAndScheduleNextResult> {
    const stored = await readStoredCompletion({
      followUpId: completedFollowUpId,
      companyId: input.followUp.company_id,
      originalDueAt: previousDueAt,
      nextFollowUpId,
      requireCompletionPlusWeek: markCompleteAutomatic,
    });

    if (!stored) {
      return unfinishedResult(
        { message: "Follow-up could not be confirmed." },
        newDueAt,
      );
    }

    if (stored.error || !stored.completedAt || !stored.nextFollowUpId) {
      return stored;
    }

    const followOnError = await recordOutcome(
      stored.nextFollowUpId,
      stored.newDueAt,
    );
    return {
      ...stored,
      error: followOnError,
    };
  }

  const scheduled = await completeAndScheduleInDatabase({
    followUpId: completedFollowUpId,
    companyId: input.followUp.company_id,
    outcome: input.outcome,
    scheduleMode: input.scheduleMode,
    newDueAt: markCompleteAutomatic ? null : newDueAt,
    originalDueAt: previousDueAt,
  });

  if (scheduled) {
    if (scheduled.error || !scheduled.completedAt || !scheduled.nextFollowUpId) {
      return scheduled;
    }

    return finishFromStoredPair(scheduled.nextFollowUpId);
  }

  const completeResult = await completeSourceFollowUp({
    followUpId: completedFollowUpId,
    companyId: input.followUp.company_id,
    asAdmin: input.asAdmin,
  });

  if (completeResult.error || !completeResult.completedAt) {
    return unfinishedResult(
      completeResult.error ?? {
        message: "Follow-up could not be marked complete. It is still open.",
      },
      newDueAt,
    );
  }

  const confirmed = {
    completedAt: completeResult.completedAt,
    completedFollowUpId,
    originalDueAt: previousDueAt,
  };

  const successor = await findSuccessorFollowUp(completedFollowUpId);
  if (successor) {
    return finishFromStoredPair(successor.id);
  }

  if (markCompleteAutomatic) {
    try {
      newDueAt = nextFollowUpDueAtFromCompletion(completeResult.completedAt);
    } catch {
      return {
        error: {
          message: "Unable to calculate the next follow-up from the completion date.",
        },
        newDueAt: "",
        nextFollowUpId: null,
        ...confirmed,
      };
    }
  }

  const createResult = await createFollowUp({
    userId: ownerUserId,
    companyId: input.followUp.company_id,
    title: input.followUp.title,
    notes: input.followUp.notes,
    dueAt: newDueAt,
    typeFields: buildCarriedTypeFields(input.followUp),
    sourceFollowUpId: completedFollowUpId,
    contactId: input.followUp.contact_id ?? null,
  });

  if (createResult.error && !createResult.followUpId) {
    if (
      createResult.error.message?.includes("follow_ups_one_successor") ||
      createResult.error.code === "23505"
    ) {
      const racedSuccessor = await findSuccessorFollowUp(completedFollowUpId);
      if (racedSuccessor) {
        return finishFromStoredPair(racedSuccessor.id);
      }
    }

    // Scheduling failed. Put a just-completed row back to pending so the
    // broker is not left with a completed follow-up and no next one.
    if (!completeResult.alreadyCompleted) {
      let reopenQuery = supabase
        .from("follow_ups")
        .update({ status: "pending", completed_at: null })
        .eq("id", completedFollowUpId)
        .eq("company_id", input.followUp.company_id)
        .eq("status", "completed");

      if (!input.asAdmin && completeResult.assigneeUserId) {
        reopenQuery = reopenQuery.eq("user_id", completeResult.assigneeUserId);
      }

      const { data: reopened } = await reopenQuery.select("id, status").maybeSingle();
      await syncCompanyCommercialDates(input.followUp.company_id, ownerUserId);

      if (reopened?.status === "pending") {
        return unfinishedResult(createResult.error, newDueAt);
      }
    }

    return {
      error: createResult.error,
      newDueAt,
      nextFollowUpId: null,
      ...confirmed,
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
      newDueAt: createResult.dueAt ?? newDueAt,
      nextFollowUpId: null,
      ...confirmed,
    };
  }

  return finishFromStoredPair(nextFollowUpId);
}

export function describeFollowUpOutcomeActivityType(type: ActivityType): string {
  return ACTIVITY_TYPE_LABELS[type];
}

export function shouldUpdateLastContactForActivityType(type: string): boolean {
  return updatesLastContactAt(type);
}

export type { FollowUpRecord };
