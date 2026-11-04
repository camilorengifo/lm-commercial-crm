"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOutreachDraft,
  saveOutreachFeedback,
  type OutreachIntelligence,
} from "@/lib/aiClient";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";
import {
  OUTREACH_FEEDBACK_RATINGS,
  OUTREACH_TONES,
  OUTREACH_TYPES,
  isEmailOutreachType,
  resolveOutreachType,
  type OutreachDraftResponse,
  type OutreachFeedbackRating,
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
  intelligence: OutreachIntelligence | null;
  editedFullDraft: string;
  editedSubjects: string[];
  editedSummary: string;
  editedMarketInsight: string;
  editedRecommendation: string;
  editedEmail: string;
  editedNextStep: string;
}

function emptyOutreachDraft(): AiOutreachDraftState {
  return {
    outreachType: DEFAULT_OUTREACH_TYPE,
    contactId: "",
    tone: DEFAULT_TONE,
    goal: "",
    draft: null,
    intelligence: null,
    editedFullDraft: "",
    editedSubjects: [],
    editedSummary: "",
    editedMarketInsight: "",
    editedRecommendation: "",
    editedEmail: "",
    editedNextStep: "",
  };
}

function technicalDraftText(form: AiOutreachDraftState): string {
  const subjects = (form.editedSubjects ?? []).filter(Boolean);
  return [
    form.editedSummary
      ? `Commercial Intelligence Summary\n${form.editedSummary}`
      : "",
    form.editedMarketInsight ? `Market Insight\n${form.editedMarketInsight}` : "",
    form.editedRecommendation
      ? `Commercial Recommendation\n${form.editedRecommendation}`
      : "",
    subjects.length
      ? `Subject alternatives\n${subjects
          .map((subject, index) => `${index + 1}. ${subject}`)
          .join("\n")}`
      : "",
    form.editedEmail ? `Email draft\n${form.editedEmail}` : "",
    form.editedNextStep ? `Suggested next step\n${form.editedNextStep}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function isOutreachDraftEmpty(value: AiOutreachDraftState): boolean {
  return (
    !value.goal.trim() &&
    !value.contactId &&
    !value.draft &&
    !value.editedFullDraft?.trim() &&
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
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

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

  useEffect(() => {
    const resolved = resolveOutreachType(form.outreachType) ?? DEFAULT_OUTREACH_TYPE;
    if (resolved !== form.outreachType) {
      setForm((prev) => ({ ...prev, outreachType: resolved }));
    }
  }, [form.outreachType, setForm]);

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

    const requestedType = form.outreachType;
    setForm((prev) => {
      const nextForm: AiOutreachDraftState = {
        ...prev,
        outreachType: requestedType,
        draft: data.draft,
        intelligence: data.intelligence,
        editedSubjects: data.draft.subjectAlternatives ?? [],
        editedSummary: data.draft.commercialSummary ?? "",
        editedMarketInsight: data.draft.marketInsight ?? "",
        editedRecommendation: data.draft.commercialRecommendation ?? "",
        editedEmail: data.draft.emailDraft ?? data.draft.fullDraft,
        editedNextStep: data.draft.suggestedNextStep ?? "",
        editedFullDraft: data.draft.fullDraft,
      };
      return {
        ...nextForm,
        editedFullDraft:
          requestedType === "Technical Follow-up"
            ? technicalDraftText(nextForm)
            : data.draft.fullDraft,
      };
    });
    setFeedbackMessage(null);
    setLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateDraft();
  }

  function draftText(): string {
    if (form.outreachType === "Technical Follow-up") {
      return technicalDraftText(form) || form.editedFullDraft || form.draft?.fullDraft || "";
    }
    return form.editedFullDraft || form.draft?.fullDraft || "";
  }

  async function handleCopy() {
    const text = draftText();
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
    const textToSave = draftText();
    if (!textToSave || !form.draft) return;

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
      form.editedSubjects?.length
        ? `Subjects:\n${form.editedSubjects.map((subject, index) => `${index + 1}. ${subject}`).join("\n")}`
        : form.draft.subjectLine
          ? `Subject: ${form.draft.subjectLine}`
          : null,
      "",
      textToSave,
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
    setFeedbackMessage(null);
    setCopySuccess(false);
  }

  async function handleFeedback(rating: OutreachFeedbackRating) {
    if (!form.draft) return;
    setSavingFeedback(true);
    setFeedbackMessage(null);
    setError(null);
    const { error: feedbackError } = await saveOutreachFeedback({
      companyId,
      outreachType: form.outreachType,
      rating,
    });
    setSavingFeedback(false);
    if (feedbackError) {
      setError(feedbackError);
      return;
    }
    setFeedbackMessage(
      "Rating saved for this company. The next draft will take it into account. The model is not retrained.",
    );
  }

  const technicalSelected = form.outreachType === "Technical Follow-up";
  const emailSelected = isEmailOutreachType(form.outreachType);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-medium text-zinc-900">
          AI Commercial Intelligence Assistant
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Draft-only assistant for {companyName}. It reads this company&apos;s
          commercial history and prepares a call script or email for you to
          review, edit, and send from your own tools.
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
              {technicalSelected
                ? "Technical Follow-up uses this company's recorded lanes and public freight sources. Nothing is sent from the CRM."
                : "Select the type of draft to generate. Nothing is sent from the CRM."}
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
          {technicalSelected
            ? "Reviewing this company's freight history and current market sources..."
            : "Building the draft from this company's commercial history..."}
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

          {technicalSelected && form.intelligence && (
            <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  CRM information used
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                  {form.intelligence.crmFacts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  Relevant lanes
                </h3>
                {form.intelligence.lanePatterns.length === 0 ? (
                  <p className="mt-1 text-sm text-zinc-600">
                    No origin and destination lanes are recorded for this company.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm text-zinc-700">
                    {form.intelligence.lanePatterns.map((lane) => (
                      <li key={`${lane.origin}-${lane.destination}-${lane.equipmentType ?? "equipment"}`}>
                        {lane.origin} to {lane.destination}
                        {lane.equipmentType ? ` · ${lane.equipmentType}` : ""}
                        {lane.commodities.length ? ` · ${lane.commodities.join(", ")}` : ""}
                        {` · ${lane.quoteCount} record${lane.quoteCount === 1 ? "" : "s"}`}
                        {lane.lastRecordedAt ? ` · last recorded ${lane.lastRecordedAt}` : ""}
                        {lane.repeatedLane ? " · repeated lane" : ""}
                        {lane.closedWithoutAward ? " · previously not awarded" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  Market insights
                </h3>
                {form.intelligence.marketResearch?.findings.length ? (
                  <ul className="mt-2 space-y-3 text-sm text-zinc-700">
                    {form.intelligence.marketResearch.findings.map((finding) => (
                      <li key={`${finding.sourceUrl}-${finding.insight}`}>
                        <p>{finding.insight}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {finding.sourceName}
                          {finding.publishedAt ? ` · ${finding.publishedAt}` : " · date not on the source"}
                          {` · ${finding.scope === "verified" ? "Verified current source" : "Observation, not a current lane condition"}`}
                          {finding.sourceUrl ? ` · ${finding.sourceUrl}` : ""}
                        </p>
                        <p className="text-xs text-zinc-500">{finding.relevance}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-zinc-600">
                    {form.intelligence.marketResearch?.limitation ??
                      "Current market research was not available for this draft."}
                  </p>
                )}
                {form.intelligence.marketResearch?.limitation &&
                  (form.intelligence.marketResearch.findings.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {form.intelligence.marketResearch.limitation}
                    </p>
                  )}
              </div>
            </div>
          )}

          {emailSelected && (form.editedSubjects ?? []).length > 0 && (
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Subject alternatives
              </p>
              {(form.editedSubjects ?? []).map((subject, index) => (
                <input
                  key={`subject-${index}`}
                  value={subject}
                  onChange={(event) => {
                    const editedSubjects = [...(form.editedSubjects ?? [])];
                    editedSubjects[index] = event.target.value;
                    setForm((prev) => ({ ...prev, editedSubjects }));
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  aria-label={`Subject alternative ${index + 1}`}
                />
              ))}
            </div>
          )}

          {!technicalSelected && (
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
          )}

          {technicalSelected ? (
            <div className="space-y-4">
              {(
                [
                  ["editedSummary", "Commercial intelligence summary", form.editedSummary],
                  ["editedMarketInsight", "Market insight", form.editedMarketInsight],
                  ["editedRecommendation", "Commercial recommendation", form.editedRecommendation],
                  ["editedEmail", "Recommended email draft", form.editedEmail],
                  ["editedNextStep", "Suggested next step", form.editedNextStep],
                ] as const
              ).map(([key, label, value]) => (
                <div key={key} className="rounded-lg border border-zinc-200 bg-white p-4">
                  <label
                    htmlFor={`outreach-${key}`}
                    className="text-xs font-medium uppercase tracking-wide text-zinc-500"
                  >
                    {label}
                  </label>
                  <textarea
                    id={`outreach-${key}`}
                    rows={key === "editedEmail" ? 10 : 4}
                    value={value ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                    className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>
              ))}
            </div>
          ) : (
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
                value={form.editedFullDraft ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    editedFullDraft: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </div>
          )}

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm font-medium text-zinc-900">Rate this recommendation</p>
            <p className="mt-1 text-xs text-zinc-500">
              Your rating is saved on this company and included the next time a
              draft is generated. This does not retrain the model, and nothing
              is sent to the customer.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {OUTREACH_FEEDBACK_RATINGS.map((rating) => (
                <button
                  key={rating.id}
                  type="button"
                  onClick={() => handleFeedback(rating.id)}
                  disabled={savingFeedback}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rating.label}
                </button>
              ))}
            </div>
            {feedbackMessage && (
              <p className="mt-3 text-sm text-emerald-800">{feedbackMessage}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
