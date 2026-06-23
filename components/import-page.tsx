"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { formatSupabaseError } from "@/lib/crmFormat";
import {
  IMPORT_FIELD_DEFINITIONS,
  type ColumnMapping,
  type ImportFieldKey,
  type ImportPreview,
  type ImportResult,
  type MappedImportRow,
  type RawImportRow,
  autoDetectMapping,
  buildImportPreview,
  executeSpreadsheetImport,
  fetchExistingImportData,
  mapImportRows,
  normalizeCompanyName,
  parseSpreadsheetFile,
} from "@/lib/spreadsheetImport";
import { supabase } from "@/lib/supabaseClient";

const ACCEPTED_FILE_TYPES = ".xlsx,.csv";

type ImportStep = "upload" | "mapping" | "preview" | "complete";

function SummaryStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "success" | "warning" | "danger";
}) {
  const highlightClass =
    highlight === "success"
      ? "border-emerald-200 bg-emerald-50/50"
      : highlight === "warning"
        ? "border-amber-200 bg-amber-50/50"
        : highlight === "danger"
          ? "border-red-200 bg-red-50/50"
          : "border-zinc-200 bg-zinc-50";

  return (
    <div className={`rounded-lg border px-4 py-3 ${highlightClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function PreviewRow({ row }: { row: MappedImportRow }) {
  const contactLabel = row.resolvedFirstName
    ? [row.resolvedFirstName, row.resolvedLastName].filter(Boolean).join(" ")
    : "—";

  return (
    <tr className={row.isValid ? "bg-white" : "bg-red-50/40"}>
      <td className="px-3 py-2 text-sm text-zinc-600">{row.rowNumber}</td>
      <td className="px-3 py-2 text-sm font-medium text-zinc-900">
        {row.companyName || "—"}
      </td>
      <td className="px-3 py-2 text-sm text-zinc-700">{contactLabel}</td>
      <td className="px-3 py-2 text-sm text-zinc-700">{row.email || "—"}</td>
      <td className="px-3 py-2 text-sm text-zinc-700">{row.city || "—"}</td>
      <td className="px-3 py-2 text-sm text-zinc-700">
        {row.salesStage || "—"}
      </td>
      <td className="px-3 py-2 text-sm text-zinc-600">
        {row.isValid ? "Ready" : row.skipReason || "Skipped"}
      </td>
    </tr>
  );
}

export function ImportPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawImportRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(() =>
    Object.fromEntries(
      IMPORT_FIELD_DEFINITIONS.map((field) => [field.key, null]),
    ) as ColumnMapping,
  );
  const [existingCompanyNames, setExistingCompanyNames] = useState<Set<string>>(
    new Set(),
  );

  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const loadExistingCompanies = useCallback(async (userId: string) => {
    const { companies, error } = await fetchExistingImportData(userId);

    if (error) {
      setPageError(formatSupabaseError(error));
      return;
    }

    setExistingCompanyNames(
      new Set(companies.map((company) => normalizeCompanyName(company.name))),
    );
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      loadExistingCompanies(session.user.id).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      loadExistingCompanies(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [router, loadExistingCompanies]);

  const mappedRows = useMemo(
    () => mapImportRows(rawRows, mapping),
    [rawRows, mapping],
  );

  const preview = useMemo<ImportPreview | null>(() => {
    if (rawRows.length === 0) return null;
    return buildImportPreview(mappedRows, existingCompanyNames);
  }, [mappedRows, rawRows.length, existingCompanyNames]);

  const mappingIsValid = Boolean(mapping.company_name);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "xlsx" && extension !== "csv") {
      setParseError("Please upload a .xlsx or .csv file.");
      return;
    }

    setParsing(true);
    setParseError(null);
    setImportResult(null);
    setStep("upload");

    const { headers: parsedHeaders, rows, error } = await parseSpreadsheetFile(file);

    if (error) {
      setParseError(error);
      setParsing(false);
      return;
    }

    const detectedMapping = autoDetectMapping(parsedHeaders);

    setFileName(file.name);
    setHeaders(parsedHeaders);
    setRawRows(rows);
    setMapping(detectedMapping);
    setStep("mapping");
    setParsing(false);
  }

  function updateMapping(field: ImportFieldKey, column: string | null) {
    setMapping((prev) => ({
      ...prev,
      [field]: column || null,
    }));
    setImportResult(null);
  }

  function handleReviewPreview() {
    if (!mappingIsValid) {
      setParseError("Map the Company name column before continuing.");
      return;
    }

    setParseError(null);
    setStep("preview");
  }

  async function handleImport() {
    if (!user || !preview || !mappingIsValid) return;

    const confirmed = window.confirm(
      `Import ${preview.companiesToCreate} new companies and up to ${preview.contactsToCreate} contacts from ${preview.totalRows} rows?`,
    );

    if (!confirmed) return;

    setImporting(true);
    setParseError(null);

    const { companies, contacts, error } = await fetchExistingImportData(
      user.id,
    );

    if (error) {
      setParseError(formatSupabaseError(error));
      setImporting(false);
      return;
    }

    const result = await executeSpreadsheetImport(
      user.id,
      mappedRows,
      companies,
      contacts,
    );

    setImportResult(result);
    setStep("complete");
    await loadExistingCompanies(user.id);
    setImporting(false);
  }

  function resetImport() {
    setStep("upload");
    setFileName(null);
    setHeaders([]);
    setRawRows([]);
    setMapping(
      Object.fromEntries(
        IMPORT_FIELD_DEFINITIONS.map((field) => [field.key, null]),
      ) as ColumnMapping,
    );
    setParseError(null);
    setImportResult(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AuthenticatedLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Import Spreadsheet
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Use this tool to migrate your existing broker spreadsheet into the
          CRM. After importing, manage your accounts directly in the CRM.
        </p>
      </div>

      {pageError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </p>
      )}

      {parseError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {parseError}
        </p>
      )}

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-zinc-900">1. Upload file</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Upload a one-time .xlsx or .csv export from your current prospect list.
        </p>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800">
            {parsing ? "Reading file..." : "Choose file"}
            <input
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileChange}
              disabled={parsing || importing}
              className="hidden"
            />
          </label>

          {fileName && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium">Selected:</span> {fileName} (
              {rawRows.length} rows)
            </p>
          )}
        </div>
      </section>

      {step !== "upload" && headers.length > 0 && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">2. Map columns</h2>
          <p className="mt-1 text-sm text-zinc-500">
            We auto-detected common column names. Adjust the mapping if needed.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {IMPORT_FIELD_DEFINITIONS.map((field) => (
              <div key={field.key}>
                <label
                  htmlFor={`mapping-${field.key}`}
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                >
                  {field.label}
                  {field.key === "company_name" && (
                    <span className="ml-1 text-red-600">*</span>
                  )}
                </label>
                <select
                  id={`mapping-${field.key}`}
                  value={mapping[field.key] ?? ""}
                  onChange={(event) =>
                    updateMapping(field.key, event.target.value || null)
                  }
                  disabled={importing || step === "complete"}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {step === "mapping" && (
            <div className="mt-5">
              <button
                type="button"
                onClick={handleReviewPreview}
                disabled={!mappingIsValid || parsing}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Review preview
              </button>
            </div>
          )}
        </section>
      )}

      {preview && (step === "preview" || step === "complete") && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">3. Preview</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Review what will be imported before creating records in the CRM.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryStat label="Total rows" value={preview.totalRows} />
            <SummaryStat
              label="Rows with company name"
              value={preview.rowsWithCompanyName}
            />
            <SummaryStat
              label="Rows missing company name"
              value={preview.rowsMissingCompanyName}
              highlight={
                preview.rowsMissingCompanyName > 0 ? "warning" : undefined
              }
            />
            <SummaryStat
              label="Possible file duplicates"
              value={preview.fileDuplicateCompanies}
              highlight={
                preview.fileDuplicateCompanies > 0 ? "warning" : undefined
              }
            />
            <SummaryStat
              label="Companies to create"
              value={preview.companiesToCreate}
              highlight="success"
            />
            <SummaryStat
              label="Existing companies matched"
              value={preview.companiesExisting}
            />
            <SummaryStat
              label="Contacts to create"
              value={preview.contactsToCreate}
            />
            <SummaryStat
              label="Invalid rows"
              value={preview.invalidRows}
              highlight={preview.invalidRows > 0 ? "danger" : undefined}
            />
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Row
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Company
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Contact
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    City
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Sales stage
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {preview.sampleRows.map((row) => (
                  <PreviewRow key={row.rowNumber} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          {preview.totalRows > preview.sampleRows.length && (
            <p className="mt-3 text-sm text-zinc-500">
              Showing the first {preview.sampleRows.length} of {preview.totalRows}{" "}
              rows.
            </p>
          )}

          {step === "preview" && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || preview.rowsWithCompanyName === 0}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importing ? "Importing..." : "Run import"}
              </button>
              <button
                type="button"
                onClick={() => setStep("mapping")}
                disabled={importing}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Back to mapping
              </button>
            </div>
          )}
        </section>
      )}

      {importResult && step === "complete" && (
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">4. Import summary</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Your spreadsheet data has been processed. Review the results below.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryStat
              label="Companies created"
              value={importResult.companiesCreated}
              highlight="success"
            />
            <SummaryStat
              label="Duplicate companies skipped"
              value={importResult.companiesSkippedDuplicate}
            />
            <SummaryStat
              label="Existing companies updated"
              value={importResult.companiesUpdated}
            />
            <SummaryStat
              label="Contacts created"
              value={importResult.contactsCreated}
              highlight="success"
            />
            <SummaryStat
              label="Duplicate contacts skipped"
              value={importResult.contactsSkippedDuplicate}
            />
            <SummaryStat
              label="Rows skipped"
              value={importResult.rowsSkipped}
              highlight={
                importResult.rowsSkipped > 0 ? "warning" : undefined
              }
            />
          </div>

          {importResult.errors.length > 0 && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">Errors</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                {importResult.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/companies"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              View companies
            </Link>
            <button
              type="button"
              onClick={resetImport}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Import another file
            </button>
          </div>
        </section>
      )}
    </AuthenticatedLayout>
  );
}
