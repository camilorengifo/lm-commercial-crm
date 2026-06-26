"use client";

import { FormEvent, useEffect, useState } from "react";
import { updateCompanyAccountStatus } from "@/lib/companyClient";
import {
  ACCOUNT_DISPOSITIONS,
  type AccountDisposition,
} from "@/lib/accountStatus";

export function CompanyAccountArchiveModal({
  open,
  companyName,
  companyId,
  onClose,
  onArchived,
}: {
  open: boolean;
  companyName: string;
  companyId: string;
  onClose: () => void;
  onArchived: (message: string) => void;
}) {
  const [disposition, setDisposition] = useState<AccountDisposition | "">("");
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveNotes, setArchiveNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisposition("");
    setArchiveReason("");
    setArchiveNotes("");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: requestError } = await updateCompanyAccountStatus({
      companyId,
      accountStatus: "archived",
      accountDisposition: disposition || null,
      archiveReason: archiveReason.trim() || null,
      archiveNotes: archiveNotes.trim() || null,
    });

    setSubmitting(false);

    if (requestError || !data) {
      setError(requestError ?? "Unable to archive account.");
      return;
    }

    onArchived(data.message);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Archive account</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Archive <span className="font-medium">{companyName}</span> to hide it
          from your working company list. All contacts, activities, follow-ups,
          and opportunities will be kept.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="archive-disposition"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Disposition
            </label>
            <select
              id="archive-disposition"
              value={disposition}
              onChange={(event) =>
                setDisposition(event.target.value as AccountDisposition | "")
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="">Select a reason (optional)</option>
              {ACCOUNT_DISPOSITIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="archive-reason"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Archive reason (optional)
            </label>
            <input
              id="archive-reason"
              value={archiveReason}
              onChange={(event) => setArchiveReason(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Short reason for archiving"
            />
          </div>

          <div>
            <label
              htmlFor="archive-notes"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Archive notes (optional)
            </label>
            <textarea
              id="archive-notes"
              rows={3}
              value={archiveNotes}
              onChange={(event) => setArchiveNotes(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Additional context for future reference"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Archiving..." : "Archive account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
