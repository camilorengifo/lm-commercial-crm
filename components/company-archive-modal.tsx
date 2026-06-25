"use client";

import { FormEvent, useEffect, useState } from "react";
import { archiveCompanies } from "@/lib/companyClient";

export function CompanyArchiveModal({
  open,
  companyName,
  companyIds,
  isAdmin,
  onClose,
  onArchived,
}: {
  open: boolean;
  companyName: string;
  companyIds: string[];
  isAdmin: boolean;
  onClose: () => void;
  onArchived: (message: string) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmText("");
    setReason("");
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

    const { data, error: requestError } = await archiveCompanies({
      companyIds,
      reason: reason.trim() || null,
      confirmText,
    });

    setSubmitting(false);

    if (requestError || !data) {
      setError(requestError ?? "Unable to archive company.");
      return;
    }

    onArchived(data.message);
    onClose();
  }

  const title = isAdmin ? "Archive company" : "Delete company";
  const countLabel =
    companyIds.length === 1
      ? companyName
      : `${companyIds.length} selected companies`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="mt-2 text-sm text-zinc-600">
          You are about to archive <span className="font-medium">{countLabel}</span>.
          The company will be removed from your active list, but contacts,
          activities, follow-ups, and opportunities will be kept for company
          records.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="archive-reason" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Reason (optional)
            </label>
            <textarea
              id="archive-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Why is this company being archived?"
            />
          </div>

          <div>
            <label htmlFor="archive-confirm" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Type DELETE to confirm
            </label>
            <input
              id="archive-confirm"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="DELETE"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
              disabled={submitting || confirmText.trim().toUpperCase() !== "DELETE"}
              className="inline-flex items-center justify-center rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Archiving..." : isAdmin ? "Archive" : "Delete company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
