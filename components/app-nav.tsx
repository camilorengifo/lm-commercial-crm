"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchUserProfile,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/companies", label: "Companies" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/import", label: "Import" },
] as const;

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setIsAdmin(false);
        return;
      }

      const { data: profile } = await fetchUserProfile(session.user.id);
      setIsAdmin(isAdminProfile(profile));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setIsAdmin(false);
        return;
      }

      const { data: profile } = await fetchUserProfile(session.user.id);
      setIsAdmin(isAdminProfile(profile));
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const navItems = isAdmin
    ? [...NAV_ITEMS, { href: "/admin", label: "Admin" } as const]
    : NAV_ITEMS;

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Logistics Masters AI Commercial Assistant
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const active = isNavActive(item.href, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? "Signing out..." : "Logout"}
          </button>
        </nav>
      </div>
    </header>
  );
}
