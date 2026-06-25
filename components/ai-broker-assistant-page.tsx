"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { AiOutputSections } from "@/components/ai-output-sections";
import {
  fetchAccountOutreachDraft,
  fetchBrokerActionPlan,
} from "@/lib/aiClient";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";
import type {
  AccountOutreachQuickResponse,
  BrokerActionPlanResponse,
} from "@/lib/aiPrompts";
import {
  fetchBrokerAssistantSnapshot,
  type BrokerAssistantSnapshot,
  type PrioritizedAccount,
} from "@/lib/brokerAssistant";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import { formatPipelineValue } from "@/lib/brokerProductivity";
import { supabase } from "@/lib/supabaseClient";

function FocusCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "warning" | "danger";
}) {
  const highlightClass =
    highlight === "danger"
      ? "border-red-200 bg-red-50/50"
      : highlight === "warning"
        ? "border-amber-200 bg-amber-50/50"
        : "border-zinc-200 bg-white";

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${highlightClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function AccountDraftPanel({
  companyId,
  companyName,
  autoOpen,
}: {
  companyId: string;
  companyName: string;
  autoOpen?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountOutreachQuickResponse | null>(null);
  const [open, setOpen] = useState(Boolean(autoOpen));

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOpen(true);

    const { data, error: requestError } = await fetchAccountOutreachDraft(
      companyId,
    );

    if (requestError || !data) {
      setError(requestError ?? AI_CLIENT_ERROR_MESSAGE);
      setLoading(false);
      return;
    }

    setDraft(data.draft);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (autoOpen) {
      void handleGenerate();
    }
  }, [autoOpen, handleGenerate]);

  return (
    <div className="mt-4 border-t border-zinc-100 pt-4">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Generating draft..." : "Draft outreach"}
      </button>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {open && draft && !loading && (
        <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
          <p className="text-xs text-zinc-500">
            Draft for {companyName}. Review and edit before sending manually.
          </p>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Email subject</h4>
            <p className="mt-1 text-sm text-zinc-700">{draft.suggestedEmailSubject}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Email body</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
              {draft.suggestedEmailBody}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">LinkedIn message</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
              {draft.linkedInMessage}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Call opener</h4>
            <p className="mt-1 text-sm text-zinc-700">{draft.callOpener}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Follow-up reason</h4>
            <p className="mt-1 text-sm text-zinc-700">{draft.followUpReason}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PrioritizedAccountCard({
  account,
  draftCompanyId,
}: {
  account: PrioritizedAccount;
  draftCompanyId: string | null;
}) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-900">
              {account.companyName}
            </h3>
            <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
              Score {account.priorityScore}
            </span>
          </div>
          <p className="text-sm text-zinc-600">
            {account.priorityReasons.join(" · ")}
          </p>
          <p className="text-sm font-medium text-zinc-800">
            {account.recommendedAction}
          </p>
        </div>

        <Link
          href={`/companies/${account.companyId}`}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Open company
        </Link>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Last activity
          </dt>
          <dd className="mt-0.5 text-zinc-800">
            {account.lastActivityAt
              ? formatDate(account.lastActivityAt)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Next follow-up
          </dt>
          <dd className="mt-0.5 text-zinc-800">
            {account.nextFollowUpAt
              ? formatDate(account.nextFollowUpAt)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Contacts
          </dt>
          <dd className="mt-0.5 text-zinc-800">{account.contactCount}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Open opportunities
          </dt>
          <dd className="mt-0.5 text-zinc-800">
            {account.openOpportunityCount}
            {account.openPipelineValue > 0
              ? ` · ${formatPipelineValue(account.openPipelineValue)}`
              : ""}
          </dd>
        </div>
      </dl>

      {account.dataQualityIssues.length > 0 && (
        <p className="mt-3 text-xs text-amber-800">
          Data gaps: {account.dataQualityIssues.join(", ")}
        </p>
      )}

      <AccountDraftPanel
        companyId={account.companyId}
        companyName={account.companyName}
        autoOpen={draftCompanyId === account.companyId}
      />
    </article>
  );
}

function ActionPlanResults({ plan }: { plan: BrokerActionPlanResponse }) {
  return (
    <div className="space-y-6">
      <AiOutputSections
        sections={[
          {
            title: "Daily summary",
            items: plan.dailySummary,
            emptyMessage: "No daily summary generated.",
          },
          {
            title: "Risk warnings",
            items: plan.riskWarnings,
            emptyMessage: "No risk warnings identified.",
          },
          {
            title: "Quick wins",
            items: plan.quickWins,
            emptyMessage: "No quick wins identified.",
          },
          {
            title: "Follow-up discipline",
            items: plan.followUpDisciplineReminders,
            emptyMessage: "No follow-up reminders generated.",
          },
        ]}
      />

      {plan.topAccountsToday.length > 0 && (
        <div className="space-y-4 border-t border-zinc-100 pt-5">
          <h3 className="text-sm font-semibold text-zinc-900">
            Top accounts — AI recommendations
          </h3>
          {plan.topAccountsToday.map((account) => (
            <div
              key={account.companyName}
              className="rounded-lg border border-zinc-200 p-4"
            >
              <h4 className="font-medium text-zinc-900">{account.companyName}</h4>
              <p className="mt-2 text-sm text-zinc-600">
                <span className="font-medium text-zinc-800">Why it matters: </span>
                {account.whyItMatters}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                <span className="font-medium text-zinc-800">Action: </span>
                {account.recommendedAction}
              </p>
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Email draft
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                  {account.emailDraft}
                </p>
              </div>
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Call opener
                </p>
                <p className="mt-1 text-sm text-zinc-700">{account.callOpener}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiBrokerAssistantPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftCompanyId = searchParams.get("company");

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BrokerAssistantSnapshot | null>(null);

  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<BrokerActionPlanResponse | null>(null);
  const [planGeneratedAt, setPlanGeneratedAt] = useState<string | null>(null);

  const loadSnapshot = useCallback(async (userId: string) => {
    setFetchError(null);

    try {
      const data = await fetchBrokerAssistantSnapshot(supabase, userId, 10);
      setSnapshot(data);
    } catch (error) {
      setFetchError(
        formatSupabaseError(
          error instanceof Error
            ? { message: error.message }
            : { message: "Unable to load assistant data." },
        ),
      );
      setSnapshot(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      void loadSnapshot(session.user.id).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      void loadSnapshot(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [loadSnapshot, router]);

  async function handleGeneratePlan() {
    setPlanLoading(true);
    setPlanError(null);

    const { data, error } = await fetchBrokerActionPlan();

    if (error || !data) {
      setPlanError(error ?? AI_CLIENT_ERROR_MESSAGE);
      setPlanLoading(false);
      return;
    }

    setPlan(data.plan);
    setPlanGeneratedAt(data.generatedAt);
    setPlanLoading(false);
  }

  if (loading) {
    return (
      <AuthenticatedLayout>
        <p className="text-sm text-zinc-500">Loading AI Broker Assistant...</p>
      </AuthenticatedLayout>
    );
  }

  if (!user) {
    return null;
  }

  const hasCrmData = snapshot?.hasCrmData ?? false;

  return (
    <AuthenticatedLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">AI Broker Assistant</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Daily account priorities, recommended actions, and outreach drafts based
          on your CRM data.
        </p>
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {!hasCrmData ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">No CRM data yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-500">
            Add companies, contacts, follow-ups, activities, and opportunities to
            unlock AI recommendations.
          </p>
          <Link
            href="/companies"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Add company
          </Link>
        </section>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-medium text-zinc-900">
              Today&apos;s focus
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <FocusCard
                label="Open follow-ups"
                value={snapshot?.focus.openFollowUps ?? 0}
              />
              <FocusCard
                label="Overdue follow-ups"
                value={snapshot?.focus.overdueFollowUps ?? 0}
                highlight={
                  (snapshot?.focus.overdueFollowUps ?? 0) > 0
                    ? "danger"
                    : undefined
                }
              />
              <FocusCard
                label="Due today"
                value={snapshot?.focus.dueTodayFollowUps ?? 0}
                highlight={
                  (snapshot?.focus.dueTodayFollowUps ?? 0) > 0
                    ? "warning"
                    : undefined
                }
              />
              <FocusCard
                label="Open opportunities"
                value={snapshot?.focus.openOpportunities ?? 0}
              />
              <FocusCard
                label="Accounts needing attention"
                value={snapshot?.focus.accountsNeedingAttention ?? 0}
                highlight={
                  (snapshot?.focus.accountsNeedingAttention ?? 0) > 0
                    ? "warning"
                    : undefined
                }
              />
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Last AI plan
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-900">
                  {planGeneratedAt
                    ? formatDateTime(planGeneratedAt)
                    : "Not generated yet"}
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-medium text-zinc-900">
                  Generate AI action plan
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Suggestions only — nothing is sent automatically. You decide what
                  to send.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGeneratePlan}
                disabled={planLoading}
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {planLoading ? "Generating..." : "Generate AI Action Plan"}
              </button>
            </div>

            {planError && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {planError}
              </p>
            )}

            {planLoading && (
              <p className="mt-4 text-sm text-zinc-500">
                Building your daily plan from prioritized accounts...
              </p>
            )}

            {plan && !planLoading && (
              <div className="mt-6 border-t border-zinc-100 pt-6">
                <p className="mb-4 text-xs text-zinc-500">
                  Generated from your CRM data. Drafts are suggestions for manual
                  review — no outreach is sent automatically.
                </p>
                <ActionPlanResults plan={plan} />
              </div>
            )}
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-lg font-medium text-zinc-900">
              Top accounts to work today
            </h2>
            <div className="space-y-4">
              {(snapshot?.topAccounts ?? []).map((account) => (
                <PrioritizedAccountCard
                  key={account.companyId}
                  account={account}
                  draftCompanyId={draftCompanyId}
                />
              ))}
            </div>
          </section>

          {(snapshot?.dataQualitySuggestions.length ?? 0) > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
              <h2 className="text-lg font-medium text-zinc-900">
                Data quality suggestions
              </h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-zinc-700">
                {snapshot?.dataQualitySuggestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AuthenticatedLayout>
  );
}
