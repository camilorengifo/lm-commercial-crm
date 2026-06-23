"use client";

import { useState } from "react";
import { AiOutputSections } from "@/components/ai-output-sections";
import { fetchAccountSummary } from "@/lib/aiClient";
import type { AccountSummaryResponse } from "@/lib/aiPrompts";

export function AiAccountSummarySection({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AccountSummaryResponse | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    const { data, error: requestError } = await fetchAccountSummary(companyId);

    if (requestError || !data) {
      setError(requestError ?? "Unable to generate account summary.");
      setLoading(false);
      return;
    }

    setSummary(data.summary);
    setLoading(false);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900">
            AI Account Summary
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Account-level insights for {companyName}, based on contacts,
            timeline, follow-ups, and load opportunities.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate Account Summary"}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-sm text-zinc-500">
          Analyzing account data and generating summary...
        </p>
      )}

      {!loading && summary && (
        <div className="space-y-5 border-t border-zinc-100 pt-5">
          <p className="text-xs text-zinc-500">
            Generated from CRM records for this company. Suggestions do not
            automatically create follow-ups or activities.
          </p>

          <AiOutputSections
            sections={[
              {
                title: "Account Summary",
                items: summary.accountSummary,
                emptyMessage:
                  "Not enough CRM data to summarize this account yet.",
              },
              {
                title: "Next Best Action",
                items: summary.nextBestAction,
                emptyMessage:
                  "No next action identified from the current account data.",
              },
              {
                title: "Risks",
                items: summary.risks,
                emptyMessage:
                  "No specific risks identified from the current account data.",
              },
              {
                title: "Opportunity Notes",
                items: summary.opportunityNotes,
                emptyMessage:
                  "No load opportunity notes available for this account.",
              },
              {
                title: "Suggested Follow-up",
                items: summary.suggestedFollowUp,
                emptyMessage:
                  "No follow-up timing suggestion available from the current data.",
              },
            ]}
          />
        </div>
      )}

      {!loading && !summary && !error && (
        <p className="text-sm text-zinc-500">
          Click Generate Account Summary for a concise read on this account and
          what to do next.
        </p>
      )}
    </section>
  );
}
