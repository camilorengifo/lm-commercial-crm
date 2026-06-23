"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { FOLLOW_UP_STATUS_LABELS } from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import { supabase } from "@/lib/supabaseClient";
import {
  bucketFollowUpsWithCompanies,
  completeFollowUp,
  fetchPendingFollowUpsWithCompanies,
  type FollowUpWithCompany,
} from "@/lib/followUps";

type FollowUpBucket = "overdue" | "today" | "upcoming";

function bucketFollowUps(followUps: FollowUpWithCompany[]) {
  return bucketFollowUpsWithCompanies(followUps);
}

function FollowUpCard({
  followUp,
  variant,
  completing,
  onMarkDone,
}: {
  followUp: FollowUpWithCompany;
  variant: FollowUpBucket;
  completing: boolean;
  onMarkDone: (followUp: FollowUpWithCompany) => void;
}) {
  const variantClasses: Record<FollowUpBucket, string> = {
    overdue: "border-red-200 bg-red-50/60",
    today: "border-amber-200 bg-amber-50/50",
    upcoming: "border-zinc-200 bg-white",
  };

  return (
    <li
      className={`rounded-lg border p-4 shadow-sm ${variantClasses[variant]}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">
              {followUp.title}
            </h3>
            <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
              {FOLLOW_UP_STATUS_LABELS[followUp.status]}
            </span>
          </div>

          <p className="text-sm text-zinc-800">
            <span className="font-medium text-zinc-600">Company:</span>{" "}
            <Link
              href={`/companies/${followUp.company_id}`}
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              {followUp.companyName}
            </Link>
          </p>

          <p className="text-sm text-zinc-800">
            <span className="font-medium text-zinc-600">Due:</span>{" "}
            {formatDateTime(followUp.due_at)}
          </p>

          {followUp.notes && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium text-zinc-600">Notes:</span>{" "}
              {followUp.notes}
            </p>
          )}

          <p className="text-xs text-zinc-500">
            Created {formatDate(followUp.created_at)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMarkDone(followUp)}
            disabled={completing}
            className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {completing ? "Saving..." : "Mark as Done"}
          </button>
          <Link
            href={`/companies/${followUp.company_id}`}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Open Company
          </Link>
        </div>
      </div>
    </li>
  );
}

function FollowUpSection({
  title,
  description,
  emptyMessage,
  followUps,
  variant,
  completingId,
  onMarkDone,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  followUps: FollowUpWithCompany[];
  variant: FollowUpBucket;
  completingId: string | null;
  onMarkDone: (followUp: FollowUpWithCompany) => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-zinc-900">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>

      {followUps.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {followUps.map((followUp) => (
            <FollowUpCard
              key={followUp.id}
              followUp={followUp}
              variant={variant}
              completing={completingId === followUp.id}
              onMarkDone={onMarkDone}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function FollowUpsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [followUps, setFollowUps] = useState<FollowUpWithCompany[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchFollowUps = useCallback(async (userId: string) => {
    setFetchError(null);

    const { data, error } = await fetchPendingFollowUpsWithCompanies(userId);

    if (error) {
      setFetchError(formatSupabaseError(error));
      setFollowUps([]);
      return;
    }

    setFollowUps(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      fetchFollowUps(session.user.id).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      fetchFollowUps(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [router, fetchFollowUps]);

  const { overdue, today, upcoming } = useMemo(
    () => bucketFollowUps(followUps),
    [followUps],
  );

  async function handleMarkDone(followUp: FollowUpWithCompany) {
    if (!user) return;

    setCompletingId(followUp.id);

    const { error } = await completeFollowUp(
      followUp.id,
      user.id,
      followUp.company_id,
    );

    if (error) {
      setFetchError(formatSupabaseError(error));
      setCompletingId(null);
      return;
    }

    await fetchFollowUps(user.id);
    setCompletingId(null);
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
            Follow-ups
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Central agenda for pending follow-ups scheduled from company
            timelines — same records as company detail, no duplicate entry
          </p>
        </div>

        {fetchError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {fetchError}
          </p>
        )}

        <div className="space-y-6">
          <FollowUpSection
            title="Overdue"
            description="Follow-ups that are past due, oldest first"
            emptyMessage="No overdue follow-ups."
            followUps={overdue}
            variant="overdue"
            completingId={completingId}
            onMarkDone={handleMarkDone}
          />

          <FollowUpSection
            title="Due Today"
            description="Follow-ups scheduled for today, earliest first"
            emptyMessage="No follow-ups due today."
            followUps={today}
            variant="today"
            completingId={completingId}
            onMarkDone={handleMarkDone}
          />

          <FollowUpSection
            title="Upcoming"
            description="Future follow-ups, soonest first"
            emptyMessage="No upcoming follow-ups."
            followUps={upcoming}
            variant="upcoming"
            completingId={completingId}
            onMarkDone={handleMarkDone}
          />
        </div>
    </AuthenticatedLayout>
  );
}
