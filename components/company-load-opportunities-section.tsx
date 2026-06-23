"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { LoadOpportunityFormFields } from "@/components/load-opportunity-form-fields";
import {
  loadOpportunityStatusBadgeClass,
  type SalesStage,
} from "@/lib/crmConstants";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import {
  EMPTY_OPPORTUNITY_FORM,
  type ContactOption,
  type LoadOpportunity,
  type OpportunityFormState,
  createLoadOpportunity,
  deleteLoadOpportunity,
  fetchContactsForCompany,
  fetchLoadOpportunitiesForCompany,
  formatContactName,
  formatLane,
  formatOpportunityRate,
  opportunityToForm,
  updateLoadOpportunity,
} from "@/lib/loadOpportunities";

export function CompanyLoadOpportunitiesSection({
  companyId,
  userId,
  currentSalesStage,
  onCompanyUpdated,
}: {
  companyId: string;
  userId: string;
  currentSalesStage: SalesStage;
  onCompanyUpdated?: () => void;
}) {
  const [opportunities, setOpportunities] = useState<LoadOpportunity[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<OpportunityFormState>(
    EMPTY_OPPORTUNITY_FORM,
  );
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<OpportunityFormState>(
    EMPTY_OPPORTUNITY_FORM,
  );
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const contactNameById = new Map(
    contacts.map((contact) => [contact.id, formatContactName(contact)]),
  );

  const refreshAll = useCallback(async () => {
    setFetchError(null);
    try {
      const [contactsResult, opportunitiesResult] = await Promise.all([
        fetchContactsForCompany(userId, companyId),
        fetchLoadOpportunitiesForCompany(userId, companyId),
      ]);

      if (contactsResult.error) throw contactsResult.error;
      if (opportunitiesResult.error) throw opportunitiesResult.error;

      setContacts(contactsResult.data);
      setOpportunities(opportunitiesResult.data);
    } catch (error) {
      setFetchError(formatSupabaseError(error as { message?: string }));
    }
  }, [companyId, userId]);

  useEffect(() => {
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);

    const { error } = await createLoadOpportunity({
      userId,
      companyId,
      form: createForm,
      currentSalesStage,
      createTimelineActivity: true,
    });

    if (error) {
      setCreateError(formatSupabaseError(error));
      setCreateSubmitting(false);
      return;
    }

    setCreateForm(EMPTY_OPPORTUNITY_FORM);
    setShowCreateForm(false);
    await refreshAll();
    onCompanyUpdated?.();
    setCreateSubmitting(false);
  }

  function startEditing(opportunity: LoadOpportunity) {
    setEditingId(opportunity.id);
    setEditForm(opportunityToForm(opportunity));
    setEditError(null);
    setShowCreateForm(false);
    setCreateError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(EMPTY_OPPORTUNITY_FORM);
    setEditError(null);
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;

    setEditError(null);
    setEditSubmitting(true);

    const { error } = await updateLoadOpportunity({
      userId,
      companyId,
      opportunityId: editingId,
      form: editForm,
      currentSalesStage,
    });

    if (error) {
      setEditError(formatSupabaseError(error));
      setEditSubmitting(false);
      return;
    }

    setEditingId(null);
    setEditForm(EMPTY_OPPORTUNITY_FORM);
    await refreshAll();
    onCompanyUpdated?.();
    setEditSubmitting(false);
  }

  async function handleDelete(opportunity: LoadOpportunity) {
    const label = formatLane(
      opportunity.lane_origin,
      opportunity.lane_destination,
    );
    const confirmed = window.confirm(
      `Delete load opportunity (${label})? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingId(opportunity.id);

    const { error } = await deleteLoadOpportunity(
      userId,
      companyId,
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

    await refreshAll();
    setDeletingId(null);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900">
            Load Opportunities
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Potential freight lanes and quote requests for this company
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreateForm((prev) => !prev);
            setCreateError(null);
            cancelEditing();
          }}
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          {showCreateForm ? "Cancel" : "Add Opportunity"}
        </button>
      </div>

      {fetchError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {showCreateForm && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="mb-4 text-sm font-medium text-zinc-900">
            New Load Opportunity
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <LoadOpportunityFormFields
              form={createForm}
              setForm={setCreateForm}
              contacts={contacts}
              idPrefix="create"
            />

            {createError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createSubmitting ? "Saving..." : "Save Opportunity"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateForm(EMPTY_OPPORTUNITY_FORM);
                  setCreateError(null);
                }}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading opportunities...</p>
      ) : opportunities.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No load opportunities recorded for this company yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {opportunities.map((opportunity) => {
            const isEditing = editingId === opportunity.id;
            const isDeleting = deletingId === opportunity.id;

            return (
              <li key={opportunity.id} className="py-5 first:pt-0 last:pb-0">
                {isEditing ? (
                  <form onSubmit={handleEdit} className="space-y-4">
                    <h3 className="text-sm font-medium text-zinc-900">
                      Edit Load Opportunity
                    </h3>
                    <LoadOpportunityFormFields
                      form={editForm}
                      setForm={setEditForm}
                      contacts={contacts}
                      idPrefix={`edit-${opportunity.id}`}
                    />

                    {editError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        {editError}
                      </p>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={editSubmitting}
                        className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {editSubmitting ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${loadOpportunityStatusBadgeClass(opportunity.status)}`}
                        >
                          {opportunity.status}
                        </span>
                        <span className="text-sm font-medium text-zinc-900">
                          {formatLane(
                            opportunity.lane_origin,
                            opportunity.lane_destination,
                          )}
                        </span>
                      </div>

                      <div className="grid gap-1 text-sm text-zinc-700 sm:grid-cols-2">
                        <p>
                          <span className="font-medium text-zinc-600">
                            Equipment:
                          </span>{" "}
                          {opportunity.equipment_type || "—"}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-600">
                            Commodity:
                          </span>{" "}
                          {opportunity.commodity || "—"}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-600">
                            Frequency:
                          </span>{" "}
                          {opportunity.frequency || "—"}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-600">
                            Est. loads/week:
                          </span>{" "}
                          {opportunity.estimated_loads_per_week ?? "—"}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-600">
                            Target rate:
                          </span>{" "}
                          {formatOpportunityRate(opportunity.target_rate)}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-600">
                            Quoted rate:
                          </span>{" "}
                          {formatOpportunityRate(opportunity.quoted_rate)}
                        </p>
                        <p className="sm:col-span-2">
                          <span className="font-medium text-zinc-600">
                            Contact:
                          </span>{" "}
                          {opportunity.contact_id
                            ? contactNameById.get(opportunity.contact_id) ??
                              "—"
                            : "—"}
                        </p>
                      </div>

                      {opportunity.notes && (
                        <p className="whitespace-pre-wrap text-sm text-zinc-600">
                          <span className="font-medium text-zinc-600">
                            Notes:
                          </span>{" "}
                          {opportunity.notes}
                        </p>
                      )}

                      <p className="text-xs text-zinc-500">
                        Created {formatDate(opportunity.created_at)}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(opportunity)}
                        disabled={isDeleting}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(opportunity)}
                        disabled={isDeleting}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
