"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  COMPANY_PRIORITIES,
  COUNTRY_OPTIONS,
  type CompanyPriority,
} from "@/lib/crmConstants";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  type CompanyRecord,
} from "@/lib/companies";
import { updateCompanyDetails } from "@/lib/companyClient";

export function CompanyEditModal({
  open,
  company,
  onClose,
  onSaved,
}: {
  open: boolean;
  company: CompanyRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("United States");
  const [priority, setPriority] = useState<CompanyPriority>("Medium");
  const [generalNotes, setGeneralNotes] = useState("");
  const [lastContactAt, setLastContactAt] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !company) return;

    setName(company.name);
    setCity(company.city ?? "");
    setState(company.state ?? "");
    setCountry(company.country ?? "United States");
    setPriority(company.priority);
    setGeneralNotes(company.general_notes ?? "");
    setLastContactAt(toDatetimeLocalValue(company.last_contact_at));
    setNextFollowUpAt(toDatetimeLocalValue(company.next_follow_up_at));
    setError(null);
  }, [open, company]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, onClose]);

  if (!open || !company) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { error: requestError } = await updateCompanyDetails({
      companyId: company!.id,
      name: name.trim(),
      city: city.trim() || null,
      state: state.trim() || null,
      country: country.trim() || null,
      priority,
      general_notes: generalNotes.trim() || null,
      last_contact_at: fromDatetimeLocalValue(lastContactAt),
      next_follow_up_at: fromDatetimeLocalValue(nextFollowUpAt),
    });

    setSaving(false);

    if (requestError) {
      setError(requestError);
      return;
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Edit company</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Update company details. Changes are logged on the commercial timeline.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="edit-name" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Company name <span className="text-red-600">*</span>
            </label>
            <input
              id="edit-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-city" className="mb-1.5 block text-sm font-medium text-zinc-700">
                City
              </label>
              <input
                id="edit-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </div>
            <div>
              <label htmlFor="edit-state" className="mb-1.5 block text-sm font-medium text-zinc-700">
                State
              </label>
              <input
                id="edit-state"
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </div>
            <div>
              <label htmlFor="edit-country" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Country
              </label>
              <select
                id="edit-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-priority" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Priority
              </label>
              <select
                id="edit-priority"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as CompanyPriority)
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                {COMPANY_PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-last-contact" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Last contact
              </label>
              <input
                id="edit-last-contact"
                type="datetime-local"
                value={lastContactAt}
                onChange={(event) => setLastContactAt(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </div>
            <div>
              <label htmlFor="edit-next-follow-up" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Next follow-up
              </label>
              <input
                id="edit-next-follow-up"
                type="datetime-local"
                value={nextFollowUpAt}
                onChange={(event) => setNextFollowUpAt(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-notes" className="mb-1.5 block text-sm font-medium text-zinc-700">
              General notes
            </label>
            <textarea
              id="edit-notes"
              rows={4}
              value={generalNotes}
              onChange={(event) => setGeneralNotes(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
