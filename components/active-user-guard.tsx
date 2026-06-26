"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  signOutAndClearSession,
} from "@/lib/authSession";
import { supabase } from "@/lib/supabaseClient";
import { sessionNeedsPasswordSetup } from "@/lib/invitationSession";
import {
  fetchUserProfile,
  isActiveProfile,
  isAdminProfile,
  isBlockedProfile,
} from "@/lib/userProfile";

export function ActiveUserGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function evaluateSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setChecking(false);
        return;
      }

      const { data: profile } = await fetchUserProfile(session.user.id);

      if (profile && !isActiveProfile(profile)) {
        await signOutAndClearSession();
        window.location.href = "/login?inactive=1";
        return;
      }

      if (profile && isBlockedProfile(profile) && !isAdminProfile(profile)) {
        setBlockedMessage(
          profile.blocked_reason ??
            "Your account has been temporarily blocked. Please contact an administrator.",
        );
        setChecking(false);
        return;
      }

      if (sessionNeedsPasswordSetup(session)) {
        router.replace("/set-password");
        return;
      }

      setBlockedMessage(null);
      setChecking(false);
    }

    void evaluateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setBlockedMessage(null);
        setChecking(false);
        return;
      }

      const { data: profile } = await fetchUserProfile(session.user.id);

      if (profile && !isActiveProfile(profile)) {
        await signOutAndClearSession();
        window.location.href = "/login?inactive=1";
        return;
      }

      if (profile && isBlockedProfile(profile) && !isAdminProfile(profile)) {
        setBlockedMessage(
          profile.blocked_reason ??
            "Your account has been temporarily blocked. Please contact an administrator.",
        );
        setChecking(false);
        return;
      }

      if (sessionNeedsPasswordSetup(session)) {
        router.replace("/set-password");
        return;
      }

      setBlockedMessage(null);
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (blockedMessage) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Account blocked</h1>
          <p className="mt-2 text-sm text-zinc-600">{blockedMessage}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
