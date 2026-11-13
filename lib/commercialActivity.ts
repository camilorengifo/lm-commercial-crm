import type { ActivityType } from "@/lib/crmConstants";
import { ACTIVITY_TYPE_LABELS } from "@/lib/crmConstants";
import {
  activityCreationKey,
  completionActivityCreationKey,
} from "@/lib/followUpIdempotency";
import {
  createFollowUp,
  syncCompanyCommercialDates,
  type CreateFollowUpInput,
} from "@/lib/followUps";
import type { FollowUpTypeFormValues } from "@/lib/followUpSeasonal";
import { insertActivityOnce } from "@/lib/idempotentActivityInsert";
import { supabase } from "@/lib/supabaseClient";

export interface NextFollowUpInput {
  dueAt: string;
  channelType: ActivityType;
  notes?: string | null;
  typeFields?: FollowUpTypeFormValues;
}

export interface LogCommercialActivityInput {
  userId: string;
  companyId: string;
  activityType: ActivityType;
  activityAt: string;
  notes: string;
  contactId?: string | null;
  nextFollowUp?: NextFollowUpInput | null;
  /** Stable id for this save. Retries must reuse it. */
  clientRequestId?: string | null;
}

export interface CompleteFollowUpWithActivityInput {
  followUpId: string;
  userId: string;
  companyId: string;
  asAdmin?: boolean;
  activityType: ActivityType;
  activityAt: string;
  notes: string;
  contactId?: string | null;
  nextFollowUp?: NextFollowUpInput | null;
  /** Stable id for this save. Retries must reuse it. */
  clientRequestId?: string | null;
}

function buildFollowUpTitle(channelType: ActivityType): string {
  return `${ACTIVITY_TYPE_LABELS[channelType]} follow-up`;
}

async function insertCommercialActivity(input: {
  userId: string;
  companyId: string;
  activityType: ActivityType;
  activityAt: string;
  notes: string;
  contactId?: string | null;
  scheduledFollowUpAt?: string | null;
  subject?: string | null;
  creationKey?: string | null;
}) {
  const trimmedNotes = input.notes.trim();
  if (!trimmedNotes) {
    return { error: { message: "Outcome / notes are required." } };
  }

  return insertActivityOnce({
    creationKey: input.creationKey ?? null,
    values: {
      user_id: input.userId,
      company_id: input.companyId,
      contact_id: input.contactId?.trim() || null,
      activity_type: input.activityType,
      subject:
        input.subject?.trim() || ACTIVITY_TYPE_LABELS[input.activityType],
      notes: trimmedNotes,
      activity_at: input.activityAt,
      scheduled_follow_up_at: input.scheduledFollowUpAt ?? null,
    },
  });
}

async function createNextFollowUp(
  input: LogCommercialActivityInput | CompleteFollowUpWithActivityInput,
  nextFollowUp: NextFollowUpInput,
  link?: {
    sourceFollowUpId?: string | null;
    clientRequestId?: string | null;
  },
) {
  const followUpInput: CreateFollowUpInput = {
    userId: input.userId,
    companyId: input.companyId,
    title: buildFollowUpTitle(nextFollowUp.channelType),
    notes: nextFollowUp.notes?.trim() || null,
    dueAt: nextFollowUp.dueAt,
    typeFields: nextFollowUp.typeFields,
    contactId: input.contactId,
    sourceFollowUpId: link?.sourceFollowUpId,
    clientRequestId: link?.clientRequestId ?? input.clientRequestId,
  };

  const result = await createFollowUp(followUpInput);
  return { error: result.error };
}

export async function logCommercialActivity(
  input: LogCommercialActivityInput,
): Promise<{ error: { message?: string } | null }> {
  const trimmedNotes = input.notes.trim();
  if (!trimmedNotes) {
    return { error: { message: "Outcome / notes are required." } };
  }

  const nextDueAt = input.nextFollowUp?.dueAt ?? null;

  const activityResult = await insertCommercialActivity({
    userId: input.userId,
    companyId: input.companyId,
    activityType: input.activityType,
    activityAt: input.activityAt,
    notes: trimmedNotes,
    contactId: input.contactId,
    scheduledFollowUpAt: nextDueAt,
    creationKey: activityCreationKey({
      purpose: "log",
      clientRequestId: input.clientRequestId,
    }),
  });

  if (activityResult.error) {
    return activityResult;
  }

  if (input.nextFollowUp?.dueAt) {
    const followUpResult = await createNextFollowUp(input, input.nextFollowUp, {
      clientRequestId: input.clientRequestId,
    });
    if (followUpResult.error) {
      return followUpResult;
    }
  }

  return syncCompanyCommercialDates(input.companyId, input.userId);
}

export async function completeFollowUpWithActivity(
  input: CompleteFollowUpWithActivityInput,
): Promise<{ error: { message?: string } | null }> {
  const trimmedNotes = input.notes.trim();
  if (!trimmedNotes) {
    return { error: { message: "Outcome / notes are required." } };
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
    query = query.eq("user_id", input.userId);
  }

  const { data: completedRow, error: completeError } = await query
    .select("id")
    .maybeSingle();

  if (completeError) {
    return { error: completeError };
  }

  if (!completedRow) {
    const { data: current, error: readError } = await supabase
      .from("follow_ups")
      .select("id, status")
      .eq("id", input.followUpId)
      .eq("company_id", input.companyId)
      .maybeSingle();

    if (readError) {
      return { error: readError };
    }

    if (current?.status === "completed") {
      if (input.nextFollowUp?.dueAt) {
        const followUpResult = await createNextFollowUp(
          input,
          input.nextFollowUp,
          {
            sourceFollowUpId: input.followUpId,
            clientRequestId: input.clientRequestId,
          },
        );
        if (followUpResult.error) {
          return followUpResult;
        }
      }

      return syncCompanyCommercialDates(input.companyId, input.userId);
    }

    return {
      error: { message: "Only open follow-ups can be completed." },
    };
  }

  const nextDueAt = input.nextFollowUp?.dueAt ?? null;

  const activityResult = await insertCommercialActivity({
    userId: input.userId,
    companyId: input.companyId,
    activityType: input.activityType,
    activityAt: input.activityAt,
    notes: trimmedNotes,
    contactId: input.contactId,
    scheduledFollowUpAt: nextDueAt,
    subject: `Completed follow-up: ${ACTIVITY_TYPE_LABELS[input.activityType]}`,
    creationKey: completionActivityCreationKey(input.followUpId),
  });

  if (activityResult.error) {
    return activityResult;
  }

  if (input.nextFollowUp?.dueAt) {
    const followUpResult = await createNextFollowUp(input, input.nextFollowUp, {
      sourceFollowUpId: input.followUpId,
      clientRequestId: input.clientRequestId,
    });
    if (followUpResult.error) {
      return followUpResult;
    }
  }

  return syncCompanyCommercialDates(input.companyId, input.userId);
}

export function nowDatetimeLocal(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
