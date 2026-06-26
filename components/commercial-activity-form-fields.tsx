"use client";

import {
  ACTIVITY_TYPES,
  type ActivityType,
} from "@/lib/crmConstants";
import { FollowUpTypeFormFields } from "@/components/follow-up-type-form-fields";
import {
  DEFAULT_FOLLOW_UP_TYPE_FORM,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import type { ContactOption } from "@/lib/loadOpportunities";
import { formatContactName } from "@/lib/loadOpportunities";

export interface CommercialActivityFormValues {
  activity_type: ActivityType;
  activity_at: string;
  notes: string;
  contact_id: string;
  schedule_next_follow_up: boolean;
  next_follow_up_at: string;
  next_follow_up_type: ActivityType;
  next_follow_up_notes: string;
  followUpTypeFields: FollowUpTypeFormValues;
}

export const BROKER_ACTIVITY_TYPES = ACTIVITY_TYPES.filter(
  (option) => option.value !== "other",
);

export function emptyCommercialActivityForm(
  activityAt: string,
): CommercialActivityFormValues {
  return {
    activity_type: "call",
    activity_at: activityAt,
    notes: "",
    contact_id: "",
    schedule_next_follow_up: false,
    next_follow_up_at: "",
    next_follow_up_type: "call",
    next_follow_up_notes: "",
    followUpTypeFields: { ...DEFAULT_FOLLOW_UP_TYPE_FORM },
  };
}

export function validateCommercialActivityForm(
  form: CommercialActivityFormValues,
  activityAt: string | null,
): string | null {
  if (!activityAt) {
    return "Activity date is required.";
  }

  if (!form.notes.trim()) {
    return "Outcome / notes are required.";
  }

  if (form.schedule_next_follow_up) {
    if (!form.next_follow_up_at.trim()) {
      return "Next follow-up date is required when scheduling a follow-up.";
    }
  }

  return null;
}

export function CommercialActivityFormFields({
  form,
  setForm,
  contacts,
  idPrefix,
  showContactField = true,
}: {
  form: CommercialActivityFormValues;
  setForm: React.Dispatch<React.SetStateAction<CommercialActivityFormValues>>;
  contacts: ContactOption[];
  idPrefix: string;
  showContactField?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label
          htmlFor={`${idPrefix}-activity_type`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Activity type <span className="text-red-600">*</span>
        </label>
        <select
          id={`${idPrefix}-activity_type`}
          required
          value={form.activity_type}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              activity_type: event.target.value as ActivityType,
            }))
          }
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        >
          {BROKER_ACTIVITY_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-activity_at`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Activity date <span className="text-red-600">*</span>
        </label>
        <input
          id={`${idPrefix}-activity_at`}
          type="datetime-local"
          required
          value={form.activity_at}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, activity_at: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {showContactField && (
        <div className="sm:col-span-2">
          <label
            htmlFor={`${idPrefix}-contact_id`}
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Contact
          </label>
          <select
            id={`${idPrefix}-contact_id`}
            value={form.contact_id}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, contact_id: event.target.value }))
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="">No specific contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {formatContactName(contact)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-notes`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Outcome / notes <span className="text-red-600">*</span>
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          rows={3}
          required
          value={form.notes}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, notes: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="What happened on this interaction?"
        />
      </div>

      <div className="sm:col-span-2 border-t border-zinc-200 pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <input
            type="checkbox"
            checked={form.schedule_next_follow_up}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                schedule_next_follow_up: event.target.checked,
              }))
            }
            className="rounded border-zinc-300"
          />
          Schedule next follow-up
        </label>
      </div>

      {form.schedule_next_follow_up && (
        <>
          <div>
            <label
              htmlFor={`${idPrefix}-next_follow_up_at`}
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Next follow-up date <span className="text-red-600">*</span>
            </label>
            <input
              id={`${idPrefix}-next_follow_up_at`}
              type="datetime-local"
              required={form.schedule_next_follow_up}
              value={form.next_follow_up_at}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  next_follow_up_at: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-next_follow_up_type`}
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Next follow-up type
            </label>
            <select
              id={`${idPrefix}-next_follow_up_type`}
              value={form.next_follow_up_type}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  next_follow_up_type: event.target.value as ActivityType,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              {BROKER_ACTIVITY_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor={`${idPrefix}-next_follow_up_notes`}
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Next follow-up notes
            </label>
            <input
              id={`${idPrefix}-next_follow_up_notes`}
              type="text"
              value={form.next_follow_up_notes}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  next_follow_up_notes: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="What should happen next?"
            />
          </div>

          <div className="sm:col-span-2">
            <FollowUpTypeFormFields
              idPrefix={`${idPrefix}-seasonal`}
              values={form.followUpTypeFields}
              onChange={(followUpTypeFields) =>
                setForm((prev) => ({ ...prev, followUpTypeFields }))
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

export function commercialActivityFormToNextFollowUp(
  form: CommercialActivityFormValues,
  nextDueAt: string,
) {
  return {
    dueAt: nextDueAt,
    channelType: form.next_follow_up_type,
    notes: form.next_follow_up_notes.trim() || null,
    typeFields: form.followUpTypeFields,
  };
}
