"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { BrokerAssistantDashboardCard } from "@/components/broker-assistant-dashboard-card";
import {
  fetchAdminDashboardStats,
  type AdminDashboardStats,
} from "@/lib/adminStats";
import {
  ACTIVITY_TYPE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  priorityBadgeClass,
  loadOpportunityStatusBadgeClass,
  type ActivityType,
} from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import {
  fetchBrokerDashboardData,
  getDaysOverdue,
  getTodayHeading,
  LIST_LIMIT,
  type ActionPlanItem,
  type BrokerDashboardData,
  type FollowUpDashboardItem,
  type HighPriorityCompanyItem,
  type OpenOpportunityDashboardItem,
  type RecentActivityItem,
} from "@/lib/brokerDashboard";
import { completeFollowUp } from "@/lib/followUps";
import {
  fetchUserProfile,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

function SummaryCard({
  label,
  value,
  subtext,
  highlight,
  href,
}: {
  label: string;
  value: number | string;
  subtext?: string;
  highlight?: "danger" | "warning";
  href?: string;
}) {
  const highlightClass =
    highlight === "danger"
      ? "border-red-200 bg-red-50/50"
      : highlight === "warning"
        ? "border-amber-200 bg-amber-50/50"
        : "border-zinc-200 bg-white";

  const content = (
    <>
      <p className="text-sm font-medium text-zinc-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
      {subtext && <p className="mt-1 text-xs text-zinc-500">{subtext}</p>}
    </>
  );

  const className = `rounded-xl border p-5 shadow-sm transition ${highlightClass} ${
    href ? "hover:border-zinc-300 hover:bg-zinc-50/80" : ""
  }`;

  if (href) {
    return (
      <Link href={href} className={`block ${className}`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

function QuickNav({ isAdmin }: { isAdmin: boolean }) {
  const links = [
    { href: "/companies", label: "Companies" },
    { href: "/opportunities", label: "Opportunities" },
    { href: "/pipeline", label: "Pipeline" },
    { href: "/follow-ups", label: "Follow-ups" },
    { href: "/ai-broker-assistant", label: "AI Broker Assistant" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function actionPlanBadgeClass(kind: ActionPlanItem["kind"]): string {
  switch (kind) {
    case "overdue":
      return "bg-red-100 text-red-800";
    case "today":
      return "bg-amber-100 text-amber-800";
    case "high_priority":
      return "bg-orange-100 text-orange-800";
    case "opportunity":
      return "bg-sky-100 text-sky-800";
  }
}

function actionPlanLabel(kind: ActionPlanItem["kind"]): string {
  switch (kind) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Due today";
    case "high_priority":
      return "High priority";
    case "opportunity":
      return "Opportunity";
  }
}

function formatActivityType(value: string): string {
  if (value in ACTIVITY_TYPE_LABELS) {
    return ACTIVITY_TYPE_LABELS[value as ActivityType];
  }

  return value;
}

function FollowUpRow({
  followUp,
  variant,
  completing,
  onMarkDone,
}: {
  followUp: FollowUpDashboardItem;
  variant: "overdue" | "today";
  completing: boolean;
  onMarkDone: (followUp: FollowUpDashboardItem) => void;
}) {
  const variantClass =
    variant === "overdue"
      ? "border-red-200 bg-red-50/60"
      : "border-amber-200 bg-amber-50/50";

  const statusLabel = FOLLOW_UP_STATUS_LABELS[followUp.status];

  return (
    <li className={`rounded-lg border p-4 ${variantClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900">
              <Link
                href={`/companies/${followUp.company_id}`}
                className="underline-offset-2 hover:underline"
              >
                {followUp.companyName}
              </Link>
            </p>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(followUp.companyPriority)}`}
            >
              {followUp.companyPriority}
            </span>
          </div>
          {followUp.contactName && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium">Contact:</span> {followUp.contactName}
            </p>
          )}
          <p className="text-sm text-zinc-700">
            <span className="font-medium">Follow-up:</span> {followUp.followUpNote}
          </p>
          <p className="text-sm text-zinc-600">
            <span className="font-medium">Due:</span>{" "}
            {formatDateTime(followUp.due_at)}
            <span className="ml-2 text-zinc-500">· {statusLabel}</span>
            {variant === "overdue" && (
              <span className="ml-2 font-medium text-red-700">
                ({getDaysOverdue(followUp.due_at)} day
                {getDaysOverdue(followUp.due_at) === 1 ? "" : "s"} overdue)
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMarkDone(followUp)}
            disabled={completing}
            className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {completing ? "Saving..." : "Mark as Done"}
          </button>
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

function HighPriorityCompanyRow({
  company,
}: {
  company: HighPriorityCompanyItem;
}) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-zinc-900">{company.name}</p>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(company.priority)}`}
          >
            {company.priority}
          </span>
        </div>
        <p className="text-sm text-zinc-600">{company.reason}</p>
        <p className="text-sm text-zinc-500">
          Last contact:{" "}
          {company.lastActivityAt
            ? formatDate(company.lastActivityAt)
            : "No activity recorded"}
        </p>
        <p className="text-sm text-zinc-500">
          Next follow-up:{" "}
          {company.nextFollowUpAt
            ? formatDate(company.nextFollowUpAt)
            : "No follow-up scheduled"}
        </p>
      </div>

      <Link
        href={`/companies/${company.id}`}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        Open Company
      </Link>
    </li>
  );
}

function OpenOpportunityRow({
  opportunity,
}: {
  opportunity: OpenOpportunityDashboardItem;
}) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-zinc-900">
          {opportunity.companyName}
        </p>
        <p className="text-sm text-zinc-700">{opportunity.title}</p>
        {opportunity.laneLabel && opportunity.laneLabel !== "—" && (
          <p className="text-sm text-zinc-600">
            <span className="font-medium">Lane:</span> {opportunity.laneLabel}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${loadOpportunityStatusBadgeClass(opportunity.status)}`}
          >
            {opportunity.status}
          </span>
          {opportunity.estimatedValue && (
            <span className="text-sm text-zinc-600">
              Est. value: {opportunity.estimatedValue}
            </span>
          )}
        </div>
      </div>

      <Link
        href={`/companies/${opportunity.companyId}`}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        Open Company
      </Link>
    </li>
  );
}

function RecentActivityRow({ activity }: { activity: RecentActivityItem }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-zinc-900">
          <Link
            href={`/companies/${activity.companyId}`}
            className="underline-offset-2 hover:underline"
          >
            {activity.companyName}
          </Link>
        </p>
        <p className="text-sm text-zinc-600">
          <span className="font-medium">
            {formatActivityType(activity.activityType)}
          </span>
          {" · "}
          {formatDateTime(activity.activityAt)}
        </p>
        <p className="line-clamp-2 text-sm text-zinc-700">{activity.preview}</p>
      </div>

      <Link
        href={`/companies/${activity.companyId}`}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        Open Company
      </Link>
    </li>
  );
}

function AdminDashboardView({ stats }: { stats: AdminDashboardStats }) {
  return (
    <>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard label="Total companies" value={stats.totalCompanies} />
        <SummaryCard label="Total brokers" value={stats.totalBrokers} />
        <SummaryCard
          label="Follow-ups due today"
          value={stats.followUpsDueToday}
          highlight={stats.followUpsDueToday > 0 ? "warning" : undefined}
        />
        <SummaryCard
          label="Overdue follow-ups"
          value={stats.overdueFollowUps}
          highlight={stats.overdueFollowUps > 0 ? "danger" : undefined}
        />
        <SummaryCard
          label="High priority companies"
          value={stats.highPriorityCompanies}
          highlight={
            stats.highPriorityCompanies > 0 ? "warning" : undefined
          }
        />
        <SummaryCard
          label="Open opportunities"
          value={stats.openOpportunities}
        />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-zinc-900">
          Broker activity overview
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Global commercial workload and recent activity by broker.
        </p>

        {stats.brokerRows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No brokers registered yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Broker
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Email
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">
                    Companies
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">
                    Follow-ups today
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">
                    Overdue
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">
                    Activity 7 days
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Last activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {stats.brokerRows.map((row) => (
                  <tr key={row.userId}>
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{row.email}</td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {row.companies}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {row.followUpsDueToday}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {row.overdueFollowUps}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {row.activityCount7d}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {row.lastActivityAt
                        ? formatDate(row.lastActivityAt)
                        : "No activity"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function BrokerDashboardView({
  dashboard,
  completingId,
  onMarkDone,
}: {
  dashboard: BrokerDashboardData;
  completingId: string | null;
  onMarkDone: (followUp: FollowUpDashboardItem) => void;
}) {
  const {
    metrics,
    actionPlan,
    dueToday,
    overdue,
    highPriorityCompanies,
    openOpportunities,
    recentActivities,
  } = dashboard;

  return (
    <>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard label="Total companies" value={metrics.companyCount} />
        <SummaryCard
          label="High priority / hot"
          value={metrics.hotPriorityCount}
          highlight={metrics.hotPriorityCount > 0 ? "warning" : undefined}
        />
        <SummaryCard
          label="Follow-ups due today"
          value={metrics.dueTodayCount}
          highlight={metrics.dueTodayCount > 0 ? "warning" : undefined}
          href="/follow-ups"
        />
        <SummaryCard
          label="Overdue follow-ups"
          value={metrics.overdueCount}
          highlight={metrics.overdueCount > 0 ? "danger" : undefined}
          href="/follow-ups"
        />
        <SummaryCard
          label="Open opportunities"
          value={metrics.openOpportunityCount}
          subtext={`Won: ${metrics.wonOpportunityCount} · Lost: ${metrics.lostOpportunityCount}`}
        />
        <SummaryCard
          label="Activity last 7 days"
          value={metrics.recentActivityCount7d}
          subtext={
            metrics.lastActivityDate
              ? `Last activity: ${formatDate(metrics.lastActivityDate)}`
              : "No activity recorded"
          }
        />
      </div>

      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-zinc-900">Today&apos;s action plan</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Priority tasks across follow-ups, accounts, and opportunities.
        </p>

        {actionPlan.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No urgent tasks right now. Review your companies or pipeline to plan
            your day.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {actionPlan.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${actionPlanBadgeClass(item.kind)}`}
                    >
                      {actionPlanLabel(item.kind)}
                    </span>
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.title}
                    </p>
                  </div>
                  <p className="text-sm text-zinc-600">{item.detail}</p>
                </div>

                <Link
                  href={item.href}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BrokerAssistantDashboardCard />

      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Today&apos;s follow-ups
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Follow-ups scheduled for today
              </p>
            </div>
            <Link
              href="/follow-ups"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              View all
            </Link>
          </div>

          {dueToday.length === 0 ? (
            <p className="text-sm text-zinc-500">
              You have no follow-ups due today.
            </p>
          ) : (
            <ul className="space-y-3">
              {dueToday.slice(0, LIST_LIMIT).map((followUp) => (
                <FollowUpRow
                  key={followUp.id}
                  followUp={followUp}
                  variant="today"
                  completing={completingId === followUp.id}
                  onMarkDone={onMarkDone}
                />
              ))}
            </ul>
          )}

          {dueToday.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-zinc-500">
              Showing {LIST_LIMIT} of {dueToday.length}.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Overdue follow-ups
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Past-due follow-ups that need attention
              </p>
            </div>
            <Link
              href="/follow-ups"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              View all
            </Link>
          </div>

          {overdue.length === 0 ? (
            <p className="text-sm text-zinc-500">
              You have no overdue follow-ups.
            </p>
          ) : (
            <ul className="space-y-3">
              {overdue.slice(0, LIST_LIMIT).map((followUp) => (
                <FollowUpRow
                  key={followUp.id}
                  followUp={followUp}
                  variant="overdue"
                  completing={completingId === followUp.id}
                  onMarkDone={onMarkDone}
                />
              ))}
            </ul>
          )}

          {overdue.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-zinc-500">
              Showing {LIST_LIMIT} of {overdue.length}.
            </p>
          )}
        </section>
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Hot companies to pursue
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                High priority, no recent activity, or no follow-up scheduled
              </p>
            </div>
            <Link
              href="/companies"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              View all
            </Link>
          </div>

          {highPriorityCompanies.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No hot companies need attention right now.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {highPriorityCompanies.slice(0, LIST_LIMIT).map((company) => (
                <HighPriorityCompanyRow key={company.id} company={company} />
              ))}
            </ul>
          )}

          {highPriorityCompanies.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-zinc-500">
              Showing {LIST_LIMIT} of {highPriorityCompanies.length}.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Active opportunities
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Open load opportunities across your accounts
              </p>
            </div>
            <Link
              href="/opportunities"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              View all
            </Link>
          </div>

          {openOpportunities.length === 0 ? (
            <p className="text-sm text-zinc-500">
              You have no open opportunities yet.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {openOpportunities.slice(0, LIST_LIMIT).map((opportunity) => (
                <OpenOpportunityRow
                  key={opportunity.id}
                  opportunity={opportunity}
                />
              ))}
            </ul>
          )}

          {openOpportunities.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-zinc-500">
              Showing {LIST_LIMIT} of {openOpportunities.length}.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-zinc-900">
              Recent activity
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Latest notes and activities recorded in the CRM
            </p>
          </div>
        </div>

        {recentActivities.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent activity.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {recentActivities.map((activity) => (
              <RecentActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function HomeDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [brokerDashboard, setBrokerDashboard] =
    useState<BrokerDashboardData | null>(null);
  const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(
    null,
  );
  const [completingId, setCompletingId] = useState<string | null>(null);

  const isAdmin = isAdminProfile(profile);

  const loadDashboard = useCallback(async (userId: string, asAdmin: boolean) => {
    setFetchError(null);

    if (asAdmin) {
      const { data, error } = await fetchAdminDashboardStats();

      if (error || !data) {
        setFetchError(
          formatSupabaseError(error ?? { message: "Unable to load dashboard." }),
        );
        return;
      }

      setAdminStats(data);
      setBrokerDashboard(null);
      return;
    }

    const { data, error } = await fetchBrokerDashboardData(userId);

    if (error || !data) {
      setFetchError(
        formatSupabaseError(error ?? { message: "Unable to load dashboard." }),
      );
      return;
    }

    setBrokerDashboard(data);
    setAdminStats(null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);

      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      await loadDashboard(
        session.user.id,
        isAdminProfile(userProfile),
      );
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);
      await loadDashboard(session.user.id, isAdminProfile(userProfile));
    });

    return () => subscription.unsubscribe();
  }, [router, loadDashboard]);

  async function handleMarkDone(followUp: FollowUpDashboardItem) {
    if (!user) return;

    setCompletingId(followUp.id);

    const { error } = await completeFollowUp(
      followUp.id,
      followUp.user_id,
      followUp.company_id,
    );

    if (error) {
      setFetchError(formatSupabaseError(error));
      setCompletingId(null);
      return;
    }

    await loadDashboard(user.id, false);
    setCompletingId(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!user || (!brokerDashboard && !adminStats)) {
    return null;
  }

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Today
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            {getTodayHeading()}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {isAdmin
              ? "Global operational view for administrators."
              : "Your operational dashboard for the day. Signed in as "}
            {!isAdmin && (
              <span className="font-medium text-zinc-900">{user.email}</span>
            )}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <QuickNav isAdmin={isAdmin} />
          {!isAdmin && (
            <Link
              href="/companies"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Add Company
            </Link>
          )}
        </div>
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {isAdmin && adminStats ? (
        <AdminDashboardView stats={adminStats} />
      ) : brokerDashboard ? (
        <BrokerDashboardView
          dashboard={brokerDashboard}
          completingId={completingId}
          onMarkDone={handleMarkDone}
        />
      ) : null}
    </AuthenticatedLayout>
  );
}
