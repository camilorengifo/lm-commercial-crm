import { supabase } from "@/lib/supabaseClient";
import {
  isSecurityDebugEnabled,
  logBrokerIsolationWarn,
  logSecurityFetchContext,
  type SecurityFetchMode,
} from "@/lib/securityDebug";
import {
  fetchUserProfile,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";

export const COMPANY_OWNER_USER_ID_COLUMN = "user_id";
export const COMPANIES_FETCH_PAGE_SIZE = 1000;

/** Canonical personal-book owner: always the authenticated viewer on broker-facing routes. */
export function resolvePersonalCompanyOwnerUserId(viewerUserId: string): string {
  return viewerUserId;
}

export interface CanonicalCompanyViewer {
  viewerUserId: string;
  authUserId: string;
  profileId: string | null;
  profileIdMatchesAuth: boolean;
}

/**
 * Resolves the user id used for companies.user_id ownership on personal broker routes.
 * companies.user_id and profiles.id both reference auth.users.id — the viewer id is auth.user.id.
 */
export function resolveCanonicalCompanyViewerId(input: {
  authUserId: string;
  profile: UserProfile | null | undefined;
}): CanonicalCompanyViewer {
  const profileId = input.profile?.id ?? null;
  const profileIdMatchesAuth =
    profileId === null || profileId === input.authUserId;

  if (profileId && !profileIdMatchesAuth) {
    logBrokerIsolationWarn(
      "resolveCanonicalCompanyViewerId: profile.id differs from auth.user.id",
      { authUserId: input.authUserId, profileId },
    );
  }

  return {
    viewerUserId: input.authUserId,
    authUserId: input.authUserId,
    profileId,
    profileIdMatchesAuth,
  };
}

export function companyOwnedByViewer(
  companyUserId: string,
  viewerUserId: string,
): boolean {
  return companyUserId === viewerUserId;
}

export async function fetchOwnedCompanyIdsForViewer(
  viewerUserId: string,
  options?: { includeSoftDeleted?: boolean },
): Promise<{
  data: string[];
  error: { message?: string } | null;
}> {
  const ids: string[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("companies")
      .select("id")
      .eq(COMPANY_OWNER_USER_ID_COLUMN, viewerUserId)
      .order("id", { ascending: true });

    if (!options?.includeSoftDeleted) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query.range(
      offset,
      offset + COMPANIES_FETCH_PAGE_SIZE - 1,
    );

    if (error) {
      return { data: [], error };
    }

    const batch = (data ?? []).map((row) => row.id as string);
    ids.push(...batch);

    if (batch.length < COMPANIES_FETCH_PAGE_SIZE) {
      break;
    }

    offset += COMPANIES_FETCH_PAGE_SIZE;
  }

  return {
    data: ids,
    error: null,
  };
}

export interface BrokerIsolationStats {
  rawCount: number;
  visibleCount: number;
  foreignCount: number;
  foreignCompanies: Array<{ id: string; name: string; user_id: string }>;
}

export interface AuthenticatedViewerContext {
  userId: string;
  email: string | null;
  profile: UserProfile | null;
  isAdmin: boolean;
}

export function brokerCanAccessCompany(input: {
  companyUserId: string;
  viewerUserId: string;
  isAdmin: boolean;
  allowAdminBypass?: boolean;
}): boolean {
  if (input.allowAdminBypass !== false && input.isAdmin) {
    return true;
  }

  return input.companyUserId === input.viewerUserId;
}

export function resolveBrokerScopedUserId(input: {
  ownerUserId: string;
  viewerUserId: string;
  isAdmin: boolean;
  brokerFacingRoute?: boolean;
}): string {
  if (input.brokerFacingRoute || !input.isAdmin) {
    return input.viewerUserId;
  }

  return input.ownerUserId;
}

export function assertBrokerCompanyScope(input: {
  ownerUserId: string;
  viewerUserId: string;
  isAdmin: boolean;
  allowAdminBypass?: boolean;
}): void {
  if (
    !brokerCanAccessCompany({
      companyUserId: input.ownerUserId,
      viewerUserId: input.viewerUserId,
      isAdmin: input.isAdmin,
      allowAdminBypass: input.allowAdminBypass,
    })
  ) {
    throw new Error("You do not have access to this company.");
  }
}

export function brokerDataAccessDeniedError(): { message: string } {
  return { message: "You do not have access to this record." };
}

export function shouldScopeToOwnerOnly(input: {
  profile: UserProfile | null;
  brokerFacingRoute: boolean;
}): boolean {
  if (input.brokerFacingRoute) {
    return true;
  }

  return !isAdminProfile(input.profile);
}

export function filterRowsOwnedByUser<T extends { user_id: string }>(
  rows: T[],
  ownerUserId: string,
  allowForeign = false,
): T[] {
  if (allowForeign) {
    return rows;
  }

  return rows.filter((row) => row.user_id === ownerUserId);
}

export function filterCompaniesOwnedByUser<
  T extends { user_id: string; id: string; name?: string | null },
>(companies: T[], ownerUserId: string): {
  visible: T[];
  stats: BrokerIsolationStats;
} {
  const foreignCompanies = companies.filter(
    (company) => company.user_id !== ownerUserId,
  );

  const visible = companies.filter((company) => company.user_id === ownerUserId);

  const stats: BrokerIsolationStats = {
    rawCount: companies.length,
    visibleCount: visible.length,
    foreignCount: foreignCompanies.length,
    foreignCompanies: foreignCompanies.map((company) => ({
      id: company.id,
      user_id: company.user_id,
      name: company.name?.trim() || "—",
    })),
  };

  if (stats.foreignCount > 0) {
    logBrokerIsolationWarn("foreign companies detected after fetch", {
      ownerUserId,
      stats,
    });
  }

  return { visible, stats };
}

export async function getAuthenticatedViewerContext(): Promise<AuthenticatedViewerContext | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: profile } = await fetchUserProfile(user.id);

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    isAdmin: isAdminProfile(profile),
  };
}

export async function fetchCompaniesOwnedByUser<T extends { user_id: string; id: string; name?: string | null }>(
  input: {
    ownerUserId: string;
    select: string;
    page: string;
    profile?: UserProfile | null;
    order?: { column: string; ascending?: boolean };
  },
): Promise<{
  data: T[];
  error: { message?: string } | null;
  stats: BrokerIsolationStats;
  fetchMode: SecurityFetchMode;
}> {
  const fetchMode: SecurityFetchMode = "broker_own_only";

  logSecurityFetchContext({
    page: input.page,
    fetchMode,
    authUserId: input.ownerUserId,
    authEmail: input.profile?.email ?? null,
    profileRole: input.profile?.role ?? null,
    filterUserId: input.ownerUserId,
    note:
      "Personal companies book: companies.user_id = viewer (brokers and admins).",
  });

  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("companies")
      .select(input.select)
      .eq(COMPANY_OWNER_USER_ID_COLUMN, input.ownerUserId)
      .is("deleted_at", null);

    if (input.order) {
      query = query.order(input.order.column, {
        ascending: input.order.ascending ?? true,
      });
    }

    const { data, error } = await query.range(
      offset,
      offset + COMPANIES_FETCH_PAGE_SIZE - 1,
    );

    if (error) {
      return {
        data: [],
        error,
        stats: {
          rawCount: 0,
          visibleCount: 0,
          foreignCount: 0,
          foreignCompanies: [],
        },
        fetchMode,
      };
    }

    const batch = (data ?? []) as unknown as T[];
    allRows.push(...batch);

    if (batch.length < COMPANIES_FETCH_PAGE_SIZE) {
      break;
    }

    offset += COMPANIES_FETCH_PAGE_SIZE;
  }

  const { visible, stats } = filterCompaniesOwnedByUser(
    allRows,
    input.ownerUserId,
  );

  if (isSecurityDebugEnabled()) {
    console.info("[broker-isolation]", {
      page: input.page,
      fetchMode,
      ...stats,
    });

    if (visible.length > 0) {
      void logBrokerCompanyOwnership(visible);
    }
  }

  return {
    data: visible,
    error: null,
    stats,
    fetchMode,
  };
}

export async function fetchCompanyByIdForViewer<
  T extends { user_id: string; id: string; name?: string | null },
>(input: {
  companyId: string;
  viewerUserId: string;
  select: string;
  profile: UserProfile | null;
  allowAdminBypass?: boolean;
  personalBookOnly?: boolean;
}): Promise<{
  data: T | null;
  error: { message?: string } | null;
  denied: boolean;
}> {
  const allowAdminBypass =
    input.allowAdminBypass !== false &&
    !input.personalBookOnly &&
    isAdminProfile(input.profile);

  let query = supabase
    .from("companies")
    .select(input.select)
    .eq("id", input.companyId);

  if (!allowAdminBypass) {
    query = query.eq(COMPANY_OWNER_USER_ID_COLUMN, input.viewerUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    return { data: null, error, denied: false };
  }

  if (!data) {
    return { data: null, error: null, denied: true };
  }

  const company = data as unknown as T;

  if (
    !brokerCanAccessCompany({
      companyUserId: company.user_id,
      viewerUserId: input.viewerUserId,
      isAdmin: isAdminProfile(input.profile),
      allowAdminBypass: input.allowAdminBypass,
    })
  ) {
    logBrokerIsolationWarn("company detail access denied", {
      companyId: input.companyId,
      viewerUserId: input.viewerUserId,
      companyUserId: company.user_id,
    });
    return { data: null, error: null, denied: true };
  }

  return { data: company, error: null, denied: false };
}

export function enforceBrokerOwnedRows<T extends { user_id: string }>(
  rows: T[],
  ownerUserId: string,
  input: {
    page: string;
    brokerFacingRoute?: boolean;
    profile?: UserProfile | null;
  },
): T[] {
  const allowForeign = !shouldScopeToOwnerOnly({
    profile: input.profile ?? null,
    brokerFacingRoute: input.brokerFacingRoute ?? true,
  });

  const visible = filterRowsOwnedByUser(rows, ownerUserId, allowForeign);

  if (visible.length !== rows.length) {
    logBrokerIsolationWarn("foreign rows removed", {
      page: input.page,
      ownerUserId,
      rawCount: rows.length,
      visibleCount: visible.length,
    });
  }

  return visible;
}

export async function logBrokerCompanyOwnership<
  T extends { id: string; name?: string | null; user_id: string },
>(companies: T[]): Promise<void> {
  if (!isSecurityDebugEnabled() || companies.length === 0) {
    return;
  }

  const ownerIds = [...new Set(companies.map((company) => company.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", ownerIds);

  const emailByUserId = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile.email as string]),
  );

  console.info(
    "[broker-isolation] company ownership",
    companies.map((company) => ({
      id: company.id,
      name: company.name?.trim() || "—",
      user_id: company.user_id,
      ownerEmail: emailByUserId.get(company.user_id) ?? "—",
    })),
  );
}
