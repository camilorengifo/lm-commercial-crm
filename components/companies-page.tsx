"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CrmAlert, CrmCard, EmptyState, PageHeader, SectionHeader } from "@/components/crm-ui";
import { CompaniesBulkActiveModal } from "@/components/companies-bulk-active-modal";
import { CompaniesBulkArchiveModal } from "@/components/companies-bulk-archive-modal";
import { CompaniesBulkPauseModal } from "@/components/companies-bulk-pause-modal";
import {
  COMPANY_PRIORITIES,
  COUNTRY_OPTIONS,
  DEFAULT_SALES_STAGE,
  SALES_STAGES,
  priorityBadgeClass,
  salesStageBadgeClass,
  type CompanyPriority,
  type SalesStage,
} from "@/lib/crmConstants";
import {
  COMPANY_LIST_SELECT,
  COMPANY_SORT_OPTIONS,
  filterCompaniesBySearch,
  sortCompanies,
  type CompanyRecord,
  type CompanySortOption,
} from "@/lib/companies";
import {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  ACCOUNT_STATUS_LABELS,
  accountDispositionBadgeClass,
  accountStatusBadgeClass,
  getAccountDispositionLabel,
  matchesAccountStatusFilter,
  normalizeAccountStatus,
  type AccountStatusFilter,
} from "@/lib/accountStatus";
import {
  CompaniesIsolationDebug,
  type CompanyOwnershipDebugRow,
} from "@/components/companies-isolation-debug";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import { createAuthFetchGuard, getVerifiedAuthContext } from "@/lib/authSession";
import {
  fetchCompaniesOwnedByUser,
  filterCompaniesOwnedByUser,
  type BrokerIsolationStats,
} from "@/lib/brokerDataAccess";
import { fetchUserProfile, isAdminProfile, type UserProfile } from "@/lib/userProfile";
import { isSecurityDebugEnabled, logBrokerIsolationWarn } from "@/lib/securityDebug";
import { supabase } from "@/lib/supabaseClient";

interface Company extends CompanyRecord {
  sales_stage: SalesStage;
}

const EMPTY_FORM = {
  name: "",
  city: "",
  state: "",
  country: "United States",
  priority: "Medium" as CompanyPriority,
  sales_stage: DEFAULT_SALES_STAGE,
  general_notes: "",
  last_contact_at: "",
};

export function CompaniesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [accountStatusFilter, setAccountStatusFilter] =
    useState<AccountStatusFilter>("working");
  const [sortBy, setSortBy] = useState<CompanySortOption>("name_asc");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkPauseOpen, setBulkPauseOpen] = useState(false);
  const [bulkActiveOpen, setBulkActiveOpen] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [viewerProfile, setViewerProfile] = useState<UserProfile | null>(null);
  const [profileIdMatchesAuth, setProfileIdMatchesAuth] = useState(true);
  const [authEmailMatchesProfile, setAuthEmailMatchesProfile] = useState(true);
  const [isAdminViewer, setIsAdminViewer] = useState(false);
  const [isolationStats, setIsolationStats] = useState<BrokerIsolationStats | null>(
    null,
  );
  const [companyOwnershipRows, setCompanyOwnershipRows] = useState<
    CompanyOwnershipDebugRow[]
  >([]);
  const fetchGuardRef = useRef(createAuthFetchGuard());

  const fetchCompanies = useCallback(async (userId: string, email: string | null) => {
    const fetchGeneration = fetchGuardRef.current.next();
    setFetchError(null);
    setCompanies([]);
    setIsolationStats(null);
    setCompanyOwnershipRows([]);

    const authContext = await getVerifiedAuthContext();
    if (fetchGuardRef.current.isStale(fetchGeneration)) {
      return;
    }

    if (!authContext || authContext.userId !== userId) {
      logBrokerIsolationWarn("auth context mismatch during companies fetch", {
        requestedUserId: userId,
        verifiedUserId: authContext?.userId ?? null,
        requestedEmail: email,
        verifiedEmail: authContext?.email ?? null,
      });
      return;
    }

    const { data: profile } = await fetchUserProfile(userId);
    if (fetchGuardRef.current.isStale(fetchGeneration)) {
      return;
    }

    setViewerProfile(profile);
    setProfileIdMatchesAuth(profile ? profile.id === userId : false);
    setAuthEmailMatchesProfile(authContext.authEmailMatchesProfile);
    setIsAdminViewer(isAdminProfile(profile));

    if (profile && profile.id !== userId) {
      logBrokerIsolationWarn("profile.id !== auth.user.id", {
        authUserId: userId,
        profileId: profile.id,
      });
    }

    if (profile && !authContext.authEmailMatchesProfile) {
      logBrokerIsolationWarn("auth.user.email !== profile.email", {
        authEmail: email,
        profileEmail: profile.email,
        authUserId: userId,
        profileId: profile.id,
      });
    }

    const { data, error, stats } = await fetchCompaniesOwnedByUser<Company>({
      ownerUserId: userId,
      select: COMPANY_LIST_SELECT,
      page: "/companies",
      profile,
      order: { column: "name", ascending: true },
    });

    if (fetchGuardRef.current.isStale(fetchGeneration)) {
      return;
    }

    if (error) {
      setFetchError(formatSupabaseError(error));
      return;
    }

    const { visible } = filterCompaniesOwnedByUser(data, userId);

    const foreignInVisible = visible.filter((company) => company.user_id !== userId);
    if (foreignInVisible.length > 0) {
      logBrokerIsolationWarn("foreign companies in visible list after filter", {
        authUserId: userId,
        authEmail: email,
        profileRole: profile?.role ?? null,
        isAdmin: isAdminProfile(profile),
        foreignCompanies: foreignInVisible.map((company) => ({
          id: company.id,
          name: company.name,
          user_id: company.user_id,
        })),
      });
    }

    setIsolationStats(stats);
    setCompanies(visible);

    if (isSecurityDebugEnabled() && visible.length > 0) {
      const ownerIds = [...new Set(visible.map((company) => company.user_id))];
      const { data: ownerProfiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);

      if (fetchGuardRef.current.isStale(fetchGeneration)) {
        return;
      }

      const emailByUserId = new Map(
        (ownerProfiles ?? []).map((row) => [
          row.id as string,
          (row.email as string | null) ?? "—",
        ]),
      );

      setCompanyOwnershipRows(
        visible.map((company) => ({
          id: company.id,
          name: company.name,
          user_id: company.user_id,
          ownerEmail: emailByUserId.get(company.user_id) ?? "—",
          matchesAuth: company.user_id === userId,
        })),
      );
    } else {
      setCompanyOwnershipRows([]);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser }, error }) => {
      if (error || !authUser) {
        router.replace("/login");
        return;
      }

      setUser(authUser);
      fetchCompanies(authUser.id, authUser.email ?? null).finally(() =>
        setLoading(false),
      );
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        setViewerProfile(null);
        setCompanies([]);
        router.replace("/login");
        return;
      }

      setCompanies([]);
      setViewerProfile(null);
      setUser(session.user);
      fetchCompanies(session.user.id, session.user.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, [router, fetchCompanies]);

  const countryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const company of companies) {
      if (company.country?.trim()) values.add(company.country.trim());
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    let rows = filterCompaniesBySearch(companies, search);

    if (countryFilter !== "all") {
      rows = rows.filter((company) => company.country === countryFilter);
    }

    if (priorityFilter !== "all") {
      rows = rows.filter((company) => company.priority === priorityFilter);
    }

    rows = rows.filter((company) =>
      matchesAccountStatusFilter(
        normalizeAccountStatus(company.account_status),
        accountStatusFilter,
      ),
    );

    return sortCompanies(rows, sortBy);
  }, [companies, search, countryFilter, priorityFilter, accountStatusFilter, sortBy]);

  const visibleCompanyIds = useMemo(
    () => filteredCompanies.map((company) => company.id),
    [filteredCompanies],
  );

  const selectedVisibleCount = useMemo(
    () => visibleCompanyIds.filter((id) => selectedCompanyIds.has(id)).length,
    [visibleCompanyIds, selectedCompanyIds],
  );

  const allVisibleSelected =
    visibleCompanyIds.length > 0 &&
    visibleCompanyIds.every((companyId) => selectedCompanyIds.has(companyId));

  const selectedCompanyIdList = useMemo(
    () => Array.from(selectedCompanyIds),
    [selectedCompanyIds],
  );

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

  function clearSelection() {
    setSelectedCompanyIds(new Set());
  }

  function archiveSuccessMessage(updated: number): string {
    if (
      accountStatusFilter !== "archived" &&
      accountStatusFilter !== "all"
    ) {
      return `${updated} account${updated === 1 ? "" : "s"} archived and hidden from the working list.`;
    }

    return `${updated} account${updated === 1 ? "" : "s"} archived successfully.`;
  }

  async function handleBulkCompleted(
    action: "archive" | "pause" | "active",
    result: { updated: number; message: string },
  ) {
    if (!user) return;

    setBulkSubmitting(true);
    clearSelection();

    let message = result.message;
    if (action === "archive") {
      message = archiveSuccessMessage(result.updated);
    } else if (action === "pause") {
      message = `${result.updated} account${result.updated === 1 ? "" : "s"} paused successfully.`;
    } else {
      message = `${result.updated} account${result.updated === 1 ? "" : "s"} marked as active.`;
    }

    setSuccessMessage(message);
    await fetchCompanies(user.id, user.email ?? null);
    setBulkSubmitting(false);
  }

  function resetFilters() {
    setSearch("");
    setCountryFilter("all");
    setPriorityFilter("all");
    setAccountStatusFilter("working");
    setSortBy("name_asc");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setFormError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError("Company name is required.");
      setSubmitting(false);
      return;
    }

    const payload = {
      user_id: user.id,
      name: trimmedName,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country,
      priority: form.priority,
      sales_stage: form.sales_stage,
      general_notes: form.general_notes.trim() || null,
      last_contact_at: form.last_contact_at
        ? new Date(form.last_contact_at).toISOString()
        : null,
    };

    const { data: created, error } = await supabase
      .from("companies")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      setFormError(formatSupabaseError(error));
      setSubmitting(false);
      return;
    }

    setForm(EMPTY_FORM);
    setShowForm(false);
    setSubmitting(false);

    if (created?.id) {
      router.push(`/companies/${created.id}`);
      return;
    }

    setSuccessMessage(`"${trimmedName}" was added successfully.`);
    await fetchCompanies(user.id, user.email ?? null);
  }

  const uniqueCompanyOwnerIds = useMemo(
    () => [...new Set(companies.map((company) => company.user_id))],
    [companies],
  );

  if (loading) {
    return (
      <div className="crm-loading-screen">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AuthenticatedLayout>
        {isSecurityDebugEnabled() && (
          <CompaniesIsolationDebug
            authUserId={user.id}
            authEmail={user.email ?? null}
            profile={viewerProfile}
            isAdmin={isAdminViewer}
            fetchMode="broker_own_only"
            stats={isolationStats}
            profileIdMatchesAuth={profileIdMatchesAuth}
            authEmailMatchesProfile={authEmailMatchesProfile}
            uniqueCompanyOwnerIds={uniqueCompanyOwnerIds}
            companyOwnershipRows={companyOwnershipRows}
          />
        )}

        <PageHeader
          title="Companies"
          description="Search, filter, and manage your company book of business"
          actions={
            <button
              type="button"
              onClick={() => {
                setShowForm((prev) => !prev);
                setFormError(null);
              }}
              className="crm-btn-primary"
            >
              {showForm ? "Cancel" : "Add Company"}
            </button>
          }
        />

        <CrmCard className="mb-5" padding>
          <div className="mb-4 w-full sm:max-w-sm">
            <label htmlFor="search" className="crm-label">
              Search
            </label>
            <input
              id="search"
              type="search"
              placeholder="Search companies..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="crm-input"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label htmlFor="account-status-filter" className="crm-label">
                Account status
              </label>
              <select
                id="account-status-filter"
                value={accountStatusFilter}
                onChange={(event) =>
                  setAccountStatusFilter(event.target.value as AccountStatusFilter)
                }
                className="crm-select"
              >
                {ACCOUNT_STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="country-filter" className="crm-label">
                Country
              </label>
              <select
                id="country-filter"
                value={countryFilter}
                onChange={(event) => setCountryFilter(event.target.value)}
                className="crm-select"
              >
                <option value="all">All countries</option>
                {countryOptions.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="priority-filter" className="crm-label">
                Priority
              </label>
              <select
                id="priority-filter"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                className="crm-select"
              >
                <option value="all">All priorities</option>
                {COMPANY_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sort-by" className="crm-label">
                Sort
              </label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as CompanySortOption)
                }
                className="crm-select"
              >
                {COMPANY_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={resetFilters}
                className="crm-btn-secondary crm-btn-sm w-full"
              >
                Reset filters
              </button>
            </div>
          </div>
        </CrmCard>

        {successMessage && (
          <CrmAlert variant="success" className="mb-4">
            {successMessage}
          </CrmAlert>
        )}

        {selectedCompanyIds.size > 0 && (
          <CrmCard className="mb-4" padding>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-slate-700">
              {selectedCompanyIds.size} account
              {selectedCompanyIds.size === 1 ? "" : "s"} selected
              {selectedVisibleCount !== selectedCompanyIds.size && (
                <span className="ml-1 font-normal text-slate-500">
                  ({selectedVisibleCount} visible)
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBulkArchiveOpen(true)}
                disabled={bulkSubmitting}
                className="crm-btn-primary crm-btn-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Archive selected
              </button>
              <button
                type="button"
                onClick={() => setBulkPauseOpen(true)}
                disabled={bulkSubmitting}
                className="crm-btn-secondary crm-btn-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Pause selected
              </button>
              <button
                type="button"
                onClick={() => setBulkActiveOpen(true)}
                disabled={bulkSubmitting}
                className="crm-btn-secondary crm-btn-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark as Active
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={bulkSubmitting}
                className="crm-btn-secondary crm-btn-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear selection
              </button>
            </div>
            </div>
          </CrmCard>
        )}

        {fetchError && (
          <CrmAlert variant="error" className="mb-4">
            {fetchError}
          </CrmAlert>
        )}

        {showForm && (
          <CrmCard className="mb-8" padding>
            <SectionHeader title="New Company" className="mb-5" />

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="name"
                    className="crm-label"
                  >
                    Company name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    className="crm-input"
                    placeholder="Acme Freight Co."
                  />
                </div>

                <div>
                  <label
                    htmlFor="city"
                    className="crm-label"
                  >
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={form.city}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, city: event.target.value }))
                    }
                    className="crm-input"
                  />
                </div>

                <div>
                  <label
                    htmlFor="state"
                    className="crm-label"
                  >
                    State
                  </label>
                  <input
                    id="state"
                    type="text"
                    value={form.state}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, state: event.target.value }))
                    }
                    className="crm-input"
                  />
                </div>

                <div>
                  <label
                    htmlFor="country"
                    className="crm-label"
                  >
                    Country
                  </label>
                  <select
                    id="country"
                    value={form.country}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        country: event.target.value,
                      }))
                    }
                    className="crm-select"
                  >
                    {COUNTRY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="priority"
                    className="crm-label"
                  >
                    Priority
                  </label>
                  <select
                    id="priority"
                    value={form.priority}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        priority: event.target.value as CompanyPriority,
                      }))
                    }
                    className="crm-select"
                  >
                    {COMPANY_PRIORITIES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="sales_stage"
                    className="crm-label"
                  >
                    Sales stage
                  </label>
                  <select
                    id="sales_stage"
                    value={form.sales_stage}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        sales_stage: event.target.value as SalesStage,
                      }))
                    }
                    className="crm-select"
                  >
                    {SALES_STAGES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="last_contact_at"
                    className="crm-label"
                  >
                    Last contact
                  </label>
                  <input
                    id="last_contact_at"
                    type="datetime-local"
                    value={form.last_contact_at}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        last_contact_at: event.target.value,
                      }))
                    }
                    className="crm-input"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="general_notes"
                    className="crm-label"
                  >
                    General notes
                  </label>
                  <textarea
                    id="general_notes"
                    rows={3}
                    value={form.general_notes}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        general_notes: event.target.value,
                      }))
                    }
                    className="crm-input"
                    placeholder="Notes about this company..."
                  />
                </div>
              </div>

              {formError && (
                <CrmAlert variant="error" className="mb-0">
                  {formError}
                </CrmAlert>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="crm-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save Company"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setForm(EMPTY_FORM);
                    setFormError(null);
                  }}
                  className="crm-btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </CrmCard>
        )}

        <div className="crm-table-wrap">
          {filteredCompanies.length === 0 ? (
            <EmptyState
              title={
                companies.length === 0
                  ? "No companies yet"
                  : accountStatusFilter === "archived"
                    ? "No archived accounts"
                    : "No matches found"
              }
              description={
                companies.length === 0
                  ? "Click Add Company to get started."
                  : accountStatusFilter === "archived"
                    ? "Archived accounts will appear here."
                    : accountStatusFilter === "working" &&
                        !search &&
                        countryFilter === "all" &&
                        priorityFilter === "all"
                      ? "No working accounts in your book."
                      : "Try adjusting your search or filters."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <div className="crm-divider-toolbar">
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
                >
                  {allVisibleSelected ? "Deselect all visible" : "Select all visible"}
                </button>
                {selectedVisibleCount > 0 && (
                  <span className="text-sm text-slate-500">
                    {selectedVisibleCount} selected
                  </span>
                )}
              </div>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        aria-label="Select all visible companies"
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      Company
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">City</th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      State
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      Country
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      Priority
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      Account status
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      Sales stage
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      Last contact
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      Next follow-up
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-600">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredCompanies.map((company) => {
                    const status = normalizeAccountStatus(company.account_status);
                    const dispositionLabel = getAccountDispositionLabel(
                      company.account_disposition,
                    );

                    return (
                    <tr key={company.id}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedCompanyIds.has(company.id)}
                          onChange={() => toggleCompanySelection(company.id)}
                          aria-label={`Select ${company.name}`}
                          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/companies/${company.id}`}
                          className="crm-link font-medium"
                        >
                          {company.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {company.city || "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {company.state || "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {company.country || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`crm-badge ${priorityBadgeClass(company.priority)}`}
                        >
                          {company.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`crm-badge ${accountStatusBadgeClass(status)}`}
                          >
                            {ACCOUNT_STATUS_LABELS[status]}
                          </span>
                          {dispositionLabel && (
                            <span
                              className={`crm-badge ${accountDispositionBadgeClass(company.account_disposition ?? "")}`}
                            >
                              {dispositionLabel}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`crm-badge ${salesStageBadgeClass(company.sales_stage)}`}
                        >
                          {company.sales_stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {formatDate(company.last_contact_at)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {formatDate(company.next_follow_up_at)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {formatDate(company.created_at)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <CompaniesBulkArchiveModal
          open={bulkArchiveOpen}
          selectedCount={selectedCompanyIds.size}
          companyIds={selectedCompanyIdList}
          onClose={() => setBulkArchiveOpen(false)}
          onCompleted={(result) => void handleBulkCompleted("archive", result)}
        />
        <CompaniesBulkPauseModal
          open={bulkPauseOpen}
          selectedCount={selectedCompanyIds.size}
          companyIds={selectedCompanyIdList}
          onClose={() => setBulkPauseOpen(false)}
          onCompleted={(result) => void handleBulkCompleted("pause", result)}
        />
        <CompaniesBulkActiveModal
          open={bulkActiveOpen}
          selectedCount={selectedCompanyIds.size}
          companyIds={selectedCompanyIdList}
          onClose={() => setBulkActiveOpen(false)}
          onCompleted={(result) => void handleBulkCompleted("active", result)}
        />
    </AuthenticatedLayout>
  );
}
