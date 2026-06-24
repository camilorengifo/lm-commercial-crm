"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_OUTREACH_TYPE: OutreachType = "Call Script";
const DEFAULT_TONE: OutreachTone = "Professional";

export function AiOutreachAssistantSection({
  companyId,
  companyName,
  userId,
  onActivitySaved,
}: {
  companyId: string;
  companyName: string;
  userId: string;
  onActivitySaved?: () => void;
}) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);

  const [outreachType, setOutreachType] =
    useState<OutreachType>(DEFAULT_OUTREACH_TYPE);
  const [contactId, setContactId] = useState("");
  const [tone, setTone] = useState<OutreachTone>(DEFAULT_TONE);
  const [goal, setGoal] = useState("");

  const [loading, setLoading] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<OutreachDraftResponse | null>(null);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    const { data, error: contactsError } = await fetchContactsForCompany(
      userId,
      companyId,
    );

    if (contactsError) {
      setError(formatSupabaseError(contactsError));
      setContacts([]);
    } else {
      setContacts(data);
    }

    setContactsLoading(false);
  }, [companyId, userId]);

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
      contactId: contactId.trim() || null,
      outreachType,
      tone,
      goal: goal.trim() || null,
    });

    if (requestError || !data) {
      setError(requestError ?? AI_CLIENT_ERROR_MESSAGE);
      setLoading(false);
      return;
    }

    setDraft(data.draft);
    setLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateDraft();
  }

  async function handleCopy() {
    if (!draft?.fullDraft) return;

    try {
      await navigator.clipboard.writeText(draft.fullDraft);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError("Unable to copy to clipboard. Please copy the text manually.");
    }
  }

  async function handleSaveAsActivity() {
    if (!draft?.fullDraft) return;

    setSavingActivity(true);
    setSaveMessage(null);
    setError(null);

    const selectedContact = contacts.find((contact) => contact.id === contactId);
    const contactLabel = selectedContact
      ? formatContactName(selectedContact)
      : null;

    const notesParts = [
      `Outreach type: ${outreachType}`,
      `Tone: ${tone}`,
      contactLabel ? `Contact: ${contactLabel}` : null,
      goal.trim() ? `Goal: ${goal.trim()}` : null,
      draft.subjectLine ? `Subject: ${draft.subjectLine}` : null,
      "",
      draft.fullDraft,
    ].filter((part) => part !== null);

    const { error: insertError } = await supabase.from("activities").insert({
      user_id: userId,
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
    onActivitySaved?.();
    setSavingActivity(false);
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
              value={outreachType}
              onChange={(event) =>
                setOutreachType(event.target.value as OutreachType)
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
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
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
              value={tone}
              onChange={(event) => setTone(event.target.value as OutreachTone)}
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
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              disabled={loading}
              placeholder="Example: Ask for available lanes, follow up on a quote, reconnect after no response..."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Generating draft..." : "Generate Draft"}
        </button>
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

      {!loading && draft && (
        <div className="mt-6 space-y-4 border-t border-zinc-100 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">
              Draft for broker review only. Copy and use in your own tools — the
              CRM does not send messages or contact customers.
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

          {draft.subjectLine && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Subject line
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {draft.subjectLine}
              </p>
            </div>
          )}

          <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            {draft.sections.map((section) => (
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
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Draft to copy
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
              {draft.fullDraft}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
