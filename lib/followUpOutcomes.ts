import {
  ACTIVITY_TYPE_LABELS,
  updatesLastContactAt,
  type ActivityType,
} from "@/lib/crmConstants";
import { formatDateTime } from "@/lib/crmFormat";
import { addBusinessCalendarDays } from "@/lib/followUpClassification";
import { isMissingColumnError } from "@/lib/followUpIdempotency";
import {
  cancelFollowUpsInCompanyCycle,
  createFollowUp,
  syncCompanyCommercialDates,
  type FollowUpEnriched,
  type FollowUpRecord,
} from "@/lib/followUps";
import {
  followUpTypeFormFromRecord,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import {
  planCompanyFollowUpCompletion,
  sameFollowUpInstant,
  type CompanyCycleFollowUp,
} from "@/lib/singleCompanyFollowUp";
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
      ? " Next follow-up was scheduled automatically for 7 days after this action (same local time)."
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

/**
 * Add calendar days in the CRM timezone (America/Bogota), preserving the
 * wall-clock hour. Buckets then classify that instant on the CRM calendar.
 */
export function addCalendarDaysPreservingLocalTime(
  isoDueAt: string,
  days: number,
): string {
  return addBusinessCalendarDays(isoDueAt, days);
}

export function isFutureDueAt(
  isoDueAt: string,
  reference: Date = new Date(),
): boolean {
  const date = new Date(isoDueAt);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > reference.getTime();
}

async function findOutcomeActivity(input: {
  followUpId: string;
  activityType: ActivityType;
}): Promise<{ id: string; scheduledDueAt: string | null } | null> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, scheduled_follow_up_at")
    .eq("follow_up_id", input.followUpId)
    .eq("activity_type", input.activityType)
    .limit(1);

  const row = data?.[0];
  if (error || !row) {
    return null;
  }

  return {
    id: row.id as string,
    scheduledDueAt: (row.scheduled_follow_up_at as string | null) ?? null,
  };
}

async function readFollowUpSource(
  followUpId: string,
  companyId: string,
): Promise<{
  row: { status: string; completedAt: string | null } | null;
  error: { message?: string } | null;
}> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("status, completed_at")
    .eq("id", followUpId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    return { row: null, error };
  }

  if (!data) {
    return { row: null, error: null };
  }

  return {
    row: {
      status: data.status as string,
      completedAt: (data.completed_at as string | null) ?? null,
    },
    error: null,
  };
}

async function loadCompanyPendingCycle(companyId: string): Promise<{
  rows: CompanyCycleFollowUp[];
  error: { message?: string; code?: string } | null;
}> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("id, company_id, due_at, created_at, source_follow_up_id")
    .eq("company_id", companyId)
    .eq("status", "pending");

  if (error && isMissingColumnError(error, "source_follow_up_id")) {
    const retry = await supabase
      .from("follow_ups")
      .select("id, company_id, due_at, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending");

    if (retry.error) {
      return { rows: [], error: retry.error };
    }

    return {
      rows: ((retry.data ?? []) as Array<{
        id: string;
        company_id: string;
        due_at: string;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        companyId: row.company_id,
        dueAt: row.due_at,
        createdAt: row.created_at,
        sourceFollowUpId: null,
      })),
      error: null,
    };
  }

  if (error) {
    return { rows: [], error };
  }

  return {
    rows: ((data ?? []) as Array<{
      id: string;
      company_id: string;
      due_at: string;
      created_at: string;
      source_follow_up_id: string | null;
    }>).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      dueAt: row.due_at,
      createdAt: row.created_at,
      sourceFollowUpId: row.source_follow_up_id,
    })),
    error: null,
  };
}

function storedDueMatches(stored: string, expected: string): boolean {
  if (sameFollowUpInstant(stored, expected)) return true;
  const left = Date.parse(stored);
  const right = Date.parse(expected);
  return (
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.abs(left - right) < 60_000
  );
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

async function resolveManagedContact(
  followUp: CompleteAndScheduleNextInput["followUp"],
): Promise<{ contactId: string | null; contactName: string | null }> {
  const rowContactId = followUp.contact_id?.trim() || null;
  if (!rowContactId) {
    return {
      contactId: followUp.contactId?.trim() || null,
      contactName: followUp.contactName?.trim() || null,
    };
  }

  const { data } = await supabase
    .from("contacts")
    .select("first_name, last_name")
    .eq("id", rowContactId)
    .maybeSingle();

  const name = [data?.first_name, data?.last_name]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .trim();

  return {
    contactId: rowContactId,
    contactName: name || followUp.contactName?.trim() || null,
  };
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
  const companyId = input.followUp.company_id;
  const completedFollowUpId = input.followUp.id;
  const previousDueAt = input.followUp.due_at;
  const requestedDueAt =
    input.scheduleMode === "automatic_week"
      ? addCalendarDaysPreservingLocalTime(new Date().toISOString(), 7)
      : input.newDueAt;
  const managedContact = await resolveManagedContact(input.followUp);

  const sourceRead = await readFollowUpSource(completedFollowUpId, companyId);
  if (sourceRead.error) {
    return { error: sourceRead.error, newDueAt: requestedDueAt, nextFollowUpId: null };
  }
  if (!sourceRead.row) {
    return {
      error: { message: "Follow-up not found." },
      newDueAt: requestedDueAt,
      nextFollowUpId: null,
    };
  }

  let source = sourceRead.row;
  let completedInThisCall = false;

  if (source.status === "pending") {
    const completeResult = await completeSourceFollowUp({
      followUpId: completedFollowUpId,
      ownerUserId,
      companyId,
      asAdmin: input.asAdmin,
    });

    if (completeResult.error) {
      return {
        error: completeResult.error,
        newDueAt: requestedDueAt,
        nextFollowUpId: null,
      };
    }

    const afterComplete = await readFollowUpSource(completedFollowUpId, companyId);
    if (afterComplete.error) {
      return {
        error: afterComplete.error,
        newDueAt: requestedDueAt,
        nextFollowUpId: null,
      };
    }

    if (!afterComplete.row || afterComplete.row.status !== "completed") {
      return {
        error: { message: "Only pending follow-ups can be completed." },
        newDueAt: requestedDueAt,
        nextFollowUpId: null,
      };
    }

    source = afterComplete.row;
    completedInThisCall = !completeResult.alreadyCompleted;
  }

  const pending = await loadCompanyPendingCycle(companyId);
  if (pending.error) {
    return { error: pending.error, newDueAt: requestedDueAt, nextFollowUpId: null };
  }

  const existingActivity = await findOutcomeActivity({
    followUpId: completedFollowUpId,
    activityType: outcomeActivityType(input.outcome),
  });

  const plan = planCompanyFollowUpCompletion({
    companyId,
    target: {
      id: completedFollowUpId,
      companyId,
      status: source.status,
      completedAt: source.completedAt,
    },
    pending: pending.rows,
    requestedDueAt,
    activityExists: Boolean(existingActivity),
    activityScheduledDueAt: existingActivity?.scheduledDueAt ?? null,
  });

  if (!plan.ok) {
    return {
      error: { message: plan.error ?? "Unable to complete this follow-up." },
      newDueAt: requestedDueAt,
      nextFollowUpId: null,
    };
  }

  if (plan.cancelIds.length > 0) {
    const cancelResult = await cancelFollowUpsInCompanyCycle({
      companyId,
      ownerUserId,
      followUpIds: plan.cancelIds,
      asAdmin: input.asAdmin,
    });

    if (cancelResult.error) {
      return {
        error: cancelResult.error,
        newDueAt: requestedDueAt,
        nextFollowUpId: null,
      };
    }
  }

  let nextFollowUpId = plan.keepSuccessorId;
  let scheduledDueAt = plan.dueAt;

  if (plan.createSuccessor) {
    const createResult = await createFollowUp({
      userId: ownerUserId,
      companyId,
      title: input.followUp.title,
      notes: input.followUp.notes,
      dueAt: plan.dueAt,
      typeFields: buildCarriedTypeFields(input.followUp),
      sourceFollowUpId: completedFollowUpId,
      contactId: input.followUp.contact_id ?? null,
    });

    if (!createResult.followUpId) {
      const raced = await loadCompanyPendingCycle(companyId);
      const racedSuccessor = raced.rows.find(
        (row) => row.sourceFollowUpId === completedFollowUpId,
      );

      if (!racedSuccessor) {
        if (completedInThisCall && (raced.rows.length === 0 || raced.error)) {
          let reopenQuery = supabase
            .from("follow_ups")
            .update({ status: "pending", completed_at: null })
            .eq("id", completedFollowUpId)
            .eq("company_id", companyId)
            .eq("status", "completed");

          if (!input.asAdmin) {
            reopenQuery = reopenQuery.eq("user_id", ownerUserId);
          }

          await reopenQuery;
          await syncCompanyCommercialDates(companyId, ownerUserId);
        }

        return {
          error: createResult.error ?? { message: "Unable to schedule the next follow-up." },
          newDueAt: requestedDueAt,
          nextFollowUpId: null,
        };
      }

      nextFollowUpId = racedSuccessor.id;
      scheduledDueAt = racedSuccessor.dueAt;
    } else {
      nextFollowUpId = createResult.followUpId;
      scheduledDueAt = createResult.dueAt ?? plan.dueAt;
    }

    if (!storedDueMatches(scheduledDueAt, plan.dueAt)) {
      let alignQuery = supabase
        .from("follow_ups")
        .update({
          due_at: plan.dueAt,
          source_follow_up_id: completedFollowUpId,
        })
        .eq("id", nextFollowUpId)
        .eq("company_id", companyId)
        .eq("status", "pending");

      if (!input.asAdmin) {
        alignQuery = alignQuery.eq("user_id", ownerUserId);
      }

      const aligned = await alignQuery;
      if (aligned.error && !isMissingColumnError(aligned.error, "source_follow_up_id")) {
        return {
          error: aligned.error,
          newDueAt: plan.dueAt,
          nextFollowUpId,
        };
      }

      if (aligned.error) {
        let dueOnly = supabase
          .from("follow_ups")
          .update({ due_at: plan.dueAt })
          .eq("id", nextFollowUpId)
          .eq("company_id", companyId)
          .eq("status", "pending");

        if (!input.asAdmin) {
          dueOnly = dueOnly.eq("user_id", ownerUserId);
        }

        const dueAligned = await dueOnly;
        if (dueAligned.error) {
          return {
            error: dueAligned.error,
            newDueAt: plan.dueAt,
            nextFollowUpId,
          };
        }
      }

      scheduledDueAt = plan.dueAt;
    }
  }

  if (!nextFollowUpId) {
    return {
      error: { message: "Next follow-up was created but no ID was returned." },
      newDueAt: requestedDueAt,
      nextFollowUpId: null,
    };
  }

  const openAfter = await loadCompanyPendingCycle(companyId);
  if (openAfter.error) {
    return { error: openAfter.error, newDueAt: scheduledDueAt, nextFollowUpId };
  }

  const extras = openAfter.rows
    .filter((row) => row.id !== nextFollowUpId)
    .map((row) => row.id);

  if (extras.length > 0) {
    const sweep = await cancelFollowUpsInCompanyCycle({
      companyId,
      ownerUserId,
      followUpIds: extras,
      asAdmin: input.asAdmin,
    });

    if (sweep.error) {
      return { error: sweep.error, newDueAt: scheduledDueAt, nextFollowUpId };
    }
  }

  const openFinal = await loadCompanyPendingCycle(companyId);
  if (openFinal.error) {
    return { error: openFinal.error, newDueAt: scheduledDueAt, nextFollowUpId };
  }

  const saved = openFinal.rows.find((row) => row.id === nextFollowUpId);
  if (openFinal.rows.length !== 1 || !saved || !storedDueMatches(saved.dueAt, scheduledDueAt)) {
    return {
      error: {
        message:
          "The next follow-up for this company could not be saved as a single open item.",
      },
      newDueAt: scheduledDueAt,
      nextFollowUpId,
    };
  }

  scheduledDueAt = saved.dueAt;

  const activityResult = await insertOutcomeActivity({
    outcome: input.outcome,
    actorUserId: input.actorUserId,
    companyId,
    completedFollowUpId,
    nextFollowUpId,
    previousDueAt,
    newDueAt: scheduledDueAt,
    scheduleMode: input.scheduleMode,
    contactId: managedContact.contactId,
    contactName: managedContact.contactName,
    companyName: input.followUp.companyName,
  });

  if (activityResult.error) {
    return {
      error: activityResult.error,
      newDueAt: scheduledDueAt,
      nextFollowUpId,
    };
  }

  const syncResult = await syncCompanyCommercialDates(companyId, ownerUserId);

  if (syncResult.error) {
    return {
      error: syncResult.error,
      newDueAt: scheduledDueAt,
      nextFollowUpId,
    };
  }

  return { error: null, newDueAt: scheduledDueAt, nextFollowUpId };
}

export function describeFollowUpOutcomeActivityType(type: ActivityType): string {
  return ACTIVITY_TYPE_LABELS[type];
}

export function shouldUpdateLastContactForActivityType(type: string): boolean {
  return updatesLastContactAt(type);
}

export type { FollowUpRecord };
