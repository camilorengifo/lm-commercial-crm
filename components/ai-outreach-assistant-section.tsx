"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchOutreachDraft } from "@/lib/aiClient";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";
import {
  OUTREACH_TONES,
  OUTREACH_TYPES,
  type OutreachDraftResponse,
  type OutreachTone,
  type OutreachType,
} from "@/lib/aiPrompts";
import { formatSupabaseError } from "@/lib/crmFormat";
import {
  type ContactOption,
  fetchContactsForCompany,
  formatContactName,
} from "@/lib/loadOpportunities";
import { companyDraftKey, usePersistentDraft } from "@/lib/usePersistentDraft";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_OUTREACH_TYPE: OutreachType = "Call Script";
const DEFAULT_TONE: OutreachTone = "Professional";

interface AiOutreachDraftState {
  outreachType: OutreachType;
  contactId: string;
  tone: OutreachTone;
  goal: string;
  draft: OutreachDraftResponse | null;
  editedFullDraft: string;
}

function emptyOutreachDraft(): AiOutreachDraftState {
  return {
    outreachType: DEFAULT_OUTREACH_TYPE,
    contactId: "",
    tone: DEFAULT_TONE,
    goal: "",
    draft: null,
    editedFullDraft: "",
  };
}

function isOutreachDraftEmpty(value: AiOutreachDraftState): boolean {
  return (
    !value.goal.trim() &&
    !value.contactId &&
    !value.draft &&
    !value.editedFullDraft.trim() &&
    value.outreachType === DEFAULT_OUTREACH_TYPE &&
    value.tone === DEFAULT_TONE
  );
}

export function AiOutreachAssistantSection({
  companyId,
  companyName,
  ownerUserId,
  viewerUserId,
  isAdmin = false,
  onActivitySaved,
}: {
  companyId: string;
  companyName: string;
  ownerUserId: string;
  viewerUserId: string;
  isAdmin?: boolean;
  onActivitySaved?: () => void;
}) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);

  const draftKey = useMemo(
    () => companyDraftKey(companyId, "ai-outreach"),
    [companyId],
  );

  const [form, setForm, clearForm] = usePersistentDraft<AiOutreachDraftState>({
    key: draftKey,
    initialValue: emptyOutreachDraft(),
    isEmpty: isOutreachDraftEmpty,
  });

  const [loading, setLoading] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const scopedUserId = isAdmin ? ownerUserId : viewerUserId;

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    const { data, error: contactsError } = await fetchContactsForCompany(
      scopedUserId,
      companyId,
      isAdmin,
    );

    if (contactsError) {
      setError(formatSupabaseError(contactsError));
      setContacts([]);
    } else {
      setContacts(data);
    }

    setContactsLoading(false);
  }, [companyId, scopedUserId, isAdmin]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  async function generateDraft() {
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    setCopySuccess(false);

    const { data, error: requestError } = await fetchOutreachDraft({
      companyId,
      contactId: form.contactId.trim() || null,
      outreachType: form.outreachType,
      tone: form.tone,
      goal: form.goal.trim() || null,
    });

    if (requestError || !data) {
      setError(requestError ?? AI_CLIENT_ERROR_MESSAGE);
      setLoading(false);
      return;
    }

    setForm((prev) => ({
      ...prev,
      draft: data.draft,
      editedFullDraft: data.draft.fullDraft,
    }));
    setLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateDraft();
  }

  async function handleCopy() {
    const text = form.editedFullDraft || form.draft?.fullDraft;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError("Unable to copy to clipboard. Please copy the text manually.");
    }
  }

  async function handleSaveAsActivity() {
    const draftText = form.editedFullDraft || form.draft?.fullDraft;
    if (!draftText || !form.draft) return;

    setSavingActivity(true);
    setSaveMessage(null);
    setError(null);

    const selectedContact = contacts.find(
      (contact) => contact.id === form.contactId,
    );
    const contactLabel = selectedContact
      ? formatContactName(selectedContact)
      : null;

    const notesParts = [
      `Outreach type: ${form.outreachType}`,
      `Tone: ${form.tone}`,
      contactLabel ? `Contact: ${contactLabel}` : null,
      form.goal.trim() ? `Goal: ${form.goal.trim()}` : null,
      form.draft.subjectLine ? `Subject: ${form.draft.subjectLine}` : null,
      "",
      draftText,
    ].filter((part) => part !== null);

    const { error: insertError } = await supabase.from("activities").insert({
      user_id: scopedUserId,
      company_id: companyId,
      activity_type: "note",
      subject: "AI outreach draft generated",
      notes: notesParts.join("\n"),
      activity_at: new Date().toISOString(),
    });

    if (insertError) {
      setError(formatSupabaseError(insertError));
      setSavingActivity(false);
      return;
    }

    setSaveMessage("Draft saved to the Commercial Timeline.");
    clearForm();
    onActivitySaved?.();
    setSavingActivity(false);
  }

  function handleDiscard() {
    clearForm();
    setError(null);
    setSaveMessage(null);
    setCopySuccess(false);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-medium text-zinc-900">
          AI Outreach Assistant
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Draft-only assistant for {companyName}. Generates call scripts and
          message drafts from CRM history for you to review, copy, and use in
          your own email, phone, or LinkedIn app.
        </p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
          Assistive only: this tool does not send email, WhatsApp, SMS, or
          LinkedIn messages, and does not run campaigns or automated outreach.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="outreach-type"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Outreach Type
            </label>
            <select
              id="outreach-type"
              value={form.outreachType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  outreachType: event.target.value as OutreachType,
                }))
              }
              disabled={loading}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {OUTREACH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type} (draft)
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Select the type of draft to generate. Nothing is sent from the CRM.
            </p>
          </div>

          <div>
            <label
              htmlFor="outreach-contact"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Contact
            </label>
            <select
              id="outreach-contact"
              value={form.contactId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  contactId: event.target.value,
                }))
              }
              disabled={loading || contactsLoading}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">No specific contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {formatContactName(contact)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="outreach-tone"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Tone
            </label>
            <select
              id="outreach-tone"
              value={form.tone}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  tone: event.target.value as OutreachTone,
                }))
              }
              disabled={loading}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {OUTREACH_TONES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="outreach-goal"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Goal
            </label>
            <input
              id="outreach-goal"
              type="text"
              value={form.goal}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, goal: event.target.value }))
              }
              disabled={loading}
              placeholder="Example: Ask for available lanes, follow up on a quote, reconnect after no response..."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Generating draft..." : "Generate Draft"}
          </button>
          {!isOutreachDraftEmpty(form) && (
            <button
              type="button"
              onClick={handleDiscard}
              disabled={loading || savingActivity}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              Discard draft
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {saveMessage && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {saveMessage}
        </p>
      )}

      {loading && (
        <p className="mt-4 text-sm text-zinc-500">
          Building outreach draft from account history...
        </p>
      )}

      {!loading && form.draft && (
        <div className="mt-6 space-y-4 border-t border-zinc-100 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">
              Draft for broker review only. Copy and use in your own tools — the
              CRM does not send messages or contact customers. Your edits are
              kept if you switch browser tabs.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                {copySuccess ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={generateDraft}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={handleSaveAsActivity}
                disabled={savingActivity}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingActivity ? "Saving..." : "Save as Activity"}
              </button>
            </div>
          </div>

          {form.draft.subjectLine && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Subject line
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {form.draft.subjectLine}
              </p>
            </div>
          )}

          <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            {form.draft.sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold text-zinc-900">
                  {section.title}
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                  {section.content}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <label
              htmlFor="outreach-edited-draft"
              className="text-xs font-medium uppercase tracking-wide text-zinc-500"
            >
              Draft to copy / edit
            </label>
            <textarea
              id="outreach-edited-draft"
              rows={12}
              value={form.editedFullDraft}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  editedFullDraft: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>
        </div>
      )}
    </section>
  );
}
