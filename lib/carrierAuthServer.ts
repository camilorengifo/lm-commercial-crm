import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { fetchProfileForUser, type UserProfile } from "@/lib/authProfile";
import type { CarrierEditContext } from "@/lib/carrierEditContext";
import { isAdminProfile, isBlockedProfile } from "@/lib/userProfile";
import { getAuthenticatedUser } from "@/lib/supabaseServer";

export interface ActiveCarrierUserContext {
  user: User;
  profile: UserProfile;
  supabase: SupabaseClient;
}

export async function requireActiveCarrierUser(
  request: Request,
): Promise<
  | { ok: true; context: ActiveCarrierUserContext }
  | { ok: false; response: NextResponse }
> {
  const { user, supabase, error } = await getAuthenticatedUser(request);

  if (error || !user || !supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const profile = await fetchProfileForUser(supabase, user.id);
  if (!profile?.is_active || isBlockedProfile(profile)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: { user, profile, supabase },
  };
}

export async function userOwnsCarrierRelationship(
  supabase: SupabaseClient,
  userId: string,
  carrierId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_carriers")
    .select("id")
    .eq("user_id", userId)
    .eq("carrier_id", carrierId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function requireCarrierSharedMutationAuth(
  request: Request,
  carrierId: string,
  editContext: CarrierEditContext,
): Promise<
  | { ok: true; context: ActiveCarrierUserContext }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireActiveCarrierUser(request);
  if (!auth.ok) {
    return auth;
  }

  if (!carrierId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Carrier ID is required." }, { status: 400 }),
    };
  }

  if (isAdminProfile(auth.context.profile)) {
    if (editContext === "network") {
      return auth;
    }

    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Administrators must edit shared carrier information from the Carrier Network context.",
        },
        { status: 403 },
      ),
    };
  }

  if (editContext !== "my") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "You can only edit carrier information from My Carriers for carriers linked to your account.",
        },
        { status: 403 },
      ),
    };
  }

  const ownsRelationship = await userOwnsCarrierRelationship(
    auth.context.supabase,
    auth.context.user.id,
    carrierId,
  );

  if (!ownsRelationship) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Add this carrier to My Carriers before editing its information.",
        },
        { status: 403 },
      ),
    };
  }

  return auth;
}

/** @deprecated Use requireCarrierSharedMutationAuth with editContext "network". */
export async function requireAdminForSharedCarrierMutation(
  request: Request,
): Promise<
  | { ok: true; context: ActiveCarrierUserContext }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireActiveCarrierUser(request);
  if (!auth.ok) {
    return auth;
  }

  if (!isAdminProfile(auth.context.profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Only administrators can edit shared Carrier Network data.",
        },
        { status: 403 },
      ),
    };
  }

  return auth;
}
