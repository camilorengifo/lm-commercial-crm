"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CrmAlert, CrmCard, PageHeader } from "@/components/crm-ui";
import { CompanyAccountArchiveModal } from "@/components/company-account-archive-modal";
import { CompanyAccountStatusSection } from "@/components/company-account-status-section";
import { CompanyArchiveModal } from "@/components/company-archive-modal";
import { CompanyEditModal } from "@/components/company-edit-modal";
import { AiOutreachAssistantSection } from "@/components/ai-outreach-assistant-section";
import { CompanyChronologySection } from "@/components/company-chronology-section";
import { CompanyContactsSection } from "@/components/company-contacts-section";
import { CompanyFollowUpsSection } from "@/components/company-follow-ups-section";
import { CompanyLoadOpportunitiesSection } from "@/components/company-load-opportunities-section";
import {
  DEFAULT_SALES_STAGE,
  COMPANY_PRIORITIES,
  SALES_STAGES,
  isSalesStage,
  priorityBadgeClass,
  salesStageBadgeClass,
  type CompanyPriority,
  type SalesStage,
} from "@/lib/crmConstants";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import { reassignCompanyOwner } from "@/lib/adminStats";
import {
  formatAssignableOwnerLabel,
  getAssignableCompanyOwners,
  type AdminCompaniesBrokerOption,
} from "@/lib/adminCompanies";
import { COMPANY_LIST_SELECT, type CompanyRecord } from "@/lib/companies";
import { restoreCompanies, updateCompanyAccountStatus } from "@/lib/companyClient";
import {
  ACCOUNT_STATUS_LABELS,
  accountStatusBadgeClass,
  getAccountDispositionLabel,
  normalizeAccountStatus,
  type CompanyAccountStatusFields,
} from "@/lib/accountStatus";
import {
  fetchAllProfiles,
  fetchUserProfile,
  getProfileDisplayName,
  canManageOpportunities as userCanManageOpportunities,
  isAdminProfile,
  normalizeUserRole,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";
import { UNASSIGNED_OFFICE_LABEL } from "@/lib/offices";
import {
  brokerCanAccessCompany,
  fetchCompanyByIdForViewer,
  resolveBrokerScopedUserId,
} from "@/lib/brokerDataAccess";
import {
  createCompanyContactsWarningMessage,
  createCompanySuccessMessage,
} from "@/lib/companyCreateContacts";
import {
  companyDraftKey,
  readCompanyDraft,
  writeCompanyDraft,
} from "@/lib/usePersistentDraft";

const COMPANY_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "follow-ups", label: "Follow-ups" },
  { id: "opportunities", label: "Opportunities" },
  { id: "timeline", label: "Timeline" },
  { id: "ai-outreach", label: "AI Outreach" },
] as const;

type CompanySectionId = (typeof COMPANY_SECTIONS)[number]["id"];

function isCompanySectionId(
  value: string | null | undefined,
): value is CompanySectionId {
  return COMPANY_SECTIONS.some((section) => section.id === value);
}

interface CompanyOwnerInfo {
  name: string;
  email: string;
  officeName: string;
}

interface Company extends CompanyRecord {
  sales_stage: SalesStage;
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="crm-detail-field-label">
        {label}
      </dt>
      <dd className="crm-detail-field-value">{children}</dd>
    </div>
  );
}

export function CompanyDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const companyId = typeof params.id === "string" ? params.id : "";

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [chronologyRefreshKey, setChronologyRefreshKey] = useState(0);
  const [followUpsRefreshKey, setFollowUpsRefreshKey] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [assignableOwners, setAssignableOwners] = useState<
    AdminCompaniesBrokerOption[]
  >([]);
  const [reassignOwnerId, setReassignOwnerId] = useState("");
  const [ownerInfo, setOwnerInfo] = useState<CompanyOwnerInfo | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [accountArchiveOpen, setAccountArchiveOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoringAccount, setRestoringAccount] = useState(false);
  const [companyAccessVerified, setCompanyAccessVerified] = useState(false);

  const isAdmin = isAdminProfile(profile);

  const fetchCompany = useCallback(
    async (
      userId: string,
      id: string,
      userProfile: UserProfile | null,
      options?: { soft?: boolean },
    ) => {
      const soft = options?.soft === true;

      // Hard loads clear UI. Soft loads must NOT null company — that unmounts
      // child forms and destroys in-progress drafts on auth token refresh.
      if (!soft) {
        setFetchError(null);
        setNotFound(false);
        setCompanyAccessVerified(false);
        setCompany(null);
        setOwnerInfo(null);
      } else {
        setFetchError(null);
      }

      const { data, error, denied } = await fetchCompanyByIdForViewer<Company>({
        companyId: id,
        viewerUserId: userId,
        select: COMPANY_LIST_SELECT,
        profile: userProfile,
        allowAdminBypass: isAdminProfile(userProfile),
      });

      if (error) {
        setFetchError(formatSupabaseError(error));
        return;
      }

      if (denied || !data) {
        if (!soft) {
          setNotFound(true);
        }
        return;
      }

      const nextCompany = {
        ...data,
        sales_stage: isSalesStage(data.sales_stage)
          ? data.sales_stage
          : DEFAULT_SALES_STAGE,
      };

      setCompany(nextCompany);
      setReassignOwnerId((current) =>
        current && current.length > 0 ? current : nextCompany.user_id,
      );
      setCompanyAccessVerified(true);

      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select(
          "email, full_name, role, is_active, is_blocked, blocked_at, blocked_reason, office_id",
        )
        .eq("id", nextCompany.user_id)
        .maybeSingle();

      let officeName = UNASSIGNED_OFFICE_LABEL;
      if (ownerProfile?.office_id) {
        const { data: office } = await supabase
          .from("offices")
          .select("name")
          .eq("id", ownerProfile.office_id)
          .maybeSingle();

        officeName = office?.name ?? UNASSIGNED_OFFICE_LABEL;
      }

      if (ownerProfile) {
        setOwnerInfo({
          name: getProfileDisplayName({
            id: nextCompany.user_id,
            email: ownerProfile.email ?? "",
            full_name: ownerProfile.full_name,
            role: normalizeUserRole(ownerProfile.role),
            is_active: ownerProfile.is_active ?? true,
            is_blocked: ownerProfile.is_blocked ?? false,
            blocked_at: ownerProfile.blocked_at ?? null,
            blocked_reason: ownerProfile.blocked_reason ?? null,
          }),
          email: ownerProfile.email ?? "—",
          officeName,
        });
      } else if (!soft) {
        setOwnerInfo(null);
      }
    },
    [],
  );

  async function handlePriorityChange(nextPriority: CompanyPriority) {
    if (!user || !company || company.priority === nextPriority) return;

    setPriorityError(null);
    setActionError(null);
    setActionMessage(null);
    setUpdatingPriority(true);

    let updateQuery = supabase
      .from("companies")
      .update({ priority: nextPriority })
      .eq("id", company.id);

    if (!isAdmin) {
      updateQuery = updateQuery.eq("user_id", user.id);
    }

    const { error } = await updateQuery;

    if (error) {
      setPriorityError(formatSupabaseError(error));
      setActionError(formatSupabaseError(error));
      setUpdatingPriority(false);
      return;
    }

    setCompany((prev) =>
      prev ? { ...prev, priority: nextPriority } : prev,
    );
    setActionMessage("Priority updated successfully.");
    setUpdatingPriority(false);
  }

  async function handleSalesStageChange(nextStage: SalesStage) {
    if (!user || !company || company.sales_stage === nextStage) return;

    setStageError(null);
    setUpdatingStage(true);

    let updateQuery = supabase
      .from("companies")
      .update({ sales_stage: nextStage })
      .eq("id", company.id);

    if (!isAdmin) {
      updateQuery = updateQuery.eq("user_id", user.id);
    }

    const { error } = await updateQuery;

    if (error) {
      setStageError(formatSupabaseError(error));
      setUpdatingStage(false);
      return;
    }

    setCompany((prev) => (prev ? { ...prev, sales_stage: nextStage } : prev));
    setUpdatingStage(false);
  }

  const handleCompanyUpdated = useCallback(() => {
    if (user && companyId && profile) {
      return fetchCompany(user.id, companyId, profile);
    }
    return Promise.resolve();
  }, [user, companyId, profile, fetchCompany]);

  const handleAccountStatusUpdated = useCallback(
    async (fields: CompanyAccountStatusFields) => {
      setCompany((prev) =>
        prev
          ? {
              ...prev,
              account_status: fields.account_status,
              account_disposition: fields.account_disposition,
              archived_at: fields.archived_at,
              archived_by: fields.archived_by,
              archive_reason: fields.archive_reason,
              archive_notes: fields.archive_notes,
            }
          : prev,
      );
      await handleCompanyUpdated();
      setChronologyRefreshKey((key) => key + 1);
    },
    [handleCompanyUpdated],
  );

  const refreshFollowUpSections = useCallback(() => {
    setFollowUpsRefreshKey((key) => key + 1);
    setChronologyRefreshKey((key) => key + 1);
    handleCompanyUpdated();
  }, [handleCompanyUpdated]);

  async function handleReassignOwner() {
    if (!company || !reassignOwnerId || reassignOwnerId === company.user_id) {
      return;
    }

    setReassignError(null);
    setReassignSuccess(null);
    setReassigning(true);

    const { error } = await reassignCompanyOwner(company.id, reassignOwnerId);

    if (error) {
      setReassignError(formatSupabaseError(error));
      setReassigning(false);
      return;
    }

    setReassignSuccess("Company ownership updated.");
    if (user && companyId && profile) {
      await fetchCompany(user.id, companyId, profile);
      setChronologyRefreshKey((key) => key + 1);
    }

    setReassigning(false);
  }

  async function handleRestoreCompany() {
    if (!company) return;

    setActionError(null);
    setActionMessage(null);
    setRestoring(true);

    const { data, error } = await restoreCompanies([company.id]);

    setRestoring(false);

    if (error || !data) {
      setActionError(error ?? "Unable to restore company.");
      return;
    }

    setActionMessage(data.message);
    if (user && companyId && profile) {
      await fetchCompany(user.id, companyId, profile);
      setChronologyRefreshKey((key) => key + 1);
    }
  }

  async function handleRestoreAccount() {
    if (!company) return;

    setActionError(null);
    setActionMessage(null);
    setRestoringAccount(true);

    const { data, error } = await updateCompanyAccountStatus({
      companyId: company.id,
      accountStatus: "active",
    });

    setRestoringAccount(false);

    if (error || !data) {
      setActionError(error ?? "Unable to restore account.");
      return;
    }

    setActionMessage(data.message);
    if (user && companyId && profile) {
      if (data.company) {
        setCompany((prev) =>
          prev
            ? {
                ...prev,
                account_status: data.company!.account_status,
                account_disposition: data.company!.account_disposition,
                archived_at: data.company!.archived_at,
                archived_by: data.company!.archived_by,
                archive_reason: data.company!.archive_reason,
                archive_notes: data.company!.archive_notes,
              }
            : prev,
        );
      }
      await fetchCompany(user.id, companyId, profile);
      setChronologyRefreshKey((key) => key + 1);
    }
  }

  const isSoftDeleted = Boolean(company?.deleted_at);
  const accountStatus = normalizeAccountStatus(company?.account_status);
  const isAccountArchived = accountStatus === "archived";
  const dispositionLabel = getAccountDispositionLabel(company?.account_disposition);
  const canManageCompany = !isSoftDeleted || isAdmin;
  const canManageFollowUps =
    Boolean(company) &&
    canManageCompany &&
    (isAdmin || user?.id === company?.user_id);
  const canManageCompanyOpportunities =
    Boolean(company) &&
    canManageCompany &&
    userCanManageOpportunities(profile);

  useEffect(() => {
    if (searchParams.get("created") !== "1") {
      return;
    }

    if (searchParams.get("contactsWarning") === "1") {
      setActionError(createCompanyContactsWarningMessage());
      setActionMessage(null);
    } else {
      const contactCount = Number.parseInt(searchParams.get("contacts") ?? "0", 10);
      setActionMessage(
        createCompanySuccessMessage(Number.isFinite(contactCount) ? contactCount : 0),
      );
      setActionError(null);
    }

    router.replace(`/companies/${companyId}`, { scroll: false });
  }, [searchParams, companyId, router]);

  useEffect(() => {
    if (!companyId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(async ({ data: { user: authUser }, error }) => {
      if (error || !authUser) {
        router.replace("/login");
        return;
      }

      setUser(authUser);

      const { data: userProfile } = await fetchUserProfile(authUser.id);
      setProfile(userProfile);

      if (isAdminProfile(userProfile)) {
        const { data: allProfiles } = await fetchAllProfiles();
        setAssignableOwners(getAssignableCompanyOwners(allProfiles));
      }

      fetchCompany(authUser.id, companyId, userProfile).finally(() =>
        setLoading(false),
      );
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user) {
        router.replace("/login");
        return;
      }

      // Returning to the browser tab often refreshes the JWT. Do not tear down
      // Company Detail or remount child forms on token refresh / initial session.
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        return;
      }

      setUser(session.user);
      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      if (companyId) {
        // Soft refresh keeps mounted forms/drafts intact.
        fetchCompany(session.user.id, companyId, userProfile, { soft: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [router, companyId, fetchCompany]);

  const tabParam = searchParams.get("tab");
  const activeSection: CompanySectionId = isCompanySectionId(tabParam)
    ? tabParam
    : "overview";

  const selectCompanySection = useCallback(
    (section: CompanySectionId, options?: { scroll?: boolean }) => {
      if (!companyId) return;

      const nextParams = new URLSearchParams(searchParams.toString());
      if (section === "overview") {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", section);
      }

      const query = nextParams.toString();
      router.replace(
        query ? `/companies/${companyId}?${query}` : `/companies/${companyId}`,
        { scroll: false },
      );

      writeCompanyDraft(companyDraftKey(companyId, "section"), { section });

      if (options?.scroll !== false) {
        window.requestAnimationFrame(() => {
          document
            .getElementById(`company-section-${section}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    },
    [companyId, router, searchParams],
  );

  useEffect(() => {
    if (!companyId || !companyAccessVerified || !company) return;

    const urlTab = searchParams.get("tab");
    if (isCompanySectionId(urlTab)) {
      writeCompanyDraft(companyDraftKey(companyId, "section"), {
        section: urlTab,
      });
      window.requestAnimationFrame(() => {
        document
          .getElementById(`company-section-${urlTab}`)
          ?.scrollIntoView({ behavior: "auto", block: "start" });
      });
      return;
    }

    const stored = readCompanyDraft<{ section: string }>(
      companyDraftKey(companyId, "section"),
    );
    if (
      stored &&
      isCompanySectionId(stored.section) &&
      stored.section !== "overview"
    ) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", stored.section);
      router.replace(`/companies/${companyId}?${nextParams.toString()}`, {
        scroll: false,
      });
    }
    // Only restore once access is verified for this company.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot restore
  }, [companyId, companyAccessVerified]);

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

  const canViewCompany =
    company &&
    brokerCanAccessCompany({
      companyUserId: company.user_id,
      viewerUserId: user.id,
      isAdmin,
    });

  const scopedUserId =
    company && user
      ? resolveBrokerScopedUserId({
          ownerUserId: company.user_id,
          viewerUserId: user.id,
          isAdmin,
        })
      : user.id;

  return (
    <AuthenticatedLayout maxWidthClass="max-w-4xl">
        {actionMessage && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {actionMessage}
          </p>
        )}

        {actionError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        {fetchError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {fetchError}
          </p>
        )}

        {notFound && !fetchError && (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-zinc-600">
              Company not found or you do not have access.
            </p>
          </div>
        )}

        {company && companyAccessVerified && canViewCompany && (
          <>
            <div className="crm-company-header">
              <div className="crm-company-header-bar" aria-hidden />
              <div className="pt-2">
              {isSoftDeleted && (
                <CrmAlert variant="warning" className="mb-4">
                  This company has been deleted from your active list.
                  {company.delete_reason
                    ? ` Reason: ${company.delete_reason}`
                    : ""}
                </CrmAlert>
              )}

              {!isSoftDeleted && isAccountArchived && (
                <CrmAlert variant="warning" className="mb-4">
                  This account is archived and hidden from your default working
                  list.
                  {company.archive_reason
                    ? ` Reason: ${company.archive_reason}`
                    : ""}
                </CrmAlert>
              )}

              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="crm-eyebrow">Company account</p>
                  <h1 className="crm-page-title mt-2">{company.name}</h1>
                  <p className="crm-page-subtitle">
                    Contacts, opportunities, timeline, and follow-ups
                  </p>
                  {ownerInfo && (
                    <p className="mt-2 text-sm text-zinc-600">
                      Broker: {ownerInfo.name} ({ownerInfo.email}) · Office /
                      Agency: {ownerInfo.officeName}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canManageCompany ? (
                    <select
                      id="company-priority-header"
                      value={company.priority}
                      disabled={updatingPriority}
                      onChange={(event) =>
                        handlePriorityChange(
                          event.target.value as CompanyPriority,
                        )
                      }
                      aria-label="Company priority"
                      title={
                        updatingPriority ? "Saving priority..." : "Priority"
                      }
                      className={`crm-badge cursor-pointer appearance-none border-0 py-1 pl-2.5 pr-7 outline-none transition focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 ${priorityBadgeClass(company.priority)}`}
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2371717a' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
                        backgroundPosition: "right 0.35rem center",
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "1rem 1rem",
                      }}
                    >
                      {COMPANY_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`crm-badge ${priorityBadgeClass(company.priority)}`}
                    >
                      {company.priority}
                    </span>
                  )}
                  <span
                    className={`crm-badge ${accountStatusBadgeClass(accountStatus)}`}
                  >
                    {ACCOUNT_STATUS_LABELS[accountStatus]}
                  </span>
                  {dispositionLabel && (
                    <span className="crm-badge bg-slate-100 text-slate-700 ring-slate-200">
                      {dispositionLabel}
                    </span>
                  )}
                  {canManageCompany && !isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditOpen(true)}
                        className="crm-btn-secondary crm-btn-sm"
                      >
                        Edit company
                      </button>
                      {!isAccountArchived && (
                        <button
                          type="button"
                          onClick={() => setAccountArchiveOpen(true)}
                          className="crm-btn-secondary crm-btn-sm"
                        >
                          Archive account
                        </button>
                      )}
                      {isAccountArchived && (
                        <button
                          type="button"
                          onClick={handleRestoreAccount}
                          disabled={restoringAccount}
                          className="crm-btn-primary crm-btn-sm disabled:opacity-60"
                        >
                          {restoringAccount ? "Restoring..." : "Restore account"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setArchiveOpen(true)}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100"
                      >
                        Delete company
                      </button>
                    </>
                  )}
                  {isAdmin && canManageCompany && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditOpen(true)}
                        className="crm-btn-secondary crm-btn-sm"
                      >
                        Edit company
                      </button>
                      {!isAccountArchived && (
                        <button
                          type="button"
                          onClick={() => setAccountArchiveOpen(true)}
                          className="crm-btn-secondary crm-btn-sm"
                        >
                          Archive account
                        </button>
                      )}
                      {isAccountArchived && (
                        <button
                          type="button"
                          onClick={handleRestoreAccount}
                          disabled={restoringAccount}
                          className="crm-btn-primary crm-btn-sm disabled:opacity-60"
                        >
                          {restoringAccount ? "Restoring..." : "Restore account"}
                        </button>
                      )}
                      {!isSoftDeleted && (
                        <button
                          type="button"
                          onClick={() => setArchiveOpen(true)}
                          className="crm-btn-danger crm-btn-sm"
                        >
                          Delete company
                        </button>
                      )}
                      {isSoftDeleted && (
                        <button
                          type="button"
                          onClick={handleRestoreCompany}
                          disabled={restoring}
                          className="crm-btn-primary crm-btn-sm disabled:opacity-60"
                        >
                          {restoring ? "Restoring..." : "Restore deleted company"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailField label="City">{company.city || "—"}</DetailField>
                <DetailField label="State">{company.state || "—"}</DetailField>
                <DetailField label="Country">
                  {company.country || "—"}
                </DetailField>
                <DetailField label="Priority">
                  <div className="space-y-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(company.priority)}`}
                    >
                      {company.priority}
                    </span>
                    {canManageCompany ? (
                      <select
                        id="company-priority-detail"
                        value={company.priority}
                        disabled={updatingPriority}
                        onChange={(event) =>
                          handlePriorityChange(
                            event.target.value as CompanyPriority,
                          )
                        }
                        className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {COMPANY_PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {updatingPriority && (
                      <p className="text-sm text-zinc-500">Saving priority...</p>
                    )}
                    {priorityError && (
                      <p className="text-sm text-red-600">{priorityError}</p>
                    )}
                  </div>
                </DetailField>
                <DetailField label="Sales stage">
                  <div className="space-y-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${salesStageBadgeClass(company.sales_stage)}`}
                    >
                      {company.sales_stage}
                    </span>
                    <select
                      value={company.sales_stage}
                      disabled={updatingStage}
                      onChange={(event) =>
                        handleSalesStageChange(event.target.value as SalesStage)
                      }
                      className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {SALES_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                    {stageError && (
                      <p className="text-sm text-red-600">{stageError}</p>
                    )}
                  </div>
                </DetailField>
                <DetailField label="Last contact">
                  {formatDate(company.last_contact_at)}
                </DetailField>
                <DetailField label="Next follow-up">
                  {formatDate(company.next_follow_up_at)}
                </DetailField>
                <DetailField label="Created date">
                  {formatDate(company.created_at)}
                </DetailField>
                {isAdmin && (
                  <DetailField label="Reassign owner">
                      <div className="space-y-2">
                        <select
                          value={reassignOwnerId}
                          onChange={(event) =>
                            setReassignOwnerId(event.target.value)
                          }
                          disabled={reassigning}
                          className="block w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {assignableOwners.map((owner) => (
                            <option key={owner.userId} value={owner.userId}>
                              {formatAssignableOwnerLabel(owner)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleReassignOwner}
                          disabled={
                            reassigning ||
                            reassignOwnerId === company.user_id
                          }
                          className="crm-btn-secondary crm-btn-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reassigning ? "Saving..." : "Save owner change"}
                        </button>
                        {reassignError && (
                          <p className="text-sm text-red-600">{reassignError}</p>
                        )}
                        {reassignSuccess && (
                          <p className="text-sm text-emerald-700">
                            {reassignSuccess}
                          </p>
                        )}
                      </div>
                    </DetailField>
                )}
              </dl>

              <div className="mt-6 border-t border-zinc-100 pt-6">
                <DetailField label="General notes">
                  {company.general_notes ? (
                    <p className="whitespace-pre-wrap">{company.general_notes}</p>
                  ) : (
                    "—"
                  )}
                </DetailField>
              </div>
              </div>
            </div>

            <div className="space-y-5">
              <nav
                className="sticky top-0 z-20 -mx-1 flex flex-wrap gap-2 border-b border-zinc-200 bg-zinc-50/95 px-1 py-3 backdrop-blur"
                aria-label="Company sections"
              >
                {COMPANY_SECTIONS.map((section) => {
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => selectCompanySection(section.id)}
                      className={
                        isActive
                          ? "crm-tab-pill crm-tab-pill-active"
                          : "crm-tab-pill"
                      }
                    >
                      {section.label}
                    </button>
                  );
                })}
              </nav>

              <div id="company-section-overview" className="scroll-mt-24" />

              <div id="company-section-contacts" className="scroll-mt-24">
              <CompanyContactsSection
                companyId={company.id}
                ownerUserId={company.user_id}
                viewerUserId={user.id}
                isAdmin={isAdmin}
              />
              </div>
              <CompanyAccountStatusSection
                company={company}
                canManage={canManageCompany}
                onUpdated={handleAccountStatusUpdated}
              />
              <div id="company-section-follow-ups" className="scroll-mt-24">
              <CompanyFollowUpsSection
                companyId={company.id}
                userId={scopedUserId}
                actorUserId={user.id}
                companyPriority={company.priority}
                canManage={canManageFollowUps}
                isAdmin={isAdmin}
                onCompanyUpdated={refreshFollowUpSections}
                externalRefreshKey={followUpsRefreshKey}
              />
              </div>
              <div id="company-section-opportunities" className="scroll-mt-24">
              <CompanyLoadOpportunitiesSection
                companyId={company.id}
                ownerUserId={company.user_id}
                viewerUserId={user.id}
                isAdmin={isAdmin}
                currentSalesStage={company.sales_stage}
                canManage={canManageCompanyOpportunities}
                onCompanyUpdated={handleCompanyUpdated}
              />
              </div>
              <div id="company-section-timeline" className="scroll-mt-24">
              <CompanyChronologySection
                companyId={company.id}
                userId={scopedUserId}
                viewerUserId={user.id}
                isAdmin={isAdmin}
                canManage={canManageFollowUps}
                externalRefreshKey={chronologyRefreshKey}
                onCompanyUpdated={() => {
                  if (user && companyId && profile) {
                    return fetchCompany(user.id, companyId, profile, {
                      soft: true,
                    });
                  }
                }}
              />
              </div>
              <div className="crm-workspace-toolbar">
                <Link
                  href="/assistant"
                  className="crm-btn-secondary crm-btn-sm"
                >
                  Open in AI Assistant
                </Link>
                <Link
                  href={`/assistant?company=${company.id}`}
                  className="crm-btn-secondary crm-btn-sm"
                >
                  Draft next outreach
                </Link>
              </div>
              <div id="company-section-ai-outreach" className="scroll-mt-24">
              <AiOutreachAssistantSection
                companyId={company.id}
                companyName={company.name}
                ownerUserId={company.user_id}
                viewerUserId={user.id}
                isAdmin={isAdmin}
                onActivitySaved={() => {
                  refreshFollowUpSections();
                }}
              />
              </div>
            </div>
          </>
        )}

      <CompanyEditModal
        open={editOpen}
        company={company}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setActionMessage("Company updated successfully.");
          handleCompanyUpdated();
          setChronologyRefreshKey((key) => key + 1);
        }}
      />

      <CompanyAccountArchiveModal
        open={accountArchiveOpen}
        companyName={company?.name ?? "Company"}
        companyId={company?.id ?? ""}
        onClose={() => setAccountArchiveOpen(false)}
        onArchived={(message) => {
          setActionMessage(message);
          handleCompanyUpdated();
          setChronologyRefreshKey((key) => key + 1);
        }}
      />

      <CompanyArchiveModal
        open={archiveOpen}
        companyName={company?.name ?? "Company"}
        companyIds={company ? [company.id] : []}
        isAdmin={isAdmin}
        onClose={() => setArchiveOpen(false)}
        onArchived={(message) => {
          setActionMessage(message);
          if (isAdmin) {
            handleCompanyUpdated();
          } else {
            router.push("/companies");
          }
        }}
      />
    </AuthenticatedLayout>
  );
}
