"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CrmCard, SectionHeader } from "@/components/crm-ui";
import {
  fetchBrokerAssistantSnapshot,
  type PrioritizedAccount,
} from "@/lib/brokerAssistant";
import { supabase } from "@/lib/supabaseClient";

function TopAccountRow({ account }: { account: PrioritizedAccount }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">
          {account.companyName}
        </p>
        <p className="truncate text-xs text-slate-500">
          Score {account.priorityScore} · {account.priorityReasons[0]}
        </p>
      </div>
      <Link href={`/companies/${account.companyId}`} className="crm-link text-sm">
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
    <CrmCard className="mb-5" hover>
      <SectionHeader
        title="AI Broker Assistant"
        description="Today's prioritized accounts, recommended next actions, and outreach drafts."
        actions={
          <Link href="/assistant" className="crm-btn-primary">
            Open assistant
          </Link>
        }
        className="mb-0"
      />

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading priorities...</p>
      ) : topAccounts.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          Add CRM data to see prioritized accounts here.
        </p>
      ) : (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="crm-eyebrow">Top accounts needing attention</p>
          <ul className="mt-2">
            {topAccounts.map((account) => (
              <TopAccountRow key={account.companyId} account={account} />
            ))}
          </ul>
        </div>
      )}
    </CrmCard>
  );
}
