"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
  COMPANY_PRIORITIES,
  DEFAULT_SALES_STAGE,
  SALES_STAGES,
  isSalesStage,
  priorityBadgeClass,
  salesStageBadgeClass,
  type CompanyPriority,
  type SalesStage,
} from "@/lib/crmConstants";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import { supabase } from "@/lib/supabaseClient";

interface PipelineCompany {
  id: string;
  user_id: string;
  name: string;
  country: string | null;
  priority: CompanyPriority;
  sales_stage: SalesStage;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  contactCount: number;
}

const PRIORITY_FILTER_OPTIONS = COMPANY_PRIORITIES;

function PipelineCompanyCard({
  company,
  updating,
  onMoveStage,
}: {
  company: PipelineCompany;
  updating: boolean;
  onMoveStage: (companyId: string, stage: SalesStage) => void;
}) {
  const otherStages = SALES_STAGES.filter((stage) => stage !== company.sales_stage);

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <Link
          href={`/companies/${company.id}`}
          className="text-sm font-semibold text-zinc-900 underline-offset-2 hover:underline"
        >
          {company.name}
        </Link>
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(company.priority)}`}
        >
          {company.priority}
        </span>
      </div>

      <dl className="space-y-1.5 text-xs text-zinc-600">
        <div>
          <span className="font-medium text-zinc-500">Country:</span>{" "}
          {company.country || "—"}
        </div>
        <div>
          <span className="font-medium text-zinc-500">Last activity:</span>{" "}
          {formatDate(company.last_contact_at)}
        </div>
        <div>
          <span className="font-medium text-zinc-500">Next follow-up:</span>{" "}
          {formatDate(company.next_follow_up_at)}
        </div>
        <div>
          <span className="font-medium text-zinc-500">Contacts:</span>{" "}
          {company.contactCount}
        </div>
      </dl>

      <div className="mt-4 flex flex-col gap-2">
        <label className="sr-only" htmlFor={`move-${company.id}`}>
          Move {company.name} to another stage
        </label>
        <select
          id={`move-${company.id}`}
          disabled={updating}
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value;
            if (!isSalesStage(value)) return;
            onMoveStage(company.id, value);
            event.target.value = "";
          }}
          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs font-medium text-zinc-700 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="" disabled>
            {updating ? "Moving..." : "Move to..."}
          </option>
          {otherStages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>

        <Link
          href={`/companies/${company.id}`}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Open Company
        </Link>
      </div>
    </article>
  );
}

function PipelineColumn({
  stage,
  companies,
  updatingCompanyId,
  onMoveStage,
}: {
  stage: SalesStage;
  companies: PipelineCompany[];
  updatingCompanyId: string | null;
  onMoveStage: (companyId: string, stage: SalesStage) => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/80">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">{stage}</h2>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${salesStageBadgeClass(stage)}`}
          >
            {companies.length}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {companies.length === 0 ? (
          <p className="px-1 py-2 text-xs text-zinc-500">
            No companies in this stage.
          </p>
        ) : (
          companies.map((company) => (
            <PipelineCompanyCard
              key={company.id}
              company={company}
              updating={updatingCompanyId === company.id}
              onMoveStage={onMoveStage}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function PipelinePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<PipelineCompany[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<CompanyPriority | "">(
    "",
  );
  const [updatingCompanyId, setUpdatingCompanyId] = useState<string | null>(
    null,
  );

  const loadPipeline = useCallback(async (userId: string) => {
    setFetchError(null);

    const [companiesResult, contactsResult] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, user_id, name, country, priority, sales_stage, last_contact_at, next_follow_up_at",
        )
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      supabase.from("contacts").select("company_id").eq("user_id", userId),
    ]);

    if (companiesResult.error) {
      setFetchError(formatSupabaseError(companiesResult.error));
      setCompanies([]);
      return;
    }

    if (contactsResult.error) {
      setFetchError(formatSupabaseError(contactsResult.error));
      setCompanies([]);
      return;
    }

    const contactCountByCompany = new Map<string, number>();
    for (const contact of contactsResult.data ?? []) {
      const companyId = contact.company_id as string;
      contactCountByCompany.set(
        companyId,
        (contactCountByCompany.get(companyId) ?? 0) + 1,
      );
    }

    setCompanies(
      (companiesResult.data ?? []).map((row) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        name: row.name as string,
        country: row.country as string | null,
        priority: row.priority as CompanyPriority,
        sales_stage: isSalesStage(row.sales_stage as string)
          ? (row.sales_stage as SalesStage)
          : DEFAULT_SALES_STAGE,
        last_contact_at: row.last_contact_at as string | null,
        next_follow_up_at: row.next_follow_up_at as string | null,
        contactCount: contactCountByCompany.get(row.id as string) ?? 0,
      })),
    );
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      loadPipeline(session.user.id).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      loadPipeline(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [router, loadPipeline]);

  const filteredCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();

    return companies.filter((company) => {
      if (priorityFilter && company.priority !== priorityFilter) return false;
      if (!query) return true;
      return company.name.toLowerCase().includes(query);
    });
  }, [companies, search, priorityFilter]);

  const companiesByStage = useMemo(() => {
    const grouped = Object.fromEntries(
      SALES_STAGES.map((stage) => [stage, [] as PipelineCompany[]]),
    ) as Record<SalesStage, PipelineCompany[]>;

    for (const company of filteredCompanies) {
      grouped[company.sales_stage].push(company);
    }

    return grouped;
  }, [filteredCompanies]);

  async function handleMoveStage(companyId: string, stage: SalesStage) {
    if (!user) return;

    setUpdatingCompanyId(companyId);

    const { error } = await supabase
      .from("companies")
      .update({ sales_stage: stage })
      .eq("id", companyId)
      .eq("user_id", user.id);

    if (error) {
      setFetchError(formatSupabaseError(error));
      setUpdatingCompanyId(null);
      return;
    }

    setCompanies((prev) =>
      prev.map((company) =>
        company.id === companyId ? { ...company, sales_stage: stage } : company,
      ),
    );
    setUpdatingCompanyId(null);
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
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Sales Pipeline
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Visual board by sales stage — uses the same company record as
            Companies and Company Detail
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="w-full sm:max-w-sm">
            <label htmlFor="pipeline-search" className="sr-only">
              Search companies
            </label>
            <input
              id="pipeline-search"
              type="search"
              placeholder="Search by company name..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div className="w-full sm:max-w-xs">
            <label
              htmlFor="priority-filter"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Priority
            </label>
            <select
              id="priority-filter"
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value as CompanyPriority | "")
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="">All priorities</option>
              {PRIORITY_FILTER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {fetchError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {fetchError}
          </p>
        )}

        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max gap-4">
            {SALES_STAGES.map((stage) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                companies={companiesByStage[stage]}
                updatingCompanyId={updatingCompanyId}
                onMoveStage={handleMoveStage}
              />
            ))}
          </div>
        </div>
    </AuthenticatedLayout>
  );
}
