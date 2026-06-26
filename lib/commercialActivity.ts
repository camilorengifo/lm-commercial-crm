import type { ActivityType } from "@/lib/crmConstants";
import { ACTIVITY_TYPE_LABELS } from "@/lib/crmConstants";
import {
  createFollowUp,
  syncCompanyCommercialDates,
  type CreateFollowUpInput,
} from "@/lib/followUps";
import type { FollowUpTypeFormValues } from "@/lib/followUpSeasonal";
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
}) {
  const trimmedNotes = input.notes.trim();
  if (!trimmedNotes) {
    return { error: { message: "Outcome / notes are required." } };
  }

  const { error } = await supabase.from("activities").insert({
    user_id: input.userId,
    company_id: input.companyId,
    contact_id: input.contactId?.trim() || null,
    activity_type: input.activityType,
    subject:
      input.subject?.trim() || ACTIVITY_TYPE_LABELS[input.activityType],
    notes: trimmedNotes,
    activity_at: input.activityAt,
    scheduled_follow_up_at: input.scheduledFollowUpAt ?? null,
  });

  if (error) {
    return { error };
  }

  return { error: null };
}

async function createNextFollowUp(
  input: LogCommercialActivityInput | CompleteFollowUpWithActivityInput,
  nextFollowUp: NextFollowUpInput,
) {
  const followUpInput: CreateFollowUpInput = {
    userId: input.userId,
    companyId: input.companyId,
    title: buildFollowUpTitle(nextFollowUp.channelType),
    notes: nextFollowUp.notes?.trim() || null,
    dueAt: nextFollowUp.dueAt,
    typeFields: nextFollowUp.typeFields,
  };

  return createFollowUp(followUpInput);
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
  });

  if (activityResult.error) {
    return activityResult;
  }

  if (input.nextFollowUp?.dueAt) {
    const followUpResult = await createNextFollowUp(input, input.nextFollowUp);
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
    .eq("company_id", input.companyId);

  if (!input.asAdmin) {
    query = query.eq("user_id", input.userId);
  }

  const { error: completeError } = await query;

  if (completeError) {
    return { error: completeError };
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
  });

  if (activityResult.error) {
    return activityResult;
  }

  if (input.nextFollowUp?.dueAt) {
    const followUpResult = await createNextFollowUp(input, input.nextFollowUp);
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
