"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
  ACTIVITY_TYPES,
  COMPANY_PRIORITIES,
  FOLLOW_UP_STATUS_LABELS,
  priorityBadgeClass,
  type ActivityType,
  type CompanyPriority,
  type FollowUpStatus,
} from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import {
  bucketFollowUpsWithCompanies,
  completeFollowUp,
  createActivityNote,
  fetchCancelledFollowUps,
  fetchFollowUpWorkcenterData,
  fromDatetimeLocalValue,
  getFollowUpBucket,
  isCompletedThisWeek,
  isDueThisWeek,
  rescheduleFollowUp,
  toDatetimeLocalValue,
  type FollowUpEnriched,
} from "@/lib/followUps";
import { getDaysOverdue } from "@/lib/brokerDashboard";
import {
  fetchAllProfiles,
  fetchUserProfile,
  getProfileDisplayName,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

type WorkcenterTab = "today" | "overdue" | "upcoming" | "completed";
type StatusFilter = "open" | FollowUpStatus;
type DueDateFilter = "all" | "today" | "overdue" | "this_week";

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
    </div>
  );
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

function RescheduleModal({
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
  onSave: (input: { dueAt: string; title: string; notes: string }) => void;
}) {
  const [dueAt, setDueAt] = useState(toDatetimeLocalValue(followUp.due_at));
  const [title, setTitle] = useState(followUp.title);
  const [notes, setNotes] = useState(followUp.notes ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedDueAt = fromDatetimeLocalValue(dueAt);
    if (!parsedDueAt) {
      return;
    }

    if (!title.trim()) {
      return;
    }

    onSave({
      dueAt: parsedDueAt,
      title: title.trim(),
      notes,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-medium text-zinc-900">Reschedule follow-up</h3>
        <p className="mt-1 text-sm text-zinc-500">
          {followUp.companyName}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="reschedule-due"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              New due date <span className="text-red-600">*</span>
            </label>
            <input
              id="reschedule-due"
              type="datetime-local"
              required
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="reschedule-title"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Title <span className="text-red-600">*</span>
            </label>
            <input
              id="reschedule-title"
              type="text"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="reschedule-notes"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Notes / next step
            </label>
            <textarea
              id="reschedule-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="What should happen next?"
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
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save reschedule"}
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
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Activity type
            </label>
            <select
              id="activity-type"
              value={activityType}
              onChange={(event) =>
                setActivityType(event.target.value as ActivityType)
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
              htmlFor="activity-subject"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Subject
            </label>
            <input
              id="activity-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="activity-notes"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              What happened? <span className="text-red-600">*</span>
            </label>
            <textarea
              id="activity-notes"
              required
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save activity"}
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
  isAdmin,
  canManage,
  actionLoading,
  onMarkComplete,
  onReschedule,
  onAddActivity,
}: {
  followUp: FollowUpEnriched;
  variant: WorkcenterTab | "cancelled";
  isAdmin: boolean;
  canManage: boolean;
  actionLoading: boolean;
  onMarkComplete: (followUp: FollowUpEnriched) => void;
  onReschedule: (followUp: FollowUpEnriched) => void;
  onAddActivity: (followUp: FollowUpEnriched) => void;
}) {
  const variantClasses: Record<WorkcenterTab | "cancelled", string> = {
    overdue: "border-red-200 bg-red-50/60",
    today: "border-amber-200 bg-amber-50/50",
    upcoming: "border-zinc-200 bg-white",
    completed: "border-emerald-200 bg-emerald-50/40",
    cancelled: "border-zinc-200 bg-zinc-50",
  };

  const followUpNote = followUp.notes?.trim() || followUp.title;
  const daysOverdue =
    variant === "overdue" ? getDaysOverdue(followUp.due_at) : 0;

  return (
    <li
      className={`rounded-lg border p-4 shadow-sm ${variantClasses[variant]}`}
    >
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
          </div>

          {followUp.contactName && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Contact:</span>{" "}
              {followUp.contactName}
            </p>
          )}

          {isAdmin && (followUp.brokerName || followUp.brokerEmail) && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Broker:</span>{" "}
              {followUp.brokerName}
              {followUp.brokerEmail ? ` (${followUp.brokerEmail})` : ""}
            </p>
          )}

          <p className="text-sm text-zinc-800">
            <span className="font-medium text-zinc-600">Due:</span>{" "}
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

          <p className="text-sm text-zinc-700">
            <span className="font-medium text-zinc-600">Next step:</span>{" "}
            {followUpNote}
          </p>

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
                onClick={() => onReschedule(followUp)}
                disabled={actionLoading}
                className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reschedule
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [brokers, setBrokers] = useState<UserProfile[]>([]);
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
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkcenterTab>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | CompanyPriority>(
    "all",
  );
  const [brokerFilter, setBrokerFilter] = useState("all");

  const [actionFollowUpId, setActionFollowUpId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] =
    useState<FollowUpEnriched | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [activityTarget, setActivityTarget] = useState<FollowUpEnriched | null>(
    null,
  );
  const [activityError, setActivityError] = useState<string | null>(null);

  const isAdmin = isAdminProfile(profile);

  const loadFollowUps = useCallback(
    async (userId: string, asAdmin: boolean) => {
      setFetchError(null);

      const { data, error } = await fetchFollowUpWorkcenterData(userId, asAdmin);

      if (error || !data) {
        setFetchError(
          formatSupabaseError(error ?? { message: "Unable to load follow-ups." }),
        );
        setPendingFollowUps([]);
        setCompletedFollowUps([]);
        return;
      }

      setPendingFollowUps(data.pending);
      setCompletedFollowUps(data.completed);
    },
    [],
  );

  const loadCancelled = useCallback(
    async (userId: string, asAdmin: boolean) => {
      const { data, error } = await fetchCancelledFollowUps(userId, asAdmin);

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

      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      const admin = isAdminProfile(userProfile);
      if (admin) {
        const { data: allProfiles } = await fetchAllProfiles();
        setBrokers(
          (allProfiles ?? []).filter(
            (item) => item.role === "broker" && item.is_active,
          ),
        );
      }

      await loadFollowUps(session.user.id, admin);
      setLoading(false);
    });
  }, [router, loadFollowUps]);

  useEffect(() => {
    if (statusFilter !== "cancelled" || !user) return;
    loadCancelled(user.id, isAdmin);
  }, [statusFilter, user, isAdmin, loadCancelled]);

  const buckets = useMemo(
    () => bucketFollowUpsWithCompanies(pendingFollowUps),
    [pendingFollowUps],
  );

  const metrics = useMemo(() => {
    const completedThisWeek = completedFollowUps.filter((followUp) =>
      isCompletedThisWeek(followUp.completed_at),
    ).length;

    return {
      dueToday: buckets.today.length,
      overdue: buckets.overdue.length,
      upcoming: buckets.upcoming.length,
      completedThisWeek,
      totalOpen: pendingFollowUps.length,
    };
  }, [buckets, completedFollowUps, pendingFollowUps.length]);

  const baseList = useMemo(() => {
    if (statusFilter === "completed") {
      return completedFollowUps;
    }

    if (statusFilter === "cancelled") {
      return cancelledFollowUps;
    }

    if (activeTab === "completed") {
      return completedFollowUps;
    }

    return buckets[activeTab];
  }, [
    statusFilter,
    activeTab,
    completedFollowUps,
    cancelledFollowUps,
    buckets,
  ]);

  const filteredFollowUps = useMemo(() => {
    return baseList.filter((followUp) => {
      if (brokerFilter !== "all" && followUp.user_id !== brokerFilter) {
        return false;
      }

      if (priorityFilter !== "all" && followUp.companyPriority !== priorityFilter) {
        return false;
      }

      if (statusFilter === "open" && followUp.status !== "pending") {
        return false;
      }

      if (
        statusFilter !== "open" &&
        statusFilter !== "completed" &&
        statusFilter !== "cancelled" &&
        followUp.status !== statusFilter
      ) {
        return false;
      }

      if (
        dueDateFilter !== "all" &&
        followUp.status === "pending" &&
        statusFilter !== "completed" &&
        statusFilter !== "cancelled" &&
        activeTab !== "completed"
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
    brokerFilter,
    priorityFilter,
    statusFilter,
    dueDateFilter,
    activeTab,
    searchQuery,
  ]);

  const activeTabConfig =
    TAB_CONFIG.find((tab) => tab.id === activeTab) ?? TAB_CONFIG[0];

  function canManageFollowUp(followUp: FollowUpEnriched): boolean {
    if (!user) return false;
    if (isAdmin) return false;
    return followUp.user_id === user.id;
  }

  async function refreshData() {
    if (!user) return;
    await loadFollowUps(user.id, isAdmin);
    if (statusFilter === "cancelled") {
      await loadCancelled(user.id, isAdmin);
    }
  }

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 4000);
  }

  async function handleMarkComplete(followUp: FollowUpEnriched) {
    if (!user || !canManageFollowUp(followUp)) return;

    setActionFollowUpId(followUp.id);
    setFetchError(null);

    const { error } = await completeFollowUp(
      followUp.id,
      followUp.user_id,
      followUp.company_id,
    );

    if (error) {
      setFetchError(formatSupabaseError(error));
      setActionFollowUpId(null);
      return;
    }

    await refreshData();
    setActionFollowUpId(null);
    showSuccess("Follow-up marked as complete.");
  }

  async function handleRescheduleSave(input: {
    dueAt: string;
    title: string;
    notes: string;
  }) {
    if (!rescheduleTarget || !user) return;

    setActionFollowUpId(rescheduleTarget.id);
    setRescheduleError(null);

    const { error } = await rescheduleFollowUp({
      followUpId: rescheduleTarget.id,
      ownerUserId: rescheduleTarget.user_id,
      companyId: rescheduleTarget.company_id,
      dueAt: input.dueAt,
      title: input.title,
      notes: input.notes.trim() || null,
    });

    if (error) {
      setRescheduleError(formatSupabaseError(error));
      setActionFollowUpId(null);
      return;
    }

    setRescheduleTarget(null);
    await refreshData();
    setActionFollowUpId(null);
    showSuccess("Follow-up rescheduled.");
  }

  async function handleActivitySave(input: {
    notes: string;
    subject: string;
    activityType: ActivityType;
  }) {
    if (!activityTarget || !user) return;

    setActionFollowUpId(activityTarget.id);
    setActivityError(null);

    const { error } = await createActivityNote({
      userId: activityTarget.user_id,
      companyId: activityTarget.company_id,
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

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const cardVariant: WorkcenterTab | "cancelled" =
    statusFilter === "cancelled"
      ? "cancelled"
      : activeTab === "completed" || statusFilter === "completed"
        ? "completed"
        : activeTab;

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Follow-ups
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isAdmin
            ? "Daily work center across all brokers — view who needs contact today and what is overdue."
            : "Your daily work center — see who to contact today, what is overdue, and log outcomes quickly."}
        </p>
      </div>

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {successMessage && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Due Today" value={metrics.dueToday} />
        <SummaryCard label="Overdue" value={metrics.overdue} />
        <SummaryCard label="Upcoming" value={metrics.upcoming} />
        <SummaryCard
          label="Completed This Week"
          value={metrics.completedThisWeek}
        />
        <SummaryCard
          label="Total Open Follow-ups"
          value={metrics.totalOpen}
        />
      </div>

      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <label
              htmlFor="follow-up-search"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Search
            </label>
            <input
              id="follow-up-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Company, contact, or note..."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="status-filter"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="due-filter"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Due date
            </label>
            <select
              id="due-filter"
              value={dueDateFilter}
              onChange={(event) =>
                setDueDateFilter(event.target.value as DueDateFilter)
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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
              className="mb-1.5 block text-sm font-medium text-zinc-700"
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
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="all">All priorities</option>
              {COMPANY_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <div className="md:col-span-2 xl:col-span-5">
              <label
                htmlFor="broker-filter"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
              >
                Broker
              </label>
              <select
                id="broker-filter"
                value={brokerFilter}
                onChange={(event) => setBrokerFilter(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 sm:max-w-md"
              >
                <option value="all">All brokers</option>
                {brokers.map((broker) => (
                  <option key={broker.id} value={broker.id}>
                    {getProfileDisplayName(broker)}
                    {broker.email ? ` (${broker.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-zinc-200 pb-1">
        {TAB_CONFIG.map((tab) => {
          const count =
            tab.id === "completed"
              ? completedFollowUps.length
              : buckets[tab.id].length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border border-b-0 border-zinc-200 bg-white text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {tab.title}
              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-zinc-900">
            {activeTabConfig.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {activeTabConfig.description}
          </p>
        </div>

        {filteredFollowUps.length === 0 ? (
          <p className="text-sm text-zinc-500">{activeTabConfig.emptyMessage}</p>
        ) : (
          <ul className="space-y-3">
            {filteredFollowUps.map((followUp) => (
              <FollowUpCard
                key={followUp.id}
                followUp={followUp}
                variant={cardVariant}
                isAdmin={isAdmin}
                canManage={canManageFollowUp(followUp)}
                actionLoading={actionFollowUpId === followUp.id}
                onMarkComplete={handleMarkComplete}
                onReschedule={(item) => {
                  setRescheduleError(null);
                  setRescheduleTarget(item);
                }}
                onAddActivity={(item) => {
                  setActivityError(null);
                  setActivityTarget(item);
                }}
              />
            ))}
          </ul>
        )}

        {isAdmin && (
          <p className="mt-4 text-xs text-zinc-500">
            Admin view is read-only for broker-owned follow-ups. Brokers complete
            and reschedule their own items.
          </p>
        )}
      </section>

      {rescheduleTarget && (
        <RescheduleModal
          followUp={rescheduleTarget}
          saving={actionFollowUpId === rescheduleTarget.id}
          error={rescheduleError}
          onClose={() => {
            if (actionFollowUpId) return;
            setRescheduleTarget(null);
            setRescheduleError(null);
          }}
          onSave={handleRescheduleSave}
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
