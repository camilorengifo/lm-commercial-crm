"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { LoadOpportunityFormFields } from "@/components/load-opportunity-form-fields";
import { formatSupabaseError } from "@/lib/crmFormat";
import {
  EMPTY_OPPORTUNITY_FORM,
  type CompanyOption,
  type ContactOption,
  type OpportunityFormState,
  createLoadOpportunity,
  fetchCompaniesForOpportunities,
  fetchContactsForCompany,
} from "@/lib/loadOpportunities";
import {
  fetchUserProfile,
  canManageOpportunities as userCanManageOpportunities,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

export function OpportunityNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetCompanyId = searchParams.get("companyId")?.trim() ?? "";

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [companyId, setCompanyId] = useState(presetCompanyId);
  const [form, setForm] = useState<OpportunityFormState>(EMPTY_OPPORTUNITY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = isAdminProfile(profile);

  const loadContacts = useCallback(
    async (
      selectedCompanyId: string,
      userId: string,
      asAdmin: boolean,
      companyOwnerId?: string,
    ) => {
      if (!selectedCompanyId) {
        setContacts([]);
        return;
      }

      const { data, error: contactsError } = await fetchContactsForCompany(
        companyOwnerId ?? userId,
        selectedCompanyId,
        asAdmin,
      );

      if (contactsError) {
        setError(formatSupabaseError(contactsError));
        setContacts([]);
        return;
      }

      setContacts(data);
    },
    [],
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      const asAdmin = isAdminProfile(userProfile);
      if (!userCanManageOpportunities(userProfile)) {
        router.replace("/opportunities");
        return;
      }

      const { data, error: companiesError } = await fetchCompaniesForOpportunities(
        session.user.id,
        asAdmin,
      );

      if (companiesError) {
        setError(formatSupabaseError(companiesError));
        setLoading(false);
        return;
      }

      setCompanies(data);

      const initialCompanyId =
        presetCompanyId && data.some((company) => company.id === presetCompanyId)
          ? presetCompanyId
          : (data[0]?.id ?? "");

      setCompanyId(initialCompanyId);
      await loadContacts(
        initialCompanyId,
        session.user.id,
        asAdmin,
        data.find((company) => company.id === initialCompanyId)?.user_id,
      );
      setLoading(false);
    });
  }, [router, presetCompanyId, loadContacts]);

  useEffect(() => {
    if (!user) return;
    const selectedCompany = companies.find((company) => company.id === companyId);
    loadContacts(
      companyId,
      user.id,
      isAdmin,
      selectedCompany?.user_id,
    );
  }, [companyId, user, isAdmin, companies, loadContacts]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !companyId) return;

    const selectedCompany = companies.find((company) => company.id === companyId);
    if (!selectedCompany) {
      setError("Select a valid company.");
      return;
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const ownerUserId = isAdmin ? selectedCompany.user_id : user.id;

    const { data, error: createError } = await createLoadOpportunity({
      userId: ownerUserId,
      companyId,
      form,
      currentSalesStage: selectedCompany.sales_stage,
      createTimelineActivity: true,
    });

    if (createError || !data) {
      setError(formatSupabaseError(createError ?? { message: "Unable to save." }));
      setSubmitting(false);
      return;
    }

    setSuccess("Opportunity created successfully.");
    setSubmitting(false);
    router.push(`/opportunities/${data.id}`);
  }

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
    <AuthenticatedLayout>
      <div className="mb-6">
        <Link
          href="/opportunities"
          className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
        >
          ← Back to opportunities
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
          New Opportunity
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Record a load opportunity connected to a company.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </p>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="opportunity-company"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Company <span className="text-red-600">*</span>
            </label>
            <select
              id="opportunity-company"
              required
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="" disabled>
                Select a company
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <LoadOpportunityFormFields
            form={form}
            setForm={setForm}
            contacts={contacts}
            idPrefix="new"
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting || !companyId}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save opportunity"}
            </button>
            <Link
              href="/opportunities"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </AuthenticatedLayout>
  );
}
