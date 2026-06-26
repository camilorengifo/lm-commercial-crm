"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { CrmAlert, CrmCard, PageHeader, StatCard, StatGrid } from "@/components/crm-ui";
import {
  LOAD_OPPORTUNITY_STATUSES,
  getOpportunityStageLabel,
  loadOpportunityStatusBadgeClass,
  type LoadOpportunityStatus,
} from "@/lib/crmConstants";
import { formatDate, formatSupabaseError } from "@/lib/crmFormat";
import {
  buildOpportunityListMetrics,
  fetchLoadOpportunitiesWithCompanies,
  formatLane,
  formatContactName,
  truncateNotesPreview,
  type LoadOpportunityWithCompany,
} from "@/lib/loadOpportunities";
import {
  fetchUserProfile,
  canManageOpportunities as userCanManageOpportunities,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

type StageFilter = "all" | LoadOpportunityStatus;

function matchesSearch(
  opportunity: LoadOpportunityWithCompany,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    opportunity.name,
    opportunity.companyName,
    opportunity.lane_origin,
    opportunity.lane_destination,
    opportunity.commodity,
    opportunity.notes,
    opportunity.next_step,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function OpportunitiesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<
    LoadOpportunityWithCompany[]
  >([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("all");

  const isAdmin = isAdminProfile(profile);

  const loadOpportunities = useCallback(
    async (userId: string, asAdmin: boolean) => {
      setFetchError(null);
      const { data, error } = await fetchLoadOpportunitiesWithCompanies(
        userId,
        asAdmin,
      );

      if (error) {
        setFetchError(formatSupabaseError(error));
        return;
      }

      setOpportunities(data);
    },
    [],
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);
      await loadOpportunities(
        session.user.id,
        isAdminProfile(userProfile),
      );
      setLoading(false);
    });
  }, [router, loadOpportunities]);

  const metrics = useMemo(
    () => buildOpportunityListMetrics(opportunities),
    [opportunities],
  );

  const companyOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const opportunity of opportunities) {
      byId.set(opportunity.company_id, opportunity.companyName);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opportunity) => {
      if (stageFilter !== "all" && opportunity.status !== stageFilter) {
        return false;
      }

      if (
        companyFilter !== "all" &&
        opportunity.company_id !== companyFilter
      ) {
        return false;
      }

      return matchesSearch(opportunity, searchQuery);
    });
  }, [opportunities, stageFilter, companyFilter, searchQuery]);

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
      <PageHeader
        title="Opportunities"
        description={
          isAdmin
            ? "Global view of load opportunities across all brokers."
            : "Track load opportunities connected to your companies."
        }
        actions={
          userCanManageOpportunities(profile) ? (
            <Link href="/opportunities/new" className="crm-btn-primary">
              New Opportunity
            </Link>
          ) : undefined
        }
      />

      {fetchError && (
        <CrmAlert variant="error">{fetchError}</CrmAlert>
      )}

      <StatGrid columns={4}>
        <StatCard
          label="Open Opportunities"
          value={metrics.openCount}
        />
        <StatCard label="Won" value={metrics.wonCount} />
        <StatCard label="Lost" value={metrics.lostCount} />
        <StatCard label="Total" value={opportunities.length} />
      </StatGrid>

      <CrmCard className="mb-5" padding>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2">
            <label
              htmlFor="opportunity-search"
              className="crm-label"
            >
              Search
            </label>
            <input
              id="opportunity-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Name, company, lane, commodity..."
              className="crm-input"
            />
          </div>

          <div>
            <label
              htmlFor="opportunity-stage-filter"
              className="crm-label"
            >
              Stage
            </label>
            <select
              id="opportunity-stage-filter"
              value={stageFilter}
              onChange={(event) =>
                setStageFilter(event.target.value as StageFilter)
              }
              className="crm-select"
            >
              <option value="all">All stages</option>
              {LOAD_OPPORTUNITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {getOpportunityStageLabel(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="opportunity-company-filter"
              className="crm-label"
            >
              Company
            </label>
            <select
              id="opportunity-company-filter"
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="crm-select"
            >
              <option value="all">All companies</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CrmCard>

      <div className="crm-table-wrap">
        <div className="crm-divider-toolbar">
          <p className="text-sm text-slate-600">
            Showing {filteredOpportunities.length} of {opportunities.length}{" "}
            opportunities
          </p>
        </div>

        {filteredOpportunities.length === 0 ? (
          <p className="crm-empty-state">
            {opportunities.length === 0
              ? "No opportunities yet. Create one here or from a company detail page."
              : "No opportunities match your current filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="crm-table">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Opportunity
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Lane
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Equipment
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Commodity
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Stage
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {filteredOpportunities.map((opportunity) => {
                  const notesPreview = truncateNotesPreview(opportunity.notes);

                  return (
                    <tr key={opportunity.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/opportunities/${opportunity.id}`}
                          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                        >
                          {opportunity.name}
                        </Link>
                        {notesPreview && (
                          <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                            {notesPreview}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/companies/${opportunity.company_id}`}
                          className="text-zinc-700 underline-offset-2 hover:underline"
                        >
                          {opportunity.companyName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {formatLane(
                          opportunity.lane_origin,
                          opportunity.lane_destination,
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {opportunity.equipment_type || "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {opportunity.commodity || "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {opportunity.contactFirstName
                          ? formatContactName({
                              first_name: opportunity.contactFirstName,
                              last_name: opportunity.contactLastName,
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${loadOpportunityStatusBadgeClass(opportunity.status)}`}
                        >
                          {getOpportunityStageLabel(opportunity.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {formatDate(opportunity.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
