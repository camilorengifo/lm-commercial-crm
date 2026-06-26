"use client";

import { useEffect, useMemo } from "react";
import type { AdminCompaniesBrokerOption } from "@/lib/adminCompanies";
import type { AdminCompanyOversightRow } from "@/lib/adminCompanies";
import { getProfileDisplayName, type UserProfile } from "@/lib/userProfile";

export function AdminReassignCompaniesModal({
  open,
  selectedCompanies,
  assignableOwners,
  targetBrokerId,
  submitting,
  error,
  onTargetBrokerChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  selectedCompanies: AdminCompanyOversightRow[];
  assignableOwners: AdminCompaniesBrokerOption[];
  targetBrokerId: string;
  submitting: boolean;
  error: string | null;
  onTargetBrokerChange: (userId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const currentOwnerSummary = useMemo(() => {
    if (selectedCompanies.length === 0) return null;

    const uniqueOwners = new Map<
      string,
      { name: string; email: string; userId: string }
    >();
    for (const company of selectedCompanies) {
      uniqueOwners.set(company.brokerUserId, {
        name: company.brokerName,
        email: company.brokerEmail,
        userId: company.brokerUserId,
      });
    }

    if (uniqueOwners.size === 1) {
      const owner = Array.from(uniqueOwners.values())[0];
      return `${owner.email} (${owner.name}) · ${owner.userId}`;
    }

    return `${uniqueOwners.size} different owners`;
  }, [selectedCompanies]);

  const targetOwner = assignableOwners.find(
    (owner) => owner.userId === targetBrokerId,
  );

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

  const allAlreadyAssigned =
    targetBrokerId.length > 0 &&
    selectedCompanies.every(
      (company) => company.brokerUserId === targetBrokerId,
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reassign-companies-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
      >
        <h2
          id="reassign-companies-title"
          className="text-lg font-semibold text-zinc-900"
        >
          Reassign company owner
        </h2>

        <p className="mt-2 text-sm text-zinc-600">
          {selectedCompanies.length} compan
          {selectedCompanies.length === 1 ? "y" : "ies"} selected. This updates{" "}
          <span className="font-medium">companies.user_id</span> and moves
          contacts, activities, follow-ups, and opportunities to the new broker.
          Nothing is deleted.
        </p>

        {currentOwnerSummary && (
          <p className="mt-3 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Current owner: </span>
            {currentOwnerSummary}
          </p>
        )}

        <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-xs">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-zinc-600">
                  Company
                </th>
                <th className="px-3 py-2 text-left font-medium text-zinc-600">
                  Owner email
                </th>
                <th className="px-3 py-2 text-left font-medium text-zinc-600">
                  companies.user_id
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {selectedCompanies.map((company) => (
                <tr key={company.companyId}>
                  <td className="px-3 py-2 text-zinc-900">{company.companyName}</td>
                  <td className="px-3 py-2 text-zinc-700">{company.brokerEmail}</td>
                  <td className="px-3 py-2 font-mono text-zinc-600 break-all">
                    {company.brokerUserId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <label
            htmlFor="target-broker"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            New owner broker
          </label>
          <select
            id="target-broker"
            value={targetBrokerId}
            onChange={(event) => onTargetBrokerChange(event.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select a broker...</option>
            {assignableOwners.map((owner) => (
              <option key={owner.userId} value={owner.userId}>
                {owner.email} — {owner.name}
              </option>
            ))}
          </select>
          {targetOwner && (
            <p className="mt-2 font-mono text-xs text-zinc-500">
              New companies.user_id: {targetOwner.userId}
            </p>
          )}
        </div>

        <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          After reassignment, only{" "}
          {targetOwner ? (
            <span className="font-medium text-zinc-900">{targetOwner.email}</span>
          ) : (
            "the selected broker"
          )}{" "}
          will see these companies on <span className="font-medium">/companies</span>.
          The previous owner will lose access immediately.
        </p>

        {allAlreadyAssigned && (
          <p className="mt-3 text-sm text-amber-700">
            All selected companies already belong to this broker.
          </p>
        )}

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
            onClick={onConfirm}
            disabled={
              submitting || !targetBrokerId || allAlreadyAssigned
            }
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Reassigning..." : "Reassign owner"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function buildAssignableOwnersFromProfiles(
  profiles: UserProfile[],
): AdminCompaniesBrokerOption[] {
  return profiles
    .filter(
      (profile) =>
        profile.is_active !== false &&
        (profile.role === "broker" || profile.role === "admin"),
    )
    .map((profile) => ({
      userId: profile.id,
      name: getProfileDisplayName(profile),
      email: profile.email ?? "—",
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
