"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import {
  fetchAdminBrokerDetail,
  fetchAdminDashboardStats,
  type AdminBrokerDetailSummary,
  type BrokerPerformanceRow,
} from "@/lib/adminStats";
import {
  fetchUserProfile,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
    </div>
  );
}

export function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof fetchAdminDashboardStats>
  >["data"]>(null);
  const [selectedBrokerId, setSelectedBrokerId] = useState("all");
  const [brokerDetail, setBrokerDetail] =
    useState<AdminBrokerDetailSummary | null>(null);

  const loadAdminData = useCallback(async (userId: string) => {
    setFetchError(null);

    const { data: userProfile, error: profileError } =
      await fetchUserProfile(userId);

    if (profileError) {
      setFetchError(formatSupabaseError(profileError));
      return false;
    }

    if (!isAdminProfile(userProfile)) {
      router.replace("/");
      return false;
    }

    setProfile(userProfile);

    const { data, error } = await fetchAdminDashboardStats();
    if (error) {
      setFetchError(formatSupabaseError(error));
      return false;
    }

    setStats(data);
    return true;
  }, [router]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      await loadAdminData(session.user.id);
      setLoading(false);
    });
  }, [router, loadAdminData]);

  useEffect(() => {
    if (selectedBrokerId === "all") {
      setBrokerDetail(null);
      return;
    }

    fetchAdminBrokerDetail(selectedBrokerId).then(({ data, error }) => {
      if (error) {
        setFetchError(formatSupabaseError(error));
        setBrokerDetail(null);
        return;
      }

      setBrokerDetail(data);
    });
  }, [selectedBrokerId]);

  const selectedBroker = useMemo(() => {
    if (!stats || selectedBrokerId === "all") return null;
    return stats.brokerRows.find((row) => row.userId === selectedBrokerId) ?? null;
  }, [stats, selectedBrokerId]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!user || !profile || !stats) {
    return null;
  }

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Admin
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Broker management and CRM activity across all accounts.
        </p>
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Total brokers" value={stats.totalBrokers} />
        <SummaryCard label="Total companies" value={stats.totalCompanies} />
        <SummaryCard
          label="Follow-ups due today"
          value={stats.followUpsDueToday}
        />
        <SummaryCard
          label="Overdue follow-ups"
          value={stats.overdueFollowUps}
        />
        <SummaryCard
          label="Open opportunities"
          value={stats.openOpportunities}
        />
      </div>

      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-medium text-zinc-900">
              Broker performance
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Activity summary per broker user.
            </p>
          </div>

          <div className="w-full sm:max-w-xs">
            <label
              htmlFor="broker-filter"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Filter by broker
            </label>
            <select
              id="broker-filter"
              value={selectedBrokerId}
              onChange={(event) => setSelectedBrokerId(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="all">All brokers</option>
              {stats.brokerRows.map((row) => (
                <option key={row.userId} value={row.userId}>
                  {row.name} ({row.email})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Broker
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Companies
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Contacts
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Due today
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Overdue
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Open opps
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Last activity
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {(selectedBrokerId === "all"
                ? stats.brokerRows
                : stats.brokerRows.filter(
                    (row) => row.userId === selectedBrokerId,
                  )
              ).map((row: BrokerPerformanceRow) => (
                <tr key={row.userId}>
                  <td className="px-3 py-3 text-sm text-zinc-900">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-zinc-600">{row.email}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700">
                    {row.companies}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700">
                    {row.contacts}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700">
                    {row.followUpsDueToday}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700">
                    {row.overdueFollowUps}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700">
                    {row.openOpportunities}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700">
                    {formatDate(row.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedBroker && brokerDetail && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">
            {selectedBroker.name} summary
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{selectedBroker.email}</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="Follow-ups due today"
              value={brokerDetail.followUpsDueToday}
            />
            <SummaryCard
              label="Overdue follow-ups"
              value={brokerDetail.overdueFollowUps}
            />
            <SummaryCard
              label="Open opportunities"
              value={brokerDetail.openOpportunities}
            />
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Company
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Owner
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Sales stage
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Last contact
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {brokerDetail.companies.map((company) => (
                  <tr key={company.id}>
                    <td className="px-3 py-3 text-sm">
                      <Link
                        href={`/companies/${company.id}`}
                        className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                      >
                        {company.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-700">
                      {company.ownerEmail}
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-700">
                      {company.salesStage}
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-700">
                      {formatDate(company.lastContactAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AuthenticatedLayout>
  );
}
