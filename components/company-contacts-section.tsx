"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import { supabase } from "@/lib/supabaseClient";

interface Contact {
  id: string;
  user_id: string;
  company_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
}

interface ContactFormState {
  first_name: string;
  last_name: string;
  job_title: string;
  email: string;
  phone: string;
  notes: string;
  is_primary: boolean;
}

const EMPTY_FORM: ContactFormState = {
  first_name: "",
  last_name: "",
  job_title: "",
  email: "",
  phone: "",
  notes: "",
  is_primary: false,
};

function formatContactName(contact: Contact): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ");
}

function contactToForm(contact: Contact): ContactFormState {
  return {
    first_name: contact.first_name,
    last_name: contact.last_name ?? "",
    job_title: contact.job_title ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    notes: contact.notes ?? "",
    is_primary: contact.is_primary,
  };
}

function buildContactPayload(form: ContactFormState) {
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim() || null,
    job_title: form.job_title.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    notes: form.notes.trim() || null,
    is_primary: form.is_primary,
  };
}

function ContactFormFields({
  form,
  setForm,
  idPrefix,
}: {
  form: ContactFormState;
  setForm: React.Dispatch<React.SetStateAction<ContactFormState>>;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label
          htmlFor={`${idPrefix}-first_name`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          First name <span className="text-red-600">*</span>
        </label>
        <input
          id={`${idPrefix}-first_name`}
          type="text"
          required
          value={form.first_name}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, first_name: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="John"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-last_name`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Last name
        </label>
        <input
          id={`${idPrefix}-last_name`}
          type="text"
          value={form.last_name}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, last_name: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Smith"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-job_title`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Job title
        </label>
        <input
          id={`${idPrefix}-job_title`}
          type="text"
          value={form.job_title}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, job_title: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Logistics Director"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-email`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Email
        </label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          value={form.email}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, email: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="john@company.com"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-phone`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Phone
        </label>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          value={form.phone}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, phone: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="+1 555 123 4567"
        />
      </div>

      <div className="flex items-end sm:col-span-2">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, is_primary: event.target.checked }))
            }
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          Primary contact
        </label>
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor={`${idPrefix}-notes`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          rows={3}
          value={form.notes}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, notes: event.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Notes about this contact..."
        />
      </div>
    </div>
  );
}

function ContactDetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  if (!children || children === "—") return null;

  return (
    <div className="text-sm">
      <span className="font-medium text-zinc-600">{label}: </span>
      <span className="text-zinc-800">{children}</span>
    </div>
  );
}

export function CompanyContactsSection({
  companyId,
  ownerUserId,
  viewerUserId,
  isAdmin = false,
}: {
  companyId: string;
  ownerUserId: string;
  viewerUserId: string;
  isAdmin?: boolean;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<ContactFormState>(EMPTY_FORM);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ContactFormState>(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const scopedUserId = isAdmin ? ownerUserId : viewerUserId;

  const fetchContacts = useCallback(async () => {
    setFetchError(null);

    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, user_id, company_id, first_name, last_name, email, phone, job_title, notes, is_primary, created_at",
      )
      .eq("company_id", companyId)
      .eq("user_id", scopedUserId)
      .order("is_primary", { ascending: false })
      .order("first_name", { ascending: true });

    if (error) {
      setFetchError(formatSupabaseError(error));
      return;
    }

    setContacts((data as Contact[]) ?? []);
  }, [companyId, scopedUserId]);

  useEffect(() => {
    setLoading(true);
    fetchContacts().finally(() => setLoading(false));
  }, [fetchContacts]);

  async function clearOtherPrimaryContacts(excludeContactId?: string) {
    let query = supabase
      .from("contacts")
      .update({ is_primary: false })
      .eq("company_id", companyId)
      .eq("user_id", scopedUserId)
      .eq("is_primary", true);

    if (excludeContactId) {
      query = query.neq("id", excludeContactId);
    }

    const { error } = await query;

    if (error) {
      throw error;
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);

    const trimmedFirstName = createForm.first_name.trim();
    if (!trimmedFirstName) {
      setCreateError("First name is required.");
      setCreateSubmitting(false);
      return;
    }

    try {
      if (createForm.is_primary) {
        await clearOtherPrimaryContacts();
      }

      const payload = {
        user_id: scopedUserId,
        company_id: companyId,
        ...buildContactPayload(createForm),
        first_name: trimmedFirstName,
      };

      const { error } = await supabase.from("contacts").insert(payload);

      if (error) {
        setCreateError(formatSupabaseError(error));
        setCreateSubmitting(false);
        return;
      }

      setCreateForm(EMPTY_FORM);
      setShowCreateForm(false);
      await fetchContacts();
    } catch (error) {
      setCreateError(formatSupabaseError(error as { message?: string }));
    }

    setCreateSubmitting(false);
  }

  function startEditing(contact: Contact) {
    setEditingId(contact.id);
    setEditForm(contactToForm(contact));
    setEditError(null);
    setShowCreateForm(false);
    setCreateError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
    setEditError(null);
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;

    setEditError(null);
    setEditSubmitting(true);

    const trimmedFirstName = editForm.first_name.trim();
    if (!trimmedFirstName) {
      setEditError("First name is required.");
      setEditSubmitting(false);
      return;
    }

    try {
      if (editForm.is_primary) {
        await clearOtherPrimaryContacts(editingId);
      }

      const payload = {
        ...buildContactPayload(editForm),
        first_name: trimmedFirstName,
      };

      const { error } = await supabase
        .from("contacts")
        .update(payload)
        .eq("id", editingId)
        .eq("company_id", companyId)
        .eq("user_id", scopedUserId);

      if (error) {
        setEditError(formatSupabaseError(error));
        setEditSubmitting(false);
        return;
      }

      setEditingId(null);
      setEditForm(EMPTY_FORM);
      await fetchContacts();
    } catch (error) {
      setEditError(formatSupabaseError(error as { message?: string }));
    }

    setEditSubmitting(false);
  }

  async function handleDelete(contact: Contact) {
    const name = formatContactName(contact);
    const confirmed = window.confirm(
      `Delete contact "${name}"? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingId(contact.id);

    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", contact.id)
      .eq("company_id", companyId)
      .eq("user_id", scopedUserId);

    if (error) {
      setFetchError(formatSupabaseError(error));
      setDeletingId(null);
      return;
    }

    if (editingId === contact.id) {
      cancelEditing();
    }

    await fetchContacts();
    setDeletingId(null);
  }

  return (
    <section className="crm-card crm-card-padded">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="crm-section-title">Contacts</h2>
        <button
          type="button"
          onClick={() => {
            setShowCreateForm((prev) => !prev);
            setCreateError(null);
            cancelEditing();
          }}
          className="crm-btn-primary"
        >
          {showCreateForm ? "Cancel" : "Add Contact"}
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
            New Contact
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <ContactFormFields
              form={createForm}
              setForm={setCreateForm}
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
                className="crm-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createSubmitting ? "Saving..." : "Save Contact"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateForm(EMPTY_FORM);
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
        <p className="text-sm text-zinc-500">Loading contacts...</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No contacts have been recorded for this company yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {contacts.map((contact) => {
            const isEditing = editingId === contact.id;
            const isDeleting = deletingId === contact.id;

            return (
              <li key={contact.id} className="py-5 first:pt-0 last:pb-0">
                {isEditing ? (
                  <form onSubmit={handleEdit} className="space-y-4">
                    <h3 className="text-sm font-medium text-zinc-900">
                      Edit Contact
                    </h3>
                    <ContactFormFields
                      form={editForm}
                      setForm={setEditForm}
                      idPrefix={`edit-${contact.id}`}
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
                        className="crm-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
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
                        <h3 className="text-base font-medium text-zinc-900">
                          {formatContactName(contact)}
                        </h3>
                        {contact.is_primary && (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                            Primary
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <ContactDetailRow label="Job title">
                          {contact.job_title || "—"}
                        </ContactDetailRow>
                        <ContactDetailRow label="Email">
                          {contact.email ? (
                            <a
                              href={`mailto:${contact.email}`}
                              className="text-zinc-800 underline-offset-2 hover:underline"
                            >
                              {contact.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </ContactDetailRow>
                        <ContactDetailRow label="Phone">
                          {contact.phone ? (
                            <a
                              href={`tel:${contact.phone}`}
                              className="text-zinc-800 underline-offset-2 hover:underline"
                            >
                              {contact.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </ContactDetailRow>
                        {contact.notes && (
                          <div className="text-sm">
                            <span className="font-medium text-zinc-600">
                              Notes:{" "}
                            </span>
                            <span className="whitespace-pre-wrap text-zinc-800">
                              {contact.notes}
                            </span>
                          </div>
                        )}
                        <ContactDetailRow label="Created">
                          {formatDate(contact.created_at)}
                        </ContactDetailRow>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(contact)}
                        disabled={isDeleting}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(contact)}
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
