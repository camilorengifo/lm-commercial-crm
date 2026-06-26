"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ACCOUNT_DISPOSITIONS,
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  accountDispositionBadgeClass,
  accountStatusBadgeClass,
  getAccountDispositionLabel,
  normalizeAccountStatus,
  type AccountDisposition,
  type AccountStatus,
} from "@/lib/accountStatus";
import { updateCompanyAccountStatus } from "@/lib/companyClient";
import type { CompanyRecord } from "@/lib/companies";
import { formatDate, formatDateTime } from "@/lib/crmFormat";

interface AccountStatusCompany extends CompanyRecord {
  account_status?: AccountStatus | string | null;
  account_disposition?: AccountDisposition | string | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  archive_notes?: string | null;
}

export function CompanyAccountStatusSection({
  company,
  canManage,
  onUpdated,
}: {
  company: AccountStatusCompany;
  canManage: boolean;
  onUpdated: () => void;
}) {
  const currentStatus = normalizeAccountStatus(company.account_status);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>(currentStatus);
  const [disposition, setDisposition] = useState(
    company.account_disposition ?? "",
  );
  const [archiveReason, setArchiveReason] = useState(company.archive_reason ?? "");
  const [archiveNotes, setArchiveNotes] = useState(company.archive_notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setAccountStatus(normalizeAccountStatus(company.account_status));
    setDisposition(company.account_disposition ?? "");
    setArchiveReason(company.archive_reason ?? "");
    setArchiveNotes(company.archive_notes ?? "");
    setError(null);
    setSuccess(null);
  }, [company]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { data, error: requestError } = await updateCompanyAccountStatus({
      companyId: company.id,
      accountStatus,
      accountDisposition: disposition.trim() || null,
      archiveReason:
        accountStatus === "archived" ? archiveReason.trim() || null : null,
      archiveNotes:
        accountStatus === "archived" ? archiveNotes.trim() || null : null,
    });

    setSubmitting(false);

    if (requestError || !data) {
      setError(requestError ?? "Unable to save account status.");
      return;
    }

    setSuccess(data.message);
    onUpdated();
  }

  const dispositionLabel = getAccountDispositionLabel(company.account_disposition);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-zinc-900">Account status</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Classify and archive accounts you are not actively pursuing
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${accountStatusBadgeClass(currentStatus)}`}
          >
            {ACCOUNT_STATUS_LABELS[currentStatus]}
          </span>
          {dispositionLabel && (
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${accountDispositionBadgeClass(company.account_disposition ?? "")}`}
            >
              {dispositionLabel}
            </span>
          )}
        </div>
      </div>

      {currentStatus === "archived" && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>This account is archived and hidden from your default working list.</p>
          {company.archived_at && (
            <p className="mt-1 text-xs text-amber-800">
              Archived on {formatDateTime(company.archived_at)}
            </p>
          )}
          {company.archive_reason && (
            <p className="mt-2">
              <span className="font-medium">Reason:</span> {company.archive_reason}
            </p>
          )}
          {company.archive_notes && (
            <p className="mt-1 whitespace-pre-wrap">
              <span className="font-medium">Notes:</span> {company.archive_notes}
            </p>
          )}
        </div>
      )}

      {currentStatus !== "archived" && company.archive_notes && (
        <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          <p className="font-medium text-zinc-800">Previous archive notes</p>
          {company.archive_reason && (
            <p className="mt-1">
              <span className="font-medium">Reason:</span> {company.archive_reason}
            </p>
          )}
          <p className="mt-1 whitespace-pre-wrap">{company.archive_notes}</p>
          {company.archived_at && (
            <p className="mt-2 text-xs text-zinc-500">
              Last archived {formatDate(company.archived_at)}
            </p>
          )}
        </div>
      )}

      {canManage ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="account-status"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
              >
                Account status
              </label>
              <select
                id="account-status"
                value={accountStatus}
                onChange={(event) =>
                  setAccountStatus(event.target.value as AccountStatus)
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                {ACCOUNT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ACCOUNT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="account-disposition"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
              >
                Disposition
              </label>
              <select
                id="account-disposition"
                value={disposition}
                onChange={(event) => setDisposition(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                <option value="">None</option>
                {ACCOUNT_DISPOSITIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {accountStatus === "archived" && (
            <>
              <div>
                <label
                  htmlFor="account-archive-reason"
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                >
                  Archive reason
                </label>
                <input
                  id="account-archive-reason"
                  value={archiveReason}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  placeholder="Why are you archiving this account?"
                />
              </div>

              <div>
                <label
                  htmlFor="account-archive-notes"
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                >
                  Archive notes
                </label>
                <textarea
                  id="account-archive-notes"
                  rows={3}
                  value={archiveNotes}
                  onChange={(event) => setArchiveNotes(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  placeholder="Additional notes for future reference"
                />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save account status"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-zinc-500">
          Account status can be updated when the company is active.
        </p>
      )}
    </section>
  );
}
