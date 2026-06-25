"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  AdminAccessDenied,
  AdminSubNav,
  AdminSummaryCard,
  ProductivityScoreHint,
} from "@/components/admin-shared";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { verifyAdminAccess } from "@/lib/admin";
import {
  fetchAdminOverview,
  type AdminOverviewData,
} from "@/lib/adminDashboard";
import {
  formatPipelineValue,
  PRODUCTIVITY_SCORE_EXPLANATION,
} from "@/lib/brokerProductivity";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import type { UserProfile } from "@/lib/userProfile";

export function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);

  const loadData = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await fetchAdminOverview();
    if (error) {
      setFetchError(formatSupabaseError(error));
      return;
    }
    setOverview(data);
  }, []);

  useEffect(() => {
    verifyAdminAccess().then((result) => {
      if (!result.allowed) {
        if (result.reason === "unauthenticated") {
          router.replace("/login");
          return;
        }
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setUser(result.user);
      setProfile(result.profile);
      loadData().finally(() => setLoading(false));
    });
  }, [router, loadData]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (accessDenied) {
    return <AdminAccessDenied />;
  }

  if (!user || !profile || !overview) {
    return null;
  }

  const { kpis, brokerProductivity, needsAttention, commercialPulse } =
    overview;

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Admin overview
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Global commercial activity, broker productivity, and pipeline health
          across all accounts.
        </p>
      </div>

      <AdminSubNav />

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <AdminSummaryCard label="Total brokers" value={kpis.totalBrokers} />
        <AdminSummaryCard label="Active brokers" value={kpis.activeBrokers} />
        <AdminSummaryCard label="Total companies" value={kpis.totalCompanies} />
        <AdminSummaryCard label="Total contacts" value={kpis.totalContacts} />
        <AdminSummaryCard
          label="Open follow-ups"
          value={kpis.totalOpenFollowUps}
        />
        <AdminSummaryCard
          label="Follow-ups due today"
          value={kpis.followUpsDueToday}
        />
        <AdminSummaryCard
          label="Overdue follow-ups"
          value={kpis.overdueFollowUps}
        />
        <AdminSummaryCard
          label="Completed this week"
          value={kpis.followUpsCompletedThisWeek}
        />
        <AdminSummaryCard
          label="Total opportunities"
          value={kpis.totalOpportunities}
        />
        <AdminSummaryCard
          label="Open opportunities"
          value={kpis.openOpportunities}
        />
        <AdminSummaryCard label="Won opportunities" value={kpis.wonOpportunities} />
        <AdminSummaryCard label="Lost opportunities" value={kpis.lostOpportunities} />
        <AdminSummaryCard
          label="Open pipeline value"
          value={formatPipelineValue(kpis.estimatedOpenPipelineValue)}
        />
      </div>

      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-medium text-zinc-900">
              Companies oversight
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Review all companies across brokers — overdue follow-ups, abandoned
              accounts, missing contacts, and hot leads.
            </p>
          </div>
          <Link
            href="/admin/companies"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            View companies oversight
          </Link>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-medium text-zinc-900">
              Broker productivity
            </h2>
            <ProductivityScoreHint />
          </div>
          <Link
            href="/admin/brokers"
            className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
          >
            View full broker productivity
          </Link>
        </div>

        {brokerProductivity.length === 0 ? (
          <p className="text-sm text-zinc-500">No brokers registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">
                    Broker
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">
                    Score
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">
                    Companies
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">
                    Contacts
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">
                    Activities 7d
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">
                    FU completed 7d
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">
                    Overdue
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">
                    Opps won
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">
                    Open pipeline
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">
                    Last activity
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {brokerProductivity.slice(0, 15).map((row) => (
                  <tr key={row.userId}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-zinc-900">{row.name}</div>
                      <div className="text-zinc-600">{row.email}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-zinc-900">
                      {row.productivityScore}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-700">
                      {row.companies}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-700">
                      {row.contacts}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-700">
                      {row.activities7d}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-700">
                      {row.followUpsCompleted7d}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-700">
                      {row.overdueFollowUps}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-700">
                      {row.wonOpportunities}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-700">
                      {formatPipelineValue(row.openPipelineValue)}
                    </td>
                    <td className="px-3 py-3 text-zinc-700">
                      {formatDate(row.lastActivityAt)}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/brokers/${row.userId}`}
                        className="font-medium text-zinc-700 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-500">
          {PRODUCTIVITY_SCORE_EXPLANATION}
        </p>
      </section>

      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">Needs attention</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Brokers, companies, and opportunities that need oversight.
          </p>

          <div className="mt-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-zinc-800">
                Brokers with overdue follow-ups
              </h3>
              {needsAttention.brokers.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">
                  No brokers with 3+ overdue follow-ups.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {needsAttention.brokers.map((broker) => (
                    <li
                      key={broker.userId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">
                          {broker.name}
                        </p>
                        <p className="text-zinc-600">{broker.reason}</p>
                      </div>
                      <Link
                        href={`/admin/brokers/${broker.userId}`}
                        className="shrink-0 font-medium text-zinc-700 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-800">
                Brokers with no activity (7 days)
              </h3>
              {needsAttention.inactiveBrokers.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">
                  All brokers have recent activity.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {needsAttention.inactiveBrokers.slice(0, 5).map((broker) => (
                    <li
                      key={broker.userId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">
                          {broker.name}
                        </p>
                        <p className="text-zinc-600">{broker.reason}</p>
                      </div>
                      <Link
                        href={`/admin/brokers/${broker.userId}`}
                        className="shrink-0 font-medium text-zinc-700 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-zinc-800">
                  Companies with overdue follow-ups
                </h3>
                <Link
                  href="/admin/companies"
                  className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
                >
                  View all
                </Link>
              </div>
              {needsAttention.companies.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">
                  No companies with overdue follow-ups.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {needsAttention.companies.map((company) => (
                    <li
                      key={company.companyId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">
                          {company.companyName}
                        </p>
                        <p className="text-zinc-600">
                          {company.brokerName} · {company.overdueFollowUpCount}{" "}
                          overdue
                        </p>
                      </div>
                      <Link
                        href={`/companies/${company.companyId}`}
                        className="shrink-0 font-medium text-zinc-700 underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-800">
                Stuck opportunities
              </h3>
              {needsAttention.opportunities.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">
                  No open opportunities without recent company activity.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {needsAttention.opportunities.map((opportunity) => (
                    <li
                      key={opportunity.opportunityId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">
                          {opportunity.opportunityName}
                        </p>
                        <p className="text-zinc-600">
                          {opportunity.companyName} · {opportunity.brokerName} ·{" "}
                          {opportunity.status}
                        </p>
                      </div>
                      <Link
                        href={`/opportunities/${opportunity.opportunityId}`}
                        className="shrink-0 font-medium text-zinc-700 underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">Commercial pulse</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Recent activity across all brokers.
          </p>

          <div className="mt-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-zinc-800">
                Recent activities
              </h3>
              {commercialPulse.recentActivities.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">No recent activity.</p>
              ) : (
                <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {commercialPulse.recentActivities.map((activity) => (
                    <li key={activity.id} className="p-3 text-sm">
                      <p className="font-medium text-zinc-900">
                        <Link
                          href={`/companies/${activity.companyId}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {activity.companyName}
                        </Link>
                      </p>
                      <p className="text-zinc-600">
                        {activity.brokerName} · {activity.activityType} ·{" "}
                        {formatDateTime(activity.activityAt)}
                      </p>
                      <p className="line-clamp-2 text-zinc-700">
                        {activity.preview}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-800">
                Recent opportunities
              </h3>
              {commercialPulse.recentOpportunities.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">
                  No opportunities created yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {commercialPulse.recentOpportunities.map((opportunity) => (
                    <li key={opportunity.id} className="p-3 text-sm">
                      <p className="font-medium text-zinc-900">
                        {opportunity.name}
                      </p>
                      <p className="text-zinc-600">
                        {opportunity.companyName} · {opportunity.brokerName} ·{" "}
                        {opportunity.status} · {formatDate(opportunity.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-800">
                Recently completed follow-ups
              </h3>
              {commercialPulse.completedFollowUps.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">
                  No completed follow-ups yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {commercialPulse.completedFollowUps.map((followUp) => (
                    <li key={followUp.id} className="p-3 text-sm">
                      <p className="font-medium text-zinc-900">
                        {followUp.title}
                      </p>
                      <p className="text-zinc-600">
                        {followUp.companyName} · {followUp.brokerName} ·{" "}
                        {formatDateTime(followUp.completedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </AuthenticatedLayout>
  );
}
