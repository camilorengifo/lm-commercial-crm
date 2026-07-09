"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/components/admin-auth-context";
import {
  AdminSubNav,
  AdminSummaryCard,
  ProductivityCompanyCountHint,
} from "@/components/admin-shared";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { StatGrid } from "@/components/crm-ui";
import {
  fetchBrokerAdminDetail,
  type AdminBrokerDetailData,
} from "@/lib/adminDashboard";
import {
  activityLevelLabel,
  formatPipelineValue,
  productivityRoleLabel,
  PRODUCTIVITY_SCORE_EXPLANATION,
} from "@/lib/brokerProductivity";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";

export function AdminBrokerDetailPage() {
  useAdminAuth();
  const params = useParams();
  const brokerId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminBrokerDetailData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!brokerId) {
      setNotFound(true);
      return;
    }

    setFetchError(null);
    const { data, error } = await fetchBrokerAdminDetail(brokerId);

    if (error) {
      setFetchError(formatSupabaseError(error));
      setDetail(null);
      if (error.message?.includes("not found")) {
        setNotFound(true);
      }
      return;
    }

    setDetail(data);
    setNotFound(!data);
  }, [brokerId]);

  useEffect(() => {
    loadDetail().finally(() => setLoading(false));
  }, [loadDetail]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
        <AdminSubNav />
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          User not found.
        </p>
        <Link
          href="/admin/brokers"
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
        >
          Back to broker productivity
        </Link>
      </AuthenticatedLayout>
    );
  }

  const { metrics } = detail;

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/brokers"
            className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
          >
            ← Back to broker productivity
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            {detail.profile.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">{detail.profile.email}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {productivityRoleLabel(detail.profile.role)} ·{" "}
            {detail.profile.isActive ? "Active" : "Inactive"} ·{" "}
            {activityLevelLabel(metrics.activityLevel)} · Productivity score{" "}
            {metrics.productivityScore}
          </p>
        </div>
      </div>

      <AdminSubNav />

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      <StatGrid columns={6}>
        <AdminSummaryCard
          label="Companies"
          value={metrics.companies}
          subtext="Non-deleted, companies.user_id"
        />
        <AdminSummaryCard label="Contacts" value={metrics.contacts} />
        <AdminSummaryCard
          label="Follow-ups due today"
          value={detail.followUps.dueToday}
        />
        <AdminSummaryCard
          label="Overdue follow-ups"
          value={detail.followUps.overdue}
        />
        <AdminSummaryCard
          label="Completed this week"
          value={detail.followUps.completedThisWeek}
        />
        <AdminSummaryCard
          label="Open pipeline"
          value={formatPipelineValue(metrics.openPipelineValue)}
        />
      </StatGrid>

      <ProductivityCompanyCountHint />

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">Needs attention</h2>
          {detail.needsAttention.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              No urgent items for this broker right now.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {detail.needsAttention.map((item, index) => (
                <li
                  key={`${item.kind}-${index}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{item.title}</p>
                    <p className="text-zinc-600">{item.detail}</p>
                  </div>
                  <Link
                    href={item.href}
                    className="shrink-0 font-medium text-zinc-700 underline-offset-2 hover:underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">
            Open follow-ups
          </h2>
          {detail.followUps.pending.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              No open follow-ups for this broker.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {detail.followUps.pending.map((followUp) => (
                <li key={followUp.id} className="p-3 text-sm">
                  <p className="font-medium text-zinc-900">{followUp.title}</p>
                  <p className="text-zinc-600">
                    <Link
                      href={`/companies/${followUp.companyId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {followUp.companyName}
                    </Link>
                    {" · "}
                    Due {formatDateTime(followUp.dueAt)} · {followUp.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">Companies</h2>
          {detail.companies.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No companies assigned.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600">
                      Company
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600">
                      Stage
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600">
                      Priority
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600">
                      Last contact
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {detail.companies.map((company) => (
                    <tr key={company.id}>
                      <td className="px-3 py-3">
                        <Link
                          href={`/companies/${company.id}`}
                          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                        >
                          {company.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-zinc-700">
                        {company.salesStage}
                      </td>
                      <td className="px-3 py-3 text-zinc-700">
                        {company.priority}
                      </td>
                      <td className="px-3 py-3 text-zinc-700">
                        {formatDate(company.lastContactAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">Opportunities</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Open {detail.opportunities.open} · Won {detail.opportunities.won} ·
            Lost {detail.opportunities.lost}
          </p>
          {detail.opportunities.recent.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No opportunities yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {detail.opportunities.recent.map((opportunity) => (
                <li
                  key={opportunity.id}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-zinc-900">
                      {opportunity.name}
                    </p>
                    <p className="text-zinc-600">
                      {opportunity.companyName} · {opportunity.status} ·{" "}
                      {formatPipelineValue(opportunity.pipelineValue)}
                    </p>
                  </div>
                  <Link
                    href={`/opportunities/${opportunity.id}`}
                    className="shrink-0 font-medium text-zinc-700 underline-offset-2 hover:underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-zinc-900">
          Recent commercial timeline
        </h2>
        {detail.recentActivities.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No recent activity.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {detail.recentActivities.map((activity) => (
              <li
                key={activity.id}
                className="flex items-start justify-between gap-3 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-zinc-900">
                    <Link
                      href={`/companies/${activity.companyId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {activity.companyName}
                    </Link>
                  </p>
                  <p className="text-zinc-600">
                    {activity.activityType} ·{" "}
                    {formatDateTime(activity.activityAt)}
                  </p>
                  <p className="text-zinc-700">{activity.preview}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs text-zinc-500">
        {PRODUCTIVITY_SCORE_EXPLANATION}
      </p>
    </AuthenticatedLayout>
  );
}
