export const FOLLOW_UP_TYPES = ["regular", "seasonal"] as const;

export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export const FOLLOW_UP_TYPE_LABELS: Record<FollowUpType, string> = {
  regular: "Regular",
  seasonal: "Seasonal / Future Opportunity",
};

export const REMINDER_LEAD_DAY_OPTIONS = [14, 20, 30, 45] as const;

export type ReminderLeadDays = (typeof REMINDER_LEAD_DAY_OPTIONS)[number];

export const DEFAULT_REMINDER_LEAD_DAYS: ReminderLeadDays = 30;

export interface FollowUpTypeFormValues {
  followUpType: FollowUpType;
  reminderLeadDays: ReminderLeadDays;
  seasonalContext: string;
}

export const DEFAULT_FOLLOW_UP_TYPE_FORM: FollowUpTypeFormValues = {
  followUpType: "regular",
  reminderLeadDays: DEFAULT_REMINDER_LEAD_DAYS,
  seasonalContext: "",
};

export function normalizeFollowUpType(
  value: string | null | undefined,
): FollowUpType {
  return value === "seasonal" ? "seasonal" : "regular";
}

export function isReminderLeadDays(value: number): value is ReminderLeadDays {
  return (REMINDER_LEAD_DAY_OPTIONS as readonly number[]).includes(value);
}

export function computeReminderStartDate(
  dueAtIso: string,
  leadDays: number,
): string | null {
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) return null;

  const start = new Date(due);
  start.setDate(start.getDate() - leadDays);
  return start.toISOString();
}

export function resolveFollowUpSeasonalFields(
  form: FollowUpTypeFormValues,
  dueAt: string,
): {
  follow_up_type: FollowUpType;
  reminder_lead_days: number | null;
  reminder_start_date: string | null;
  seasonal_context: string | null;
} {
  if (form.followUpType === "seasonal") {
    const leadDays = isReminderLeadDays(form.reminderLeadDays)
      ? form.reminderLeadDays
      : DEFAULT_REMINDER_LEAD_DAYS;

    return {
      follow_up_type: "seasonal",
      reminder_lead_days: leadDays,
      reminder_start_date: computeReminderStartDate(dueAt, leadDays),
      seasonal_context: form.seasonalContext.trim() || null,
    };
  }

  return {
    follow_up_type: "regular",
    reminder_lead_days: null,
    reminder_start_date: null,
    seasonal_context: null,
  };
}

export function followUpTypeFormFromRecord(input: {
  follow_up_type?: string | null;
  reminder_lead_days?: number | null;
  seasonal_context?: string | null;
}): FollowUpTypeFormValues {
  const followUpType = normalizeFollowUpType(input.follow_up_type);
  const leadDays = input.reminder_lead_days;

  return {
    followUpType,
    reminderLeadDays:
      leadDays && isReminderLeadDays(leadDays)
        ? leadDays
        : DEFAULT_REMINDER_LEAD_DAYS,
    seasonalContext: input.seasonal_context ?? "",
  };
}

export function followUpTypeBadgeClass(type: FollowUpType): string {
  switch (type) {
    case "regular":
      return "bg-zinc-100 text-zinc-700";
    case "seasonal":
      return "bg-violet-100 text-violet-800";
  }
}

export function reminderLeadDaysLabel(days: number): string {
  return `${days} days before`;
}
