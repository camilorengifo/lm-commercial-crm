"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { sessionNeedsPasswordSetup } from "@/lib/invitationSession";
import {
  fetchUserProfile,
  isActiveProfile,
} from "@/lib/userProfile";

export function ActiveUserGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setChecking(false);
        return;
      }

      const { data: profile } = await fetchUserProfile(session.user.id);

      if (profile && !isActiveProfile(profile)) {
        await supabase.auth.signOut();
        setBlocked(true);
        router.replace("/login?inactive=1");
        return;
      }

      if (sessionNeedsPasswordSetup(session)) {
        router.replace("/set-password");
        return;
      }

      setChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setBlocked(false);
        setChecking(false);
        return;
      }

      const { data: profile } = await fetchUserProfile(session.user.id);

      if (profile && !isActiveProfile(profile)) {
        await supabase.auth.signOut();
        setBlocked(true);
        router.replace("/login?inactive=1");
        return;
      }

      if (sessionNeedsPasswordSetup(session)) {
        router.replace("/set-password");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (checking || blocked) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
