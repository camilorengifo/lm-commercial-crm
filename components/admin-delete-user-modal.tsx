"use client";

import { useEffect, useMemo } from "react";
import type { AdminUserListItem } from "@/lib/adminUserManagement";

export interface AdminDeleteUserAssignee {
  userId: string;
  name: string;
  email: string;
}

type DeleteStep = "options" | "confirm";

export function AdminDeleteUserModal({
  open,
  targetUser,
  assignableOwners,
  step,
  reassignToUserId,
  confirmText,
  submitting,
  error,
  onReassignToUserIdChange,
  onConfirmTextChange,
  onCancel,
  onReassignRecords,
  onDeactivateUser,
  onDeleteAnyway,
  onConfirmDelete,
}: {
  open: boolean;
  targetUser: AdminUserListItem | null;
  assignableOwners: AdminDeleteUserAssignee[];
  step: DeleteStep;
  reassignToUserId: string;
  confirmText: string;
  submitting: boolean;
  error: string | null;
  onReassignToUserIdChange: (userId: string) => void;
  onConfirmTextChange: (text: string) => void;
  onCancel: () => void;
  onReassignRecords: () => void;
  onDeactivateUser: () => void;
  onDeleteAnyway: () => void;
  onConfirmDelete: () => void;
}) {
  const targetLabel = useMemo(() => {
    if (!targetUser) return "this user";
    const name = targetUser.fullName?.trim() || targetUser.email;
    return `${name} (${targetUser.email})`;
  }, [targetUser]);

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

  if (!open || !targetUser) return null;

  const confirmDeleteEnabled =
    confirmText === "DELETE" &&
    reassignToUserId.length > 0 &&
    !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
      >
        {step === "options" ? (
          <>
            <h2
              id="delete-user-title"
              className="text-lg font-semibold text-zinc-900"
            >
              Remove user access
            </h2>

            <p className="mt-2 text-sm text-zinc-700">
              This user owns CRM records. Deleting this user may affect
              companies, follow-ups, opportunities, activities, and historical
              records. Are you sure you want to proceed?
            </p>

            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This user owns CRM records. You can reassign, deactivate, or
              proceed with deletion after confirmation.
            </p>

            <div className="mt-4">
              <label
                htmlFor="delete-user-reassign-target"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
              >
                Reassign records to
              </label>
              <select
                id="delete-user-reassign-target"
                value={reassignToUserId}
                onChange={(event) =>
                  onReassignToUserIdChange(event.target.value)
                }
                disabled={submitting}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select a broker or admin...</option>
                {assignableOwners.map((owner) => (
                  <option key={owner.userId} value={owner.userId}>
                    {owner.name} ({owner.email})
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={onReassignRecords}
                disabled={submitting || !reassignToUserId}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Working..." : "Reassign records"}
              </button>

              <button
                type="button"
                onClick={onDeactivateUser}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Working..." : "Deactivate user"}
              </button>

              <button
                type="button"
                onClick={onDeleteAnyway}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete anyway
              </button>

              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2
              id="delete-user-title"
              className="text-lg font-semibold text-zinc-900"
            >
              Confirm deletion
            </h2>

            <p className="mt-2 text-sm text-zinc-700">
              You are about to permanently remove access for {targetLabel}.
              CRM records will be reassigned before deletion. This cannot be
              undone.
            </p>

            <div className="mt-4">
              <label
                htmlFor="delete-user-reassign-target-confirm"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
              >
                Reassign records to
              </label>
              <select
                id="delete-user-reassign-target-confirm"
                value={reassignToUserId}
                onChange={(event) =>
                  onReassignToUserIdChange(event.target.value)
                }
                disabled={submitting}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select a broker or admin...</option>
                {assignableOwners.map((owner) => (
                  <option key={owner.userId} value={owner.userId}>
                    {owner.name} ({owner.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label
                htmlFor="delete-user-confirm-text"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
              >
                Type DELETE to confirm
              </label>
              <input
                id="delete-user-confirm-text"
                type="text"
                value={confirmText}
                onChange={(event) => onConfirmTextChange(event.target.value)}
                disabled={submitting}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={!confirmDeleteEnabled}
                className="inline-flex items-center justify-center rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Removing..." : "Confirm delete"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
