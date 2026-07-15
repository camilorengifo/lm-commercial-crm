"use client";

import { useEffect } from "react";

export interface BulkEditChangeSummary {
  label: string;
  value: string;
}

export function CompaniesBulkEditConfirmModal({
  open,
  selectedCount,
  changes,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  selectedCount: number;
  changes: BulkEditChangeSummary[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-edit-confirm-title"
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
      >
        <h2
          id="bulk-edit-confirm-title"
          className="text-lg font-semibold text-zinc-900"
        >
          Update selected companies?
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          You are about to update {selectedCount} compan
          {selectedCount === 1 ? "y" : "ies"}.
        </p>

        {changes.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
            {changes.map((change) => (
              <li key={change.label}>
                <span className="font-medium text-zinc-900">{change.label}</span>
                {" → "}
                {change.value}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="crm-btn-secondary crm-btn-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || changes.length === 0}
            className="crm-btn-primary crm-btn-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Updating…" : "Update companies"}
          </button>
        </div>
      </div>
    </div>
  );
}
