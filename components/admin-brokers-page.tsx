"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  AdminAccessDenied,
  AdminSubNav,
  AdminSummaryCard,
  ProductivityScoreHint,
} from "@/components/admin-shared";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { StatGrid } from "@/components/crm-ui";
import { verifyAdminAccess } from "@/lib/admin";
import {
  fetchAdminOverview,
  type BrokerProductivityRow,
  type OfficeProductivitySummary,
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
import { ALL_OFFICES_LABEL, UNASSIGNED_OFFICE_LABEL, type Office } from "@/lib/offices";
import type { UserProfile } from "@/lib/userProfile";

type OfficeFilterValue = "all" | "grouped" | "unassigned" | string;

function brokerMatchesOfficeFilter(
  broker: BrokerProductivityRow,
  officeFilter: OfficeFilterValue,
): boolean {
  if (officeFilter === "all" || officeFilter === "grouped") {
    return true;
  }

  if (officeFilter === "unassigned") {
    return broker.officeId === null;
  }

  return broker.officeId === officeFilter;
}

function BrokerProductivityTable({
  brokers,
}: {
  brokers: BrokerProductivityRow[];
}) {
  if (brokers.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm">
        No brokers match your current filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead className="bg-zinc-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-zinc-600">
              Broker
            </th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600">
              Office / Agency
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
          {brokers.map((broker) => (
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
              <td className="px-4 py-3 text-zinc-700">{broker.officeName}</td>
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
  );
}

function OfficeSummaryCards({ summary }: { summary: OfficeProductivitySummary }) {
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

export function AdminBrokersPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<BrokerProductivityRow[]>([]);
  const [officeSummaries, setOfficeSummaries] = useState<
    OfficeProductivitySummary[]
  >([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [officeFilter, setOfficeFilter] = useState<OfficeFilterValue>("all");
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
    setOfficeSummaries(data?.officeSummaries ?? []);
    setOffices(data?.offices ?? []);
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
      if (!brokerMatchesOfficeFilter(broker, officeFilter)) {
        return false;
      }

      if (!normalized) return true;
      const haystack = [broker.name, broker.email, broker.officeName]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });

    rows = filterBrokersByActivityLevel(rows, activityFilter);
    return sortBrokerProductivityRows(rows, sortBy);
  }, [brokers, searchQuery, officeFilter, activityFilter, sortBy]);

  const activeOfficeSummary = useMemo(() => {
    if (officeFilter === "all" || officeFilter === "grouped") {
      return null;
    }

    if (officeFilter === "unassigned") {
      return (
        officeSummaries.find((summary) => summary.officeId === null) ?? null
      );
    }

    return (
      officeSummaries.find((summary) => summary.officeId === officeFilter) ??
      null
    );
  }, [officeFilter, officeSummaries]);

  const groupedBrokers = useMemo(() => {
    if (officeFilter !== "grouped") {
      return [];
    }

    const sections: Array<{
      key: string;
      title: string;
      brokers: BrokerProductivityRow[];
    }> = [];

    for (const summary of officeSummaries) {
      const sectionBrokers = filteredBrokers.filter((broker) =>
        summary.officeId === null
          ? broker.officeId === null
          : broker.officeId === summary.officeId,
      );

      if (sectionBrokers.length === 0) {
        continue;
      }

      sections.push({
        key: summary.officeId ?? "unassigned",
        title: summary.officeName,
        brokers: sectionBrokers,
      });
    }

    return sections;
  }, [officeFilter, officeSummaries, filteredBrokers]);

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
          Compare broker activity, follow-up discipline, and pipeline results by
          office / agency.
        </p>
        <ProductivityScoreHint />
      </div>

      <AdminSubNav />

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2">
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
            htmlFor="office-filter"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Filter by office
          </label>
          <select
            id="office-filter"
            value={officeFilter}
            onChange={(event) =>
              setOfficeFilter(event.target.value as OfficeFilterValue)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">{ALL_OFFICES_LABEL}</option>
            <option value="grouped">Brokers by office (grouped)</option>
            <option value="unassigned">{UNASSIGNED_OFFICE_LABEL}</option>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
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

      {activeOfficeSummary && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium text-zinc-900">
            Office productivity — {activeOfficeSummary.officeName}
          </h2>
          <OfficeSummaryCards summary={activeOfficeSummary} />
        </section>
      )}

      {officeFilter === "all" && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium text-zinc-900">
            Office productivity
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {officeSummaries.map((summary) => (
              <div
                key={summary.officeId ?? "unassigned"}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <h3 className="text-base font-medium text-zinc-900">
                  {summary.officeName}
                </h3>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-zinc-500">Brokers</dt>
                    <dd className="font-medium text-zinc-900">
                      {summary.totalBrokers}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Companies</dt>
                    <dd className="font-medium text-zinc-900">
                      {summary.totalCompanies}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Activities</dt>
                    <dd className="font-medium text-zinc-900">
                      {summary.totalActivities}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Follow-ups</dt>
                    <dd className="font-medium text-zinc-900">
                      {summary.totalFollowUps}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Overdue follow-ups</dt>
                    <dd className="font-medium text-zinc-900">
                      {summary.overdueFollowUps}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Open opportunities</dt>
                    <dd className="font-medium text-zinc-900">
                      {summary.openOpportunities}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-medium text-zinc-900">
          Broker productivity
        </h2>

        {officeFilter === "grouped" ? (
          groupedBrokers.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm">
              No brokers match your current filters.
            </p>
          ) : (
            <div className="space-y-8">
              {groupedBrokers.map((section) => (
                <Fragment key={section.key}>
                  <h3 className="text-base font-medium text-zinc-900">
                    {section.title}
                  </h3>
                  <BrokerProductivityTable brokers={section.brokers} />
                </Fragment>
              ))}
            </div>
          )
        ) : (
          <BrokerProductivityTable brokers={filteredBrokers} />
        )}
      </section>

      <p className="mt-4 text-xs text-zinc-500">
        {PRODUCTIVITY_SCORE_EXPLANATION}
      </p>
    </AuthenticatedLayout>
  );
}
