"use client";

import {
  DEFAULT_REMINDER_LEAD_DAYS,
  FOLLOW_UP_TYPE_LABELS,
  FOLLOW_UP_TYPES,
  REMINDER_LEAD_DAY_OPTIONS,
  type FollowUpType,
  type FollowUpTypeFormValues,
  type ReminderLeadDays,
} from "@/lib/followUpSeasonal";

export function FollowUpTypeFormFields({
  idPrefix,
  values,
  onChange,
}: {
  idPrefix: string;
  values: FollowUpTypeFormValues;
  onChange: (next: FollowUpTypeFormValues) => void;
}) {
  const isSeasonal = values.followUpType === "seasonal";

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={`${idPrefix}-follow-up-type`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Follow-up type
        </label>
        <select
          id={`${idPrefix}-follow-up-type`}
          value={values.followUpType}
          onChange={(event) =>
            onChange({
              ...values,
              followUpType: event.target.value as FollowUpType,
            })
          }
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        >
          {FOLLOW_UP_TYPES.map((type) => (
            <option key={type} value={type}>
              {FOLLOW_UP_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {isSeasonal && (
        <>
          <div>
            <label
              htmlFor={`${idPrefix}-reminder-lead-days`}
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Start reminding
            </label>
            <select
              id={`${idPrefix}-reminder-lead-days`}
              value={values.reminderLeadDays}
              onChange={(event) =>
                onChange({
                  ...values,
                  reminderLeadDays: Number(
                    event.target.value,
                  ) as ReminderLeadDays,
                })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              {REMINDER_LEAD_DAY_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days} days before
                </option>
              ))}
            </select>
            {!REMINDER_LEAD_DAY_OPTIONS.includes(values.reminderLeadDays) && (
              <p className="mt-1 text-xs text-zinc-500">
                Default is {DEFAULT_REMINDER_LEAD_DAYS} days before.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-seasonal-context`}
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Seasonal context
            </label>
            <textarea
              id={`${idPrefix}-seasonal-context`}
              rows={3}
              value={values.seasonalContext}
              onChange={(event) =>
                onChange({
                  ...values,
                  seasonalContext: event.target.value,
                })
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Example: Customer said produce season starts in June. Start warming up the account before then."
            />
          </div>
        </>
      )}
    </div>
  );
}
