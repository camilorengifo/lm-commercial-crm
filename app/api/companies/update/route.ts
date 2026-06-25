import { NextResponse } from "next/server";
import { fetchProfileForUser } from "@/lib/authProfile";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";
import { COMPANY_PRIORITIES, type CompanyPriority } from "@/lib/crmConstants";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isCompanyPriority(value: string): value is CompanyPriority {
  return (COMPANY_PRIORITIES as readonly string[]).includes(value);
}

interface UpdateCompanyBody {
  companyId?: string;
  name?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  priority?: string;
  general_notes?: string | null;
  last_contact_at?: string | null;
  next_follow_up_at?: string | null;
}

export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await fetchProfileForUser(supabase, user.id);
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isBlockedProfile(profile) && !isAdminProfile(profile)) {
    return NextResponse.json(
      {
        error:
          "Your account has been temporarily blocked. Please contact an administrator.",
      },
      { status: 403 },
    );
  }

  let body: UpdateCompanyBody;
  try {
    body = (await request.json()) as UpdateCompanyBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const companyId = body.companyId?.trim() ?? "";
  const name = body.name?.trim() ?? "";

  if (!companyId || !isUuid(companyId)) {
    return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }

  const priority = body.priority?.trim() ?? "Medium";
  if (!isCompanyPriority(priority)) {
    return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
  }

  const { error: rpcError } = await supabase.rpc("update_company_details", {
    p_company_id: companyId,
    p_name: name,
    p_city: body.city?.trim() ?? "",
    p_state: body.state?.trim() ?? "",
    p_country: body.country?.trim() ?? "",
    p_priority: priority,
    p_general_notes: body.general_notes?.trim() ?? "",
    p_last_contact_at: body.last_contact_at ?? null,
    p_next_follow_up_at: body.next_follow_up_at ?? null,
  });

  if (rpcError) {
    return NextResponse.json(
      { error: rpcError.message || "Unable to update company." },
      { status: 400 },
    );
  }

  return NextResponse.json({ message: "Company updated successfully." });
}
