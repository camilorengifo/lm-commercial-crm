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
import { StatGrid } from "@/components/crm-ui";
import { AdminReassignCompaniesModal } from "@/components/admin-reassign-companies-modal";
import { reassignAdminCompanies } from "@/lib/adminClient";
import { verifyAdminAccess } from "@/lib/admin";
import {
  ADMIN_COMPANY_PRIORITIES,
  attentionBadgeClass,
  attentionBadgeLabel,
  computeAdminCompaniesSummary,
  fetchAdminCompaniesOversight,
  filterAdminCompanies,
  formatAssignableOwnerLabel,
  getAssignableCompanyOwners,
  type AdminCompaniesBrokerOption,
  type AdminCompaniesOversightData,
  type AdminCompanyAttentionStatus,
  type AdminCompanyLifecycleStatus,
  type AdminCompanySortOption,
} from "@/lib/adminCompanies";
import { restoreCompanies } from "@/lib/companyClient";
import { formatPipelineValue } from "@/lib/brokerProductivity";
import { priorityBadgeClass, type CompanyPriority } from "@/lib/crmConstants";
import {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  ACCOUNT_STATUS_LABELS,
  accountDispositionBadgeClass,
  accountStatusBadgeClass,
  getAccountDispositionLabel,
  type AccountStatusFilter,
} from "@/lib/accountStatus";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import { ALL_OFFICES_LABEL, UNASSIGNED_OFFICE_LABEL } from "@/lib/offices";
import { fetchAllProfiles, type UserProfile } from "@/lib/userProfile";

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
  const [officeFilter, setOfficeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [attentionFilter, setAttentionFilter] =
    useState<AdminCompanyAttentionStatus>("all");
  const [lifecycleFilter, setLifecycleFilter] =
    useState<AdminCompanyLifecycleStatus>("active");
  const [accountStatusFilter, setAccountStatusFilter] =
    useState<AccountStatusFilter>("working");
  const [sortBy, setSortBy] = useState<AdminCompanySortOption>("name_asc");

  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(
    new Set(),
  );
  const [assignableOwners, setAssignableOwners] = useState<
    AdminCompaniesBrokerOption[]
  >([]);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [targetBrokerId, setTargetBrokerId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);

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

      void fetchAllProfiles().then(({ data }) => {
        setAssignableOwners(getAssignableCompanyOwners(data));
      });

      loadData().finally(() => setLoading(false));
    });
  }, [router, loadData]);

  const filteredCompanies = useMemo(() => {
    if (!oversight) return [];

    return filterAdminCompanies(oversight.companies, {
      search: searchQuery,
      brokerUserId: brokerFilter,
      officeId: officeFilter,
      priority: priorityFilter,
      country: countryFilter,
      attention: attentionFilter,
      lifecycle: lifecycleFilter,
      accountStatus: accountStatusFilter,
      sort: sortBy,
    });
  }, [
    oversight,
    searchQuery,
    brokerFilter,
    officeFilter,
    priorityFilter,
    countryFilter,
    attentionFilter,
    lifecycleFilter,
    accountStatusFilter,
    sortBy,
  ]);

  const selectedCompanies = useMemo(() => {
    if (!oversight) return [];
    return oversight.companies.filter((company) =>
      selectedCompanyIds.has(company.companyId),
    );
  }, [oversight, selectedCompanyIds]);

  const filteredSummary = useMemo(
    () => computeAdminCompaniesSummary(filteredCompanies),
    [filteredCompanies],
  );

  const ownerFilterOptions = useMemo(() => {
    if (!oversight) {
      return [];
    }

    const merged = new Map<string, AdminCompaniesBrokerOption>();
    for (const owner of oversight.brokers) {
      merged.set(owner.userId, owner);
    }
    for (const owner of assignableOwners) {
      merged.set(owner.userId, owner);
    }

    return Array.from(merged.values()).sort((a, b) => {
      const roleOrder = a.role === b.role ? 0 : a.role === "admin" ? -1 : 1;
      if (roleOrder !== 0) {
        return roleOrder;
      }

      return a.name.localeCompare(b.name);
    });
  }, [oversight, assignableOwners]);

  const activeBrokerOwnershipSummary = useMemo(() => {
    if (brokerFilter === "all" || !oversight) {
      return null;
    }

    const broker =
      ownerFilterOptions.find((item) => item.userId === brokerFilter) ??
      oversight.brokers.find((item) => item.userId === brokerFilter);
    if (!broker) {
      return null;
    }

    const ownedCount = oversight.companies.filter(
      (company) => company.brokerUserId === brokerFilter,
    ).length;

    return {
      broker,
      ownedCount,
      filteredCount: filteredCompanies.length,
    };
  }, [brokerFilter, oversight, filteredCompanies.length, ownerFilterOptions]);

  const visibleCompanyIds = useMemo(
    () => filteredCompanies.map((company) => company.companyId),
    [filteredCompanies],
  );

  const allVisibleSelected =
    visibleCompanyIds.length > 0 &&
    visibleCompanyIds.every((companyId) => selectedCompanyIds.has(companyId));

  function toggleCompanySelection(companyId: string) {
    setSelectedCompanyIds((current) => {
      const next = new Set(current);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedCompanyIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const companyId of visibleCompanyIds) {
          next.delete(companyId);
        }
      } else {
        for (const companyId of visibleCompanyIds) {
          next.add(companyId);
        }
      }
      return next;
    });
  }

  function openReassignModal() {
    setReassignError(null);
    setTargetBrokerId("");
    setReassignModalOpen(true);
  }

  async function handleConfirmReassign() {
    if (selectedCompanyIds.size === 0 || !targetBrokerId) return;

    setReassigning(true);
    setReassignError(null);

    const { data, error } = await reassignAdminCompanies({
      companyIds: Array.from(selectedCompanyIds),
      newUserId: targetBrokerId,
    });

    setReassigning(false);

    if (error || !data) {
      setReassignError(error ?? "Unable to reassign companies.");
      return;
    }

    setReassignModalOpen(false);
    setSelectedCompanyIds(new Set());
    setReassignSuccess(data.message);
    await loadData();
  }

  async function handleRestoreSelected() {
    if (selectedCompanyIds.size === 0) return;

    setReassignError(null);
    setReassignSuccess(null);

    const { data, error } = await restoreCompanies(Array.from(selectedCompanyIds));

    if (error || !data) {
      setReassignError(error ?? "Unable to restore companies.");
      return;
    }

    setReassignSuccess(data.message);
    setSelectedCompanyIds(new Set());
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">
          Loading companies oversight…
        </p>
      </div>
    );
  }

  if (accessDenied) {
    return <AdminAccessDenied />;
  }

  if (!user || !profile || !oversight) {
    return null;
  }

  const { summary: unfilteredSummary } = oversight;
  const summary = filteredSummary;
  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    brokerFilter !== "all" ||
    officeFilter !== "all" ||
    priorityFilter !== "all" ||
    countryFilter !== "all" ||
    attentionFilter !== "all" ||
    lifecycleFilter !== "active" ||
    accountStatusFilter !== "working";

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Companies oversight
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Global company book across brokers and admins. Owner visibility is
          driven by <span className="font-medium">companies.user_id</span> —
          use this page to verify owner email and reassign accounts.
        </p>
      </div>

      <AdminSubNav />

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {reassignSuccess && (
        <p className="mb-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {reassignSuccess}
        </p>
      )}

      {activeBrokerOwnershipSummary && (
        <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-medium">Ownership filter active</p>
          <p className="mt-1">
            {activeBrokerOwnershipSummary.broker.name} (
            {activeBrokerOwnershipSummary.broker.email}) owns{" "}
            {activeBrokerOwnershipSummary.ownedCount} compan
            {activeBrokerOwnershipSummary.ownedCount === 1 ? "y" : "ies"} in
            the CRM (profiles.id / companies.user_id:{" "}
            <span className="font-mono text-xs">
              {activeBrokerOwnershipSummary.broker.userId}
            </span>
            ). Showing {activeBrokerOwnershipSummary.filteredCount} after other
            filters.
          </p>
        </div>
      )}

      <StatGrid columns={5}>
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
      </StatGrid>

      {hasActiveFilters && (
        <p className="mb-5 text-sm text-zinc-500">
          Summary reflects current filters ({summary.totalCompanies} of{" "}
          {unfilteredSummary.totalCompanies} total companies loaded).
        </p>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
            Owner
          </label>
          <select
            id="broker-filter"
            value={brokerFilter}
            onChange={(event) => setBrokerFilter(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">All owners</option>
            {ownerFilterOptions.map((owner) => (
              <option key={owner.userId} value={owner.userId}>
                {formatAssignableOwnerLabel(owner)}
              </option>
            ))}
          </select>
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
            onChange={(event) => setOfficeFilter(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="all">{ALL_OFFICES_LABEL}</option>
            <option value="unassigned">{UNASSIGNED_OFFICE_LABEL}</option>
            {oversight.offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
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
            htmlFor="account-status-filter"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Account status
          </label>
          <select
            id="account-status-filter"
            value={accountStatusFilter}
            onChange={(event) =>
              setAccountStatusFilter(event.target.value as AccountStatusFilter)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            {ACCOUNT_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="lifecycle-filter"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Deleted status
          </label>
          <select
            id="lifecycle-filter"
            value={lifecycleFilter}
            onChange={(event) =>
              setLifecycleFilter(event.target.value as AdminCompanyLifecycleStatus)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="active">Active</option>
            <option value="archived">Archived / Deleted</option>
            <option value="all">All</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="sort-filter"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Sort
          </label>
          <select
            id="sort-filter"
            value={sortBy}
            onChange={(event) =>
              setSortBy(event.target.value as AdminCompanySortOption)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="name_asc">Company name A–Z</option>
            <option value="name_desc">Company name Z–A</option>
            <option value="created_newest">Created (newest)</option>
            <option value="created_oldest">Created (oldest)</option>
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-600">
          {selectedCompanyIds.size === 0
            ? "No companies selected"
            : `${selectedCompanyIds.size} compan${
                selectedCompanyIds.size === 1 ? "y" : "ies"
              } selected`}
        </p>
        <button
          type="button"
          onClick={openReassignModal}
          disabled={selectedCompanyIds.size === 0}
          className="crm-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reassign owner ({selectedCompanyIds.size || 0})
        </button>
        {lifecycleFilter !== "active" && (
          <button
            type="button"
            onClick={() => void handleRestoreSelected()}
            disabled={selectedCompanyIds.size === 0}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Restore selected
          </button>
        )}
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
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible companies"
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Company
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Owner
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Owner user ID
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  Office / Agency
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
                    <input
                      type="checkbox"
                      checked={selectedCompanyIds.has(company.companyId)}
                      onChange={() => toggleCompanySelection(company.companyId)}
                      aria-label={`Select ${company.companyName}`}
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${company.companyId}`}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                    >
                      {company.companyName}
                    </Link>
                    {company.isArchived && (
                      <span className="ml-2 inline-flex rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
                        Deleted
                      </span>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${accountStatusBadgeClass(company.accountStatus)}`}
                      >
                        {ACCOUNT_STATUS_LABELS[company.accountStatus]}
                      </span>
                      {getAccountDispositionLabel(company.accountDisposition) && (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${accountDispositionBadgeClass(company.accountDisposition ?? "")}`}
                        >
                          {getAccountDispositionLabel(company.accountDisposition)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">
                      Created {formatDate(company.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{company.brokerEmail}</p>
                    <p className="text-xs text-zinc-500">{company.brokerName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-zinc-700 break-all">
                      {company.brokerUserId}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {company.brokerOfficeName}
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

      <AdminReassignCompaniesModal
        open={reassignModalOpen}
        selectedCompanies={selectedCompanies}
        assignableOwners={assignableOwners}
        targetBrokerId={targetBrokerId}
        submitting={reassigning}
        error={reassignError}
        onTargetBrokerChange={setTargetBrokerId}
        onCancel={() => {
          if (!reassigning) {
            setReassignModalOpen(false);
            setReassignError(null);
          }
        }}
        onConfirm={() => void handleConfirmReassign()}
      />
    </AuthenticatedLayout>
  );
}
