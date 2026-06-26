"use client";

import { useEffect, useState } from "react";
import { bulkUpdateCompanyAccountStatus } from "@/lib/companyClient";

export function CompaniesBulkActiveModal({
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
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

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const { data, error: requestError } = await bulkUpdateCompanyAccountStatus({
      companyIds,
      accountStatus: "active",
    });

    setSubmitting(false);

    if (requestError || !data) {
      setError(requestError ?? "Unable to mark accounts as active.");
      return;
    }

    onCompleted({ updated: data.updated, message: data.message });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Mark as active</h2>
        <p className="mt-2 text-sm text-zinc-600">
          You are about to mark {selectedCount} account
          {selectedCount === 1 ? "" : "s"} as active. Previously archived accounts
          will return to your working list. Existing archive notes will be kept for
          reference.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Updating..." : "Mark as active"}
          </button>
        </div>
      </div>
    </div>
  );
}
