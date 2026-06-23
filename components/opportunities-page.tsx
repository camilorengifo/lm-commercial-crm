"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { LoadOpportunityFormFields } from "@/components/load-opportunity-form-fields";
import {
  LOAD_OPPORTUNITY_STATUSES,
  loadOpportunityStatusBadgeClass,
  type LoadOpportunityStatus,
} from "@/lib/crmConstants";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import {
  EMPTY_OPPORTUNITY_FORM,
  type ContactOption,
  type LoadOpportunityWithCompany,
  type OpportunityFormState,
  deleteLoadOpportunity,
  fetchContactsForCompany,
  fetchLoadOpportunitiesWithCompanies,
  formatContactName,
  formatLane,
  formatOpportunityRate,
  opportunityToForm,
  truncateNotesPreview,
  updateLoadOpportunity,
} from "@/lib/loadOpportunities";
import { supabase } from "@/lib/supabaseClient";

type StatusFilter = "all" | LoadOpportunityStatus;

function matchesSearch(
  opportunity: LoadOpportunityWithCompany,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const contactName =
    opportunity.contactFirstName || opportunity.contactLastName
      ? formatContactName({
          first_name: opportunity.contactFirstName ?? "",
          last_name: opportunity.contactLastName,
        })
      : "";

  const haystack = [
    opportunity.companyName,
    opportunity.lane_origin,
    opportunity.lane_destination,
    opportunity.commodity,
    opportunity.notes,
    contactName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function OpportunityCard({
  opportunity,
  isEditing,
  editForm,
  setEditForm,
  editContacts,
  editContactsLoading,
  editSubmitting,
  editError,
  deleting,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onDelete,
}: {
  opportunity: LoadOpportunityWithCompany;
  isEditing: boolean;
  editForm: OpportunityFormState;
  setEditForm: React.Dispatch<React.SetStateAction<OpportunityFormState>>;
  editContacts: ContactOption[];
  editContactsLoading: boolean;
  editSubmitting: boolean;
  editError: string | null;
  deleting: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}) {
  const contactName =
    opportunity.contactFirstName || opportunity.contactLastName
      ? formatContactName({
          first_name: opportunity.contactFirstName ?? "",
          last_name: opportunity.contactLastName,
        })
      : null;

  const notesPreview = truncateNotesPreview(opportunity.notes);

  if (isEditing) {
    return (
      <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
        <form onSubmit={onSubmitEdit} className="space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-medium text-zinc-900">
              Edit Load Opportunity
            </h3>
            <p className="text-sm text-zinc-600">
              <span className="font-medium">Company:</span>{" "}
              {opportunity.companyName}
            </p>
          </div>

          {editContactsLoading ? (
            <p className="text-sm text-zinc-500">Loading contacts...</p>
          ) : (
            <LoadOpportunityFormFields
              form={editForm}
              setForm={setEditForm}
              contacts={editContacts}
              idPrefix={`edit-${opportunity.id}`}
            />
          )}

          {editError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {editError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={editSubmitting || editContactsLoading}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editSubmitting ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${loadOpportunityStatusBadgeClass(opportunity.status)}`}
            >
              {opportunity.status}
            </span>
            <span className="text-sm font-semibold text-zinc-900">
              {formatLane(
                opportunity.lane_origin,
                opportunity.lane_destination,
              )}
            </span>
          </div>

          <p className="text-sm text-zinc-800">
            <span className="font-medium text-zinc-600">Company:</span>{" "}
            <Link
              href={`/companies/${opportunity.company_id}`}
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              {opportunity.companyName}
            </Link>
          </p>

          {contactName && (
            <p className="text-sm text-zinc-800">
              <span className="font-medium text-zinc-600">Contact:</span>{" "}
              {contactName}
            </p>
          )}

          <div className="grid gap-1 text-sm text-zinc-700 sm:grid-cols-2">
            <p>
              <span className="font-medium text-zinc-600">Equipment:</span>{" "}
              {opportunity.equipment_type || "—"}
            </p>
            <p>
              <span className="font-medium text-zinc-600">Commodity:</span>{" "}
              {opportunity.commodity || "—"}
            </p>
            <p>
              <span className="font-medium text-zinc-600">Frequency:</span>{" "}
              {opportunity.frequency || "—"}
            </p>
            <p>
              <span className="font-medium text-zinc-600">
                Est. loads/week:
              </span>{" "}
              {opportunity.estimated_loads_per_week ?? "—"}
            </p>
            <p>
              <span className="font-medium text-zinc-600">Target rate:</span>{" "}
              {formatOpportunityRate(opportunity.target_rate)}
            </p>
            <p>
              <span className="font-medium text-zinc-600">Quoted rate:</span>{" "}
              {formatOpportunityRate(opportunity.quoted_rate)}
            </p>
          </div>

          {notesPreview && (
            <p className="text-sm text-zinc-600">
              <span className="font-medium text-zinc-600">Notes:</span>{" "}
              {notesPreview}
            </p>
          )}

          <p className="text-xs text-zinc-500">
            Created {formatDate(opportunity.created_at)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/companies/${opportunity.company_id}`}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Open Company
          </Link>
          <button
            type="button"
            onClick={onStartEdit}
            disabled={deleting}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </li>
  );
}

export function OpportunitiesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<
    LoadOpportunityWithCompany[]
  >([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<OpportunityFormState>(
    EMPTY_OPPORTUNITY_FORM,
  );
  const [editContacts, setEditContacts] = useState<ContactOption[]>([]);
  const [editContactsLoading, setEditContactsLoading] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadOpportunities = useCallback(async (userId: string) => {
    setFetchError(null);
    const { data, error } = await fetchLoadOpportunitiesWithCompanies(userId);

    if (error) {
      setFetchError(formatSupabaseError(error));
      return;
    }

    setOpportunities(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      loadOpportunities(session.user.id).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      loadOpportunities(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [router, loadOpportunities]);

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(
      LOAD_OPPORTUNITY_STATUSES.map((status) => [status, 0]),
    ) as Record<LoadOpportunityStatus, number>;

    for (const opportunity of opportunities) {
      counts[opportunity.status] += 1;
    }

    return counts;
  }, [opportunities]);

  const companyOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const opportunity of opportunities) {
      byId.set(opportunity.company_id, opportunity.companyName);
    }

    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [opportunities]);

  const equipmentOptions = useMemo(() => {
    const values = new Set<string>();
    for (const opportunity of opportunities) {
      const equipment = opportunity.equipment_type?.trim();
      if (equipment) values.add(equipment);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opportunity) => {
      if (statusFilter !== "all" && opportunity.status !== statusFilter) {
        return false;
      }

      if (
        companyFilter !== "all" &&
        opportunity.company_id !== companyFilter
      ) {
        return false;
      }

      if (equipmentFilter !== "all") {
        const equipment = opportunity.equipment_type?.trim() ?? "";
        if (equipment !== equipmentFilter) return false;
      }

      return matchesSearch(opportunity, searchQuery);
    });
  }, [
    opportunities,
    statusFilter,
    companyFilter,
    equipmentFilter,
    searchQuery,
  ]);

  async function startEditing(opportunity: LoadOpportunityWithCompany) {
    setEditingId(opportunity.id);
    setEditForm(opportunityToForm(opportunity));
    setEditError(null);
    setEditContactsLoading(true);

    const { data, error } = await fetchContactsForCompany(
      user!.id,
      opportunity.company_id,
    );

    if (error) {
      setEditError(formatSupabaseError(error));
      setEditContacts([]);
    } else {
      setEditContacts(data);
    }

    setEditContactsLoading(false);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(EMPTY_OPPORTUNITY_FORM);
    setEditError(null);
    setEditContacts([]);
  }

  async function handleEdit(
    event: FormEvent<HTMLFormElement>,
    opportunity: LoadOpportunityWithCompany,
  ) {
    event.preventDefault();
    if (!user || !editingId) return;

    setEditError(null);
    setEditSubmitting(true);

    const { error } = await updateLoadOpportunity({
      userId: user.id,
      companyId: opportunity.company_id,
      opportunityId: editingId,
      form: editForm,
      currentSalesStage: opportunity.companySalesStage,
    });

    if (error) {
      setEditError(formatSupabaseError(error));
      setEditSubmitting(false);
      return;
    }

    cancelEditing();
    await loadOpportunities(user.id);
    setEditSubmitting(false);
  }

  async function handleDelete(opportunity: LoadOpportunityWithCompany) {
    if (!user) return;

    const label = formatLane(
      opportunity.lane_origin,
      opportunity.lane_destination,
    );
    const confirmed = window.confirm(
      `Delete load opportunity for ${opportunity.companyName} (${label})? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingId(opportunity.id);

    const { error } = await deleteLoadOpportunity(
      user.id,
      opportunity.company_id,
      opportunity.id,
    );

    if (error) {
      setFetchError(formatSupabaseError(error));
      setDeletingId(null);
      return;
    }

    if (editingId === opportunity.id) {
      cancelEditing();
    }

    await loadOpportunities(user.id);
    setDeletingId(null);
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
          Load Opportunities
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Freight opportunities across all your companies
        </p>
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition ${
              statusFilter === "all"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            All ({opportunities.length})
          </button>
          {LOAD_OPPORTUNITY_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition ${
                statusFilter === status
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {status} ({statusCounts[status]})
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2 xl:col-span-2">
            <label
              htmlFor="opportunity-search"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Search
            </label>
            <input
              id="opportunity-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Company, lane, commodity, or notes..."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="opportunity-status-filter"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Status
            </label>
            <select
              id="opportunity-status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="all">All statuses</option>
              {LOAD_OPPORTUNITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="opportunity-company-filter"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Company
            </label>
            <select
              id="opportunity-company-filter"
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="all">All companies</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <label
              htmlFor="opportunity-equipment-filter"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Equipment type
            </label>
            <select
              id="opportunity-equipment-filter"
              value={equipmentFilter}
              onChange={(event) => setEquipmentFilter(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 md:max-w-sm"
            >
              <option value="all">All equipment types</option>
              {equipmentOptions.map((equipment) => (
                <option key={equipment} value={equipment}>
                  {equipment}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-medium text-zinc-900">
              {statusFilter === "all"
                ? "All Opportunities"
                : `${statusFilter} Opportunities`}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Sorted by most recently updated
            </p>
          </div>
          <p className="text-sm text-zinc-600">
            Showing {filteredOpportunities.length} of {opportunities.length}
          </p>
        </div>

        {filteredOpportunities.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {opportunities.length === 0
              ? "No load opportunities yet. Add opportunities from a company detail page."
              : "No opportunities match your current filters."}
          </p>
        ) : (
          <ul className="space-y-4">
            {filteredOpportunities.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                isEditing={editingId === opportunity.id}
                editForm={editForm}
                setEditForm={setEditForm}
                editContacts={editContacts}
                editContactsLoading={editContactsLoading}
                editSubmitting={editSubmitting}
                editError={editError}
                deleting={deletingId === opportunity.id}
                onStartEdit={() => startEditing(opportunity)}
                onCancelEdit={cancelEditing}
                onSubmitEdit={(event) => handleEdit(event, opportunity)}
                onDelete={() => handleDelete(opportunity)}
              />
            ))}
          </ul>
        )}
      </section>
    </AuthenticatedLayout>
  );
}
