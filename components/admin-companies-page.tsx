"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  AdminAccessDenied,
  AdminSubNav,
  AdminSummaryCard,
} from "@/components/admin-shared";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { verifyAdminAccess } from "@/lib/admin";
import {
  ADMIN_COMPANY_PRIORITIES,
  attentionBadgeClass,
  attentionBadgeLabel,
  fetchAdminCompaniesOversight,
  filterAdminCompanies,
  type AdminCompaniesOversightData,
  type AdminCompanyAttentionStatus,
} from "@/lib/adminCompanies";
import { formatPipelineValue } from "@/lib/brokerProductivity";
import { priorityBadgeClass, type CompanyPriority } from "@/lib/crmConstants";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import type { UserProfile } from "@/lib/userProfile";

export function AdminCompaniesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [oversight, setOversight] = useState<AdminCompaniesOversightData | null>(
    null,
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [attentionFilter, setAttentionFilter] =
    useState<AdminCompanyAttentionStatus>("all");

  const loadData = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await fetchAdminCompaniesOversight();
    if (error) {
      setFetchError(formatSupabaseError(error));
      return;
    }
    setOversight(data);
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

  const filteredCompanies = useMemo(() => {
    if (!oversight) return [];

    return filterAdminCompanies(oversight.companies, {
      search: searchQuery,
      brokerUserId: brokerFilter,
      priority: priorityFilter,
      country: countryFilter,
      attention: attentionFilter,
    });
  }, [
    oversight,
    searchQuery,
    brokerFilter,
    priorityFilter,
    countryFilter,
    attentionFilter,
  ]);

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

  if (!user || !profile || !oversight) {
    return null;
  }

  const { summary } = oversight;

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Companies oversight
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          All companies across brokers — identify overdue follow-ups, abandoned
          accounts, missing contacts, and hot leads.
        </p>
      </div>

      <AdminSubNav />

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <AdminSummaryCard label="Total companies" value={summary.totalCompanies} />
        <AdminSummaryCard
          label="High priority companies"
          value={summary.highPriorityCompanies}
        />
        <AdminSummaryCard
          label="Overdue follow-ups"
          value={summary.companiesWithOverdueFollowUps}
          subtext="Companies with overdue items"
        />
        <AdminSummaryCard
          label="No activity 30+ days"
          value={summary.companiesNoActivity30d}
        />
        <AdminSummaryCard
          label="No contacts"
          value={summary.companiesWithNoContacts}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <label
            htmlFor="company-search"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Search
          </label>
          <input
            id="company-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Company name..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        <div>
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
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">All brokers</option>
            {oversight.brokers.map((broker) => (
              <option key={broker.userId} value={broker.userId}>
                {broker.name}
              </option>
            ))}
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
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">All priorities</option>
            {ADMIN_COMPANY_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="country-filter"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Country
          </label>
          <select
            id="country-filter"
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">All countries</option>
            {oversight.countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="attention-filter"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Attention status
          </label>
          <select
            id="attention-filter"
            value={attentionFilter}
            onChange={(event) =>
              setAttentionFilter(event.target.value as AdminCompanyAttentionStatus)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">All</option>
            <option value="overdue_follow_up">Overdue follow-up</option>
            <option value="no_activity_30d">No activity 30+ days</option>
            <option value="no_contacts">No contacts</option>
            <option value="high_priority">High priority</option>
            <option value="has_open_opportunity">Has open opportunity</option>
          </select>
        </div>
      </div>

      {filteredCompanies.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm">
          {oversight.companies.length === 0
            ? "No companies in the CRM yet."
            : "No companies match your current filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Company
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Broker
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Priority
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Country
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Last contact
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Next follow-up
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Contacts
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Activities
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Follow-ups
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">
                  Opportunities
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Status / Attention
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredCompanies.map((company) => (
                <tr key={company.companyId} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${company.companyId}`}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                    >
                      {company.companyName}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      Created {formatDate(company.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-zinc-900">{company.brokerName}</p>
                    <p className="text-xs text-zinc-500">{company.brokerEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        priorityBadgeClass(company.priority as CompanyPriority)
                      }`}
                    >
                      {company.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {company.country ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {company.lastContactAt
                      ? formatDate(company.lastContactAt)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {company.nextFollowUpAt
                      ? formatDate(company.nextFollowUpAt)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {company.contactCount}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    {company.activityCount}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    <span>{company.openFollowUpCount}</span>
                    {company.overdueFollowUpCount > 0 && (
                      <span className="block text-xs text-red-700">
                        {company.overdueFollowUpCount} overdue
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700">
                    <span>{company.openOpportunityCount}</span>
                    {company.openOpportunityValue > 0 && (
                      <span className="block text-xs text-zinc-500">
                        {formatPipelineValue(company.openOpportunityValue)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {company.attentionBadges.length === 0 ? (
                      <span className="text-xs text-zinc-500">On track</span>
                    ) : (
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {company.attentionBadges.map((badge) => (
                          <span
                            key={`${company.companyId}-${badge}`}
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${attentionBadgeClass(badge)}`}
                          >
                            {attentionBadgeLabel(badge)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredCompanies.length > 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          Showing {filteredCompanies.length} of {oversight.companies.length}{" "}
          companies.
        </p>
      )}
    </AuthenticatedLayout>
  );
}
