"use client";

import { FormEvent, useEffect, useState } from "react";
import { bulkUpdateCompanyAccountStatus } from "@/lib/companyClient";
import {
  BULK_ARCHIVE_DISPOSITIONS,
  type AccountDisposition,
} from "@/lib/accountStatus";

export function CompaniesBulkArchiveModal({
  open,
  selectedCount,
  companyIds,
  onClose,
  onCompleted,
}: {
  open: boolean;
  selectedCount: number;
  companyIds: string[];
  onClose: () => void;
  onCompleted: (result: { updated: number; message: string }) => void;
}) {
  const [disposition, setDisposition] = useState<AccountDisposition | "">("");
  const [archiveNotes, setArchiveNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisposition("");
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

    const reason = disposition || null;

    const { data, error: requestError } = await bulkUpdateCompanyAccountStatus({
      companyIds,
      accountStatus: "archived",
      accountDisposition: reason,
      archiveReason: reason,
      archiveNotes: archiveNotes.trim() || null,
    });

    setSubmitting(false);

    if (requestError || !data) {
      setError(requestError ?? "Unable to archive accounts.");
      return;
    }

    onCompleted({ updated: data.updated, message: data.message });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Archive selected accounts</h2>
        <p className="mt-2 text-sm text-zinc-600">
          You are about to archive {selectedCount} account
          {selectedCount === 1 ? "" : "s"}. Archived accounts will be hidden from
          the default working list but will not be deleted.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="bulk-archive-disposition"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Archive reason / disposition
            </label>
            <select
              id="bulk-archive-disposition"
              value={disposition}
              onChange={(event) =>
                setDisposition(event.target.value as AccountDisposition | "")
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="">Select a reason (optional)</option>
              {BULK_ARCHIVE_DISPOSITIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="bulk-archive-notes"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Notes
            </label>
            <textarea
              id="bulk-archive-notes"
              rows={3}
              value={archiveNotes}
              onChange={(event) => setArchiveNotes(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Optional notes about why these accounts are being archived."
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
              {submitting ? "Archiving..." : "Archive accounts"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
