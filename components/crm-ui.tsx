import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="crm-page-header">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="crm-eyebrow">{eyebrow}</p>}
          <h1 className={`crm-page-title ${eyebrow ? "mt-1.5" : ""}`}>{title}</h1>
          {description && <p className="crm-page-subtitle">{description}</p>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 lg:pb-0.5">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className = "mb-3",
  accent,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  accent?: "blue" | "amber" | "red" | "emerald";
}) {
  const dotClass =
    accent === "amber"
      ? "bg-amber-400"
      : accent === "red"
        ? "bg-red-400"
        : accent === "emerald"
          ? "bg-emerald-400"
          : accent === "blue"
            ? "bg-blue-500"
            : "bg-slate-300";

  return (
    <div
      className={`flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="flex items-start gap-2.5">
        {accent && (
          <span
            className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
            aria-hidden
          />
        )}
        <div>
          <h2 className="crm-section-title">{title}</h2>
        {description &&
          (typeof description === "string" ? (
            <p className="crm-section-subtitle">{description}</p>
          ) : (
            <div className="crm-section-subtitle">{description}</div>
          ))}
        </div>
      </div>
      {actions}
    </div>
  );
}

export function CrmCard({
  children,
  className = "",
  padding = true,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
  accent?: "top" | boolean;
}) {
  return (
    <div
      className={`crm-card ${padding ? "crm-card-padded" : ""} ${hover ? "crm-card-hover" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function StatGrid({
  children,
  columns = 4,
  className = "",
}: {
  children: ReactNode;
  columns?: 4 | 5 | 6;
  className?: string;
}) {
  const columnClass =
    columns === 6
      ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
      : columns === 5
        ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        : "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className={`crm-stat-grid ${columnClass} ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  subtext,
  highlight,
  href,
}: {
  label: string;
  value: number | string;
  subtext?: string;
  highlight?: "danger" | "warning";
  href?: string;
}) {
  const highlightClass =
    highlight === "danger"
      ? "crm-stat-card-danger"
      : highlight === "warning"
        ? "crm-stat-card-warning"
        : "";

  const content = (
    <>
      <p className="crm-stat-label">{label}</p>
      <p className="crm-stat-value">{value}</p>
      {subtext && <p className="crm-stat-subtext">{subtext}</p>}
    </>
  );

  const className = `crm-stat-card block ${highlightClass}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

export function ActionPlanRow({
  badge,
  badgeClass,
  title,
  detail,
  href,
}: {
  badge: string;
  badgeClass: string;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <li className="crm-action-plan-item">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <span className={badgeClass}>{badge}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{detail}</p>
        </div>
      </div>
      <Link href={href} className="crm-btn-primary crm-btn-sm shrink-0">
        Open
      </Link>
    </li>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="crm-empty-state">
      <div className="crm-empty-state-icon" aria-hidden>
        —
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
    </div>
  );
}

export function CrmAlert({
  variant,
  children,
  className = "mb-6",
}: {
  variant: "error" | "success" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const variantClass =
    variant === "error"
      ? "crm-alert-error"
      : variant === "success"
        ? "crm-alert-success"
        : "crm-alert-warning";

  return <div className={`${variantClass} ${className}`}>{children}</div>;
}

export function ListPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={`crm-list-panel divide-y divide-slate-100 ${className}`}>
      {children}
    </ul>
  );
}

export function WorkspaceSection({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`crm-workspace-section ${className}`}>{children}</div>;
}
