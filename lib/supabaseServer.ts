import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function createAuthedSupabaseClient(accessToken: string): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function getAuthenticatedUser(request: Request): Promise<{
  user: User | null;
  supabase: SupabaseClient | null;
  accessToken: string | null;
  error: string | null;
}> {
  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!accessToken) {
    return {
      user: null,
      supabase: null,
      accessToken: null,
      error: "Unauthorized",
    };
  }

  const supabase = createAuthedSupabaseClient(accessToken);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return {
      user: null,
      supabase: null,
      accessToken: null,
      error: "Unauthorized",
    };
  }

  return { user, supabase, accessToken, error: null };
}
