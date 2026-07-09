"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CrmCard, StatCard } from "@/components/crm-ui";

export function AdminAccessDenied() {
  return (
    <div className="crm-app-bg flex min-h-full flex-1 items-center justify-center px-4">
      <CrmCard className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600">
          You do not have permission to view admin pages. Contact an
          administrator if you believe this is a mistake.
        </p>
        <Link href="/" className="crm-btn-primary mt-6">
          Back to dashboard
        </Link>
      </CrmCard>
    </div>
  );
}

export function AdminSubNav() {
  const pathname = usePathname();

  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/brokers", label: "Broker & admin productivity" },
    { href: "/admin/companies", label: "Companies" },
    { href: "/admin/users", label: "Users" },
  ];

  return (
    <nav className="crm-admin-subnav">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active ? "crm-admin-subnav-link crm-admin-subnav-link-active" : "crm-admin-subnav-link"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSummaryCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: number | string;
  subtext?: string;
}) {
  return <StatCard label={label} value={value} subtext={subtext} />;
}

import { PRODUCTIVITY_SCORE_EXPLANATION } from "@/lib/brokerProductivity";

export function ProductivityScoreHint() {
  return (
    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
      {PRODUCTIVITY_SCORE_EXPLANATION}
    </p>
  );
}
