"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  DETAIL_ACCOUNT_DISPOSITIONS,
  accountDispositionBadgeClass,
  accountStatusBadgeClass,
  buildAccountStatusSavePayload,
  getAccountDispositionLabel,
  normalizeAccountStatus,
  normalizeCompanyAccountStatusFields,
  type AccountDisposition,
  type AccountStatus,
  type CompanyAccountStatusFields,
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

function applyAccountStatusFields(
  fields: CompanyAccountStatusFields,
): {
  accountStatus: AccountStatus;
  disposition: string;
  archiveReason: string;
  archiveNotes: string;
} {
  return {
    accountStatus: fields.account_status,
    disposition: fields.account_disposition ?? "",
    archiveReason: fields.archive_reason ?? "",
    archiveNotes: fields.archive_notes ?? "",
  };
}

export function CompanyAccountStatusSection({
  company,
  canManage,
  onUpdated,
}: {
  company: AccountStatusCompany;
  canManage: boolean;
  onUpdated: (fields: CompanyAccountStatusFields) => void | Promise<void>;
}) {
  const currentFields = normalizeCompanyAccountStatusFields(company);
  const currentStatus = currentFields.account_status;
  const [accountStatus, setAccountStatus] = useState<AccountStatus>(currentStatus);
  const [disposition, setDisposition] = useState(currentFields.account_disposition ?? "");
  const [archiveReason, setArchiveReason] = useState(currentFields.archive_reason ?? "");
  const [archiveNotes, setArchiveNotes] = useState(currentFields.archive_notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const next = applyAccountStatusFields(normalizeCompanyAccountStatusFields(company));
    setAccountStatus(next.accountStatus);
    setDisposition(next.disposition);
    setArchiveReason(next.archiveReason);
    setArchiveNotes(next.archiveNotes);
  }, [
    company.id,
    company.account_status,
    company.account_disposition,
    company.archive_reason,
    company.archive_notes,
    company.archived_at,
  ]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const savePayload = buildAccountStatusSavePayload({
      accountStatus,
      disposition,
      archiveReason,
      archiveNotes,
    });

    try {
      const { data, error: requestError } = await updateCompanyAccountStatus({
        companyId: company.id,
        accountStatus,
        accountDisposition: savePayload.accountDisposition,
        archiveReason: savePayload.archiveReason,
        archiveNotes: savePayload.archiveNotes,
      });

      if (requestError || !data) {
        setError(requestError ?? "Unable to save account status.");
        return;
      }

      const savedFields = data.company
        ? normalizeCompanyAccountStatusFields(data.company)
        : normalizeCompanyAccountStatusFields({
            account_status: accountStatus,
            account_disposition: savePayload.accountDisposition,
            archive_reason: savePayload.archiveReason,
            archive_notes: savePayload.archiveNotes,
            archived_at:
              accountStatus === "archived" ? new Date().toISOString() : null,
            archived_by: accountStatus === "archived" ? company.archived_by ?? null : null,
          });

      const next = applyAccountStatusFields(savedFields);
      setAccountStatus(next.accountStatus);
      setDisposition(next.disposition);
      setArchiveReason(next.archiveReason);
      setArchiveNotes(next.archiveNotes);
      setSuccess(data.message);

      await onUpdated(savedFields);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Unable to save account status.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const dispositionLabel = getAccountDispositionLabel(currentFields.account_disposition);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="crm-section-title">Account status</h2>
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
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${accountDispositionBadgeClass(currentFields.account_disposition ?? "")}`}
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
          {currentFields.archive_reason && (
            <p className="mt-2">
              <span className="font-medium">Reason:</span>{" "}
              {getAccountDispositionLabel(currentFields.archive_reason) ??
                currentFields.archive_reason}
            </p>
          )}
          {currentFields.archive_notes && (
            <p className="mt-1 whitespace-pre-wrap">
              <span className="font-medium">Notes:</span> {currentFields.archive_notes}
            </p>
          )}
        </div>
      )}

      {currentStatus !== "archived" && currentFields.archive_notes && (
        <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          <p className="font-medium text-zinc-800">Previous archive notes</p>
          {currentFields.archive_reason && (
            <p className="mt-1">
              <span className="font-medium">Reason:</span>{" "}
              {getAccountDispositionLabel(currentFields.archive_reason) ??
                currentFields.archive_reason}
            </p>
          )}
          <p className="mt-1 whitespace-pre-wrap">{currentFields.archive_notes}</p>
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
                {DETAIL_ACCOUNT_DISPOSITIONS.map((option) => (
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
                  Archive reason (optional)
                </label>
                <input
                  id="account-archive-reason"
                  value={archiveReason}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                  placeholder="Additional reason if not covered by disposition"
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
                  placeholder="Optional notes about why this account is being archived."
                />
              </div>
            </>
          )}

          {accountStatus === "paused" && (
            <div>
              <label
                htmlFor="account-pause-notes"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
              >
                Notes
              </label>
              <textarea
                id="account-pause-notes"
                rows={3}
                value={archiveNotes}
                onChange={(event) => setArchiveNotes(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="Optional notes about why this account is being paused."
              />
            </div>
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
