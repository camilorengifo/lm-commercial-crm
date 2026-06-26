"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  activityTypeBadgeClass,
  type ActivityType,
} from "@/lib/crmConstants";
import { FollowUpTypeFormFields } from "@/components/follow-up-type-form-fields";
import {
  DEFAULT_FOLLOW_UP_TYPE_FORM,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import { supabase } from "@/lib/supabaseClient";
import { createFollowUp } from "@/lib/followUps";

interface Activity {
  id: string;
  user_id: string;
  company_id: string;
  activity_type: ActivityType;
  subject: string | null;
  notes: string | null;
  activity_at: string;
  created_at: string;
}

interface ActivityFormState {
  activity_type: ActivityType;
  activity_at: string;
  subject: string;
  notes: string;
  schedule_follow_up: string;
  follow_up_notes: string;
  followUpTypeFields: FollowUpTypeFormValues;
}

function nowDatetimeLocal(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function emptyActivityForm(): ActivityFormState {
  return {
    activity_type: "call",
    activity_at: nowDatetimeLocal(),
    subject: "",
    notes: "",
    schedule_follow_up: "",
    follow_up_notes: "",
    followUpTypeFields: { ...DEFAULT_FOLLOW_UP_TYPE_FORM },
  };
}

function activityToForm(activity: Activity): ActivityFormState {
  return {
    activity_type: activity.activity_type,
    activity_at: toDatetimeLocalValue(activity.activity_at),
    subject: activity.subject ?? "",
    notes: activity.notes ?? "",
    schedule_follow_up: "",
    follow_up_notes: "",
    followUpTypeFields: { ...DEFAULT_FOLLOW_UP_TYPE_FORM },
  };
}

function buildActivityPayload(form: ActivityFormState) {
  return {
    activity_type: form.activity_type,
    activity_at: fromDatetimeLocalValue(form.activity_at) ?? new Date().toISOString(),
    subject: form.subject.trim() || null,
    notes: form.notes.trim() || null,
  };
}

function validateActivityForm(form: ActivityFormState): string | null {
  const activityAt = fromDatetimeLocalValue(form.activity_at);
  if (!activityAt) {
    return "Activity date is required.";
  }

  if (!form.subject.trim() && !form.notes.trim()) {
    return "Enter a subject or notes to describe the activity.";
  }

  if (form.schedule_follow_up.trim()) {
    const followUpAt = fromDatetimeLocalValue(form.schedule_follow_up);
    if (!followUpAt) {
      return "The follow-up date is not valid.";
    }
  }

  return null;
}

function ActivityFormFields({
  form,
  setForm,
  idPrefix,
  showFollowUpFields,
}: {
  form: ActivityFormState;
  setForm: React.Dispatch<React.SetStateAction<ActivityFormState>>;
  idPrefix: string;
  showFollowUpFields: boolean;
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
          {ACTIVITY_TYPES.map((option) => (
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
          Date & time <span className="text-red-600">*</span>
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

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-subject`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Subject
        </label>
        <input
          id={`${idPrefix}-subject`}
          type="text"
          value={form.subject}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, subject: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="e.g. Proposal follow-up"
        />
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-notes`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          rows={3}
          value={form.notes}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, notes: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Interaction details..."
        />
        <p className="mt-1 text-xs text-zinc-500">
          Enter a subject or notes.
        </p>
      </div>

      {showFollowUpFields && (
        <>
          <div>
            <label
              htmlFor={`${idPrefix}-schedule_follow_up`}
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Schedule next follow-up
            </label>
            <input
              id={`${idPrefix}-schedule_follow_up`}
              type="datetime-local"
              value={form.schedule_follow_up}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  schedule_follow_up: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-follow_up_notes`}
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Follow-up notes
            </label>
            <input
              id={`${idPrefix}-follow_up_notes`}
              type="text"
              value={form.follow_up_notes}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  follow_up_notes: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Reason or reminder"
            />
          </div>

          <div className="sm:col-span-2">
            <FollowUpTypeFormFields
              idPrefix={`${idPrefix}-follow-up`}
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

export function CompanyChronologySection({
  companyId,
  userId,
  onCompanyUpdated,
  externalRefreshKey,
  canManage = true,
}: {
  companyId: string;
  userId: string;
  onCompanyUpdated?: () => void;
  externalRefreshKey?: number;
  canManage?: boolean;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<ActivityFormState>(emptyActivityForm);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ActivityFormState>(emptyActivityForm);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const syncCompanyFields = useCallback(async () => {
    const { data: latestActivity } = await supabase
      .from("activities")
      .select("activity_at")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .order("activity_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: nextFollowUp, error: followUpError } = await supabase
      .from("follow_ups")
      .select("due_at")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("due_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (followUpError) {
      throw followUpError;
    }

    const { error: companyError } = await supabase
      .from("companies")
      .update({
        last_contact_at: latestActivity?.activity_at ?? null,
        next_follow_up_at: nextFollowUp?.due_at ?? null,
      })
      .eq("id", companyId)
      .eq("user_id", userId);

    if (companyError) {
      throw companyError;
    }

    onCompanyUpdated?.();
  }, [companyId, userId, onCompanyUpdated]);

  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from("activities")
      .select(
        "id, user_id, company_id, activity_type, subject, notes, activity_at, created_at",
      )
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .order("activity_at", { ascending: false });

    if (error) {
      throw error;
    }

    setActivities((data as Activity[]) ?? []);
  }, [companyId, userId]);

  const refreshAll = useCallback(async () => {
    setFetchError(null);
    try {
      await fetchActivities();
      await syncCompanyFields();
    } catch (error) {
      setFetchError(formatSupabaseError(error as { message?: string }));
    }
  }, [fetchActivities, syncCompanyFields]);

  useEffect(() => {
    setLoadingActivities(true);

    refreshAll().finally(() => {
      setLoadingActivities(false);
    });
  }, [refreshAll]);

  useEffect(() => {
    if (externalRefreshKey === undefined || externalRefreshKey === 0) return;
    refreshAll();
  }, [externalRefreshKey, refreshAll]);

  async function createFollowUpFromForm(
    form: ActivityFormState,
    activitySubject: string | null,
    activityType: ActivityType,
  ) {
    const dueAt = fromDatetimeLocalValue(form.schedule_follow_up);
    if (!dueAt) return;

    const title =
      activitySubject?.trim() ||
      `Follow-up: ${ACTIVITY_TYPE_LABELS[activityType]}`;

    const { error } = await createFollowUp({
      userId,
      companyId,
      title,
      notes: form.follow_up_notes.trim() || null,
      dueAt,
      typeFields: form.followUpTypeFields,
    });

    if (error) {
      throw error;
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);

    const validationError = validateActivityForm(createForm);
    if (validationError) {
      setCreateError(validationError);
      setCreateSubmitting(false);
      return;
    }

    const payload = {
      user_id: userId,
      company_id: companyId,
      ...buildActivityPayload(createForm),
    };

    const { error } = await supabase.from("activities").insert(payload);

    if (error) {
      setCreateError(formatSupabaseError(error));
      setCreateSubmitting(false);
      return;
    }

    try {
      if (createForm.schedule_follow_up.trim()) {
        await createFollowUpFromForm(
          createForm,
          payload.subject,
          createForm.activity_type,
        );
      }

      setCreateForm(emptyActivityForm());
      setShowCreateForm(false);
      await refreshAll();
    } catch (followUpError) {
      setCreateError(formatSupabaseError(followUpError as { message?: string }));
    }

    setCreateSubmitting(false);
  }

  function startEditing(activity: Activity) {
    setEditingId(activity.id);
    setEditForm(activityToForm(activity));
    setEditError(null);
    setShowCreateForm(false);
    setCreateError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(emptyActivityForm());
    setEditError(null);
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;

    setEditError(null);
    setEditSubmitting(true);

    const validationError = validateActivityForm(editForm);
    if (validationError) {
      setEditError(validationError);
      setEditSubmitting(false);
      return;
    }

    const payload = buildActivityPayload(editForm);

    const { error } = await supabase
      .from("activities")
      .update(payload)
      .eq("id", editingId)
      .eq("company_id", companyId)
      .eq("user_id", userId);

    if (error) {
      setEditError(formatSupabaseError(error));
      setEditSubmitting(false);
      return;
    }

    setEditingId(null);
    setEditForm(emptyActivityForm());
    await refreshAll();
    setEditSubmitting(false);
  }

  async function handleDelete(activity: Activity) {
    const label =
      activity.subject?.trim() ||
      ACTIVITY_TYPE_LABELS[activity.activity_type];
    const confirmed = window.confirm(
      `Delete activity "${label}" from ${formatDateTime(activity.activity_at)}? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingId(activity.id);

    const { error } = await supabase
      .from("activities")
      .delete()
      .eq("id", activity.id)
      .eq("company_id", companyId)
      .eq("user_id", userId);

    if (error) {
      setFetchError(formatSupabaseError(error));
      setDeletingId(null);
      return;
    }

    if (editingId === activity.id) {
      cancelEditing();
    }

    await refreshAll();
    setDeletingId(null);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900">
            Commercial Timeline
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Activity and interaction history for this company
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              setCreateError(null);
              cancelEditing();
            }}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            {showCreateForm ? "Cancel" : "Log Activity"}
          </button>
        )}
      </div>

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {showCreateForm && canManage && (
        <div className="mb-8 rounded-lg border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="mb-4 text-sm font-medium text-zinc-900">
            New Activity
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <ActivityFormFields
              form={createForm}
              setForm={setCreateForm}
              idPrefix="create"
              showFollowUpFields
            />

            {createError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createSubmitting ? "Saving..." : "Save Activity"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateForm(emptyActivityForm());
                  setCreateError(null);
                }}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Activity History
        </h3>

        {loadingActivities ? (
          <p className="text-sm text-zinc-500">Loading activities...</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No activities have been recorded for this company yet.
          </p>
        ) : (
          <ol className="relative space-y-0 border-l border-zinc-200 pl-6">
            {activities.map((activity) => {
              const isEditing = editingId === activity.id;
              const isDeleting = deletingId === activity.id;

              return (
                <li key={activity.id} className="relative pb-8 last:pb-0">
                  <span className="absolute -left-[1.625rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-zinc-400 ring-1 ring-zinc-200" />

                  {isEditing ? (
                    <form
                      onSubmit={handleEdit}
                      className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
                    >
                      <h4 className="text-sm font-medium text-zinc-900">
                        Edit Activity
                      </h4>
                      <ActivityFormFields
                        form={editForm}
                        setForm={setEditForm}
                        idPrefix={`edit-${activity.id}`}
                        showFollowUpFields={false}
                      />

                      {editError && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                          {editError}
                        </p>
                      )}

                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={editSubmitting}
                          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {editSubmitting ? "Saving..." : "Save Changes"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <time
                              dateTime={activity.activity_at}
                              className="text-sm font-semibold text-zinc-900"
                            >
                              {formatDateTime(activity.activity_at)}
                            </time>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${activityTypeBadgeClass(activity.activity_type)}`}
                            >
                              {ACTIVITY_TYPE_LABELS[activity.activity_type]}
                            </span>
                          </div>

                          {activity.subject && (
                            <p className="text-sm font-medium text-zinc-800">
                              {activity.subject}
                            </p>
                          )}

                          {activity.notes && (
                            <p className="whitespace-pre-wrap text-sm text-zinc-600">
                              {activity.notes}
                            </p>
                          )}

                          <p className="text-xs text-zinc-400">
                            Recorded on {formatDate(activity.created_at)}
                          </p>
                        </div>

                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(activity)}
                            disabled={isDeleting}
                            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(activity)}
                            disabled={isDeleting}
                            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
