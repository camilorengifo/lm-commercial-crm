"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CommercialActivityFormFields,
  commercialActivityFormToNextFollowUp,
  emptyCommercialActivityForm,
  validateCommercialActivityForm,
  type CommercialActivityFormValues,
} from "@/components/commercial-activity-form-fields";
import { FollowUpTypeFormFields } from "@/components/follow-up-type-form-fields";
import {
  FOLLOW_UP_STATUS_LABELS,
  priorityBadgeClass,
  type CompanyPriority,
} from "@/lib/crmConstants";
import {
  completeFollowUpWithActivity,
  fromDatetimeLocalValue,
  logCommercialActivity,
  nowDatetimeLocal,
} from "@/lib/commercialActivity";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import {
  DEFAULT_FOLLOW_UP_TYPE_FORM,
  FOLLOW_UP_TYPE_LABELS,
  followUpTypeBadgeClass,
  followUpTypeFormFromRecord,
  normalizeFollowUpType,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import {
  fetchPendingFollowUpsForCompany,
  fromDatetimeLocalValue as followUpFromDatetimeLocalValue,
  getFollowUpBucket,
  rescheduleFollowUp,
  toDatetimeLocalValue,
  type FollowUpRecord,
} from "@/lib/followUps";
import {
  fetchContactsForCompany,
  formatContactName,
  type ContactOption,
} from "@/lib/loadOpportunities";

function bucketLabel(bucket: ReturnType<typeof getFollowUpBucket>): string {
  switch (bucket) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Due today";
    case "upcoming":
      return "Upcoming";
  }
}

function bucketBadgeClass(bucket: ReturnType<typeof getFollowUpBucket>): string {
  switch (bucket) {
    case "overdue":
      return "bg-red-100 text-red-800";
    case "today":
      return "bg-amber-100 text-amber-800";
    case "upcoming":
      return "bg-sky-100 text-sky-800";
  }
}

function EditFollowUpModal({
  followUp,
  saving,
  error,
  onClose,
  onSave,
}: {
  followUp: FollowUpRecord;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: {
    dueAt: string;
    title: string;
    notes: string;
    typeFields: FollowUpTypeFormValues;
  }) => void;
}) {
  const [dueAt, setDueAt] = useState(toDatetimeLocalValue(followUp.due_at));
  const [title, setTitle] = useState(followUp.title);
  const [notes, setNotes] = useState(followUp.notes ?? "");
  const [typeFields, setTypeFields] = useState<FollowUpTypeFormValues>(() =>
    followUpTypeFormFromRecord(followUp),
  );

  useEffect(() => {
    setDueAt(toDatetimeLocalValue(followUp.due_at));
    setTitle(followUp.title);
    setNotes(followUp.notes ?? "");
    setTypeFields(followUpTypeFormFromRecord(followUp));
  }, [followUp]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedDueAt = followUpFromDatetimeLocalValue(dueAt);
    if (!parsedDueAt || !title.trim()) return;

    onSave({
      dueAt: parsedDueAt,
      title: title.trim(),
      notes,
      typeFields,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h3 className="crm-section-title">Edit follow-up</h3>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="edit-follow-up-due"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Due date <span className="text-red-600">*</span>
            </label>
            <input
              id="edit-follow-up-due"
              type="datetime-local"
              required
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="edit-follow-up-title"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Title <span className="text-red-600">*</span>
            </label>
            <input
              id="edit-follow-up-title"
              type="text"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="edit-follow-up-notes"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Note / next step
            </label>
            <textarea
              id="edit-follow-up-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <FollowUpTypeFormFields
            idPrefix="edit-follow-up"
            values={typeFields}
            onChange={setTypeFields}
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="crm-btn-primary disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompleteFollowUpModal({
  followUp,
  contacts,
  saving,
  error,
  onClose,
  onComplete,
}: {
  followUp: FollowUpRecord;
  contacts: ContactOption[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onComplete: (form: CommercialActivityFormValues) => void;
}) {
  const [form, setForm] = useState<CommercialActivityFormValues>(() =>
    emptyCommercialActivityForm(nowDatetimeLocal()),
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onComplete(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h3 className="crm-section-title">Complete follow-up</h3>
        <p className="mt-1 text-sm text-zinc-600">
          What happened with &ldquo;{followUp.title}&rdquo;?
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <CommercialActivityFormFields
            form={form}
            setForm={setForm}
            contacts={contacts}
            idPrefix={`complete-${followUp.id}`}
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="crm-btn-primary disabled:opacity-60"
            >
              {saving ? "Saving..." : "Complete follow-up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CompanyFollowUpsSection({
  companyId,
  userId,
  companyPriority,
  canManage = true,
  isAdmin = false,
  onCompanyUpdated,
  externalRefreshKey,
}: {
  companyId: string;
  userId: string;
  companyPriority: CompanyPriority;
  canManage?: boolean;
  isAdmin?: boolean;
  onCompanyUpdated?: () => void;
  externalRefreshKey?: number;
}) {
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [logForm, setLogForm] = useState<CommercialActivityFormValues>(() =>
    emptyCommercialActivityForm(nowDatetimeLocal()),
  );
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [completeTarget, setCompleteTarget] = useState<FollowUpRecord | null>(
    null,
  );
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<FollowUpRecord | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    setFetchError(null);

    try {
      const [followUpsResult, contactsResult] = await Promise.all([
        fetchPendingFollowUpsForCompany(companyId, userId, isAdmin),
        fetchContactsForCompany(userId, companyId, isAdmin),
      ]);

      if (followUpsResult.error) throw followUpsResult.error;
      if (contactsResult.error) throw contactsResult.error;

      setFollowUps(followUpsResult.data);
      setContacts(contactsResult.data);
    } catch (error) {
      setFetchError(formatSupabaseError(error as { message?: string }));
    }
  }, [companyId, userId, isAdmin]);

  useEffect(() => {
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  useEffect(() => {
    if (externalRefreshKey === undefined || externalRefreshKey === 0) return;
    refreshAll();
  }, [externalRefreshKey, refreshAll]);

  async function handleLogActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLogError(null);
    setSuccessMessage(null);
    setLogSubmitting(true);

    const activityAt = fromDatetimeLocalValue(logForm.activity_at);
    const validationError = validateCommercialActivityForm(logForm, activityAt);

    if (validationError) {
      setLogError(validationError);
      setLogSubmitting(false);
      return;
    }

    const nextDueAt = logForm.schedule_next_follow_up
      ? fromDatetimeLocalValue(logForm.next_follow_up_at)
      : null;

    if (logForm.schedule_next_follow_up && !nextDueAt) {
      setLogError("Next follow-up date is not valid.");
      setLogSubmitting(false);
      return;
    }

    const { error } = await logCommercialActivity({
      userId,
      companyId,
      activityType: logForm.activity_type,
      activityAt: activityAt!,
      notes: logForm.notes,
      contactId: logForm.contact_id || null,
      nextFollowUp:
        nextDueAt && logForm.schedule_next_follow_up
          ? commercialActivityFormToNextFollowUp(logForm, nextDueAt)
          : null,
    });

    if (error) {
      setLogError(formatSupabaseError(error));
      setLogSubmitting(false);
      return;
    }

    setLogForm(emptyCommercialActivityForm(nowDatetimeLocal()));
    setSuccessMessage("Activity logged successfully.");
    await refreshAll();
    onCompanyUpdated?.();
    setLogSubmitting(false);
  }

  async function handleCompleteFollowUp(form: CommercialActivityFormValues) {
    if (!completeTarget) return;

    setCompleteError(null);
    setCompletingId(completeTarget.id);

    const activityAt = fromDatetimeLocalValue(form.activity_at);
    const validationError = validateCommercialActivityForm(form, activityAt);

    if (validationError) {
      setCompleteError(validationError);
      setCompletingId(null);
      return;
    }

    const nextDueAt = form.schedule_next_follow_up
      ? fromDatetimeLocalValue(form.next_follow_up_at)
      : null;

    if (form.schedule_next_follow_up && !nextDueAt) {
      setCompleteError("Next follow-up date is not valid.");
      setCompletingId(null);
      return;
    }

    const { error } = await completeFollowUpWithActivity({
      followUpId: completeTarget.id,
      userId,
      companyId,
      asAdmin: isAdmin,
      activityType: form.activity_type,
      activityAt: activityAt!,
      notes: form.notes,
      contactId: form.contact_id || null,
      nextFollowUp:
        nextDueAt && form.schedule_next_follow_up
          ? commercialActivityFormToNextFollowUp(form, nextDueAt)
          : null,
    });

    if (error) {
      setCompleteError(formatSupabaseError(error));
      setCompletingId(null);
      return;
    }

    setCompleteTarget(null);
    setSuccessMessage("Follow-up completed and activity logged.");
    await refreshAll();
    onCompanyUpdated?.();
    setCompletingId(null);
  }

  async function handleEditFollowUpSave(input: {
    dueAt: string;
    title: string;
    notes: string;
    typeFields: FollowUpTypeFormValues;
  }) {
    if (!editTarget) return;

    setEditingId(editTarget.id);
    setEditError(null);

    const { error } = await rescheduleFollowUp({
      followUpId: editTarget.id,
      ownerUserId: userId,
      companyId,
      dueAt: input.dueAt,
      title: input.title,
      notes: input.notes.trim() || null,
      typeFields: input.typeFields,
      asAdmin: isAdmin,
    });

    if (error) {
      setEditError(formatSupabaseError(error));
      setEditingId(null);
      return;
    }

    setEditTarget(null);
    setSuccessMessage("Follow-up updated.");
    await refreshAll();
    onCompanyUpdated?.();
    setEditingId(null);
  }

  return (
    <section className="crm-card crm-card-padded">
      <div className="mb-6">
        <h2 className="crm-section-title">Follow-ups</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Log what happened and schedule the next action. Manage your daily
          agenda on the{" "}
          <Link
            href="/follow-ups"
            className="font-medium text-zinc-700 underline-offset-2 hover:underline"
          >
            Follow-ups work center
          </Link>
          .
        </p>
      </div>

      {!canManage && (
        <p className="mb-4 text-sm text-zinc-500">
          Only the assigned broker or an admin can log activity for this
          company.
        </p>
      )}

      {successMessage && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </p>
      )}

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {canManage && (
        <div className="mb-8 rounded-lg border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="mb-1 text-sm font-semibold text-zinc-900">
            Log Activity &amp; Schedule Follow-up
          </h3>
          <p className="mb-4 text-sm text-zinc-600">What happened?</p>

          <form onSubmit={handleLogActivity} className="space-y-4">
            <CommercialActivityFormFields
              form={logForm}
              setForm={setLogForm}
              contacts={contacts}
              idPrefix="company-log-activity"
            />

            {logError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {logError}
              </p>
            )}

            <button
              type="submit"
              disabled={logSubmitting}
              className="crm-btn-primary disabled:opacity-60"
            >
              {logSubmitting ? "Saving..." : "Save activity"}
            </button>
          </form>
        </div>
      )}

      <div>
        <h3 className="mb-4 text-sm font-semibold text-zinc-900">
          Open Follow-ups
        </h3>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading follow-ups...</p>
        ) : followUps.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No open follow-ups for this company.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {followUps.map((followUp) => {
              const bucket = getFollowUpBucket(followUp.due_at);
              const nextStep = followUp.notes?.trim() || followUp.title;
              const isCompleting = completingId === followUp.id;
              const followUpType = normalizeFollowUpType(followUp.follow_up_type);
              const isSeasonal = followUpType === "seasonal";

              return (
                <li
                  key={followUp.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900">
                        {followUp.title}
                      </p>
                      <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                        {FOLLOW_UP_STATUS_LABELS[followUp.status]}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${bucketBadgeClass(bucket)}`}
                      >
                        {bucketLabel(bucket)}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(companyPriority)}`}
                      >
                        {companyPriority}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${followUpTypeBadgeClass(followUpType)}`}
                      >
                        {FOLLOW_UP_TYPE_LABELS[followUpType]}
                      </span>
                    </div>

                    {isSeasonal ? (
                      <>
                        <p className="text-sm text-zinc-700">
                          <span className="font-medium text-zinc-600">
                            Target date:
                          </span>{" "}
                          {formatDateTime(followUp.due_at)}
                        </p>
                        {followUp.reminder_start_date && (
                          <p className="text-sm text-zinc-700">
                            <span className="font-medium text-zinc-600">
                              Start reminding:
                            </span>{" "}
                            {formatDate(followUp.reminder_start_date)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-zinc-700">
                        <span className="font-medium text-zinc-600">Due:</span>{" "}
                        {formatDateTime(followUp.due_at)}
                      </p>
                    )}

                    {isSeasonal && followUp.seasonal_context && (
                      <p className="text-sm text-zinc-700">
                        <span className="font-medium text-zinc-600">
                          Seasonal context:
                        </span>{" "}
                        {followUp.seasonal_context}
                      </p>
                    )}

                    <p className="text-sm text-zinc-700">
                      <span className="font-medium text-zinc-600">
                        Note / next step:
                      </span>{" "}
                      {nextStep}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditError(null);
                          setEditTarget(followUp);
                        }}
                        disabled={editingId === followUp.id}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCompleteError(null);
                          setCompleteTarget(followUp);
                        }}
                        disabled={isCompleting}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isCompleting ? "Saving..." : "Complete"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editTarget && (
        <EditFollowUpModal
          followUp={editTarget}
          saving={editingId === editTarget.id}
          error={editError}
          onClose={() => {
            setEditTarget(null);
            setEditError(null);
          }}
          onSave={handleEditFollowUpSave}
        />
      )}

      {completeTarget && (
        <CompleteFollowUpModal
          followUp={completeTarget}
          contacts={contacts}
          saving={completingId === completeTarget.id}
          error={completeError}
          onClose={() => {
            setCompleteTarget(null);
            setCompleteError(null);
          }}
          onComplete={handleCompleteFollowUp}
        />
      )}
    </section>
  );
}
