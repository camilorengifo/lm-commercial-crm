"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { AiBrokerAssistantSection } from "@/components/ai-broker-assistant-section";
import {
  DEFAULT_SALES_STAGE,
  SALES_STAGES,
  isSalesStage,
  salesStageBadgeClass,
  type SalesStage,
} from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import { supabase } from "@/lib/supabaseClient";
import {
  bucketFollowUpsWithCompanies,
  completeFollowUp,
  fetchPendingFollowUpsWithCompanies,
  type FollowUpWithCompany,
} from "@/lib/followUps";
import {
  fetchLoadOpportunityCounts,
  type LoadOpportunityCounts,
} from "@/lib/loadOpportunities";

const INACTIVITY_DAYS = 14;
const LIST_LIMIT = 8;

interface CompanyRow {
  id: string;
  name: string;
  sales_stage: SalesStage;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
}

interface ActivityRow {
  company_id: string;
  activity_at: string;
}

interface CompanyNeedingAttention {
  id: string;
  name: string;
  lastActivityAt: string | null;
  nextFollowUpAt: string | null;
}

interface DashboardMetrics {
  companyCount: number;
  contactCount: number;
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  inactiveCompanyCount: number;
  opportunityCounts: LoadOpportunityCounts;
}

function getInactivityCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function latestActivityDate(
  company: CompanyRow,
  activityByCompany: Map<string, string>,
): string | null {
  const fromActivities = activityByCompany.get(company.id) ?? null;
  const fromCompany = company.last_contact_at;

  if (!fromActivities) return fromCompany;
  if (!fromCompany) return fromActivities;

  return new Date(fromActivities) > new Date(fromCompany)
    ? fromActivities
    : fromCompany;
}

function buildCompaniesNeedingAttention(
  companies: CompanyRow[],
  activityByCompany: Map<string, string>,
): CompanyNeedingAttention[] {
  const cutoff = getInactivityCutoff();

  return companies
    .map((company) => ({
      id: company.id,
      name: company.name,
      lastActivityAt: latestActivityDate(company, activityByCompany),
      nextFollowUpAt: company.next_follow_up_at,
    }))
    .filter((company) => {
      if (!company.lastActivityAt) return true;
      return new Date(company.lastActivityAt) < cutoff;
    })
    .sort((a, b) => {
      if (!a.lastActivityAt && !b.lastActivityAt) return a.name.localeCompare(b.name);
      if (!a.lastActivityAt) return -1;
      if (!b.lastActivityAt) return 1;
      return (
        new Date(a.lastActivityAt).getTime() -
        new Date(b.lastActivityAt).getTime()
      );
    });
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "danger" | "warning";
}) {
  const highlightClass =
    highlight === "danger"
      ? "border-red-200 bg-red-50/50"
      : highlight === "warning"
        ? "border-amber-200 bg-amber-50/50"
        : "border-zinc-200 bg-white";

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${highlightClass}`}>
      <p className="text-sm font-medium text-zinc-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
    </div>
  );
}

function FollowUpListItem({
  followUp,
  variant,
  completing,
  onMarkDone,
}: {
  followUp: FollowUpWithCompany;
  variant: "overdue" | "today";
  completing: boolean;
  onMarkDone: (followUp: FollowUpWithCompany) => void;
}) {
  const variantClass =
    variant === "overdue"
      ? "border-red-200 bg-red-50/60"
      : "border-amber-200 bg-amber-50/50";

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between ${variantClass}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-zinc-900">{followUp.title}</p>
        <p className="text-sm text-zinc-700">
          <span className="font-medium">Company:</span>{" "}
          <Link
            href={`/companies/${followUp.company_id}`}
            className="text-zinc-900 underline-offset-2 hover:underline"
          >
            {followUp.companyName}
          </Link>
        </p>
        <p className="text-sm text-zinc-700">
          <span className="font-medium">Due:</span>{" "}
          {formatDateTime(followUp.due_at)}
        </p>
        {followUp.notes && (
          <p className="text-sm text-zinc-600">
            <span className="font-medium">Notes:</span> {followUp.notes}
          </p>
        )}
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
    </li>
  );
}

export function HomeDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpWithCompany[]>([]);
  const [companiesNeedingAttention, setCompaniesNeedingAttention] = useState<
    CompanyNeedingAttention[]
  >([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    companyCount: 0,
    contactCount: 0,
    overdueCount: 0,
    dueTodayCount: 0,
    upcomingCount: 0,
    inactiveCompanyCount: 0,
    opportunityCounts: { New: 0, Quoted: 0, Won: 0, Lost: 0 },
  });
  const [stageCounts, setStageCounts] = useState<Record<SalesStage, number>>(
    () => Object.fromEntries(SALES_STAGES.map((stage) => [stage, 0])) as Record<
      SalesStage,
      number
    >,
  );
  const [completingId, setCompletingId] = useState<string | null>(null);

  const loadDashboard = useCallback(async (userId: string) => {
    setFetchError(null);

    const [
      companiesResult,
      contactsResult,
      followUpsResult,
      activitiesResult,
      opportunityCountsResult,
    ] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name, sales_stage, last_contact_at, next_follow_up_at")
        .eq("user_id", userId),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      fetchPendingFollowUpsWithCompanies(userId),
      supabase
        .from("activities")
        .select("company_id, activity_at")
        .eq("user_id", userId)
        .order("activity_at", { ascending: false }),
      fetchLoadOpportunityCounts(userId),
    ]);

    if (companiesResult.error) {
      setFetchError(formatSupabaseError(companiesResult.error));
      return;
    }

    if (contactsResult.error) {
      setFetchError(formatSupabaseError(contactsResult.error));
      return;
    }

    if (followUpsResult.error) {
      setFetchError(formatSupabaseError(followUpsResult.error));
      return;
    }

    if (activitiesResult.error) {
      setFetchError(formatSupabaseError(activitiesResult.error));
      return;
    }

    if (opportunityCountsResult.error) {
      setFetchError(formatSupabaseError(opportunityCountsResult.error));
      return;
    }

    const companies = ((companiesResult.data ?? []) as CompanyRow[]).map(
      (company) => ({
        ...company,
        sales_stage: isSalesStage(company.sales_stage)
          ? company.sales_stage
          : DEFAULT_SALES_STAGE,
      }),
    );
    const activities = (activitiesResult.data as ActivityRow[]) ?? [];
    const pendingFollowUps = followUpsResult.data;

    const activityByCompany = new Map<string, string>();
    for (const activity of activities) {
      if (!activityByCompany.has(activity.company_id)) {
        activityByCompany.set(activity.company_id, activity.activity_at);
      }
    }

    const buckets = bucketFollowUpsWithCompanies(pendingFollowUps);
    const attention = buildCompaniesNeedingAttention(
      companies,
      activityByCompany,
    );

    const counts = Object.fromEntries(
      SALES_STAGES.map((stage) => [stage, 0]),
    ) as Record<SalesStage, number>;

    for (const company of companies) {
      counts[company.sales_stage] += 1;
    }

    setFollowUps(pendingFollowUps);
    setCompaniesNeedingAttention(attention);
    setStageCounts(counts);
    setMetrics({
      companyCount: companies.length,
      contactCount: contactsResult.count ?? 0,
      overdueCount: buckets.overdue.length,
      dueTodayCount: buckets.today.length,
      upcomingCount: buckets.upcoming.length,
      inactiveCompanyCount: attention.length,
      opportunityCounts: opportunityCountsResult.data,
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      loadDashboard(session.user.id).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      loadDashboard(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [router, loadDashboard]);

  const { overdue, today } = useMemo(
    () => bucketFollowUpsWithCompanies(followUps),
    [followUps],
  );

  async function handleMarkDone(followUp: FollowUpWithCompany) {
    if (!user) return;

    setCompletingId(followUp.id);

    const { error } = await completeFollowUp(
      followUp.id,
      user.id,
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
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AuthenticatedLayout>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Broker Dashboard
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Signed in as{" "}
            <span className="font-medium text-zinc-900">{user.email}</span>
          </p>
        </div>

        <Link
          href="/companies"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Add Company
        </Link>
      </div>

        {fetchError && (
          <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {fetchError}
          </p>
        )}

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard label="Companies" value={metrics.companyCount} />
          <SummaryCard label="Contacts" value={metrics.contactCount} />
          <SummaryCard
            label="Overdue Follow-ups"
            value={metrics.overdueCount}
            highlight={metrics.overdueCount > 0 ? "danger" : undefined}
          />
          <SummaryCard
            label="Due Today"
            value={metrics.dueTodayCount}
            highlight={metrics.dueTodayCount > 0 ? "warning" : undefined}
          />
          <SummaryCard
            label="Upcoming Follow-ups"
            value={metrics.upcomingCount}
          />
          <SummaryCard
            label="Companies Without Recent Activity"
            value={metrics.inactiveCompanyCount}
            highlight={
              metrics.inactiveCompanyCount > 0 ? "warning" : undefined
            }
          />
        </div>

        <AiBrokerAssistantSection />

        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Load Opportunities
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Freight opportunities across your accounts
              </p>
            </div>
            <Link
              href="/opportunities"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              View all opportunities
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="New Opportunities"
              value={metrics.opportunityCounts.New}
            />
            <SummaryCard
              label="Quoted Opportunities"
              value={metrics.opportunityCounts.Quoted}
            />
            <SummaryCard
              label="Won Opportunities"
              value={metrics.opportunityCounts.Won}
            />
            <SummaryCard
              label="Lost Opportunities"
              value={metrics.opportunityCounts.Lost}
            />
          </div>
        </section>

        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Pipeline by Stage
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Company counts across your sales pipeline
              </p>
            </div>
            <Link
              href="/pipeline"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              View pipeline board
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {SALES_STAGES.map((stage) => (
              <div
                key={stage}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3"
              >
                <p className="text-xs font-medium text-zinc-600">{stage}</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">
                  {stageCounts[stage]}
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${salesStageBadgeClass(stage)}`}
                >
                  {stageCounts[stage] === 1 ? "company" : "companies"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-zinc-900">
              Today&apos;s Follow-ups
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Pending follow-ups scheduled for today
            </p>

            {today.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                No follow-ups due today.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {today.slice(0, LIST_LIMIT).map((followUp) => (
                  <FollowUpListItem
                    key={followUp.id}
                    followUp={followUp}
                    variant="today"
                    completing={completingId === followUp.id}
                    onMarkDone={handleMarkDone}
                  />
                ))}
              </ul>
            )}

            {today.length > LIST_LIMIT && (
              <p className="mt-4 text-sm text-zinc-500">
                Showing {LIST_LIMIT} of {today.length}.{" "}
                <Link
                  href="/follow-ups"
                  className="font-medium text-zinc-700 underline-offset-2 hover:underline"
                >
                  View all follow-ups
                </Link>
              </p>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-zinc-900">
              Overdue Follow-ups
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Past-due items that need immediate attention
            </p>

            {overdue.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                No overdue follow-ups.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {overdue.slice(0, LIST_LIMIT).map((followUp) => (
                  <FollowUpListItem
                    key={followUp.id}
                    followUp={followUp}
                    variant="overdue"
                    completing={completingId === followUp.id}
                    onMarkDone={handleMarkDone}
                  />
                ))}
              </ul>
            )}

            {overdue.length > LIST_LIMIT && (
              <p className="mt-4 text-sm text-zinc-500">
                Showing {LIST_LIMIT} of {overdue.length}.{" "}
                <Link
                  href="/follow-ups"
                  className="font-medium text-zinc-700 underline-offset-2 hover:underline"
                >
                  View all follow-ups
                </Link>
              </p>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-zinc-900">
              Companies Needing Attention
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              No logged activity in the last {INACTIVITY_DAYS} days
            </p>

            {companiesNeedingAttention.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                No companies need attention right now.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {companiesNeedingAttention
                  .slice(0, LIST_LIMIT)
                  .map((company) => (
                    <li
                      key={company.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-zinc-900">
                          {company.name}
                        </p>
                        <p className="text-sm text-zinc-600">
                          <span className="font-medium">Last activity:</span>{" "}
                          {company.lastActivityAt
                            ? formatDate(company.lastActivityAt)
                            : "No activity recorded"}
                        </p>
                        <p className="text-sm text-zinc-600">
                          <span className="font-medium">Next follow-up:</span>{" "}
                          {formatDate(company.nextFollowUpAt)}
                        </p>
                      </div>

                      <Link
                        href={`/companies/${company.id}`}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Open Company
                      </Link>
                    </li>
                  ))}
              </ul>
            )}

            {companiesNeedingAttention.length > LIST_LIMIT && (
              <p className="mt-4 text-sm text-zinc-500">
                Showing {LIST_LIMIT} of {companiesNeedingAttention.length}.{" "}
                <Link
                  href="/companies"
                  className="font-medium text-zinc-700 underline-offset-2 hover:underline"
                >
                  View all companies
                </Link>
              </p>
            )}
          </section>
        </div>
    </AuthenticatedLayout>
  );
}
