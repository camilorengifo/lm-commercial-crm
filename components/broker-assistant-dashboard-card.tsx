"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchBrokerAssistantSnapshot,
  type PrioritizedAccount,
} from "@/lib/brokerAssistant";
import { supabase } from "@/lib/supabaseClient";

function TopAccountRow({ account }: { account: PrioritizedAccount }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900">
          {account.companyName}
        </p>
        <p className="truncate text-xs text-zinc-500">
          Score {account.priorityScore} · {account.priorityReasons[0]}
        </p>
      </div>
      <Link
        href={`/companies/${account.companyId}`}
        className="shrink-0 text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
      >
        Open
      </Link>
    </li>
  );
}

export function BrokerAssistantDashboardCard() {
  const [loading, setLoading] = useState(true);
  const [topAccounts, setTopAccounts] = useState<PrioritizedAccount[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setLoading(false);
        return;
      }

      try {
        const snapshot = await fetchBrokerAssistantSnapshot(
          supabase,
          session.user.id,
          3,
        );
        setTopAccounts(snapshot.topAccounts);
      } catch {
        setTopAccounts([]);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900">AI Broker Assistant</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Get today&apos;s prioritized accounts, recommended next actions, and
            outreach drafts.
          </p>
        </div>
        <Link
          href="/assistant"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Open assistant
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading priorities...</p>
      ) : topAccounts.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          Add CRM data to see prioritized accounts here.
        </p>
      ) : (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Top accounts needing attention
          </p>
          <ul className="divide-y divide-zinc-100">
            {topAccounts.map((account) => (
              <TopAccountRow key={account.companyId} account={account} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
