"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  detectFetchModeFromPath,
  isSecurityDebugEnabled,
} from "@/lib/securityDebug";
import { UNASSIGNED_OFFICE_LABEL } from "@/lib/offices";
import {
  fetchUserProfile,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

export function SecurityDebugPanel() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [officeName, setOfficeName] = useState<string | null>(null);
  const [probeSummary, setProbeSummary] = useState<string | null>(null);

  const fetchMode = useMemo(
    () => detectFetchModeFromPath(pathname ?? "/"),
    [pathname],
  );

  useEffect(() => {
    if (!isSecurityDebugEnabled()) {
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        setAuthUserId(null);
        setAuthEmail(null);
        setProfile(null);
        setOfficeName(null);
        return;
      }

      setAuthUserId(session.user.id);
      setAuthEmail(session.user.email ?? null);

      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      if (!userProfile) {
        setOfficeName(null);
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("office_id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!profileRow?.office_id) {
        setOfficeName(UNASSIGNED_OFFICE_LABEL);
        return;
      }

      const { data: office } = await supabase
        .from("offices")
        .select("name")
        .eq("id", profileRow.office_id)
        .maybeSingle();

      setOfficeName(office?.name ?? UNASSIGNED_OFFICE_LABEL);
    });
  }, [pathname]);

  async function runSecurityProbe() {
    setProbeSummary("Running probe...");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setProbeSummary("No session token.");
      return;
    }

    const response = await fetch("/api/dev/security-probe", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = (await response.json()) as {
      unfilteredCount?: number;
      filteredCount?: number;
      foreignCompanyCount?: number;
      rlsLikelyBroken?: boolean;
      profileRole?: string | null;
      error?: string;
    };

    if (!response.ok) {
      setProbeSummary(payload.error ?? "Probe failed.");
      return;
    }

    setProbeSummary(
      `role=${payload.profileRole ?? "?"} unfiltered=${payload.unfilteredCount ?? 0} filtered=${payload.filteredCount ?? 0} foreign=${payload.foreignCompanyCount ?? 0} rlsBroken=${payload.rlsLikelyBroken ? "YES" : "no"}`,
    );
  }

  if (!isSecurityDebugEnabled()) {
    return null;
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 shadow-lg">
      <p className="font-semibold">Security debug (dev only)</p>
      <dl className="mt-2 space-y-1">
        <div>
          <dt className="font-medium">Path</dt>
          <dd className="break-all">{pathname}</dd>
        </div>
        <div>
          <dt className="font-medium">Fetch mode</dt>
          <dd>{fetchMode}</dd>
        </div>
        <div>
          <dt className="font-medium">Auth user id</dt>
          <dd className="break-all">{authUserId ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">Email</dt>
          <dd className="break-all">{authEmail ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">Profile role</dt>
          <dd>{profile?.role ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">Profile office</dt>
          <dd>{officeName ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">isAdminProfile()</dt>
          <dd>{isAdminProfile(profile) ? "true" : "false"}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => void runSecurityProbe()}
        className="mt-3 rounded border border-amber-400 bg-white px-2 py-1 font-medium hover:bg-amber-100"
      >
        Run RLS probe
      </button>
      {probeSummary && <p className="mt-2 break-all">{probeSummary}</p>}
    </div>
  );
}
