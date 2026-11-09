"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CrmAlert, CrmCard, PageHeader, StatCard, StatGrid } from "@/components/crm-ui";
import {
  ACCOUNT_STATUS_LABELS,
  accountStatusBadgeClass,
} from "@/lib/accountStatus";
import {
  MANUAL_ACTIVITY_TYPES,
  COMPANY_PRIORITIES,
  FOLLOW_UP_STATUS_LABELS,
  priorityBadgeClass,
  type ActivityType,
  type CompanyPriority,
  type FollowUpStatus,
} from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import { stopFollowUp } from "@/lib/doNotFollowUp";
import {
  bucketFollowUpsWithCompanies,
  createActivityNote,
  fetchCancelledFollowUps,
  fetchDoNotFollowUpFollowUps,
  fetchFollowUpWorkcenterData,
  type FollowUpWorkcenterData,
  fromDatetimeLocalValue,
  getFollowUpBucket,
  isCompletedThisWeek,
  isDueThisWeek,
  isPendingFollowUpStatus,
  toDatetimeLocalValue,
  type FollowUpEnriched,
} from "@/lib/followUps";
import {
  DO_NOT_FOLLOW_UP_REASONS,
  doNotFollowUpReasonLabel,
  type DoNotFollowUpReason,
  type FollowUpSuppressionChoice,
} from "@/lib/outreachSuppressionRules";
import {
  automaticNextFollowUpDueAt,
  completeFollowUpAndScheduleNext,
  isFutureDueAt,
  nextFollowUpDueAtFromCompletion,
  type FollowUpCompletionOutcome,
  type ScheduleNextMode,
} from "@/lib/followUpOutcomes";
import { getDaysOverdue } from "@/lib/brokerDashboard";
import { supabase } from "@/lib/supabaseClient";

type WorkcenterTab = "today" | "overdue" | "upcoming" | "completed";
type ClosedFollowUpVariant = "cancelled" | "do_not_follow_up";
type StatusFilter = "open" | FollowUpStatus;
type FollowUpCardVariant = WorkcenterTab | ClosedFollowUpVariant;
type DueDateFilter = "all" | "today" | "overdue" | "this_week";

function SummaryCard({
  label,
  value,
  onClick,
  highlight,
}: {
  label: string;
  value: number | string;
  onClick?: () => void;
  highlight?: "danger" | "warning";
}) {
  const card = (
    <StatCard label={label} value={value} highlight={highlight} />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
      >
        {card}
      </button>
    );
  }

  return card;
}

function matchesSearch(followUp: FollowUpEnriched, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    followUp.companyName,
    followUp.contactName,
    followUp.title,
    followUp.notes,
    followUp.brokerName,
    followUp.brokerEmail,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function ScheduleNextFollowUpModal({
  followUp,
  outcome,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  followUp: FollowUpEnriched;
  outcome: FollowUpCompletionOutcome;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (input: {
    scheduleMode: ScheduleNextMode;
    newDueAt: string;
  }) => void;
}) {
  const [scheduleMode, setScheduleMode] =
    useState<ScheduleNextMode>("automatic_week");
  const isNoResponse = outcome === "no_response";
  const automaticDueAt = useMemo(() => {
    try {
      if (isNoResponse) {
        return automaticNextFollowUpDueAt(followUp.due_at);
      }
      return nextFollowUpDueAtFromCompletion(new Date());
    } catch {
      return null;
    }
  }, [followUp.due_at, isNoResponse]);
  const [dueAt, setDueAt] = useState(() =>
    automaticDueAt
      ? toDatetimeLocalValue(automaticDueAt)
      : toDatetimeLocalValue(followUp.due_at),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setScheduleMode("automatic_week");
    try {
      const nextDueAt = isNoResponse
        ? automaticNextFollowUpDueAt(followUp.due_at)
        : nextFollowUpDueAtFromCompletion(new Date());
      setDueAt(toDatetimeLocalValue(nextDueAt));
    } catch {
      setDueAt(toDatetimeLocalValue(followUp.due_at));
    }
    setLocalError(null);
  }, [followUp, isNoResponse]);

  const description = isNoResponse
    ? "This follow-up will be completed as no response and a new pending follow-up will be created. Cancel keeps the current follow-up open."
    : "This closes the current follow-up and keeps its original due date. A separate pending follow-up is created for the same company, contact, and broker. Cancel keeps the current follow-up open.";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (scheduleMode === "automatic_week") {
      if (!automaticDueAt) {
        setLocalError("Unable to calculate the automatic next follow-up date.");
        return;
      }
      onConfirm({ scheduleMode, newDueAt: automaticDueAt });
      return;
    }

    const parsedDueAt = fromDatetimeLocalValue(dueAt);
    if (!parsedDueAt) {
      setLocalError("Choose a valid date and time.");
      return;
    }

    if (!isFutureDueAt(parsedDueAt)) {
      setLocalError("Choose a future date and time.");
      return;
    }

    onConfirm({ scheduleMode, newDueAt: parsedDueAt });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-medium text-zinc-900">
          Schedule next follow-up
        </h3>
        <p className="mt-1 text-sm text-zinc-500">{followUp.companyName}</p>
        <p className="mt-2 text-sm text-zinc-600">{description}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Current due date: {formatDateTime(followUp.due_at)}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <fieldset className="space-y-3">
            <legend className="crm-label">Scheduling option</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 has-[:checked]:border-sky-300 has-[:checked]:bg-sky-50/60">
              <input
                type="radio"
                name="schedule-mode"
                className="mt-1"
                checked={scheduleMode === "automatic_week"}
                onChange={() => setScheduleMode("automatic_week")}
                disabled={saving}
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">
                  Automatic – 1 Week
                </span>
                <span className="block text-xs text-zinc-500">
                  {isNoResponse
                    ? "Seven calendar days after the current due date, at the same local time. If that time has already passed, the next follow-up is seven days from today."
                    : "Seven calendar days after the completion date, at the same local time. The original due date stays on the completed follow-up."}
                  {automaticDueAt
                    ? ` Next follow-up: ${formatDateTime(automaticDueAt)}.`
                    : ""}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 has-[:checked]:border-sky-300 has-[:checked]:bg-sky-50/60">
              <input
                type="radio"
                name="schedule-mode"
                className="mt-1"
                checked={scheduleMode === "choose_datetime"}
                onChange={() => setScheduleMode("choose_datetime")}
                disabled={saving}
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">
                  Choose Date & Time
                </span>
                <span className="block text-xs text-zinc-500">
                  Pick a future date and time for the next follow-up.
                </span>
              </span>
            </label>
          </fieldset>

          {scheduleMode === "choose_datetime" && (
            <div>
              <label htmlFor="schedule-next-due" className="crm-label">
                Next follow-up date <span className="text-red-600">*</span>
              </label>
              <input
                id="schedule-next-due"
                type="datetime-local"
                required
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="crm-input"
                disabled={saving}
              />
            </div>
          )}

          {(localError || error) && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError ?? error}
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
              {saving
                ? "Saving..."
                : isNoResponse
                  ? "Confirm no response"
                  : "Confirm completion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityNoteModal({
  followUp,
  saving,
  error,
  onClose,
  onSave,
}: {
  followUp: FollowUpEnriched;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: {
    notes: string;
    subject: string;
    activityType: ActivityType;
  }) => void;
}) {
  const [activityType, setActivityType] = useState<ActivityType>("call");
  const [subject, setSubject] = useState(`Follow-up: ${followUp.companyName}`);
  const [notes, setNotes] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notes.trim()) return;

    onSave({
      notes: notes.trim(),
      subject: subject.trim(),
      activityType,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-medium text-zinc-900">Add activity note</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Log what happened for {followUp.companyName}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="activity-type"
              className="crm-label"
            >
              Activity type
            </label>
            <select
              id="activity-type"
              value={activityType}
              onChange={(event) =>
                setActivityType(event.target.value as ActivityType)
              }
              className="crm-select"
            >
              {MANUAL_ACTIVITY_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="activity-subject"
              className="crm-label"
            >
              Subject
            </label>
            <input
              id="activity-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="crm-input"
            />
          </div>

          <div>
            <label
              htmlFor="activity-notes"
              className="crm-label"
            >
              What happened? <span className="text-red-600">*</span>
            </label>
            <textarea
              id="activity-notes"
              required
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="crm-input"
              placeholder="Customer response, next steps, quote details..."
            />
          </div>

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
              {saving ? "Saving..." : "Save activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DoNotFollowUpModal({
  followUp,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  followUp: FollowUpEnriched;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (input: {
    reason: DoNotFollowUpReason;
    notes: string;
    suppression: FollowUpSuppressionChoice;
  }) => void;
}) {
  const [reason, setReason] = useState<DoNotFollowUpReason | "">("");
  const [notes, setNotes] = useState("");
  const [suppression, setSuppression] =
    useState<FollowUpSuppressionChoice>("none");
  const [localError, setLocalError] = useState<string | null>(null);

  const associatedContactId = followUp.contact_id ?? followUp.contactId;
  const associatedContactName = followUp.contactName?.trim() || null;
  const showSuppression =
    reason === "customer_requested_no_contact";

  useEffect(() => {
    setReason("");
    setNotes("");
    setSuppression("none");
    setLocalError(null);
  }, [followUp]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!reason) {
      setLocalError("Choose a reason.");
      return;
    }

    if (suppression === "contact" && !associatedContactId) {
      setLocalError(
        "This follow-up has no associated contact. Stop this follow-up only, or suppress the entire company.",
      );
      return;
    }

    onConfirm({
      reason,
      notes,
      suppression: showSuppression ? suppression : "none",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-medium text-zinc-900">Stop Follow-ups?</h3>
        <p className="mt-1 text-sm text-zinc-500">{followUp.companyName}</p>
        <p className="mt-2 text-sm text-zinc-600">
          Are you sure you want to stop follow-up attempts for this prospect?
          This action will remove the follow-up from your active agenda.
        </p>
        <p className="mt-2 text-sm text-zinc-600">
          The company record stays in the CRM. This does not archive or delete
          the company, and it is not recorded as a completed sales activity.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="dnf-reason" className="crm-label">
              Reason
            </label>
            <select
              id="dnf-reason"
              required
              value={reason}
              onChange={(event) => {
                const next = event.target.value as DoNotFollowUpReason | "";
                setReason(next);
                if (next !== "customer_requested_no_contact") {
                  setSuppression("none");
                }
              }}
              className="crm-select"
            >
              <option value="">Select a reason</option>
              {DO_NOT_FOLLOW_UP_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {showSuppression && (
            <fieldset className="space-y-3 rounded-lg border border-red-100 bg-red-50/40 p-3">
              <legend className="px-1 text-sm font-medium text-zinc-800">
                Future follow-ups
              </legend>
              <p className="text-sm text-zinc-600">
                Stopping this follow-up is separate from suppressing future
                outreach. Choose whether anyone else at this company can still
                be scheduled.
              </p>
              <label className="flex items-start gap-2 text-sm text-zinc-800">
                <input
                  type="radio"
                  name="dnf-suppression"
                  className="mt-1"
                  checked={suppression === "none"}
                  onChange={() => setSuppression("none")}
                />
                <span>
                  Stop this follow-up only. Other contacts at the company can
                  still receive follow-ups.
                </span>
              </label>
              {associatedContactId && (
                <label className="flex items-start gap-2 text-sm text-zinc-800">
                  <input
                    type="radio"
                    name="dnf-suppression"
                    className="mt-1"
                    checked={suppression === "contact"}
                    onChange={() => setSuppression("contact")}
                  />
                  <span>
                    Also suppress future follow-ups for{" "}
                    {associatedContactName ?? "this contact"} only. Other people
                    at the company are not affected.
                  </span>
                </label>
              )}
              <label className="flex items-start gap-2 text-sm text-zinc-800">
                <input
                  type="radio"
                  name="dnf-suppression"
                  className="mt-1"
                  checked={suppression === "company"}
                  onChange={() => setSuppression("company")}
                />
                <span>
                  Also suppress future follow-ups for the entire company. The
                  company is not archived or deleted.
                </span>
              </label>
            </fieldset>
          )}

          <div>
            <label htmlFor="dnf-notes" className="crm-label">
              Notes <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="dnf-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="crm-input"
              placeholder="Optional context for the commercial timeline"
            />
          </div>

          {(localError || error) && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError || error}
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
              className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Confirm Do Not Follow Up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FollowUpCard({
  followUp,
  variant,
  canManage,
  actionLoading,
  onMarkComplete,
  onNoResponse,
  onDoNotFollowUp,
  onAddActivity,
}: {
  followUp: FollowUpEnriched;
  variant: FollowUpCardVariant;
  canManage: boolean;
  actionLoading: boolean;
  onMarkComplete: (followUp: FollowUpEnriched) => void;
  onNoResponse: (followUp: FollowUpEnriched) => void;
  onDoNotFollowUp: (followUp: FollowUpEnriched) => void;
  onAddActivity: (followUp: FollowUpEnriched) => void;
}) {
  const variantClasses: Record<FollowUpCardVariant, string> = {
    overdue: "crm-follow-up-urgent",
    today: "crm-follow-up-today",
    upcoming: "crm-card crm-card-padded shadow-sm",
    completed: "crm-card crm-card-padded border-emerald-200 bg-emerald-50/40",
    cancelled: "crm-card crm-card-padded bg-slate-50",
    do_not_follow_up: "crm-card crm-card-padded border-red-200 bg-red-50/30",
  };

  const followUpNote = followUp.notes?.trim() || followUp.title;
  const daysOverdue =
    variant === "overdue" ? getDaysOverdue(followUp.due_at) : 0;

  return (
    <li className={variantClasses[variant]}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">
              <Link
                href={`/companies/${followUp.company_id}`}
                className="underline-offset-2 hover:underline"
              >
                {followUp.companyName}
              </Link>
            </h3>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(followUp.companyPriority)}`}
            >
              {followUp.companyPriority}
            </span>
            <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
              {FOLLOW_UP_STATUS_LABELS[followUp.status]}
            </span>
            {followUp.companyAccountStatus === "archived" && (
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${accountStatusBadgeClass("archived")}`}
                title="This follow-up belongs to an archived account and is outside your main active workflow"
              >
                {ACCOUNT_STATUS_LABELS.archived} account
              </span>
            )}
          </div>

          {followUp.contactName && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Contact:</span>{" "}
              {followUp.contactName}
            </p>
          )}

          {variant === "completed" && followUp.completionOutcome && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Outcome:</span>{" "}
              <span
                className={
                  followUp.completionOutcome === "no_response"
                    ? "text-orange-700"
                    : "text-emerald-700"
                }
              >
                {followUp.completionOutcome === "no_response"
                  ? "No response"
                  : "Successful contact"}
              </span>
            </p>
          )}

          <p className="text-sm text-zinc-800">
            <span className="font-medium text-zinc-600">
              {variant === "completed" ? "Original due:" : "Due:"}
            </span>{" "}
            {formatDateTime(followUp.due_at)}
            {daysOverdue > 0 && (
              <span className="ml-2 text-red-700">
                ({daysOverdue} day{daysOverdue === 1 ? "" : "s"} overdue)
              </span>
            )}
          </p>

          {followUp.status === "completed" && followUp.completed_at && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Completed:</span>{" "}
              {formatDateTime(followUp.completed_at)}
            </p>
          )}

          {variant === "completed" && followUp.nextFollowUpDueAt && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Next follow-up:</span>{" "}
              {formatDateTime(followUp.nextFollowUpDueAt)}
            </p>
          )}

          {variant !== "completed" && variant !== "do_not_follow_up" && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Next step:</span>{" "}
              {followUpNote}
            </p>
          )}

          {variant === "do_not_follow_up" && (
            <>
              <p className="text-sm text-zinc-700">
                <span className="font-medium text-zinc-600">Reason:</span>{" "}
                {doNotFollowUpReasonLabel(followUp.disposition_reason)}
              </p>
              {followUp.disposition_notes?.trim() && (
                <p className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-600">
                    Disposition notes:
                  </span>{" "}
                  {followUp.disposition_notes}
                </p>
              )}
              {followUp.disposition_at && (
                <p className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-600">Closed:</span>{" "}
                  {formatDateTime(followUp.disposition_at)}
                </p>
              )}
              {(followUp.dispositionByName || followUp.disposition_by) && (
                <p className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-600">Closed by:</span>{" "}
                  {followUp.dispositionByName ?? "Recorded user"}
                </p>
              )}
              {followUpNote && (
                <p className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-600">
                    Original note:
                  </span>{" "}
                  {followUpNote}
                </p>
              )}
            </>
          )}

          {variant === "completed" && (followUp.brokerName || followUp.brokerEmail) && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Broker:</span>{" "}
              {followUp.brokerName ?? followUp.brokerEmail}
            </p>
          )}

          {variant === "completed" && followUpNote && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">
                Original next step:
              </span>{" "}
              {followUpNote}
            </p>
          )}

          <p className="text-xs text-zinc-500">
            Created {formatDate(followUp.created_at)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {canManage && followUp.status === "pending" && (
            <>
              <button
                type="button"
                onClick={() => onMarkComplete(followUp)}
                disabled={actionLoading}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? "Saving..." : "Mark Complete"}
              </button>
              <button
                type="button"
                onClick={() => onNoResponse(followUp)}
                disabled={actionLoading}
                className="inline-flex items-center justify-center rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                No Response
              </button>
              <button
                type="button"
                onClick={() => onDoNotFollowUp(followUp)}
                disabled={actionLoading}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Do Not Follow Up
              </button>
            </>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => onAddActivity(followUp)}
              disabled={actionLoading}
              className="inline-flex items-center justify-center rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Activity Note
            </button>
          )}

          <Link
            href={`/companies/${followUp.company_id}`}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Open Company
          </Link>
        </div>
      </div>
    </li>
  );
}

const TAB_CONFIG: Array<{
  id: WorkcenterTab;
  title: string;
  description: string;
  emptyMessage: string;
}> = [
  {
    id: "today",
    title: "Due Today",
    description: "Follow-ups scheduled for today, earliest first",
    emptyMessage: "You have no follow-ups due today.",
  },
  {
    id: "overdue",
    title: "Overdue",
    description: "Past-due follow-ups, oldest first",
    emptyMessage: "You have no overdue follow-ups.",
  },
  {
    id: "upcoming",
    title: "Upcoming",
    description: "Future follow-ups, soonest first",
    emptyMessage: "No upcoming follow-ups.",
  },
  {
    id: "completed",
    title: "Completed",
    description: "Follow-ups completed this week",
    emptyMessage: "No completed follow-ups yet.",
  },
];

export function FollowUpsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingFollowUps, setPendingFollowUps] = useState<FollowUpEnriched[]>(
    [],
  );
  const [completedFollowUps, setCompletedFollowUps] = useState<
    FollowUpEnriched[]
  >([]);
  const [cancelledFollowUps, setCancelledFollowUps] = useState<
    FollowUpEnriched[]
  >([]);
  const [doNotFollowUpFollowUps, setDoNotFollowUpFollowUps] = useState<
    FollowUpEnriched[]
  >([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkcenterTab>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | CompanyPriority>(
    "all",
  );

  const [actionFollowUpId, setActionFollowUpId] = useState<string | null>(null);
  const completionInFlight = useRef(false);
  const [scheduleTarget, setScheduleTarget] = useState<{
    followUp: FollowUpEnriched;
    outcome: FollowUpCompletionOutcome;
  } | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [activityTarget, setActivityTarget] = useState<FollowUpEnriched | null>(
    null,
  );
  const [activityError, setActivityError] = useState<string | null>(null);
  const [doNotFollowUpTarget, setDoNotFollowUpTarget] =
    useState<FollowUpEnriched | null>(null);
  const [doNotFollowUpError, setDoNotFollowUpError] = useState<string | null>(
    null,
  );

  const loadFollowUps = useCallback(
    async (userId: string): Promise<FollowUpWorkcenterData | null> => {
      setFetchError(null);

      const { data, error } = await fetchFollowUpWorkcenterData(userId);

      if (error || !data) {
        setFetchError(
          formatSupabaseError(error ?? { message: "Unable to load follow-ups." }),
        );
        return null;
      }

      setPendingFollowUps(data.pending);
      setCompletedFollowUps(data.completed);
      return data;
    },
    [],
  );

  const loadDoNotFollowUp = useCallback(
    async (userId: string) => {
      const { data, error } = await fetchDoNotFollowUpFollowUps(userId);

      if (error) {
        setFetchError(formatSupabaseError(error));
        return;
      }

      setDoNotFollowUpFollowUps(data);
    },
    [],
  );

  const loadCancelled = useCallback(
    async (userId: string) => {
      const { data, error } = await fetchCancelledFollowUps(userId);

      if (error) {
        setFetchError(formatSupabaseError(error));
        return;
      }

      setCancelledFollowUps(data);
    },
    [],
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      await loadFollowUps(session.user.id);
      setLoading(false);
    });
  }, [router, loadFollowUps]);

  useEffect(() => {
    if (statusFilter !== "cancelled" || !user) return;
    loadCancelled(user.id);
  }, [statusFilter, user, loadCancelled]);

  useEffect(() => {
    if (statusFilter !== "do_not_follow_up" || !user) return;
    loadDoNotFollowUp(user.id);
  }, [statusFilter, user, loadDoNotFollowUp]);

  const openFollowUps = useMemo(
    () => pendingFollowUps.filter((followUp) => isPendingFollowUpStatus(followUp.status)),
    [pendingFollowUps],
  );

  const buckets = useMemo(
    () => bucketFollowUpsWithCompanies(openFollowUps),
    [openFollowUps],
  );

  const completedThisWeekFollowUps = useMemo(
    () =>
      completedFollowUps.filter((followUp) =>
        isCompletedThisWeek(followUp.completed_at),
      ),
    [completedFollowUps],
  );

  const metrics = useMemo(() => {
    return {
      dueToday: buckets.today.length,
      overdue: buckets.overdue.length,
      upcoming: buckets.upcoming.length,
      completedThisWeek: completedThisWeekFollowUps.length,
      totalOpen: openFollowUps.length,
    };
  }, [buckets, completedThisWeekFollowUps.length, openFollowUps.length]);

  const viewingCompleted =
    activeTab === "completed" || statusFilter === "completed";

  const baseList = useMemo(() => {
    if (statusFilter === "do_not_follow_up") {
      return doNotFollowUpFollowUps;
    }

    if (statusFilter === "cancelled") {
      return cancelledFollowUps;
    }

    if (viewingCompleted) {
      return completedThisWeekFollowUps;
    }

    return buckets[activeTab];
  }, [
    statusFilter,
    viewingCompleted,
    activeTab,
    completedThisWeekFollowUps,
    cancelledFollowUps,
    doNotFollowUpFollowUps,
    buckets,
  ]);

  const filteredFollowUps = useMemo(() => {
    return baseList.filter((followUp) => {
      if (priorityFilter !== "all" && followUp.companyPriority !== priorityFilter) {
        return false;
      }

      const viewingHistorical =
        statusFilter === "cancelled" || statusFilter === "do_not_follow_up";

      // Completed / historical views must not be constrained by Status=Open.
      if (!viewingCompleted && !viewingHistorical) {
        if (statusFilter === "open" && followUp.status !== "pending") {
          return false;
        }

        if (
          statusFilter !== "open" &&
          followUp.status !== statusFilter
        ) {
          return false;
        }
      }

      if (
        dueDateFilter !== "all" &&
        followUp.status === "pending" &&
        !viewingCompleted &&
        !viewingHistorical
      ) {
        const bucket = getFollowUpBucket(followUp.due_at);
        if (dueDateFilter === "today" && bucket !== "today") return false;
        if (dueDateFilter === "overdue" && bucket !== "overdue") return false;
        if (dueDateFilter === "this_week" && !isDueThisWeek(followUp.due_at)) {
          return false;
        }
      }

      return matchesSearch(followUp, searchQuery);
    });
  }, [
    baseList,
    priorityFilter,
    statusFilter,
    dueDateFilter,
    viewingCompleted,
    searchQuery,
  ]);

  function selectWorkcenterTab(tab: WorkcenterTab) {
    setActiveTab(tab);
    if (tab === "completed") {
      setStatusFilter("completed");
      return;
    }
    if (
      statusFilter === "completed" ||
      statusFilter === "cancelled" ||
      statusFilter === "do_not_follow_up"
    ) {
      setStatusFilter("open");
    }
  }

  const activeTabConfig =
    TAB_CONFIG.find((tab) => tab.id === activeTab) ?? TAB_CONFIG[0];

  function canManageFollowUp(followUp: FollowUpEnriched): boolean {
    if (!user) return false;
    return followUp.companyOwnerUserId === user.id;
  }

  async function refreshData() {
    if (!user) return;
    await loadFollowUps(user.id);
    if (statusFilter === "cancelled") {
      await loadCancelled(user.id);
    }
    if (statusFilter === "do_not_follow_up") {
      await loadDoNotFollowUp(user.id);
    }
  }

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 4000);
  }

  function openScheduleModal(
    followUp: FollowUpEnriched,
    outcome: FollowUpCompletionOutcome,
  ) {
    if (!canManageFollowUp(followUp)) return;
    setScheduleError(null);
    setScheduleTarget({ followUp, outcome });
  }

  async function handleScheduleConfirm(input: {
    scheduleMode: ScheduleNextMode;
    newDueAt: string;
  }) {
    if (!scheduleTarget || !user) return;
    if (!canManageFollowUp(scheduleTarget.followUp)) return;
    if (completionInFlight.current) return;

    const followUp = scheduleTarget.followUp;
    const outcome = scheduleTarget.outcome;
    completionInFlight.current = true;
    setActionFollowUpId(followUp.id);
    setScheduleError(null);

    try {
      const result = await completeFollowUpAndScheduleNext({
        followUp,
        outcome,
        actorUserId: user.id,
        newDueAt: input.newDueAt,
        scheduleMode: input.scheduleMode,
      });

      if (result.completedAt && result.completedFollowUpId === followUp.id) {
        const loaded = await loadFollowUps(user.id);
        if (!loaded) {
          setScheduleTarget(null);
          setFetchError(
            "Follow-up was saved, but the list could not be refreshed. Reload the page.",
          );
          return;
        }

        const oldStillPending = loaded.pending.some(
          (item) => item.id === followUp.id,
        );
        const nextIsPending = result.nextFollowUpId
          ? loaded.pending.some((item) => item.id === result.nextFollowUpId)
          : false;
        const oldIsCompleted = loaded.completed.some(
          (item) =>
            item.id === followUp.id && item.status === "completed",
        );

        if (oldStillPending || !nextIsPending || !oldIsCompleted) {
          setScheduleTarget(null);
          setFetchError(
            result.error
              ? formatSupabaseError(result.error)
              : "Saved follow-ups do not match the Follow-up Center lists. Reload the page before trying again.",
          );
          return;
        }
      }

      if (result.error) {
        const message = formatSupabaseError(result.error);
        if (result.completedAt) {
          setScheduleTarget(null);
          setFetchError(
            `Follow-up was marked complete, but a following step failed: ${message}`,
          );
        } else {
          setScheduleError(message);
        }
        return;
      }

      setScheduleTarget(null);
      setFetchError(null);
      showSuccess(
        outcome === "no_response"
          ? `No response recorded. Next follow-up scheduled for ${formatDateTime(result.newDueAt)}.`
          : `${followUp.companyName} follow-up completed. Original due date kept. Next follow-up scheduled for ${formatDateTime(result.newDueAt)}.`,
      );
    } finally {
      completionInFlight.current = false;
      setActionFollowUpId(null);
    }
  }

  async function handleActivitySave(input: {
    notes: string;
    subject: string;
    activityType: ActivityType;
  }) {
    if (!activityTarget || !user) return;

    setActionFollowUpId(activityTarget.id);
    setActivityError(null);

    const ownerUserId =
      activityTarget.companyOwnerUserId ?? activityTarget.user_id;

    const { error } = await createActivityNote({
      userId: user.id,
      companyId: activityTarget.company_id,
      ownerUserId,
      notes: input.notes,
      subject: input.subject,
      activityType: input.activityType,
    });

    if (error) {
      setActivityError(formatSupabaseError(error));
      setActionFollowUpId(null);
      return;
    }

    setActivityTarget(null);
    setActionFollowUpId(null);
    showSuccess("Activity note saved to the company timeline.");
  }

  async function handleDoNotFollowUpConfirm(input: {
    reason: DoNotFollowUpReason;
    notes: string;
    suppression: FollowUpSuppressionChoice;
  }) {
    if (!doNotFollowUpTarget || !user) return;
    if (!canManageFollowUp(doNotFollowUpTarget)) return;

    const followUp = doNotFollowUpTarget;
    setActionFollowUpId(followUp.id);
    setDoNotFollowUpError(null);

    const { error } = await stopFollowUp({
      followUpId: followUp.id,
      companyId: followUp.company_id,
      ownerUserId: followUp.companyOwnerUserId ?? followUp.user_id,
      actorUserId: user.id,
      reason: input.reason,
      notes: input.notes,
      associatedContactId: followUp.contact_id ?? followUp.contactId,
      associatedContactName: followUp.contactName,
      companyName: followUp.companyName,
      suppression: input.suppression,
    });

    if (error) {
      setDoNotFollowUpError(formatSupabaseError(error));
      setActionFollowUpId(null);
      return;
    }

    setDoNotFollowUpTarget(null);
    await refreshData();
    setActionFollowUpId(null);
    showSuccess(
      input.suppression === "company"
        ? "Follow-up closed. Future follow-ups are suppressed for this company."
        : input.suppression === "contact"
          ? "Follow-up closed. Future follow-ups are suppressed for this contact only."
          : "Follow-up closed. It was removed from the active agenda.",
    );
  }

  if (loading) {
    return (
      <div className="crm-loading-screen">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const cardVariant: FollowUpCardVariant =
    statusFilter === "do_not_follow_up"
      ? "do_not_follow_up"
      : statusFilter === "cancelled"
        ? "cancelled"
        : activeTab === "completed" || statusFilter === "completed"
          ? "completed"
          : activeTab;

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <PageHeader
        title="Follow-ups Work Center"
        description="Your daily work center — see who to contact today, what is overdue, and log outcomes quickly."
      />

      {fetchError && <CrmAlert variant="error" className="mb-4">{fetchError}</CrmAlert>}

      {successMessage && (
        <CrmAlert variant="success" className="mb-4">
          {successMessage}
        </CrmAlert>
      )}

      <StatGrid columns={5}>
        <SummaryCard
          label="Due Today"
          value={metrics.dueToday}
          onClick={() => selectWorkcenterTab("today")}
          highlight="warning"
        />
        <SummaryCard
          label="Overdue"
          value={metrics.overdue}
          onClick={() => selectWorkcenterTab("overdue")}
          highlight="danger"
        />
        <SummaryCard
          label="Upcoming"
          value={metrics.upcoming}
          onClick={() => selectWorkcenterTab("upcoming")}
        />
        <SummaryCard
          label="Completed This Week"
          value={metrics.completedThisWeek}
          onClick={() => selectWorkcenterTab("completed")}
        />
        <SummaryCard
          label="Total Open Follow-ups"
          value={metrics.totalOpen}
        />
      </StatGrid>

      <CrmCard className="mb-5" padding>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <label
              htmlFor="follow-up-search"
              className="crm-label"
            >
              Search
            </label>
            <input
              id="follow-up-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Company, contact, or note..."
              className="crm-input"
            />
          </div>

          <div>
            <label
              htmlFor="status-filter"
              className="crm-label"
            >
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => {
                const next = event.target.value as StatusFilter;
                setStatusFilter(next);
                if (next === "completed") {
                  setActiveTab("completed");
                } else if (activeTab === "completed") {
                  setActiveTab("today");
                }
              }}
              className="crm-select"
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="do_not_follow_up">Do Not Follow Up</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="due-filter"
              className="crm-label"
            >
              Due date
            </label>
            <select
              id="due-filter"
              value={dueDateFilter}
              onChange={(event) =>
                setDueDateFilter(event.target.value as DueDateFilter)
              }
              className="crm-select"
            >
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="overdue">Overdue</option>
              <option value="this_week">This Week</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="priority-filter"
              className="crm-label"
            >
              Priority
            </label>
            <select
              id="priority-filter"
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(
                  event.target.value as "all" | CompanyPriority,
                )
              }
              className="crm-select"
            >
              <option value="all">All priorities</option>
              {COMPANY_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CrmCard>

      <div className="mb-6 flex flex-wrap gap-2">
        {TAB_CONFIG.map((tab) => {
          const count =
            tab.id === "completed"
              ? metrics.completedThisWeek
              : buckets[tab.id].length;

          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectWorkcenterTab(tab.id)}
              className={
                isActive
                  ? "crm-tab-pill crm-tab-pill-active"
                  : "crm-tab-pill"
              }
            >
              {tab.title}
              <span
                className={`ml-2 rounded-md px-2 py-0.5 text-xs font-bold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <CrmCard padding>
        <div className="mb-4">
          <h2 className="crm-section-title">
            {statusFilter === "do_not_follow_up"
              ? "Do Not Follow Up"
              : activeTabConfig.title}
          </h2>
          <p className="crm-section-subtitle">
            {statusFilter === "do_not_follow_up"
              ? "Follow-ups closed so they leave the active agenda. They stay on the company timeline and are not counted as completed sales activity."
              : activeTabConfig.description}
          </p>
        </div>

        {filteredFollowUps.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {statusFilter === "do_not_follow_up"
              ? "No follow-ups have been closed with Do Not Follow Up."
              : activeTabConfig.emptyMessage}
          </p>
        ) : (
          <ul className="space-y-3">
            {filteredFollowUps.map((followUp) => (
              <FollowUpCard
                key={followUp.id}
                followUp={followUp}
                variant={cardVariant}
                canManage={canManageFollowUp(followUp)}
                actionLoading={actionFollowUpId === followUp.id}
                onMarkComplete={(item) =>
                  openScheduleModal(item, "completed_contact")
                }
                onNoResponse={(item) => openScheduleModal(item, "no_response")}
                onDoNotFollowUp={(item) => {
                  if (!canManageFollowUp(item)) return;
                  setDoNotFollowUpError(null);
                  setDoNotFollowUpTarget(item);
                }}
                onAddActivity={(item) => {
                  setActivityError(null);
                  setActivityTarget(item);
                }}
              />
            ))}
          </ul>
        )}
      </CrmCard>

      {scheduleTarget && (
        <ScheduleNextFollowUpModal
          followUp={scheduleTarget.followUp}
          outcome={scheduleTarget.outcome}
          saving={actionFollowUpId === scheduleTarget.followUp.id}
          error={scheduleError}
          onClose={() => {
            if (actionFollowUpId) return;
            setScheduleTarget(null);
            setScheduleError(null);
          }}
          onConfirm={(input) => void handleScheduleConfirm(input)}
        />
      )}

      {doNotFollowUpTarget && (
        <DoNotFollowUpModal
          followUp={doNotFollowUpTarget}
          saving={actionFollowUpId === doNotFollowUpTarget.id}
          error={doNotFollowUpError}
          onClose={() => {
            if (actionFollowUpId) return;
            setDoNotFollowUpTarget(null);
            setDoNotFollowUpError(null);
          }}
          onConfirm={(input) => void handleDoNotFollowUpConfirm(input)}
        />
      )}
      {activityTarget && (
        <ActivityNoteModal
          followUp={activityTarget}
          saving={actionFollowUpId === activityTarget.id}
          error={activityError}
          onClose={() => {
            if (actionFollowUpId) return;
            setActivityTarget(null);
            setActivityError(null);
          }}
          onSave={handleActivitySave}
        />
      )}
    </AuthenticatedLayout>
  );
}
