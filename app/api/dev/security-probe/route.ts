import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import { isSecurityDebugEnabled } from "@/lib/securityDebug";
import { getAuthenticatedUser } from "@/lib/supabaseServer";
import { isAdminProfile } from "@/lib/userProfile";

export async function GET(request: Request) {
  if (!isSecurityDebugEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const profile = await fetchProfileForUser(supabase, user.id);

  const [unfilteredResult, filteredResult] = await Promise.all([
    supabase.from("companies").select("id, user_id, name").order("name"),
    supabase
      .from("companies")
      .select("id, user_id, name")
      .eq("user_id", user.id)
      .order("name"),
  ]);

  const unfiltered = unfilteredResult.data ?? [];
  const filtered = filteredResult.data ?? [];
  const foreignCompanies = unfiltered.filter((row) => row.user_id !== user.id);

  return NextResponse.json({
    authUserId: user.id,
    authEmail: user.email,
    profileId: profile?.id ?? null,
    profileEmail: profile?.email ?? null,
    profileIdMatchesAuth: profile?.id === user.id,
    authEmailMatchesProfile:
      profile?.email && user.email
        ? profile.email.trim().toLowerCase() === user.email.trim().toLowerCase()
        : profile?.email === user.email,
    profileRole: profile?.role ?? null,
    profileIsActive: profile?.is_active ?? null,
    isAdmin: isAdminProfile(profile),
    unfilteredCount: unfiltered.length,
    filteredCount: filtered.length,
    foreignCompanyCount: foreignCompanies.length,
    foreignCompanies: foreignCompanies.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
    })),
    rlsLikelyBroken: foreignCompanies.length > 0 && !isAdminProfile(profile),
  });
}
