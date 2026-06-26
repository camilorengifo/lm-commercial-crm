"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BrokerAssistantDashboardCard } from "@/components/broker-assistant-dashboard-card";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { ActionPlanRow, CrmAlert, CrmCard, ListPanel, PageHeader, SectionHeader, StatCard, StatGrid } from "@/components/crm-ui";
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

function actionPlanBadgeClass(kind: ActionPlanItem["kind"]): string {
  switch (kind) {
    case "overdue":
      return "crm-badge bg-red-50 text-red-800 ring-red-200";
    case "today":
      return "crm-badge bg-amber-50 text-amber-800 ring-amber-200";
    case "high_priority":
      return "crm-badge bg-orange-50 text-orange-800 ring-orange-200";
    case "opportunity":
      return "crm-badge bg-sky-50 text-sky-800 ring-sky-200";
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
    variant === "overdue" ? "crm-follow-up-urgent" : "crm-follow-up-today";

  const statusLabel = FOLLOW_UP_STATUS_LABELS[followUp.status];

  return (
    <li className={variantClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">
              <Link
                href={`/companies/${followUp.company_id}`}
                className="crm-link"
              >
                {followUp.companyName}
              </Link>
            </p>
            <span className={`crm-badge ${priorityBadgeClass(followUp.companyPriority)}`}>
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
            className="crm-btn-success disabled:cursor-not-allowed disabled:opacity-60"
          >
            {completing ? "Saving..." : "Mark as Done"}
          </button>
          <Link
            href={`/companies/${followUp.company_id}`}
            className="crm-btn-secondary crm-btn-sm"
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
    <li className="crm-action-row">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{company.name}</p>
          <span className={`crm-badge ${priorityBadgeClass(company.priority)}`}>
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
        className="crm-btn-secondary crm-btn-sm"
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
    <li className="crm-action-row">
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
        className="crm-btn-secondary crm-btn-sm"
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
        className="crm-btn-secondary crm-btn-sm"
      >
        Open Company
      </Link>
    </li>
  );
}

function AdminToolsSection() {
  const links = [
    {
      href: "/admin",
      title: "Admin overview",
      description: "Team-wide KPIs and commercial pulse",
    },
    {
      href: "/admin/brokers",
      title: "Broker productivity",
      description: "Scores and activity by broker",
    },
    {
      href: "/admin/companies",
      title: "Companies oversight",
      description: "All accounts, reassignment, and filters",
    },
    {
      href: "/admin/users",
      title: "Users",
      description: "Invite and manage CRM users",
    },
  ] as const;

  return (
    <CrmCard className="mb-5" hover>
      <SectionHeader
        title="Admin tools"
        description="Management views across the full team. Your commercial work is below."
        actions={
          <Link href="/admin" className="crm-btn-secondary crm-btn-sm">
            Open admin overview
          </Link>
        }
        className="mb-4"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="crm-card crm-card-hover rounded-xl px-4 py-4 shadow-sm ring-1 ring-slate-100"
          >
            <p className="text-sm font-medium text-slate-900">{link.title}</p>
            <p className="mt-1 text-xs text-slate-500">{link.description}</p>
          </Link>
        ))}
      </div>
    </CrmCard>
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
      <StatGrid columns={6}>
        <StatCard label="Total companies" value={metrics.companyCount} />
        <StatCard
          label="High priority / hot"
          value={metrics.hotPriorityCount}
          highlight={metrics.hotPriorityCount > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Follow-ups due today"
          value={metrics.dueTodayCount}
          highlight={metrics.dueTodayCount > 0 ? "warning" : undefined}
          href="/follow-ups"
        />
        <StatCard
          label="Overdue follow-ups"
          value={metrics.overdueCount}
          highlight={metrics.overdueCount > 0 ? "danger" : undefined}
          href="/follow-ups"
        />
        <StatCard
          label="Open opportunities"
          value={metrics.openOpportunityCount}
          subtext={`Won: ${metrics.wonOpportunityCount} · Lost: ${metrics.lostOpportunityCount}`}
        />
        <StatCard
          label="Activity last 7 days"
          value={metrics.recentActivityCount7d}
          subtext={
            metrics.lastActivityDate
              ? `Last activity: ${formatDate(metrics.lastActivityDate)}`
              : "No activity recorded"
          }
        />
      </StatGrid>

      <CrmCard className="mb-5">
        <SectionHeader
          title="Today's action plan"
          description="Recommended next steps across follow-ups, accounts, and opportunities."
          className="mb-3"
        />

        {actionPlan.length === 0 ? (
          <p className="text-sm text-slate-500">
            No urgent tasks right now. Review your companies or pipeline to plan
            your day.
          </p>
        ) : (
          <ul className="crm-action-plan-list">
            {actionPlan.map((item) => (
              <ActionPlanRow
                key={item.id}
                badge={actionPlanLabel(item.kind)}
                badgeClass={actionPlanBadgeClass(item.kind)}
                title={item.title}
                detail={item.detail}
                href={item.href}
              />
            ))}
          </ul>
        )}
      </CrmCard>

      <BrokerAssistantDashboardCard />

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <CrmCard>
          <SectionHeader
            title="Today's follow-ups"
            description="Scheduled for today"
            accent="amber"
            actions={
              <Link href="/follow-ups" className="crm-link text-sm">
                View all
              </Link>
            }
            className="mb-3"
          />

          {dueToday.length === 0 ? (
            <p className="text-sm text-slate-500">
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
            <p className="mt-4 text-sm text-slate-500">
              Showing {LIST_LIMIT} of {dueToday.length}.
            </p>
          )}
        </CrmCard>

        <CrmCard>
          <SectionHeader
            title="Overdue follow-ups"
            description="Past-due items needing attention"
            accent="red"
            actions={
              <Link href="/follow-ups" className="crm-link text-sm">
                View all
              </Link>
            }
            className="mb-3"
          />

          {overdue.length === 0 ? (
            <p className="text-sm text-slate-500">
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
            <p className="mt-4 text-sm text-slate-500">
              Showing {LIST_LIMIT} of {overdue.length}.
            </p>
          )}
        </CrmCard>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <CrmCard>
          <SectionHeader
            title="Hot companies to pursue"
            description="High priority with no recent activity or follow-up"
            accent="amber"
            actions={
              <Link href="/companies" className="crm-link text-sm">
                View all
              </Link>
            }
            className="mb-3"
          />

          {highPriorityCompanies.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hot companies need attention right now.
            </p>
          ) : (
            <ListPanel>
              {highPriorityCompanies.slice(0, LIST_LIMIT).map((company) => (
                <HighPriorityCompanyRow key={company.id} company={company} />
              ))}
            </ListPanel>
          )}

          {highPriorityCompanies.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-slate-500">
              Showing {LIST_LIMIT} of {highPriorityCompanies.length}.
            </p>
          )}
        </CrmCard>

        <CrmCard>
          <SectionHeader
            title="Active opportunities"
            description="Open load opportunities across your accounts"
            accent="emerald"
            actions={
              <Link href="/opportunities" className="crm-link text-sm">
                View all
              </Link>
            }
            className="mb-3"
          />

          {openOpportunities.length === 0 ? (
            <p className="text-sm text-slate-500">
              You have no open opportunities yet.
            </p>
          ) : (
            <ListPanel>
              {openOpportunities.slice(0, LIST_LIMIT).map((opportunity) => (
                <OpenOpportunityRow
                  key={opportunity.id}
                  opportunity={opportunity}
                />
              ))}
            </ListPanel>
          )}

          {openOpportunities.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-slate-500">
              Showing {LIST_LIMIT} of {openOpportunities.length}.
            </p>
          )}
        </CrmCard>
      </div>

      <CrmCard className="mb-5">
        <SectionHeader
          title="Recent activity"
          description="Latest notes and activities in the CRM"
          className="mb-3"
        />

        {recentActivities.length === 0 ? (
          <p className="text-sm text-slate-500">No recent activity.</p>
        ) : (
          <ListPanel>
            {recentActivities.map((activity) => (
              <RecentActivityRow key={activity.id} activity={activity} />
            ))}
          </ListPanel>
        )}
      </CrmCard>
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
  const [completingId, setCompletingId] = useState<string | null>(null);

  const isAdmin = isAdminProfile(profile);

  const loadDashboard = useCallback(async (userId: string) => {
    setFetchError(null);

    const { data, error } = await fetchBrokerDashboardData(userId);

    if (error || !data) {
      setFetchError(
        formatSupabaseError(error ?? { message: "Unable to load dashboard." }),
      );
      setBrokerDashboard(null);
      return;
    }

    setBrokerDashboard(data);
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

      await loadDashboard(session.user.id);
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
      await loadDashboard(session.user.id);
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

    await loadDashboard(user.id);
    setCompletingId(null);
  }

  if (loading) {
    return (
      <div className="crm-loading-screen">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!user || !brokerDashboard) {
    return null;
  }

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <PageHeader
        eyebrow="Today"
        title={getTodayHeading()}
        description={
          isAdmin
            ? "Your commercial command center for the day, with admin tools when you need them."
            : (
                <>
                  Your operational dashboard for the day. Signed in as{" "}
                  <span className="font-medium text-slate-900">{user.email}</span>
                </>
              )
        }
        actions={
          <Link href="/companies" className="crm-btn-primary">
            Add Company
          </Link>
        }
      />

      {fetchError && <CrmAlert variant="error">{fetchError}</CrmAlert>}

      {isAdmin && <AdminToolsSection />}

      {isAdmin && (
        <SectionHeader
          title="My commercial work"
          description="Companies, follow-ups, and next actions assigned to you."
          className="mb-6"
        />
      )}

      <BrokerDashboardView
        dashboard={brokerDashboard}
        completingId={completingId}
        onMarkDone={handleMarkDone}
      />
    </AuthenticatedLayout>
  );
}
