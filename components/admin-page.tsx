"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminSubNav,
  AdminSummaryCard,
  ProductivityScoreHint,
} from "@/components/admin-shared";
import { useAdminAuth } from "@/components/admin-auth-context";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CrmAlert, CrmCard, PageHeader, SectionHeader, StatGrid } from "@/components/crm-ui";
import {
  buildAdminOverview,
  fetchAdminDashboardSource,
  resolveAdminOfficeFilterLabel,
  type AdminOfficeFilter,
  type AdminOverviewData,
  type OfficeProductivitySummary,
  type RawCrmData,
} from "@/lib/adminDashboard";
import {
  formatPipelineValue,
  productivityRoleLabel,
  PRODUCTIVITY_SCORE_EXPLANATION,
} from "@/lib/brokerProductivity";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import { ALL_OFFICES_LABEL, UNASSIGNED_OFFICE_LABEL } from "@/lib/offices";

function OfficeOverviewSummaryCards({
  summary,
}: {
  summary: OfficeProductivitySummary;
}) {
  return (
    <StatGrid columns={4}>
      <AdminSummaryCard label="Brokers" value={summary.totalBrokers} />
      <AdminSummaryCard label="Companies" value={summary.totalCompanies} />
      <AdminSummaryCard label="Activities" value={summary.totalActivities} />
      <AdminSummaryCard label="Follow-ups" value={summary.totalFollowUps} />
      <AdminSummaryCard
        label="Overdue follow-ups"
        value={summary.overdueFollowUps}
      />
      <AdminSummaryCard
        label="Open opportunities"
        value={summary.openOpportunities}
      />
      <AdminSummaryCard label="Quoted" value={summary.quotedOpportunities} />
      <AdminSummaryCard label="Won" value={summary.wonOpportunities} />
    </StatGrid>
  );
}

export function AdminPage() {
  useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dashboardRaw, setDashboardRaw] = useState<RawCrmData | null>(null);
  const [officeFilter, setOfficeFilter] = useState<AdminOfficeFilter>("all");

  const loadData = useCallback(async () => {
    setFetchError(null);
    if (process.env.NODE_ENV === "development") {
      console.time("admin overview load");
    }
    const { data, error } = await fetchAdminDashboardSource();
    if (process.env.NODE_ENV === "development") {
      console.timeEnd("admin overview load");
      if (data) {
        console.info("[admin overview]", {
          profiles: data.profiles.length,
          companies: data.companies.length,
          contacts: data.contacts.length,
          followUps: data.followUps.length,
          opportunities: data.opportunities.length,
          activities: data.activities.length,
        });
      }
    }
    if (error) {
      setFetchError(formatSupabaseError(error));
      setDashboardRaw(null);
      return;
    }
    setDashboardRaw(data);
  }, []);

  const overview = useMemo<AdminOverviewData | null>(() => {
    if (!dashboardRaw) {
      return null;
    }

    return buildAdminOverview(dashboardRaw, officeFilter);
  }, [dashboardRaw, officeFilter]);

  const activeOfficeSummary = useMemo(() => {
    if (!overview || officeFilter === "all") {
      return null;
    }

    return overview.officeSummaries[0] ?? null;
  }, [overview, officeFilter]);

  const officeFilterLabel = useMemo(() => {
    if (!overview) {
      return ALL_OFFICES_LABEL;
    }

    return resolveAdminOfficeFilterLabel(officeFilter, overview.offices);
  }, [overview, officeFilter]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  if (loading) {
    return (
      <div className="crm-loading-screen">
        <p className="text-sm text-slate-500">Loading overview…</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
        <PageHeader
          title="Admin overview"
          description="Global commercial activity, broker productivity, and pipeline health across all accounts."
        />
        <AdminSubNav />
        <CrmAlert variant="error">
          {fetchError ?? "Unable to load admin overview."}
        </CrmAlert>
      </AuthenticatedLayout>
    );
  }

  const { kpis, brokerProductivity, needsAttention, commercialPulse } =
    overview;

  const pageDescription =
    officeFilter === "all"
      ? "Global commercial activity, broker productivity, and pipeline health across all accounts."
      : `Overview for ${officeFilterLabel} — metrics scoped to brokers and companies in this office.`;

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <PageHeader title="Admin overview" description={pageDescription} />

      <AdminSubNav />

      {fetchError && <CrmAlert variant="error">{fetchError}</CrmAlert>}

      <div className="mb-5 max-w-sm">
        <label
          htmlFor="admin-overview-office-filter"
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Office / Agency
        </label>
        <select
          id="admin-overview-office-filter"
          value={officeFilter}
          onChange={(event) =>
            setOfficeFilter(event.target.value as AdminOfficeFilter)
          }
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        >
          <option value="all">{ALL_OFFICES_LABEL}</option>
          <option value="unassigned">{UNASSIGNED_OFFICE_LABEL}</option>
          {overview.offices.map((office) => (
            <option key={office.id} value={office.id}>
              {office.name}
            </option>
          ))}
        </select>
      </div>

      {activeOfficeSummary && (
        <section className="mb-5">
          <SectionHeader
            title={`Overview for ${activeOfficeSummary.officeName}`}
            className="mb-4"
          />
          <OfficeOverviewSummaryCards summary={activeOfficeSummary} />
        </section>
      )}

      <StatGrid columns={6}>
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
      </StatGrid>

      <CrmCard className="mb-5">
        <SectionHeader
          title="Companies oversight"
          description="Review all companies across brokers — overdue follow-ups, abandoned accounts, missing contacts, and hot leads."
          actions={
            <Link href="/admin/companies" className="crm-btn-primary crm-btn-sm">
              View companies oversight
            </Link>
          }
        />
      </CrmCard>

      <CrmCard className="mb-5">
        <SectionHeader
          title="Broker productivity"
          actions={
            <Link href="/admin/brokers" className="crm-link text-sm">
              View full report
            </Link>
          }
          className="mb-4"
        />
        <ProductivityScoreHint />

        {brokerProductivity.length === 0 ? (
          <p className="text-sm text-zinc-500">No team members registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="crm-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">
                    Role
                  </th>
                  {officeFilter === "all" && (
                    <th className="px-3 py-2 text-left font-medium text-zinc-600">
                      Office / Agency
                    </th>
                  )}
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
                    <td className="px-3 py-3 text-zinc-700">
                      {productivityRoleLabel(row.role)}
                    </td>
                    {officeFilter === "all" && (
                      <td className="px-3 py-3 text-zinc-700">
                        {row.officeName}
                      </td>
                    )}
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

        <p className="mt-3 text-xs text-slate-500">
          {PRODUCTIVITY_SCORE_EXPLANATION}
        </p>
      </CrmCard>

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <CrmCard>
          <SectionHeader
            title="Needs attention"
            description="Brokers, companies, and opportunities that need oversight."
            accent="red"
            className="mb-4"
          />

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
        </CrmCard>

        <CrmCard>
          <SectionHeader
            title="Commercial pulse"
            description={
              officeFilter === "all"
                ? "Recent activity across all brokers."
                : `Recent activity for ${officeFilterLabel}.`
            }
            accent="blue"
            className="mb-4"
          />

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
        </CrmCard>
      </div>
    </AuthenticatedLayout>
  );
}
