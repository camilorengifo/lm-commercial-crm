import { getFollowUpBucket } from "@/lib/followUps";
import { supabase } from "@/lib/supabaseClient";
import {
  getProfileDisplayName,
  type UserProfile,
} from "@/lib/userProfile";

export interface BrokerPerformanceRow {
  userId: string;
  name: string;
  email: string;
  companies: number;
  contacts: number;
  followUpsDueToday: number;
  overdueFollowUps: number;
  openOpportunities: number;
  lastActivityAt: string | null;
}

export interface AdminDashboardStats {
  totalBrokers: number;
  totalCompanies: number;
  followUpsDueToday: number;
  overdueFollowUps: number;
  openOpportunities: number;
  brokerRows: BrokerPerformanceRow[];
}

export interface AdminCompanySummary {
  id: string;
  name: string;
  ownerEmail: string;
  salesStage: string;
  lastContactAt: string | null;
}

export interface AdminBrokerDetailSummary {
  companies: AdminCompanySummary[];
  followUpsDueToday: number;
  overdueFollowUps: number;
  openOpportunities: number;
}

function isOpenOpportunityStatus(status: string): boolean {
  return status !== "Won" && status !== "Lost";
}

export async function fetchAdminDashboardStats(): Promise<{
  data: AdminDashboardStats | null;
  error: { message?: string } | null;
}> {
  const [
    profilesResult,
    companiesResult,
    contactsResult,
    followUpsResult,
    opportunitiesResult,
    activitiesResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role"),
    supabase.from("companies").select("id, user_id, last_contact_at"),
    supabase.from("contacts").select("id, user_id"),
    supabase
      .from("follow_ups")
      .select("id, user_id, due_at, status")
      .eq("status", "pending"),
    supabase.from("load_opportunities").select("id, user_id, status"),
    supabase
      .from("activities")
      .select("user_id, activity_at")
      .order("activity_at", { ascending: false })
      .limit(500),
  ]);

  const firstError =
    profilesResult.error ??
    companiesResult.error ??
    contactsResult.error ??
    followUpsResult.error ??
    opportunitiesResult.error ??
    activitiesResult.error;

  if (firstError) {
    return { data: null, error: firstError };
  }

  const profiles = ((profilesResult.data ?? []) as UserProfile[]).map(
    (profile) => ({
      ...profile,
      role: profile.role === "admin" ? "admin" : "broker",
    }),
  ) as UserProfile[];

  const brokerProfiles = profiles.filter((profile) => profile.role === "broker");
  const companies = companiesResult.data ?? [];
  const contacts = contactsResult.data ?? [];
  const followUps = followUpsResult.data ?? [];
  const opportunities = opportunitiesResult.data ?? [];
  const activities = activitiesResult.data ?? [];

  let followUpsDueToday = 0;
  let overdueFollowUps = 0;

  for (const followUp of followUps) {
    const bucket = getFollowUpBucket(followUp.due_at);
    if (bucket === "today") followUpsDueToday += 1;
    if (bucket === "overdue") overdueFollowUps += 1;
  }

  const openOpportunities = opportunities.filter((opportunity) =>
    isOpenOpportunityStatus(opportunity.status),
  ).length;

  const lastActivityByUser = new Map<string, string>();
  for (const activity of activities) {
    if (!lastActivityByUser.has(activity.user_id)) {
      lastActivityByUser.set(activity.user_id, activity.activity_at);
    }
  }

  for (const company of companies) {
    const existing = lastActivityByUser.get(company.user_id);
    const companyLast = company.last_contact_at;
    if (companyLast && (!existing || new Date(companyLast) > new Date(existing))) {
      lastActivityByUser.set(company.user_id, companyLast);
    }
  }

  const brokerRows: BrokerPerformanceRow[] = brokerProfiles.map((profile) => {
    const userId = profile.id;
    const pendingForUser = followUps.filter(
      (followUp) => followUp.user_id === userId,
    );

    let dueToday = 0;
    let overdue = 0;

    for (const followUp of pendingForUser) {
      const bucket = getFollowUpBucket(followUp.due_at);
      if (bucket === "today") dueToday += 1;
      if (bucket === "overdue") overdue += 1;
    }

    return {
      userId,
      name: getProfileDisplayName(profile),
      email: profile.email ?? "—",
      companies: companies.filter((company) => company.user_id === userId).length,
      contacts: contacts.filter((contact) => contact.user_id === userId).length,
      followUpsDueToday: dueToday,
      overdueFollowUps: overdue,
      openOpportunities: opportunities.filter(
        (opportunity) =>
          opportunity.user_id === userId &&
          isOpenOpportunityStatus(opportunity.status),
      ).length,
      lastActivityAt: lastActivityByUser.get(userId) ?? null,
    };
  });

  brokerRows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    data: {
      totalBrokers: brokerProfiles.length,
      totalCompanies: companies.length,
      followUpsDueToday,
      overdueFollowUps,
      openOpportunities,
      brokerRows,
    },
    error: null,
  };
}

export async function fetchAdminBrokerDetail(
  brokerId: string,
): Promise<{
  data: AdminBrokerDetailSummary | null;
  error: { message?: string } | null;
}> {
  const [companiesResult, followUpsResult, opportunitiesResult, profilesResult] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, name, user_id, sales_stage, last_contact_at")
        .eq("user_id", brokerId)
        .order("name", { ascending: true }),
      supabase
        .from("follow_ups")
        .select("due_at, status")
        .eq("user_id", brokerId)
        .eq("status", "pending"),
      supabase
        .from("load_opportunities")
        .select("status")
        .eq("user_id", brokerId),
      supabase.from("profiles").select("email").eq("id", brokerId).maybeSingle(),
    ]);

  const firstError =
    companiesResult.error ??
    followUpsResult.error ??
    opportunitiesResult.error ??
    profilesResult.error;

  if (firstError) {
    return { data: null, error: firstError };
  }

  const ownerEmail = profilesResult.data?.email ?? "—";
  let followUpsDueToday = 0;
  let overdueFollowUps = 0;

  for (const followUp of followUpsResult.data ?? []) {
    const bucket = getFollowUpBucket(followUp.due_at);
    if (bucket === "today") followUpsDueToday += 1;
    if (bucket === "overdue") overdueFollowUps += 1;
  }

  const openOpportunities = (opportunitiesResult.data ?? []).filter(
    (opportunity) => isOpenOpportunityStatus(opportunity.status),
  ).length;

  return {
    data: {
      companies: (companiesResult.data ?? []).map((company) => ({
        id: company.id,
        name: company.name,
        ownerEmail,
        salesStage: company.sales_stage,
        lastContactAt: company.last_contact_at,
      })),
      followUpsDueToday,
      overdueFollowUps,
      openOpportunities,
    },
    error: null,
  };
}

export async function reassignCompanyOwner(
  companyId: string,
  newUserId: string,
): Promise<{ error: { message?: string } | null }> {
  const { error } = await supabase.rpc("reassign_company_owner", {
    p_company_id: companyId,
    p_new_user_id: newUserId,
  });

  return { error };
}
