"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  SUPER_ADMIN_DELETE_CONFIRM_TEXT,
  superAdminBulkDeleteCompaniesRequest,
  type SuperAdminDeleteScope,
} from "@/lib/adminSuperAdminClient";

export function AdminSuperAdminBulkDeleteModal({
  open,
  scope,
  companyCount,
  companyIds,
  onClose,
  onCompleted,
}: {
  open: boolean;
  scope: SuperAdminDeleteScope;
  companyCount: number;
  companyIds: string[];
  onClose: () => void;
  onCompleted: (result: { deleted: number; message: string }) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setConfirmText("");
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

  const scopeLabel =
    scope === "filtered"
      ? `all ${companyCount.toLocaleString()} companies matching the current filters`
      : `${companyCount} selected compan${companyCount === 1 ? "y" : "ies"}`;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: requestError } = await superAdminBulkDeleteCompaniesRequest({
      companyIds,
      reason: reason.trim(),
      confirmText: confirmText.trim(),
    });

    setSubmitting(false);

    if (requestError || !data) {
      setError(requestError ?? "Unable to delete companies.");
      return;
    }

    onCompleted({ deleted: data.deleted, message: data.message });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-red-900">
          Delete companies (super admin)
        </h2>
        <p className="mt-2 text-sm text-zinc-700">
          You are about to soft-delete {scopeLabel}. Deleted companies are hidden
          from active oversight and broker working lists, but remain recoverable
          via restore where supported.
        </p>
        <p className="mt-2 text-sm font-medium text-red-800">
          This action is restricted to super administrators only.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="super-admin-delete-reason"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Deletion reason
            </label>
            <textarea
              id="super-admin-delete-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="Why are these companies being deleted?"
            />
          </div>

          <div>
            <label
              htmlFor="super-admin-delete-confirm"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Type <span className="font-mono">{SUPER_ADMIN_DELETE_CONFIRM_TEXT}</span> to
              confirm
            </label>
            <input
              id="super-admin-delete-confirm"
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              autoComplete="off"
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
              disabled={
                submitting ||
                !reason.trim() ||
                confirmText.trim() !== SUPER_ADMIN_DELETE_CONFIRM_TEXT
              }
              className="inline-flex items-center justify-center rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Deleting..." : "Delete companies"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
