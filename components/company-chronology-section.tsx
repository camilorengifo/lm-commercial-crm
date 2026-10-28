"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_TYPE_LABELS,
  MANUAL_ACTIVITY_TYPES,
  activityTypeBadgeClass,
  type ActivityType,
} from "@/lib/crmConstants";
import {
  fetchCommercialTimelineActivities,
  type CommercialTimelineActivity,
} from "@/lib/commercialTimeline";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import {
  ACTIVITY_DELETED_MESSAGE,
  ACTIVITY_UNCHANGED_MESSAGE,
  activityEditIsUnchanged,
  canChangeActivityType,
  canDeleteCommercialActivity,
  canEditCommercialActivity,
  validateActivityEdit,
  type ActivityEditDraft,
} from "@/lib/activityEdit";
import {
  deleteCommercialActivity,
  updateCommercialActivity,
} from "@/lib/activityEditClient";

export function CompanyChronologySection({
  companyId,
  userId,
  viewerUserId,
  externalRefreshKey,
  canManage = false,
  isAdmin = false,
  onCompanyUpdated,
}: {
  companyId: string;
  userId: string;
  viewerUserId: string;
  onCompanyUpdated?: () => void | Promise<void>;
  externalRefreshKey?: number;
  canManage?: boolean;
  isAdmin?: boolean;
}) {
  const [activities, setActivities] = useState<CommercialTimelineActivity[]>(
    [],
  );
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActivityEditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<CommercialTimelineActivity | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const deletingRef = useRef(false);

  const fetchActivities = useCallback(async () => {
    const { data, error } = await fetchCommercialTimelineActivities({
      companyId,
      userId,
      isAdmin,
    });

    if (error) {
      throw error;
    }

    setActivities(data);
  }, [companyId, userId, isAdmin]);

  const refreshAll = useCallback(async () => {
    setFetchError(null);
    try {
      await fetchActivities();
    } catch (error) {
      setFetchError(formatSupabaseError(error as { message?: string }));
    }
  }, [fetchActivities]);

  const cancelEditing = useCallback(() => {
    if (savingRef.current) return;
    setEditingId(null);
    setDraft(null);
    setEditError(null);
    setFormNotice(null);
  }, []);

  useEffect(() => {
    setEditingId(null);
    setDraft(null);
    setEditError(null);
    setFormNotice(null);
    setSaveMessage(null);
    setPendingDelete(null);
    setDeleteError(null);
  }, [companyId]);

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

  useEffect(() => {
    if (!editingId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelEditing();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingId, cancelEditing]);

  function startEditing(activity: CommercialTimelineActivity) {
    if (savingRef.current || deletingRef.current || pendingDelete) return;
    setSaveMessage(null);
    setDeleteError(null);
    setEditError(null);
    setFormNotice(null);
    setEditingId(activity.id);
    setDraft({
      subject: activity.subject ?? "",
      notes: activity.notes ?? "",
      activityType: activity.activity_type,
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || !editingId || !draft) return;

    const activity = activities.find((item) => item.id === editingId);
    if (!activity) return;

    if (
      activityEditIsUnchanged({
        originalSubject: activity.subject,
        originalNotes: activity.notes,
        originalActivityType: activity.activity_type,
        draft,
      })
    ) {
      setFormNotice(ACTIVITY_UNCHANGED_MESSAGE);
      setEditError(null);
      return;
    }

    const validationError = validateActivityEdit({
      draft,
      originalActivityType: activity.activity_type,
    });
    if (validationError) {
      setEditError(validationError);
      setFormNotice(null);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setEditError(null);
    setFormNotice(null);

    try {
      const result = await updateCommercialActivity({
        activityId: activity.id,
        companyId,
        draft,
      });

      if (result.error) {
        setEditError(result.error);
        return;
      }

      if (result.message === ACTIVITY_UNCHANGED_MESSAGE) {
        setFormNotice(result.message);
        return;
      }

      setEditingId(null);
      setDraft(null);
      setSaveMessage(result.message ?? "Activity updated.");
      await refreshAll();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function requestDelete(activity: CommercialTimelineActivity) {
    if (savingRef.current || deletingRef.current) return;
    setSaveMessage(null);
    setDeleteError(null);
    setPendingDelete(activity);
  }

  function cancelDelete() {
    if (deletingRef.current) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (deletingRef.current || !pendingDelete) return;

    const activity = pendingDelete;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteCommercialActivity({
        activityId: activity.id,
        companyId,
      });

      if (result.error) {
        setDeleteError(result.error);
        return;
      }

      if (editingId === activity.id) {
        setEditingId(null);
        setDraft(null);
        setEditError(null);
        setFormNotice(null);
      }

      setActivities((current) =>
        current.filter((item) => item.id !== activity.id),
      );
      setPendingDelete(null);
      setSaveMessage(result.message ?? ACTIVITY_DELETED_MESSAGE);
      await refreshAll();
      try {
        await onCompanyUpdated?.();
      } catch {
        // The timeline entry is already gone. A company refresh failure
        // should not look like a failed delete.
      }
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <section className="crm-card crm-card-padded">
      <div className="mb-6">
        <h2 className="crm-section-title">Commercial Timeline</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Commercial history is generated automatically from completed
          activities and follow-ups. Use Edit to correct a comment without
          adding a duplicate activity. Use Delete to remove one entry after
          you confirm. Follow-ups and other history stay in place.
        </p>
      </div>

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {fetchError}
        </p>
      )}

      {saveMessage && (
        <p
          className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {saveMessage}
        </p>
      )}

      {loadingActivities ? (
        <p className="text-sm text-zinc-500">Loading commercial history...</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No commercial activity has been recorded for this company yet. Log
          activity from the Follow-ups section above.
        </p>
      ) : (
        <ol className="relative space-y-0 border-l border-zinc-200 pl-6">
          {activities.map((activity) => {
            const isEditing = editingId === activity.id && draft !== null;
            const editable = canEditCommercialActivity({
              canManage,
              isAdmin,
              viewerUserId,
              activityUserId: activity.user_id,
            });
            const deletable = canDeleteCommercialActivity({
              canManage,
              isAdmin,
              viewerUserId,
              activityUserId: activity.user_id,
              activityType: activity.activity_type,
            });

            return (
              <li key={activity.id} className="relative pb-8 last:pb-0">
                <span className="absolute -left-[1.625rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-zinc-400 ring-1 ring-zinc-200" />

                <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                  {isEditing && draft ? (
                    <ActivityEditForm
                      activity={activity}
                      draft={draft}
                      saving={saving}
                      editError={editError}
                      formNotice={formNotice}
                      onDraftChange={setDraft}
                      onSubmit={handleSave}
                      onCancel={cancelEditing}
                    />
                  ) : (
                    <ActivitySummary
                      activity={activity}
                      editable={editable}
                      deletable={deletable}
                      disabled={saving || deleting || pendingDelete !== null}
                      onEdit={() => startEditing(activity)}
                      onDelete={() => requestDelete(activity)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {pendingDelete && (
        <DeleteTimelineEntryDialog
          deleting={deleting}
          error={deleteError}
          onCancel={cancelDelete}
          onConfirm={() => {
            void confirmDelete();
          }}
        />
      )}
    </section>
  );
}

function ActivitySummary({
  activity,
  editable,
  deletable,
  disabled,
  onEdit,
  onDelete,
}: {
  activity: CommercialTimelineActivity;
  editable: boolean;
  deletable: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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

        {(editable || deletable) && (
          <div className="flex shrink-0 items-center gap-2">
            {editable && (
              <button
                type="button"
                onClick={onEdit}
                disabled={disabled}
                aria-label={`Edit activity from ${formatDateTime(activity.activity_at)}`}
                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Edit
              </button>
            )}
            {deletable && (
              <button
                type="button"
                onClick={onDelete}
                disabled={disabled}
                aria-label={`Delete activity from ${formatDateTime(activity.activity_at)}`}
                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {activity.subject &&
        activity.subject !== ACTIVITY_TYPE_LABELS[activity.activity_type] && (
          <p className="break-words text-sm font-medium text-zinc-800">
            {activity.subject}
          </p>
        )}

      {activity.notes && (
        <p className="break-words whitespace-pre-wrap text-sm text-zinc-600">
          {activity.notes}
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {activity.brokerEmail && <span>Broker: {activity.brokerEmail}</span>}
        {activity.contactName && <span>Contact: {activity.contactName}</span>}
      </div>

      {activity.scheduled_follow_up_at && (
        <p className="text-sm text-sky-700">
          Next follow-up scheduled for{" "}
          {formatDateTime(activity.scheduled_follow_up_at)}
        </p>
      )}

      <p className="text-xs text-zinc-400">
        Recorded on {formatDate(activity.created_at)}
      </p>
      {activity.updated_by && (
        <p className="text-xs text-zinc-400">
          Edited
          {activity.editedByEmail ? ` by ${activity.editedByEmail}` : ""} on{" "}
          {formatDateTime(activity.updated_at)}
        </p>
      )}
    </div>
  );
}

function DeleteTimelineEntryDialog({
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleting, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-timeline-entry-title"
        aria-describedby="delete-timeline-entry-message"
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
      >
        <h2
          id="delete-timeline-entry-title"
          className="text-lg font-semibold text-zinc-900"
        >
          Delete timeline entry?
        </h2>
        <p id="delete-timeline-entry-message" className="mt-2 text-sm text-zinc-600">
          This action cannot be undone. Are you sure you want to delete this entry?
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            autoFocus
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="crm-btn-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivityEditForm({
  activity,
  draft,
  saving,
  editError,
  formNotice,
  onDraftChange,
  onSubmit,
  onCancel,
}: {
  activity: CommercialTimelineActivity;
  draft: ActivityEditDraft;
  saving: boolean;
  editError: string | null;
  formNotice: string | null;
  onDraftChange: (draft: ActivityEditDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const typeLocked = !canChangeActivityType(activity.activity_type);
  const idPrefix = `activity-edit-${activity.id}`;

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={saving}>
      <div className="flex flex-wrap items-center gap-2">
        <time
          dateTime={activity.activity_at}
          className="text-sm font-semibold text-zinc-900"
        >
          {formatDateTime(activity.activity_at)}
        </time>
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${activityTypeBadgeClass(draft.activityType)}`}
        >
          {ACTIVITY_TYPE_LABELS[draft.activityType]}
        </span>
      </div>

      <p className="text-sm text-zinc-500">
        Update this timeline record. The activity date, company, contact, and
        broker stay the same.
      </p>

      {activity.follow_up_id && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          This entry is linked to a follow-up. Saving updates the timeline
          comment only and does not create or change follow-ups.
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {activity.contactName && <span>Contact: {activity.contactName}</span>}
        {activity.brokerEmail && <span>Broker: {activity.brokerEmail}</span>}
      </div>

      {typeLocked ? (
        <p className="text-sm text-zinc-600">
          Activity type: {ACTIVITY_TYPE_LABELS[activity.activity_type]}. This
          type cannot be changed.
        </p>
      ) : (
        <div>
          <label
            htmlFor={`${idPrefix}-activity-type`}
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Activity type
          </label>
          <select
            id={`${idPrefix}-activity-type`}
            value={draft.activityType}
            disabled={saving}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                activityType: event.target.value as ActivityType,
              })
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-50"
          >
            {MANUAL_ACTIVITY_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label
          htmlFor={`${idPrefix}-subject`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Description
        </label>
        <input
          id={`${idPrefix}-subject`}
          type="text"
          value={draft.subject}
          disabled={saving}
          onChange={(event) =>
            onDraftChange({ ...draft, subject: event.target.value })
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-50"
          placeholder="Short description shown on the timeline"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-notes`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Comment <span className="text-red-600">*</span>
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          rows={4}
          required
          value={draft.notes}
          disabled={saving}
          onChange={(event) =>
            onDraftChange({ ...draft, notes: event.target.value })
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-50"
          placeholder="What happened on this interaction?"
        />
      </div>

      {editError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {editError}
        </p>
      )}

      {formNotice && (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700" role="status">
          {formNotice}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="crm-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
