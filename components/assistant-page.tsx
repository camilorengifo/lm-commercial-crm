"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { AiOutputSections } from "@/components/ai-output-sections";
import { fetchAssistantActionPlan } from "@/lib/assistantClient";
import { AI_CLIENT_ERROR_MESSAGE } from "@/lib/aiConstants";
import type { AssistantGenerateResponse } from "@/lib/aiPrompts";
import {
  fetchBrokerAssistantSnapshot,
  type BrokerAssistantSnapshot,
  type PrioritizedAccount,
} from "@/lib/brokerAssistant";
import { formatPipelineValue } from "@/lib/brokerProductivity";
import { priorityBadgeClass, type CompanyPriority } from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import {
  fetchAllProfiles,
  fetchUserProfile,
  getProfileDisplayName,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

function PriorityAccountCard({ account }: { account: PrioritizedAccount }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-zinc-900">{account.companyName}</h3>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(account.priority as CompanyPriority)}`}
            >
              {account.priority}
            </span>
            <span className="text-xs text-zinc-500">Score {account.priorityScore}</span>
          </div>
          <p className="text-sm text-zinc-600">{account.priorityReasons.join(" · ")}</p>
          <p className="text-sm font-medium text-zinc-800">{account.recommendedAction}</p>
          <dl className="grid gap-1 text-xs text-zinc-500 sm:grid-cols-3">
            <div>
              Last contact:{" "}
              {account.lastActivityAt ? formatDate(account.lastActivityAt) : "—"}
            </div>
            <div>
              Next follow-up:{" "}
              {account.nextFollowUpAt ? formatDate(account.nextFollowUpAt) : "—"}
            </div>
            <div>Open opportunities: {account.openOpportunityCount}</div>
          </dl>
        </div>
        <Link
          href={`/companies/${account.companyId}`}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Open company
        </Link>
      </div>
    </article>
  );
}

export function AssistantPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [brokers, setBrokers] = useState<UserProfile[]>([]);
  const [selectedBrokerId, setSelectedBrokerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BrokerAssistantSnapshot | null>(null);

  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<
    (AssistantGenerateResponse & { generatedAt: string }) | null
  >(null);

  const isAdmin = isAdminProfile(profile);
  const dataOwnerId = isAdmin && selectedBrokerId ? selectedBrokerId : user?.id ?? "";

  const loadSnapshot = useCallback(async (ownerId: string) => {
    setFetchError(null);
    try {
      const data = await fetchBrokerAssistantSnapshot(supabase, ownerId, 10);
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      if (isAdminProfile(userProfile)) {
        const { data: allProfiles } = await fetchAllProfiles();
        const brokerProfiles = allProfiles.filter((item) => item.role === "broker");
        setBrokers(brokerProfiles);
        setSelectedBrokerId(session.user.id);
      }

      await loadSnapshot(session.user.id);
      setLoading(false);
    });
  }, [router, loadSnapshot]);

  useEffect(() => {
    if (!dataOwnerId || loading) return;
    void loadSnapshot(dataOwnerId);
  }, [dataOwnerId, loading, loadSnapshot]);

  async function handleGeneratePlan() {
    setPlanLoading(true);
    setPlanError(null);

    const brokerUserId =
      isAdmin && selectedBrokerId && selectedBrokerId !== user?.id
        ? selectedBrokerId
        : undefined;

    const { data, error } = await fetchAssistantActionPlan(brokerUserId);

    setPlanLoading(false);

    if (error || !data) {
      setPlanError(error ?? AI_CLIENT_ERROR_MESSAGE);
      return;
    }

    setPlan(data);
  }

  if (loading) {
    return (
      <AuthenticatedLayout maxWidthClass="max-w-[1200px]">
        <p className="text-sm text-zinc-500">Loading AI Broker Assistant...</p>
      </AuthenticatedLayout>
    );
  }

  if (!user || !profile) {
    return null;
  }

  const hasCrmData = snapshot?.hasCrmData ?? false;

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1200px]">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">AI Broker Assistant</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your daily sales command center for account prioritization, follow-ups,
            and next best actions.
          </p>
        </div>

        {isAdmin && brokers.length > 0 && (
          <div className="w-full lg:max-w-xs">
            <label
              htmlFor="broker-selector"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              View broker data
            </label>
            <select
              id="broker-selector"
              value={selectedBrokerId}
              onChange={(event) => setSelectedBrokerId(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value={user.id}>My data</option>
              {brokers.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {getProfileDisplayName(broker)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {!hasCrmData ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">Not enough CRM activity yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-500">
            Add companies, contacts, follow-ups, and opportunities to generate a
            stronger AI action plan.
          </p>
          <Link
            href="/companies"
            className="mt-6 crm-btn-primary"
          >
            Add company
          </Link>
        </section>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-medium text-zinc-900">
              A. Today&apos;s priorities
            </h2>
            <div className="space-y-3">
              {(snapshot?.todaysPriorities ?? []).map((account) => (
                <PriorityAccountCard key={account.companyId} account={account} />
              ))}
            </div>
          </section>

          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-zinc-900">B. Overdue follow-ups</h2>
            {(snapshot?.overdueFollowUpItems.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No overdue follow-ups.</p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-100">
                {snapshot?.overdueFollowUpItems.map((item) => (
                  <li
                    key={item.followUpId}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">
                        <Link
                          href={`/companies/${item.companyId}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {item.companyName}
                        </Link>
                        {" · "}
                        {item.title}
                      </p>
                      <p className="text-sm text-zinc-600">
                        Due {formatDate(item.dueAt)} · {item.status} ·{" "}
                        {item.suggestedAction}
                      </p>
                    </div>
                    <Link
                      href="/follow-ups"
                      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
                    >
                      Work center
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-zinc-900">C. Stale accounts</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Companies with no recent activity — high priority first.
            </p>
            {(snapshot?.staleAccounts.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No stale accounts detected.</p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-100">
                {snapshot?.staleAccounts.map((account) => (
                  <li
                    key={account.companyId}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">
                        <Link
                          href={`/companies/${account.companyId}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {account.companyName}
                        </Link>
                        {" · "}
                        {account.priority}
                      </p>
                      <p className="text-sm text-zinc-600">
                        {account.daysSinceActivity != null
                          ? `${account.daysSinceActivity} days since activity`
                          : "No activity recorded"}
                        {" · "}
                        {account.suggestedAction}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-zinc-900">D. Hot opportunities</h2>
            {(snapshot?.hotOpportunities.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No open opportunities.</p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-100">
                {snapshot?.hotOpportunities.map((opportunity) => (
                  <li
                    key={opportunity.opportunityId}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">
                        <Link
                          href={`/companies/${opportunity.companyId}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {opportunity.companyName}
                        </Link>
                        {" · "}
                        {opportunity.name}
                      </p>
                      <p className="text-sm text-zinc-600">
                        {opportunity.status}
                        {opportunity.pipelineValue > 0
                          ? ` · ${formatPipelineValue(opportunity.pipelineValue)}`
                          : ""}
                        {" · "}
                        {opportunity.suggestedNextStep}
                      </p>
                    </div>
                    <Link
                      href={`/opportunities/${opportunity.opportunityId}`}
                      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-medium text-zinc-900">E. AI action plan</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Recommendations only — nothing is sent automatically.
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
                Analyzing CRM data and building your action plan...
              </p>
            )}

            {plan && !planLoading && (
              <div className="mt-6 space-y-6 border-t border-zinc-100 pt-6">
                <p className="text-xs text-zinc-500">
                  Generated {formatDateTime(plan.generatedAt)}. Suggestions for manual
                  review only.
                </p>

                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">Daily summary</h3>
                  <p className="mt-2 text-sm text-zinc-700">{plan.actionPlan}</p>
                </div>

                {plan.priorities.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-zinc-900">
                      AI recommended priorities
                    </h3>
                    <div className="space-y-3">
                      {plan.priorities.map((item) => (
                        <div
                          key={`${item.companyId}-${item.companyName}`}
                          className="rounded-lg border border-zinc-200 p-4"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-medium text-zinc-900">
                                {item.companyName}
                              </p>
                              <p className="mt-1 text-sm text-zinc-600">{item.reason}</p>
                              <p className="mt-1 text-sm font-medium text-zinc-800">
                                {item.suggestedAction}
                              </p>
                            </div>
                            {item.companyId && (
                              <Link
                                href={`/companies/${item.companyId}`}
                                className="shrink-0 text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
                              >
                                Open company
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <AiOutputSections
                  sections={[
                    {
                      title: "What to do first",
                      items: plan.whatToDoFirst,
                      emptyMessage: "No first-step recommendations generated.",
                    },
                    {
                      title: "Who to call or email",
                      items: plan.whoToContact,
                      emptyMessage: "No contact recommendations generated.",
                    },
                    {
                      title: "CRM updates to make",
                      items: plan.crmUpdates,
                      emptyMessage: "No CRM update suggestions generated.",
                    },
                    {
                      title: "Risks and accounts needing attention",
                      items: plan.risks,
                      emptyMessage: "No risk warnings generated.",
                    },
                    {
                      title: "Commercial focus for today",
                      items: plan.commercialFocus,
                      emptyMessage: "No commercial focus generated.",
                    },
                  ]}
                />
              </div>
            )}
          </section>
        </>
      )}
    </AuthenticatedLayout>
  );
}
