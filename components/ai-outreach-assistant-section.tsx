"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOutreachDraft,
  saveOutreachFeedback,
} from "@/lib/aiClient";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";
import {
  OUTREACH_FEEDBACK_RATINGS,
  OUTREACH_STYLES,
  OUTREACH_TONES,
  OUTREACH_TYPES,
  resolveOutreachStyle,
  resolveOutreachTone,
  resolveOutreachType,
  type OutreachDraftResponse,
  type OutreachFeedbackRating,
  type OutreachStyle,
  type OutreachTone,
  type OutreachType,
} from "@/lib/aiPrompts";
import { CUSTOMER_FACING_COMPANY } from "@/lib/customerBrand";
import {
  OUTREACH_LANGUAGES,
  resolveOutreachLanguage,
  type OutreachLanguage,
} from "@/lib/customerEmail";
import { formatSupabaseError } from "@/lib/crmFormat";
import {
  buildLanePatterns,
  laneSelectionKey,
  rankLanesForOutreach,
  type LanePattern,
} from "@/lib/laneIntelligence";
import {
  type ContactOption,
  type LoadOpportunity,
  fetchContactsForCompany,
  fetchLoadOpportunitiesForCompany,
  formatContactName,
} from "@/lib/loadOpportunities";
import { companyDraftKey, usePersistentDraft } from "@/lib/usePersistentDraft";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_OUTREACH_TYPE: OutreachType = "Automatic / next best follow-up";
const DEFAULT_STYLE: OutreachStyle = "Standard commercial email";
const DEFAULT_TONE: OutreachTone = "Professional and polished";

interface AiOutreachDraftState {
  outreachType: OutreachType;
  contactId: string;
  communicationStyle: OutreachStyle;
  tone: OutreachTone;
  language: OutreachLanguage;
  goal: string;
  enableMarketResearch: boolean;
  laneKey: string;
  draft: OutreachDraftResponse | null;
  editedSubject: string;
  editedBody: string;
}

function emptyOutreachDraft(): AiOutreachDraftState {
  return {
    outreachType: DEFAULT_OUTREACH_TYPE,
    contactId: "",
    communicationStyle: DEFAULT_STYLE,
    tone: DEFAULT_TONE,
    language: "en",
    goal: "",
    enableMarketResearch: false,
    laneKey: "",
    draft: null,
    editedSubject: "",
    editedBody: "",
  };
}

function withDraftDefaults(value: Partial<AiOutreachDraftState>): AiOutreachDraftState {
  const base = emptyOutreachDraft();
  const draft =
    value.draft &&
    typeof value.draft.subject === "string" &&
    typeof value.draft.body === "string" &&
    typeof value.draft.signature === "string"
      ? value.draft
      : null;
  const rawTone = String(value.tone ?? base.tone);
  return {
    ...base,
    ...value,
    outreachType:
      resolveOutreachType(String(value.outreachType ?? base.outreachType)) ??
      base.outreachType,
    communicationStyle:
      resolveOutreachStyle(String(value.communicationStyle ?? "")) ??
      (rawTone === "Natural / Conversational"
        ? "Natural and conversational"
        : base.communicationStyle),
    tone: resolveOutreachTone(rawTone) ?? base.tone,
    language: resolveOutreachLanguage(String(value.language ?? "en")) ?? "en",
    enableMarketResearch: value.enableMarketResearch === true,
    laneKey: value.laneKey ?? "",
    goal: value.goal ?? "",
    contactId: value.contactId ?? "",
    draft,
    editedSubject: value.editedSubject ?? draft?.subject ?? "",
    editedBody:
      value.editedBody ??
      (draft ? `${draft.body}\n${draft.signature}`.trim() : ""),
  };
}

function isOutreachDraftEmpty(value: AiOutreachDraftState): boolean {
  return (
    !value.goal.trim() &&
    !value.contactId &&
    !value.laneKey &&
    !value.enableMarketResearch &&
    value.language === "en" &&
    !value.draft &&
    !value.editedSubject.trim() &&
    !value.editedBody.trim() &&
    value.outreachType === DEFAULT_OUTREACH_TYPE &&
    value.communicationStyle === DEFAULT_STYLE &&
    value.tone === DEFAULT_TONE
  );
}

function laneLabel(lane: LanePattern): string {
  const equipment = lane.equipmentType ? ` · ${lane.equipmentType}` : "";
  const commodity = lane.commodities.length ? ` · ${lane.commodities.join(", ")}` : "";
  return `${lane.origin} → ${lane.destination}${equipment}${commodity}`;
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
  const [lanes, setLanes] = useState<LanePattern[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);

  const draftKey = useMemo(
    () => companyDraftKey(companyId, "ai-outreach"),
    [companyId],
  );

  const [form, setForm, clearForm, hydrated] = usePersistentDraft<AiOutreachDraftState>({
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
  const draftState = withDraftDefaults(form);

  useEffect(() => {
    if (!hydrated) return;
    const normalized = withDraftDefaults(form);
    if (JSON.stringify(normalized) !== JSON.stringify(form)) {
      setForm(normalized);
    }
  }, [hydrated, form, setForm]);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    const [contactsResult, lanesResult] = await Promise.all([
      fetchContactsForCompany(scopedUserId, companyId, isAdmin),
      fetchLoadOpportunitiesForCompany(scopedUserId, companyId, isAdmin),
    ]);

    if (contactsResult.error) {
      setError(formatSupabaseError(contactsResult.error));
      setContacts([]);
    } else {
      setContacts(contactsResult.data);
    }

    const opportunities = (lanesResult.data ?? []) as LoadOpportunity[];
    setLanes(
      rankLanesForOutreach(
        buildLanePatterns(
          opportunities.map((opportunity) => ({
            origin: opportunity.lane_origin,
            destination: opportunity.lane_destination,
            equipmentType: opportunity.equipment_type,
            commodity: opportunity.commodity,
            status: opportunity.status,
            frequency: opportunity.frequency,
            estimatedLoadsPerWeek: opportunity.estimated_loads_per_week,
            targetRate: opportunity.target_rate,
            quotedRate: opportunity.quoted_rate,
            createdAt: opportunity.created_at,
            updatedAt: opportunity.updated_at,
            notes: opportunity.notes,
          })),
        ),
      ),
    );
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
    const current = withDraftDefaults(form);

    const { data, error: requestError } = await fetchOutreachDraft({
      companyId,
      contactId: current.contactId.trim() || null,
      outreachType: current.outreachType,
      tone: current.tone,
      communicationStyle: current.communicationStyle,
      goal: current.goal.trim() || null,
      language: current.language,
      enableMarketResearch: current.enableMarketResearch,
      laneKey:
        lanes.some((lane) => laneSelectionKey(lane) === current.laneKey)
          ? current.laneKey
          : null,
    });

    if (requestError || !data) {
      setError(requestError ?? AI_CLIENT_ERROR_MESSAGE);
      setLoading(false);
      return;
    }

    const email: OutreachDraftResponse = {
      subject: data.draft.subject,
      body: data.draft.body,
      signature: CUSTOMER_FACING_COMPANY,
      clarificationQuestion: null,
    };
    if (!email.body.trim()) {
      setError(
        "The email could not be written from the Commercial Timeline. Please generate the draft again.",
      );
      setLoading(false);
      return;
    }
    setForm((prev) => ({
      ...withDraftDefaults(prev),
      draft: email,
      editedSubject: email.subject,
      editedBody: `${email.body}\n${CUSTOMER_FACING_COMPANY}`.trim(),
    }));
    setFeedbackMessage(null);
    setLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateDraft();
  }

  function copySource(): string {
    return `Subject: ${draftState.editedSubject.trim()}\n\n${draftState.editedBody.trim()}`.trim();
  }

  async function handleCopy() {
    const text = copySource();
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
    const textToSave = copySource();
    if (!textToSave || !draftState.draft) return;

    setSavingActivity(true);
    setSaveMessage(null);
    setError(null);

    const selectedContact = contacts.find(
      (contact) => contact.id === draftState.contactId,
    );
    const contactLabel = selectedContact
      ? formatContactName(selectedContact)
      : null;

    const notes = [
      "AI email draft for broker review. Nothing was sent.",
      contactLabel ? `Contact: ${contactLabel}` : null,
      "",
      textToSave,
    ]
      .filter((part) => part !== null)
      .join("\n");

    const { error: insertError } = await supabase.from("activities").insert({
      user_id: scopedUserId,
      company_id: companyId,
      activity_type: "note",
      subject: "AI outreach draft generated",
      notes,
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
    if (!draftState.draft) return;
    setSavingFeedback(true);
    setFeedbackMessage(null);
    setError(null);
    const { error: feedbackError } = await saveOutreachFeedback({
      companyId,
      outreachType: draftState.outreachType,
      rating,
    });
    setSavingFeedback(false);
    if (feedbackError) {
      setError(feedbackError);
      return;
    }
    setFeedbackMessage("Rating saved for this company. The next email will take it into account.");
  }

  const fieldClass =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-medium text-zinc-900">
          AI Commercial Intelligence Assistant
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Writes a personalized {CUSTOMER_FACING_COMPANY} email from {companyName}&apos;s
          Commercial Timeline. Review it, edit it, and send it from your own tools.
        </p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
          Assistive only: this tool does not send email, WhatsApp, SMS, or
          LinkedIn messages, and does not run campaigns or automated outreach.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-start-1">
            <label htmlFor="outreach-type" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Outreach Type
            </label>
            <select
              id="outreach-type"
              value={draftState.outreachType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...withDraftDefaults(prev),
                  outreachType: event.target.value as OutreachType,
                }))
              }
              disabled={loading}
              className={fieldClass}
            >
              {OUTREACH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {draftState.outreachType === "Automatic / next best follow-up" ? (
              <p className="mt-1.5 text-xs text-zinc-500">
                Reviews the Commercial Timeline and writes the next email. A lane is not required.
              </p>
            ) : null}
            {draftState.outreachType === "Market insight" &&
            !draftState.enableMarketResearch ? (
              <p className="mt-1.5 text-xs text-zinc-500">
                Market research is off, so this draft will not include a market claim.
              </p>
            ) : null}
          </div>

          <div className="md:col-start-1">
            <label htmlFor="outreach-contact" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Contact
            </label>
            <select
              id="outreach-contact"
              value={draftState.contactId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...withDraftDefaults(prev),
                  contactId: event.target.value,
                }))
              }
              disabled={loading || contactsLoading}
              className={fieldClass}
            >
              <option value="">No specific contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {formatContactName(contact)}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-start-1">
            <label htmlFor="outreach-language" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Language
            </label>
            <select
              id="outreach-language"
              value={draftState.language}
              onChange={(event) =>
                setForm((prev) => ({
                  ...withDraftDefaults(prev),
                  language: resolveOutreachLanguage(event.target.value) ?? "en",
                }))
              }
              disabled={loading}
              className={fieldClass}
            >
              {OUTREACH_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-start-1">
            <label htmlFor="outreach-style" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Communication style
            </label>
            <select
              id="outreach-style"
              value={draftState.communicationStyle}
              onChange={(event) =>
                setForm((prev) => ({
                  ...withDraftDefaults(prev),
                  communicationStyle:
                    resolveOutreachStyle(event.target.value) ?? DEFAULT_STYLE,
                }))
              }
              disabled={loading}
              className={fieldClass}
            >
              {OUTREACH_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-start-1">
            <label htmlFor="outreach-tone" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Tone
            </label>
            <select
              id="outreach-tone"
              value={draftState.tone}
              onChange={(event) =>
                setForm((prev) => ({
                  ...withDraftDefaults(prev),
                  tone: event.target.value as OutreachTone,
                }))
              }
              disabled={loading}
              className={fieldClass}
            >
              {OUTREACH_TONES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {lanes.length > 0 && (
            <div className="md:col-span-2">
              <label htmlFor="outreach-lane" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Recorded lane <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <select
                id="outreach-lane"
                value={draftState.laneKey}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...withDraftDefaults(prev),
                    laneKey: event.target.value,
                  }))
                }
                disabled={loading}
                className={fieldClass}
              >
                <option value="">Use the Commercial Timeline</option>
                {lanes.map((lane) => (
                  <option key={laneSelectionKey(lane)} value={laneSelectionKey(lane)}>
                    {laneLabel(lane)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="md:col-span-2">
            <label htmlFor="outreach-goal" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Goal <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="outreach-goal"
              type="text"
              maxLength={240}
              value={draftState.goal}
              onChange={(event) =>
                setForm((prev) => ({
                  ...withDraftDefaults(prev),
                  goal: event.target.value,
                }))
              }
              disabled={loading}
              placeholder="Optional. Leave blank to use the stage and the Commercial Timeline."
              className={fieldClass}
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={draftState.enableMarketResearch}
            disabled={loading}
            onChange={(event) =>
              setForm((prev) => ({
                ...withDraftDefaults(prev),
                enableMarketResearch: event.target.checked,
              }))
            }
          />
          <span>
            <span className="font-medium">Enable Market Research</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Optional. Runs only when checked. A relevant public finding may be included. If none is found, the email is written without a market claim.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Writing draft..." : "Generate Draft"}
          </button>
          {!isOutreachDraftEmpty(draftState) && (
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
          {draftState.enableMarketResearch
            ? "Checking this week's freight conditions, then writing the email..."
            : "Writing the email..."}
        </p>
      )}

      {!loading && draftState.draft && draftState.editedBody.trim() && (
        <div className="mt-6 space-y-4 border-t border-zinc-100 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">
              Draft for broker review only. Nothing is sent from the CRM.
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

          <div>
            <label htmlFor="outreach-subject" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Subject
            </label>
            <input
              id="outreach-subject"
              value={draftState.editedSubject}
              onChange={(event) =>
                setForm((prev) => ({
                  ...withDraftDefaults(prev),
                  editedSubject: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="outreach-body" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <textarea
              id="outreach-body"
              rows={14}
              value={draftState.editedBody}
              onChange={(event) =>
                setForm((prev) => ({
                  ...withDraftDefaults(prev),
                  editedBody: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-zinc-500">Rate this email</p>
            {OUTREACH_FEEDBACK_RATINGS.map((rating) => (
              <button
                key={rating.id}
                type="button"
                onClick={() => handleFeedback(rating.id)}
                disabled={savingFeedback}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {rating.label}
              </button>
            ))}
          </div>
          {feedbackMessage && (
            <p className="text-sm text-emerald-800">{feedbackMessage}</p>
          )}
        </div>
      )}
    </section>
  );
}
