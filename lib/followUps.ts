import type { FollowUpStatus } from "@/lib/crmConstants";
import { supabase } from "@/lib/supabaseClient";

export type { FollowUpStatus };

export const FOLLOW_UP_SELECT_FIELDS =
  "id, user_id, company_id, title, notes, due_at, status, completed_at, created_at";

export interface FollowUpRecord {
  id: string;
  user_id: string;
  company_id: string;
  title: string;
  notes: string | null;
  due_at: string;
  status: FollowUpStatus;
  completed_at: string | null;
  created_at: string;
}

export interface FollowUpWithCompany extends FollowUpRecord {
  companyName: string;
}

export type FollowUpBucket = "overdue" | "today" | "upcoming";

export function getDayBounds(reference: Date = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);

  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getFollowUpBucket(dueAt: string): FollowUpBucket {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "upcoming";

  const { start, end } = getDayBounds();

  if (due < start) return "overdue";
  if (due <= end) return "today";
  return "upcoming";
}

export function bucketFollowUpsWithCompanies(
  followUps: FollowUpWithCompany[],
): Record<FollowUpBucket, FollowUpWithCompany[]> {
  const overdue: FollowUpWithCompany[] = [];
  const today: FollowUpWithCompany[] = [];
  const upcoming: FollowUpWithCompany[] = [];

  for (const followUp of followUps) {
    const bucket = getFollowUpBucket(followUp.due_at);
    if (bucket === "overdue") overdue.push(followUp);
    else if (bucket === "today") today.push(followUp);
    else upcoming.push(followUp);
  }

  const byDueAsc = (a: FollowUpWithCompany, b: FollowUpWithCompany) =>
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime();

  overdue.sort(byDueAsc);
  today.sort(byDueAsc);
  upcoming.sort(byDueAsc);

  return { overdue, today, upcoming };
}

export interface CreateFollowUpInput {
  userId: string;
  companyId: string;
  title: string;
  notes?: string | null;
  dueAt: string;
}

export async function fetchPendingFollowUpsForCompany(
  companyId: string,
  userId: string,
): Promise<{ data: FollowUpRecord[]; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });

  return {
    data: (data as FollowUpRecord[]) ?? [],
    error,
  };
}

export async function fetchPendingFollowUpsForUser(
  userId: string,
): Promise<{ data: FollowUpRecord[]; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select(FOLLOW_UP_SELECT_FIELDS)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });

  return {
    data: (data as FollowUpRecord[]) ?? [],
    error,
  };
}

export async function fetchPendingFollowUpsWithCompanies(
  userId: string,
): Promise<{
  data: FollowUpWithCompany[];
  error: { message?: string } | null;
}> {
  const { data: rows, error: followUpError } =
    await fetchPendingFollowUpsForUser(userId);

  if (followUpError) {
    return { data: [], error: followUpError };
  }

  if (rows.length === 0) {
    return { data: [], error: null };
  }

  const companyIds = [...new Set(rows.map((row) => row.company_id))];

  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("user_id", userId)
    .in("id", companyIds);

  if (companyError) {
    return { data: [], error: companyError };
  }

  const companyNameById = new Map(
    (companies ?? []).map((company) => [company.id, company.name as string]),
  );

  return {
    data: rows.map((row) => ({
      ...row,
      companyName: companyNameById.get(row.company_id) ?? "Unknown company",
    })),
    error: null,
  };
}

export async function createFollowUp(
  input: CreateFollowUpInput,
): Promise<{ error: { message?: string } | null }> {
  const { error } = await supabase.from("follow_ups").insert({
    user_id: input.userId,
    company_id: input.companyId,
    title: input.title,
    notes: input.notes ?? null,
    due_at: input.dueAt,
    status: "pending" as FollowUpStatus,
  });

  return { error };
}

export async function syncCompanyNextFollowUpAt(
  companyId: string,
  userId: string,
): Promise<{ error: { message?: string } | null }> {
  const { data: nextFollowUp, error: fetchError } = await supabase
    .from("follow_ups")
    .select("due_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError };
  }

  const { error } = await supabase
    .from("companies")
    .update({ next_follow_up_at: nextFollowUp?.due_at ?? null })
    .eq("id", companyId)
    .eq("user_id", userId);

  return { error };
}

export async function completeFollowUp(
  followUpId: string,
  userId: string,
  companyId: string,
): Promise<{ error: { message?: string } | null }> {
  const { error } = await supabase
    .from("follow_ups")
    .update({
      status: "completed" as FollowUpStatus,
      completed_at: new Date().toISOString(),
    })
    .eq("id", followUpId)
    .eq("user_id", userId)
    .eq("company_id", companyId);

  if (error) {
    return { error };
  }

  return syncCompanyNextFollowUpAt(companyId, userId);
}
