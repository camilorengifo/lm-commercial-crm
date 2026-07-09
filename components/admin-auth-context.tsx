"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { verifyAdminAccess } from "@/lib/admin";
import { isSuperAdminProfile, type UserProfile } from "@/lib/userProfile";

interface AdminAuthContextValue {
  user: User;
  profile: UserProfile;
  isSuperAdmin: boolean;
  ready: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    verifyAdminAccess().then((result) => {
      if (cancelled) return;

      if (!result.allowed) {
        router.replace(
          result.reason === "unauthenticated" ? "/login" : "/dashboard",
        );
        setDenied(true);
        setReady(true);
        return;
      }

      setUser(result.user);
      setProfile(result.profile);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const value = useMemo<AdminAuthContextValue | null>(() => {
    if (!user || !profile) return null;
    return {
      user,
      profile,
      isSuperAdmin: isSuperAdminProfile(profile),
      ready: true,
    };
  }, [user, profile]);

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Checking admin access...</p>
      </div>
    );
  }

  if (denied || !value) {
    return null;
  }

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider.");
  }
  return context;
}

export function useOptionalAdminAuth(): AdminAuthContextValue | null {
  return useContext(AdminAuthContext);
}
