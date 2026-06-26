import { createClient } from "@supabase/supabase-js";
import { warnIfServiceRoleClientKey } from "@/lib/securityDebug";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
  );
}

warnIfServiceRoleClientKey(supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Email invite/recovery links open in a fresh browser without a PKCE verifier.
    flowType: "implicit",
    detectSessionInUrl: true,
    persistSession: true,
  },
});
