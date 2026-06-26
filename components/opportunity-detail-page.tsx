"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { LoadOpportunityFormFields } from "@/components/load-opportunity-form-fields";
import {
  getOpportunityStageLabel,
  loadOpportunityStatusBadgeClass,
} from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import {
  EMPTY_OPPORTUNITY_FORM,
  type ContactOption,
  type LoadOpportunityWithCompany,
  type OpportunityFormState,
  deleteLoadOpportunity,
  fetchContactsForCompany,
  fetchLoadOpportunityById,
  formatLane,
  formatContactName,
  opportunityToForm,
  updateLoadOpportunity,
} from "@/lib/loadOpportunities";
import {
  fetchUserProfile,
  canManageOpportunities as userCanManageOpportunities,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-zinc-900">{value}</p>
    </div>
  );
}

export function OpportunityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const opportunityId = typeof params.id === "string" ? params.id : "";

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [opportunity, setOpportunity] =
    useState<LoadOpportunityWithCompany | null>(null);
  const [form, setForm] = useState<OpportunityFormState>(EMPTY_OPPORTUNITY_FORM);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = isAdminProfile(profile);
  const canEdit =
    Boolean(opportunity) &&
    userCanManageOpportunities(profile) &&
    (isAdmin || user?.id === opportunity?.user_id);

  const loadOpportunity = useCallback(async () => {
    if (!user || !opportunityId) return;

    setError(null);
    setNotFound(false);

    const { data, error: fetchError } = await fetchLoadOpportunityById(
      opportunityId,
      user.id,
      false,
    );

    if (fetchError) {
      setError(formatSupabaseError(fetchError));
      return;
    }

    if (!data) {
      setNotFound(true);
      setOpportunity(null);
      return;
    }

    setOpportunity(data);
    setForm(opportunityToForm(data));

    const { data: contactList, error: contactsError } =
      await fetchContactsForCompany(user.id, data.company_id, false);

    if (contactsError) {
      setError(formatSupabaseError(contactsError));
      setContacts([]);
      return;
    }

    setContacts(contactList);
  }, [user, opportunityId, isAdmin]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (!user || loading) return;
    loadOpportunity();
  }, [user, loading, loadOpportunity]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !opportunity || !canEdit) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const { error: updateError } = await updateLoadOpportunity({
      userId: opportunity.user_id,
      companyId: opportunity.company_id,
      opportunityId: opportunity.id,
      form,
      currentSalesStage: opportunity.companySalesStage,
    });

    if (updateError) {
      setError(formatSupabaseError(updateError));
      setSubmitting(false);
      return;
    }

    setSuccess("Opportunity updated.");
    await loadOpportunity();
    setSubmitting(false);
  }

  async function handleDelete() {
    if (!user || !opportunity || !canEdit) return;

    const confirmed = window.confirm(
      `Delete opportunity "${opportunity.name}"? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    const { error: deleteError } = await deleteLoadOpportunity(
      opportunity.user_id,
      opportunity.company_id,
      opportunity.id,
    );

    if (deleteError) {
      setError(formatSupabaseError(deleteError));
      setDeleting(false);
      return;
    }

    router.push("/opportunities");
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

  if (notFound) {
    return (
      <AuthenticatedLayout>
        <p className="text-sm text-zinc-600">Opportunity not found.</p>
        <Link
          href="/opportunities"
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
        >
          Back to opportunities
        </Link>
      </AuthenticatedLayout>
    );
  }

  if (!opportunity) {
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
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                {opportunity.name}
              </h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${loadOpportunityStatusBadgeClass(opportunity.status)}`}
              >
                {getOpportunityStageLabel(opportunity.status)}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              Company:{" "}
              <Link
                href={`/companies/${opportunity.company_id}`}
                className="font-medium text-zinc-900 underline-offset-2 hover:underline"
              >
                {opportunity.companyName}
              </Link>
              {" · "}
              Lane: {formatLane(opportunity.lane_origin, opportunity.lane_destination)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Created {formatDate(opportunity.created_at)} · Updated{" "}
              {formatDateTime(opportunity.updated_at)}
            </p>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || submitting}
              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
      </div>

      {isAdmin && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Admin view: you can see this opportunity, but only the owning
          broker can edit or delete it.
        </p>
      )}

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
        {canEdit ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <LoadOpportunityFormFields
              form={form}
              setForm={setForm}
              contacts={contacts}
              idPrefix="detail"
            />

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save changes"}
            </button>
          </form>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailItem
              label="Contact"
              value={
                opportunity.contactFirstName
                  ? formatContactName({
                      first_name: opportunity.contactFirstName,
                      last_name: opportunity.contactLastName,
                    })
                  : "—"
              }
            />
            <DetailItem
              label="Lane"
              value={formatLane(
                opportunity.lane_origin,
                opportunity.lane_destination,
              )}
            />
            <DetailItem
              label="Equipment type"
              value={opportunity.equipment_type || "—"}
            />
            <DetailItem label="Commodity" value={opportunity.commodity || "—"} />
            <DetailItem
              label="Stage"
              value={getOpportunityStageLabel(opportunity.status)}
            />
            <DetailItem
              label="Created"
              value={formatDate(opportunity.created_at)}
            />
            <DetailItem label="Notes" value={opportunity.notes || "—"} />
          </div>
        )}
      </section>
    </AuthenticatedLayout>
  );
}
