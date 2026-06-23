"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { AiAccountSummarySection } from "@/components/ai-account-summary-section";
import { AiOutreachAssistantSection } from "@/components/ai-outreach-assistant-section";
import { CompanyChronologySection } from "@/components/company-chronology-section";
import { CompanyContactsSection } from "@/components/company-contacts-section";
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
import { supabase } from "@/lib/supabaseClient";

interface Company {
  id: string;
  user_id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  priority: CompanyPriority;
  sales_stage: SalesStage;
  general_notes: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
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

  const fetchCompany = useCallback(async (userId: string, id: string) => {
    setFetchError(null);
    setNotFound(false);

    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, user_id, name, city, state, country, priority, sales_stage, general_notes, last_contact_at, next_follow_up_at, created_at",
      )
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

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

    setCompany({
      ...(data as Company),
      sales_stage: isSalesStage((data as Company).sales_stage)
        ? (data as Company).sales_stage
        : DEFAULT_SALES_STAGE,
    });
  }, []);

  async function handleSalesStageChange(nextStage: SalesStage) {
    if (!user || !company || company.sales_stage === nextStage) return;

    setStageError(null);
    setUpdatingStage(true);

    const { error } = await supabase
      .from("companies")
      .update({ sales_stage: nextStage })
      .eq("id", company.id)
      .eq("user_id", user.id);

    if (error) {
      setStageError(formatSupabaseError(error));
      setUpdatingStage(false);
      return;
    }

    setCompany((prev) => (prev ? { ...prev, sales_stage: nextStage } : prev));
    setUpdatingStage(false);
  }

  const handleCompanyUpdated = useCallback(() => {
    if (user && companyId) {
      fetchCompany(user.id, companyId);
    }
  }, [user, companyId, fetchCompany]);

  useEffect(() => {
    if (!companyId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      fetchCompany(session.user.id, companyId).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      if (companyId) {
        fetchCompany(session.user.id, companyId);
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
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${priorityBadgeClass(company.priority)}`}
                >
                  {company.priority}
                </span>
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
              <AiAccountSummarySection
                companyId={company.id}
                companyName={company.name}
              />
              <AiOutreachAssistantSection
                companyId={company.id}
                companyName={company.name}
                userId={user.id}
                onActivitySaved={() => {
                  setChronologyRefreshKey((key) => key + 1);
                  handleCompanyUpdated();
                }}
              />
              <CompanyContactsSection
                companyId={company.id}
                userId={user.id}
              />
              <CompanyLoadOpportunitiesSection
                companyId={company.id}
                userId={user.id}
                currentSalesStage={company.sales_stage}
                onCompanyUpdated={handleCompanyUpdated}
              />
              <CompanyChronologySection
                companyId={company.id}
                userId={user.id}
                onCompanyUpdated={handleCompanyUpdated}
                externalRefreshKey={chronologyRefreshKey}
              />
            </div>
          </>
        )}
    </AuthenticatedLayout>
  );
}
