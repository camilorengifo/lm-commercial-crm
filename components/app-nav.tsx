"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchUserProfile,
  isAdminProfile,
} from "@/lib/userProfile";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", short: "Home" },
  { href: "/assistant", label: "AI Assistant", short: "AI" },
  { href: "/companies", label: "Companies", short: "Accounts" },
  { href: "/opportunities", label: "Opportunities", short: "Opps" },
  { href: "/pipeline", label: "Pipeline", short: "Pipeline" },
  { href: "/follow-ups", label: "Follow-ups", short: "Follow-ups" },
  { href: "/import", label: "Import", short: "Import" },
] as const;

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  const opacity = active ? 1 : 0.65;

  const paths: Record<string, ReactNode> = {
    "/": (
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    ),
    "/assistant": (
      <path
        d="M12 3l2.2 4.5L19 8.5l-3.5 3.2.9 5.2L12 15l-4.4 2.9.9-5.2L5 8.5l4.8-1L12 3z"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    ),
    "/companies": (
      <>
        <path d="M6 20V10l6-4 6 4v10" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M9 20v-5h6v5" strokeWidth="1.75" />
      </>
    ),
    "/opportunities": (
      <path
        d="M6 8h12M6 12h8M6 16h10M6 4h12"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    ),
    "/pipeline": (
      <>
        <rect x="4" y="5" width="4" height="14" rx="1" strokeWidth="1.75" />
        <rect x="10" y="8" width="4" height="11" rx="1" strokeWidth="1.75" />
        <rect x="16" y="6" width="4" height="13" rx="1" strokeWidth="1.75" />
      </>
    ),
    "/follow-ups": (
      <>
        <circle cx="12" cy="12" r="8" strokeWidth="1.75" />
        <path d="M12 8v4l3 2" strokeWidth="1.75" strokeLinecap="round" />
      </>
    ),
    "/import": (
      <path
        d="M12 4v10M8 10l4 4 4-4M6 20h12"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    "/admin": (
      <>
        <circle cx="12" cy="12" r="3" strokeWidth="1.75" />
        <path
          d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </>
    ),
  };

  return (
    <span
      className={`crm-sidebar-icon ${active ? "crm-sidebar-icon-active" : ""}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        style={{ opacity }}
        aria-hidden
      >
        {paths[href] ?? <circle cx="12" cy="12" r="4" strokeWidth="1.75" />}
      </svg>
    </span>
  );
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
    ? [...NAV_ITEMS, { href: "/admin", label: "Admin", short: "Admin" } as const]
    : NAV_ITEMS;

  const mainItems = navItems.filter((item) => item.href !== "/admin");
  const adminItem = navItems.find((item) => item.href === "/admin");

  return (
    <>
      <aside className="crm-sidebar">
        <div className="crm-sidebar-brand">
          <div className="flex items-center gap-3">
            <div className="crm-sidebar-brand-mark">LM</div>
            <div className="min-w-0">
              <p className="crm-sidebar-brand-title">Logistics Masters</p>
              <p className="crm-sidebar-brand-sub">Commercial CRM</p>
            </div>
          </div>
        </div>

        <nav className="crm-sidebar-nav" aria-label="Main navigation">
          <p className="crm-sidebar-nav-label">Main</p>
          {mainItems.map((item) => {
            const active = isNavActive(item.href, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "crm-sidebar-link crm-sidebar-link-active"
                    : "crm-sidebar-link"
                }
              >
                <NavIcon href={item.href} active={active} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {adminItem && (
            <>
              <p className="crm-sidebar-nav-label mt-5">Administration</p>
              <Link
                href={adminItem.href}
                className={
                  isNavActive(adminItem.href, pathname)
                    ? "crm-sidebar-link crm-sidebar-link-active"
                    : "crm-sidebar-link"
                }
              >
                <NavIcon href={adminItem.href} active={isNavActive(adminItem.href, pathname)} />
                <span>{adminItem.label}</span>
              </Link>
            </>
          )}
        </nav>

        <div className="crm-sidebar-footer">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="crm-sidebar-signout"
          >
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <header className="crm-mobile-header">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="crm-sidebar-brand-mark !h-8 !w-8 !text-[11px]">LM</div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Logistics Masters
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Commercial CRM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="crm-btn-secondary crm-btn-sm"
          >
            {loggingOut ? "..." : "Logout"}
          </button>
        </div>
        <nav className="crm-mobile-nav" aria-label="Mobile navigation">
          {navItems.map((item) => {
            const active = isNavActive(item.href, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active ? "crm-mobile-link crm-mobile-link-active" : "crm-mobile-link"
                }
              >
                {item.short}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
