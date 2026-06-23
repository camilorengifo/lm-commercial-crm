import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getMissingServiceRoleMessage(): string {
  return "SUPABASE_SERVICE_ROLE_KEY is required for server-side cron jobs.";
}
