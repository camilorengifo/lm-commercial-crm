"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CompanyArchiveModal } from "@/components/company-archive-modal";
import { CompanyEditModal } from "@/components/company-edit-modal";
import { AiOutreachAssistantSection } from "@/components/ai-outreach-assistant-section";
import { CompanyChronologySection } from "@/components/company-chronology-section";
import { CompanyContactsSection } from "@/components/company-contacts-section";
import { CompanyFollowUpsSection } from "@/components/company-follow-ups-section";
import { CompanyLoadOpportunitiesSection } from "@/components/company-load-opportunities-section";
import {
  DEFAULT_SALES_STAGE,
  SALES_STAGES,
  isSalesStage,
  priorityBadgeClass,
  salesStageBadgeClass,
  type CompanyPriority,
  type SalesStage,
} from "@/lib/crmConstants";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import { reassignCompanyOwner } from "@/lib/adminStats";
import { COMPANY_LIST_SELECT, type CompanyRecord } from "@/lib/companies";
import { restoreCompanies } from "@/lib/companyClient";
import {
  fetchAllProfiles,
  fetchUserProfile,
  getProfileDisplayName,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

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
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-900">{children}</dd>
    </div>
  );
}

export function CompanyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = typeof params.id === "string" ? params.id : "";

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [chronologyRefreshKey, setChronologyRefreshKey] = useState(0);
  const [followUpsRefreshKey, setFollowUpsRefreshKey] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [brokers, setBrokers] = useState<UserProfile[]>([]);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [reassignBrokerId, setReassignBrokerId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const isAdmin = isAdminProfile(profile);

  const fetchCompany = useCallback(
    async (userId: string, id: string, asAdmin: boolean) => {
      setFetchError(null);
      setNotFound(false);

      let query = supabase
        .from("companies")
        .select(COMPANY_LIST_SELECT)
        .eq("id", id);

      if (!asAdmin) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        setFetchError(formatSupabaseError(error));
        setCompany(null);
        return;
      }

      if (!data) {
        setNotFound(true);
        setCompany(null);
        return;
      }

      const nextCompany = {
        ...(data as Company),
        sales_stage: isSalesStage((data as Company).sales_stage)
          ? (data as Company).sales_stage
          : DEFAULT_SALES_STAGE,
      };

      setCompany(nextCompany);
      setReassignBrokerId(nextCompany.user_id);

      if (asAdmin) {
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", nextCompany.user_id)
          .maybeSingle();

        setOwnerEmail(ownerProfile?.email ?? null);
      } else {
        setOwnerEmail(null);
      }
    },
    [],
  );

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
      fetchCompany(user.id, companyId, isAdminProfile(profile));
    }
  }, [user, companyId, profile, fetchCompany]);

  const refreshFollowUpSections = useCallback(() => {
    setFollowUpsRefreshKey((key) => key + 1);
    setChronologyRefreshKey((key) => key + 1);
    handleCompanyUpdated();
  }, [handleCompanyUpdated]);

  async function handleReassignOwner() {
    if (!company || !reassignBrokerId || reassignBrokerId === company.user_id) {
      return;
    }

    setReassignError(null);
    setReassignSuccess(null);
    setReassigning(true);

    const { error } = await reassignCompanyOwner(company.id, reassignBrokerId);

    if (error) {
      setReassignError(formatSupabaseError(error));
      setReassigning(false);
      return;
    }

    setReassignSuccess("Company ownership updated.");
    if (user && companyId && profile) {
      await fetchCompany(user.id, companyId, isAdminProfile(profile));
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
      await fetchCompany(user.id, companyId, isAdminProfile(profile));
      setChronologyRefreshKey((key) => key + 1);
    }
  }

  const isArchived = Boolean(company?.deleted_at);
  const canManageCompany = !isArchived || isAdmin;

  useEffect(() => {
    if (!companyId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);

      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      if (isAdminProfile(userProfile)) {
        const { data: allProfiles } = await fetchAllProfiles();
        setBrokers(allProfiles.filter((item) => item.role === "broker"));
      }

      fetchCompany(
        session.user.id,
        companyId,
        isAdminProfile(userProfile),
      ).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      if (companyId) {
        fetchCompany(
          session.user.id,
          companyId,
          isAdminProfile(userProfile),
        );
      }
    });

    return () => subscription.unsubscribe();
  }, [router, companyId, fetchCompany]);

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

        {company && (
          <>
            <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              {isArchived && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  This company is archived.
                  {company.delete_reason
                    ? ` Reason: ${company.delete_reason}`
                    : ""}
                </div>
              )}

              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                    {company.name}
                  </h1>
                  <p className="mt-1 text-sm text-zinc-500">
                    Company record — contacts, opportunities, timeline, and
                    follow-ups
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${priorityBadgeClass(company.priority)}`}
                  >
                    {company.priority}
                  </span>
                  {canManageCompany && !isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditOpen(true)}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Edit company
                      </button>
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
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Edit company
                      </button>
                      {!isArchived && (
                        <button
                          type="button"
                          onClick={() => setArchiveOpen(true)}
                          className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100"
                        >
                          Archive company
                        </button>
                      )}
                      {isArchived && (
                        <button
                          type="button"
                          onClick={handleRestoreCompany}
                          disabled={restoring}
                          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {restoring ? "Restoring..." : "Restore company"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <dl className="grid gap-5 sm:grid-cols-2">
                <DetailField label="City">{company.city || "—"}</DetailField>
                <DetailField label="State">{company.state || "—"}</DetailField>
                <DetailField label="Country">
                  {company.country || "—"}
                </DetailField>
                <DetailField label="Priority">{company.priority}</DetailField>
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
                  <>
                    <DetailField label="Owner broker">
                      {ownerEmail ?? "—"}
                    </DetailField>
                    <DetailField label="Reassign owner">
                      <div className="space-y-2">
                        <select
                          value={reassignBrokerId}
                          onChange={(event) =>
                            setReassignBrokerId(event.target.value)
                          }
                          disabled={reassigning}
                          className="block w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {brokers.map((broker) => (
                            <option key={broker.id} value={broker.id}>
                              {getProfileDisplayName(broker)} (
                              {broker.email ?? "no email"})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleReassignOwner}
                          disabled={
                            reassigning ||
                            reassignBrokerId === company.user_id
                          }
                          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                  </>
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

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
                <Link
                  href="/assistant"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Open in AI Assistant
                </Link>
                <Link
                  href={`/assistant?company=${company.id}`}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Draft next outreach
                </Link>
              </div>
              <AiOutreachAssistantSection
                companyId={company.id}
                companyName={company.name}
                userId={company.user_id}
                onActivitySaved={() => {
                  refreshFollowUpSections();
                }}
              />
              <CompanyContactsSection
                companyId={company.id}
                userId={company.user_id}
              />
              <CompanyLoadOpportunitiesSection
                companyId={company.id}
                userId={company.user_id}
                currentSalesStage={company.sales_stage}
                canManage={!isAdmin}
                onCompanyUpdated={handleCompanyUpdated}
              />
              <CompanyFollowUpsSection
                companyId={company.id}
                userId={company.user_id}
                companyPriority={company.priority}
                canManage={!isAdmin}
                onCompanyUpdated={refreshFollowUpSections}
                externalRefreshKey={followUpsRefreshKey}
              />
              <CompanyChronologySection
                companyId={company.id}
                userId={company.user_id}
                onCompanyUpdated={refreshFollowUpSections}
                externalRefreshKey={chronologyRefreshKey}
                canManage={!isAdmin}
              />
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
