"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FollowUpTypeFormFields } from "@/components/follow-up-type-form-fields";
import {
  FOLLOW_UP_STATUS_LABELS,
  priorityBadgeClass,
  type CompanyPriority,
} from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import {
  DEFAULT_FOLLOW_UP_TYPE_FORM,
  FOLLOW_UP_TYPE_LABELS,
  followUpTypeBadgeClass,
  normalizeFollowUpType,
  type FollowUpTypeFormValues,
} from "@/lib/followUpSeasonal";
import {
  completeFollowUp,
  createFollowUp,
  fetchPendingFollowUpsForCompany,
  fromDatetimeLocalValue,
  getFollowUpBucket,
  type FollowUpRecord,
} from "@/lib/followUps";
import {
  fetchContactsForCompany,
  formatContactName,
  type ContactOption,
} from "@/lib/loadOpportunities";

interface ScheduleFollowUpFormState {
  title: string;
  notes: string;
  due_at: string;
  typeFields: FollowUpTypeFormValues;
}

function emptyScheduleFollowUpForm(): ScheduleFollowUpFormState {
  return {
    title: "",
    notes: "",
    due_at: "",
    typeFields: { ...DEFAULT_FOLLOW_UP_TYPE_FORM },
  };
}

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

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFollowUpFormState>(
    emptyScheduleFollowUpForm,
  );
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const primaryContactName = useMemo(() => {
    const contact = contacts[0] ?? null;
    return contact ? formatContactName(contact) : null;
  }, [contacts]);

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

  async function handleScheduleFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScheduleError(null);
    setSuccessMessage(null);
    setScheduleSubmitting(true);

    const dueAt = fromDatetimeLocalValue(scheduleForm.due_at);
    if (!dueAt) {
      setScheduleError("A valid due date is required.");
      setScheduleSubmitting(false);
      return;
    }

    const title = scheduleForm.title.trim() || "Follow-up";
    const { error } = await createFollowUp({
      userId,
      companyId,
      title,
      notes: scheduleForm.notes.trim() || null,
      dueAt,
      typeFields: scheduleForm.typeFields,
    });

    if (error) {
      setScheduleError(formatSupabaseError(error));
      setScheduleSubmitting(false);
      return;
    }

    setScheduleForm(emptyScheduleFollowUpForm());
    setShowScheduleForm(false);
    setSuccessMessage("Follow-up scheduled.");
    await refreshAll();
    onCompanyUpdated?.();
    setScheduleSubmitting(false);
  }

  async function handleCompleteFollowUp(followUp: FollowUpRecord) {
    setCompletingId(followUp.id);
    setFetchError(null);

    const { error } = await completeFollowUp(
      followUp.id,
      userId,
      companyId,
      isAdmin,
    );

    if (error) {
      setFetchError(formatSupabaseError(error));
      setCompletingId(null);
      return;
    }

    setSuccessMessage("Follow-up marked as complete.");
    await refreshAll();
    onCompanyUpdated?.();
    setCompletingId(null);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900">Follow-ups</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Open follow-ups for this company. Manage your daily agenda on the{" "}
            <Link
              href="/follow-ups"
              className="font-medium text-zinc-700 underline-offset-2 hover:underline"
            >
              Follow-ups work center
            </Link>
            .
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => {
              setShowScheduleForm((prev) => !prev);
              setScheduleError(null);
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            {showScheduleForm ? "Cancel" : "New Follow-up"}
          </button>
        )}
      </div>

      {!canManage && (
        <p className="mb-4 text-sm text-zinc-500">
          Only the assigned broker or an admin can schedule follow-ups for this
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

      {showScheduleForm && canManage && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="mb-4 text-sm font-medium text-zinc-900">
            Schedule Follow-up
          </h3>
          <form onSubmit={handleScheduleFollowUp} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="company-follow-up-title"
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                >
                  Title
                </label>
                <input
                  id="company-follow-up-title"
                  type="text"
                  value={scheduleForm.title}
                  onChange={(event) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  placeholder="e.g. Call back about Chicago lane"
                />
              </div>

              <div>
                <label
                  htmlFor="company-follow-up-due"
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                >
                  Due date <span className="text-red-600">*</span>
                </label>
                <input
                  id="company-follow-up-due"
                  type="datetime-local"
                  required
                  value={scheduleForm.due_at}
                  onChange={(event) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      due_at: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                />
              </div>

              <div className="sm:col-span-2">
                <FollowUpTypeFormFields
                  idPrefix="company-follow-up"
                  values={scheduleForm.typeFields}
                  onChange={(typeFields) =>
                    setScheduleForm((prev) => ({ ...prev, typeFields }))
                  }
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="company-follow-up-notes"
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                >
                  Note / next step
                </label>
                <textarea
                  id="company-follow-up-notes"
                  rows={3}
                  value={scheduleForm.notes}
                  onChange={(event) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  placeholder="What should happen on this follow-up?"
                />
              </div>
            </div>

            {scheduleError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {scheduleError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={scheduleSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
              >
                {scheduleSubmitting ? "Saving..." : "Save Follow-up"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowScheduleForm(false);
                  setScheduleForm(emptyScheduleFollowUpForm());
                  setScheduleError(null);
                }}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading follow-ups...</p>
      ) : followUps.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No open follow-ups for this company.
          {canManage
            ? " Click New Follow-up to schedule one."
            : ""}
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

                  {primaryContactName && (
                    <p className="text-sm text-zinc-700">
                      <span className="font-medium text-zinc-600">
                        Contact:
                      </span>{" "}
                      {primaryContactName}
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
                  <button
                    type="button"
                    onClick={() => handleCompleteFollowUp(followUp)}
                    disabled={isCompleting}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCompleting ? "Saving..." : "Mark Complete"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
