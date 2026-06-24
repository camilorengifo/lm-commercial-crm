"use client";

import { useState } from "react";
import { AiOutputSections } from "@/components/ai-output-sections";
import { fetchBrokerRecommendations } from "@/lib/aiClient";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";
import type { BrokerRecommendationsResponse } from "@/lib/aiPrompts";

export function AiBrokerAssistantSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] =
    useState<BrokerRecommendationsResponse | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    const { data, error: requestError } = await fetchBrokerRecommendations();

    if (requestError || !data) {
      setError(requestError ?? AI_CLIENT_ERROR_MESSAGE);
      setLoading(false);
      return;
    }

    setRecommendations(data.recommendations);
    setGeneratedAt(data.generatedAt);
    setLoading(false);
  }

  return (
    <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900">
            AI Broker Assistant
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Practical recommendations based on your CRM data — follow-ups,
            accounts, and load opportunities.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate AI Recommendations"}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-sm text-zinc-500">
          Analyzing your CRM data and generating recommendations...
        </p>
      )}

      {!loading && recommendations && (
        <div className="space-y-5 border-t border-zinc-100 pt-5">
          {generatedAt && (
            <p className="text-xs text-zinc-500">
              Generated from your CRM data. Recommendations are suggestions only
              and do not change your records.
            </p>
          )}

          <AiOutputSections
            sections={[
              {
                title: "Top Priorities",
                items: recommendations.topPriorities,
                emptyMessage:
                  "No top priorities identified from the current CRM data.",
              },
              {
                title: "Accounts at Risk",
                items: recommendations.accountsAtRisk,
                emptyMessage:
                  "No accounts at risk identified from the current CRM data.",
              },
              {
                title: "Follow-up Suggestions",
                items: recommendations.followUpSuggestions,
                emptyMessage:
                  "No follow-up suggestions available from the current CRM data.",
              },
              {
                title: "Opportunity Suggestions",
                items: recommendations.opportunitySuggestions,
                emptyMessage:
                  "No opportunity suggestions available from the current CRM data.",
              },
              {
                title: "General Coaching",
                items: recommendations.generalCoaching,
                emptyMessage:
                  "No coaching notes available from the current CRM data.",
              },
            ]}
          />
        </div>
      )}

      {!loading && !recommendations && !error && (
        <p className="text-sm text-zinc-500">
          Click Generate AI Recommendations to analyze your pipeline, follow-ups,
          and load opportunities.
        </p>
      )}
    </section>
  );
}
