"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminAccessDenied() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Access denied</h1>
        <p className="mt-2 text-sm text-zinc-600">
          You do not have permission to view admin pages. Contact an
          administrator if you believe this is a mistake.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export function AdminSubNav() {
  const pathname = usePathname();

  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/brokers", label: "Broker productivity" },
    { href: "/admin/users", label: "Users" },
  ];

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
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
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-zinc-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
      {subtext && <p className="mt-1 text-xs text-zinc-500">{subtext}</p>}
    </div>
  );
}

export function ProductivityScoreHint() {
  return (
    <p className="text-xs text-zinc-500" title="Productivity score explanation">
      Score is based on recent follow-ups, notes, new accounts, contacts,
      opportunities, wins, and overdue items.
    </p>
  );
}
