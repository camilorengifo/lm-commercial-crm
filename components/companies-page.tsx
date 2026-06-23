"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
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

const EMPTY_FORM = {
  name: "",
  city: "",
  state: "",
  country: "United States",
  priority: "Medium" as CompanyPriority,
  sales_stage: DEFAULT_SALES_STAGE,
  general_notes: "",
  last_contact_at: "",
  next_follow_up_at: "",
};

export function CompaniesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchCompanies = useCallback(async (userId: string) => {
    setFetchError(null);

    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, user_id, name, city, state, country, priority, sales_stage, general_notes, last_contact_at, next_follow_up_at, created_at",
      )
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (error) {
      setFetchError(formatSupabaseError(error));
      return;
    }

    setCompanies((data as Company[]) ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      fetchCompanies(session.user.id).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      fetchCompanies(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [router, fetchCompanies]);

  const filteredCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return companies;

    return companies.filter((company) => {
      const haystack = [
        company.name,
        company.city,
        company.state,
        company.country,
        company.priority,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [companies, search]);

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
      next_follow_up_at: form.next_follow_up_at
        ? new Date(form.next_follow_up_at).toISOString()
        : null,
    };

    const { error } = await supabase.from("companies").insert(payload);

    if (error) {
      setFormError(formatSupabaseError(error));
      setSubmitting(false);
      return;
    }

    setForm(EMPTY_FORM);
    setShowForm(false);
    setSuccessMessage(`"${trimmedName}" was added successfully.`);
    await fetchCompanies(user.id);
    setSubmitting(false);
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
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Companies
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Search, filter, and manage your company book of business
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setShowForm((prev) => !prev);
                setFormError(null);
              }}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              {showForm ? "Cancel" : "Add Company"}
            </button>
          </div>

          <div className="w-full sm:max-w-xs">
            <label htmlFor="search" className="sr-only">
              Search companies
            </label>
            <input
              id="search"
              type="search"
              placeholder="Search companies..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>
        </div>

        {successMessage && (
          <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
            {successMessage}
          </p>
        )}

        {fetchError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {fetchError}
          </p>
        )}

        {showForm && (
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-medium text-zinc-900">
              New Company
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="name"
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                    placeholder="Acme Freight Co."
                  />
                </div>

                <div>
                  <label
                    htmlFor="city"
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="state"
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="country"
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="next_follow_up_at"
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
                  >
                    Next follow-up
                  </label>
                  <input
                    id="next_follow_up_at"
                    type="datetime-local"
                    value={form.next_follow_up_at}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        next_follow_up_at: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="general_notes"
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                    placeholder="Notes about this company..."
                  />
                </div>
              </div>

              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {filteredCompanies.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-zinc-500">
                {companies.length === 0
                  ? "No companies yet. Click Add Company to get started."
                  : "No companies match your search."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
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
                  {filteredCompanies.map((company) => (
                    <tr key={company.id} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/companies/${company.id}`}
                          className="font-medium text-zinc-900 transition hover:text-zinc-600 hover:underline"
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
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(company.priority)}`}
                        >
                          {company.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${salesStageBadgeClass(company.sales_stage)}`}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </AuthenticatedLayout>
  );
}
