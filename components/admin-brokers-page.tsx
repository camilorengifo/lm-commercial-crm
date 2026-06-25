"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  AdminAccessDenied,
  AdminSubNav,
  ProductivityScoreHint,
} from "@/components/admin-shared";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { verifyAdminAccess } from "@/lib/admin";
import {
  fetchAdminOverview,
  type BrokerProductivityRow,
} from "@/lib/adminDashboard";
import {
  activityLevelLabel,
  filterBrokersByActivityLevel,
  formatPipelineValue,
  PRODUCTIVITY_SCORE_EXPLANATION,
  sortBrokerProductivityRows,
  type BrokerActivityLevel,
  type BrokerProductivitySort,
} from "@/lib/brokerProductivity";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import type { UserProfile } from "@/lib/userProfile";

export function AdminBrokersPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<BrokerProductivityRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] =
    useState<BrokerActivityLevel>("all");
  const [sortBy, setSortBy] =
    useState<BrokerProductivitySort>("productivityScore");

  const loadData = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await fetchAdminOverview();
    if (error) {
      setFetchError(formatSupabaseError(error));
      return;
    }
    setBrokers(data?.brokerProductivity ?? []);
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

  const filteredBrokers = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();

    let rows = brokers.filter((broker) => {
      if (!normalized) return true;
      const haystack = [broker.name, broker.email].join(" ").toLowerCase();
      return haystack.includes(normalized);
    });

    rows = filterBrokersByActivityLevel(rows, activityFilter);
    return sortBrokerProductivityRows(rows, sortBy);
  }, [brokers, searchQuery, activityFilter, sortBy]);

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

  if (!user || !profile) {
    return null;
  }

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Broker productivity
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Compare broker activity, follow-up discipline, and pipeline results.
        </p>
        <ProductivityScoreHint />
      </div>

      <AdminSubNav />

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <label
            htmlFor="broker-search"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Search
          </label>
          <input
            id="broker-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Broker name or email..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        <div>
          <label
            htmlFor="activity-filter"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Activity level
          </label>
          <select
            id="activity-filter"
            value={activityFilter}
            onChange={(event) =>
              setActivityFilter(event.target.value as BrokerActivityLevel)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">All</option>
            <option value="high">High activity</option>
            <option value="medium">Medium activity</option>
            <option value="low">Low activity</option>
            <option value="needs_attention">Needs attention</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="sort-by"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Sort by
          </label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(event) =>
              setSortBy(event.target.value as BrokerProductivitySort)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="productivityScore">Productivity score</option>
            <option value="overdueFollowUps">Overdue follow-ups</option>
            <option value="followUpsCompleted7d">Completed follow-ups</option>
            <option value="openPipelineValue">Open pipeline</option>
            <option value="lastActivityAt">Last activity</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {filteredBrokers.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm">
          No brokers match your current filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Broker
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Level
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Score
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Companies
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  FU completed wk
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Overdue
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Activities 7d
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Opps created
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Won
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Open pipeline
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Last activity
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredBrokers.map((broker) => (
                <tr key={broker.userId}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">{broker.name}</div>
                    <div className="text-zinc-600">{broker.email}</div>
                    {!broker.isActive && (
                      <span className="mt-1 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {activityLevelLabel(broker.activityLevel)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-900">
                    {broker.productivityScore}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {broker.companies}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {broker.followUpsCompleted7d}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {broker.overdueFollowUps}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {broker.activities7d}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {broker.opportunitiesCreated30d}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {broker.wonOpportunities}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {formatPipelineValue(broker.openPipelineValue)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {formatDate(broker.lastActivityAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/brokers/${broker.userId}`}
                      className="font-medium text-zinc-700 underline-offset-2 hover:underline"
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-500">
        {PRODUCTIVITY_SCORE_EXPLANATION}
      </p>
    </AuthenticatedLayout>
  );
}
