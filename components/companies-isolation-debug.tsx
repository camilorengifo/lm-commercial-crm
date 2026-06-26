"use client";

import { isSecurityDebugEnabled } from "@/lib/securityDebug";
import type { BrokerIsolationStats } from "@/lib/brokerDataAccess";
import type { UserProfile } from "@/lib/userProfile";

export interface CompanyOwnershipDebugRow {
  id: string;
  name: string;
  user_id: string;
  ownerEmail: string;
  matchesAuth: boolean;
}

export function CompaniesIsolationDebug({
  authUserId,
  authEmail,
  profile,
  isAdmin,
  fetchMode,
  stats,
  profileIdMatchesAuth,
  authEmailMatchesProfile,
  uniqueCompanyOwnerIds,
  companyOwnershipRows,
}: {
  authUserId: string;
  authEmail: string | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  fetchMode: string;
  stats: BrokerIsolationStats | null;
  profileIdMatchesAuth: boolean;
  authEmailMatchesProfile: boolean;
  uniqueCompanyOwnerIds: string[];
  companyOwnershipRows: CompanyOwnershipDebugRow[];
}) {
  if (!isSecurityDebugEnabled()) {
    return null;
  }

  const ownerMismatch =
    uniqueCompanyOwnerIds.length > 0 &&
    uniqueCompanyOwnerIds.some((ownerId) => ownerId !== authUserId);

  const allRowsMatchAuth =
    companyOwnershipRows.length > 0 &&
    companyOwnershipRows.every((row) => row.matchesAuth);

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      <p className="font-semibold">Companies isolation debug (development only)</p>
      <dl className="mt-2 grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="font-medium">auth.user.id</dt>
          <dd className="break-all">{authUserId}</dd>
        </div>
        <div>
          <dt className="font-medium">auth.user.email</dt>
          <dd className="break-all">{authEmail ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">profile.id</dt>
          <dd className="break-all">{profile?.id ?? "— (missing profile)"}</dd>
        </div>
        <div>
          <dt className="font-medium">profile.email</dt>
          <dd className="break-all">{profile?.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">profile.role</dt>
          <dd>{profile?.role ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">profile.is_active</dt>
          <dd>{profile ? String(profile.is_active) : "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">isAdmin</dt>
          <dd>{isAdmin ? "true" : "false"}</dd>
        </div>
        <div>
          <dt className="font-medium">fetchMode</dt>
          <dd>{fetchMode}</dd>
        </div>
        <div>
          <dt className="font-medium">companies returned</dt>
          <dd>{stats?.visibleCount ?? 0}</dd>
        </div>
        <div>
          <dt className="font-medium">foreignCompanies</dt>
          <dd>{stats?.foreignCount ?? 0}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium">unique company.user_id values in list</dt>
          <dd className="break-all">
            {uniqueCompanyOwnerIds.length > 0
              ? uniqueCompanyOwnerIds.join(", ")
              : "—"}
          </dd>
        </div>
      </dl>

      {allRowsMatchAuth && companyOwnershipRows.length > 0 && (
        <p className="mt-2 rounded bg-emerald-100 p-2 text-emerald-900">
          Every visible company has companies.user_id = auth.user.id. If an account
          looks like it belongs to another broker, that is a data ownership issue —
          use Admin → Companies to reassign the owner.
        </p>
      )}

      {ownerMismatch && (
        <p className="mt-2 rounded bg-red-100 p-2 text-red-900">
          List contains companies whose user_id does not match auth.user.id.
          Check session cache or company ownership in the database.
        </p>
      )}

      {companyOwnershipRows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded bg-white">
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-200 text-left">
                <th className="px-2 py-1.5 font-medium">Company</th>
                <th className="px-2 py-1.5 font-medium">companies.user_id</th>
                <th className="px-2 py-1.5 font-medium">Owner email (profiles)</th>
                <th className="px-2 py-1.5 font-medium">Matches auth?</th>
              </tr>
            </thead>
            <tbody>
              {companyOwnershipRows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-2 py-1.5">{row.name}</td>
                  <td className="px-2 py-1.5 break-all font-mono">{row.user_id}</td>
                  <td className="px-2 py-1.5 break-all">{row.ownerEmail}</td>
                  <td className="px-2 py-1.5">
                    {row.matchesAuth ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stats && stats.foreignCount > 0 && (
        <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-[11px]">
          {JSON.stringify(stats.foreignCompanies, null, 2)}
        </pre>
      )}
    </div>
  );
}
