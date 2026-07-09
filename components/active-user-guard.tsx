"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  signOutAndClearSession,
} from "@/lib/authSession";
import { sessionNeedsPasswordSetup } from "@/lib/invitationSession";
import { SESSION_CHECK_TIMEOUT_MS } from "@/lib/postLoginNavigation";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchUserProfile,
  isActiveProfile,
  isAdminProfile,
  isBlockedProfile,
} from "@/lib/userProfile";

export function ActiveUserGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [guardTitle, setGuardTitle] = useState("Unable to continue");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkingTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setChecking(false);
        setGuardTitle("Unable to continue");
        setBlockedMessage(
          "Unable to verify your account. Please refresh the page or sign in again.",
        );
      }
    }, SESSION_CHECK_TIMEOUT_MS);

    async function evaluateSession(sessionUserId: string) {
      const { data: profile, error } = await fetchUserProfile(sessionUserId);

      if (error) {
        console.error("[auth] profile fetch failed", error);
        setGuardTitle("Unable to continue");
        setBlockedMessage(
          "Unable to load your profile. Please refresh or sign in again.",
        );
        return;
      }

      if (profile && !isActiveProfile(profile)) {
        await signOutAndClearSession();
        window.location.href = "/login?inactive=1";
        return;
      }

      if (profile && isBlockedProfile(profile) && !isAdminProfile(profile)) {
        setGuardTitle("Account blocked");
        setBlockedMessage(
          profile.blocked_reason ??
            "Your account has been temporarily blocked. Please contact an administrator.",
        );
        return;
      }

      setGuardTitle("Unable to continue");
      setBlockedMessage(null);
    }

    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) {
          return;
        }

        if (!session) {
          router.replace("/login");
          return;
        }

        if (sessionNeedsPasswordSetup(session)) {
          router.replace("/set-password");
          router.refresh();
          return;
        }

        await evaluateSession(session.user.id);
      } catch (error) {
        console.error("[auth] session check failed", error);
        if (!cancelled) {
          setGuardTitle("Unable to continue");
          setBlockedMessage(
            "Unable to verify your account. Please refresh the page or sign in again.",
          );
        }
      } finally {
        if (!cancelled) {
          window.clearTimeout(checkingTimeout);
          setChecking(false);
        }
      }
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) {
        return;
      }

      if (!session) {
        setBlockedMessage(null);
        router.replace("/login");
        return;
      }

      if (sessionNeedsPasswordSetup(session)) {
        router.replace("/set-password");
        router.refresh();
        return;
      }

      try {
        await evaluateSession(session.user.id);
      } catch (error) {
        console.error("[auth] auth state profile check failed", error);
        setGuardTitle("Unable to continue");
        setBlockedMessage(
          "Unable to load your profile. Please refresh or sign in again.",
        );
      } finally {
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(checkingTimeout);
      subscription.unsubscribe();
    };
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
          <h1 className="text-xl font-semibold text-zinc-900">{guardTitle}</h1>
          <p className="mt-2 text-sm text-zinc-600">{blockedMessage}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
