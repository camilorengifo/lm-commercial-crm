"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { AiBrokerAssistantSection } from "@/components/ai-broker-assistant-section";
import {
  fetchAdminDashboardStats,
  type AdminDashboardStats,
} from "@/lib/adminStats";
import {
  ACTIVITY_TYPE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  priorityBadgeClass,
  loadOpportunityStatusBadgeClass,
  type ActivityType,
  type FollowUpStatus,
} from "@/lib/crmConstants";
import { formatDate, formatDateTime, formatSupabaseError } from "@/lib/crmFormat";
import {
  fetchBrokerDashboardData,
  getDaysOverdue,
  getTodayHeading,
  LIST_LIMIT,
  type ActionPlanItem,
  type BrokerDashboardData,
  type FollowUpDashboardItem,
  type HighPriorityCompanyItem,
  type OpenOpportunityDashboardItem,
  type RecentActivityItem,
} from "@/lib/brokerDashboard";
import { completeFollowUp } from "@/lib/followUps";
import {
  fetchUserProfile,
  isAdminProfile,
  type UserProfile,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

const FOLLOW_UP_STATUS_ES: Record<FollowUpStatus, string> = {
  pending: "Pendiente",
  completed: "Completado",
  cancelled: "Cancelado",
};

const ACTIVITY_TYPE_ES: Record<ActivityType, string> = {
  call: "Llamada",
  email: "Email",
  meeting: "Reunión",
  visit: "Visita",
  note: "Nota",
  other: "Otro",
};

function SummaryCard({
  label,
  value,
  subtext,
  highlight,
}: {
  label: string;
  value: number | string;
  subtext?: string;
  highlight?: "danger" | "warning";
}) {
  const highlightClass =
    highlight === "danger"
      ? "border-red-200 bg-red-50/50"
      : highlight === "warning"
        ? "border-amber-200 bg-amber-50/50"
        : "border-zinc-200 bg-white";

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${highlightClass}`}>
      <p className="text-sm font-medium text-zinc-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
      {subtext && <p className="mt-1 text-xs text-zinc-500">{subtext}</p>}
    </div>
  );
}

function QuickNav({ isAdmin }: { isAdmin: boolean }) {
  const links = [
    { href: "/companies", label: "Empresas" },
    { href: "/opportunities", label: "Oportunidades" },
    { href: "/pipeline", label: "Pipeline" },
    { href: "/follow-ups", label: "Follow-ups" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function actionPlanBadgeClass(kind: ActionPlanItem["kind"]): string {
  switch (kind) {
    case "overdue":
      return "bg-red-100 text-red-800";
    case "today":
      return "bg-amber-100 text-amber-800";
    case "high_priority":
      return "bg-orange-100 text-orange-800";
    case "opportunity":
      return "bg-sky-100 text-sky-800";
  }
}

function actionPlanLabel(kind: ActionPlanItem["kind"]): string {
  switch (kind) {
    case "overdue":
      return "Vencido";
    case "today":
      return "Para hoy";
    case "high_priority":
      return "Alta prioridad";
    case "opportunity":
      return "Oportunidad";
  }
}

function formatActivityType(value: string): string {
  if (value in ACTIVITY_TYPE_ES) {
    return ACTIVITY_TYPE_ES[value as ActivityType];
  }

  if (value in ACTIVITY_TYPE_LABELS) {
    return ACTIVITY_TYPE_LABELS[value as ActivityType];
  }

  return value;
}

function FollowUpRow({
  followUp,
  variant,
  completing,
  onMarkDone,
}: {
  followUp: FollowUpDashboardItem;
  variant: "overdue" | "today";
  completing: boolean;
  onMarkDone: (followUp: FollowUpDashboardItem) => void;
}) {
  const variantClass =
    variant === "overdue"
      ? "border-red-200 bg-red-50/60"
      : "border-amber-200 bg-amber-50/50";

  const statusLabel =
    FOLLOW_UP_STATUS_ES[followUp.status] ??
    FOLLOW_UP_STATUS_LABELS[followUp.status];

  return (
    <li className={`rounded-lg border p-4 ${variantClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900">
              <Link
                href={`/companies/${followUp.company_id}`}
                className="underline-offset-2 hover:underline"
              >
                {followUp.companyName}
              </Link>
            </p>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(followUp.companyPriority)}`}
            >
              {followUp.companyPriority}
            </span>
          </div>
          {followUp.contactName && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium">Contacto:</span> {followUp.contactName}
            </p>
          )}
          <p className="text-sm text-zinc-700">
            <span className="font-medium">Follow-up:</span> {followUp.followUpNote}
          </p>
          <p className="text-sm text-zinc-600">
            <span className="font-medium">Vence:</span>{" "}
            {formatDateTime(followUp.due_at)}
            <span className="ml-2 text-zinc-500">· {statusLabel}</span>
            {variant === "overdue" && (
              <span className="ml-2 font-medium text-red-700">
                ({getDaysOverdue(followUp.due_at)} día
                {getDaysOverdue(followUp.due_at) === 1 ? "" : "s"} vencido)
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMarkDone(followUp)}
            disabled={completing}
            className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {completing ? "Guardando..." : "Marcar hecho"}
          </button>
          <Link
            href={`/companies/${followUp.company_id}`}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Ver empresa
          </Link>
        </div>
      </div>
    </li>
  );
}

function HighPriorityCompanyRow({
  company,
}: {
  company: HighPriorityCompanyItem;
}) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-zinc-900">{company.name}</p>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadgeClass(company.priority)}`}
          >
            {company.priority}
          </span>
        </div>
        <p className="text-sm text-zinc-600">{company.reason}</p>
        <p className="text-sm text-zinc-500">
          Último contacto:{" "}
          {company.lastActivityAt
            ? formatDate(company.lastActivityAt)
            : "Sin actividad registrada"}
        </p>
        <p className="text-sm text-zinc-500">
          Próximo follow-up:{" "}
          {company.nextFollowUpAt
            ? formatDate(company.nextFollowUpAt)
            : "Sin follow-up programado"}
        </p>
      </div>

      <Link
        href={`/companies/${company.id}`}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        Ver empresa
      </Link>
    </li>
  );
}

function OpenOpportunityRow({
  opportunity,
}: {
  opportunity: OpenOpportunityDashboardItem;
}) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-zinc-900">
          {opportunity.companyName}
        </p>
        <p className="text-sm text-zinc-700">{opportunity.title}</p>
        {opportunity.laneLabel && opportunity.laneLabel !== "—" && (
          <p className="text-sm text-zinc-600">
            <span className="font-medium">Ruta:</span> {opportunity.laneLabel}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${loadOpportunityStatusBadgeClass(opportunity.status)}`}
          >
            {opportunity.status}
          </span>
          {opportunity.estimatedValue && (
            <span className="text-sm text-zinc-600">
              Valor est.: {opportunity.estimatedValue}
            </span>
          )}
        </div>
      </div>

      <Link
        href={`/companies/${opportunity.companyId}`}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        Ver empresa
      </Link>
    </li>
  );
}

function RecentActivityRow({ activity }: { activity: RecentActivityItem }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-zinc-900">
          <Link
            href={`/companies/${activity.companyId}`}
            className="underline-offset-2 hover:underline"
          >
            {activity.companyName}
          </Link>
        </p>
        <p className="text-sm text-zinc-600">
          <span className="font-medium">
            {formatActivityType(activity.activityType)}
          </span>
          {" · "}
          {formatDateTime(activity.activityAt)}
        </p>
        <p className="line-clamp-2 text-sm text-zinc-700">{activity.preview}</p>
      </div>

      <Link
        href={`/companies/${activity.companyId}`}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        Ver empresa
      </Link>
    </li>
  );
}

function AdminDashboardView({ stats }: { stats: AdminDashboardStats }) {
  return (
    <>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard label="Total empresas" value={stats.totalCompanies} />
        <SummaryCard label="Total brokers" value={stats.totalBrokers} />
        <SummaryCard
          label="Follow-ups para hoy"
          value={stats.followUpsDueToday}
          highlight={stats.followUpsDueToday > 0 ? "warning" : undefined}
        />
        <SummaryCard
          label="Follow-ups vencidos"
          value={stats.overdueFollowUps}
          highlight={stats.overdueFollowUps > 0 ? "danger" : undefined}
        />
        <SummaryCard
          label="Empresas alta prioridad"
          value={stats.highPriorityCompanies}
          highlight={
            stats.highPriorityCompanies > 0 ? "warning" : undefined
          }
        />
        <SummaryCard
          label="Oportunidades abiertas"
          value={stats.openOpportunities}
        />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-zinc-900">
          Resumen de actividad por broker
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Vista global de carga comercial y actividad reciente por broker.
        </p>

        {stats.brokerRows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No hay brokers registrados todavía.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Broker
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Email
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">
                    Empresas
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">
                    Follow-ups hoy
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">
                    Vencidos
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">
                    Actividad 7 días
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Última actividad
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {stats.brokerRows.map((row) => (
                  <tr key={row.userId}>
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{row.email}</td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {row.companies}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {row.followUpsDueToday}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {row.overdueFollowUps}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {row.activityCount7d}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {row.lastActivityAt
                        ? formatDate(row.lastActivityAt)
                        : "Sin actividad"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function BrokerDashboardView({
  dashboard,
  completingId,
  onMarkDone,
}: {
  dashboard: BrokerDashboardData;
  completingId: string | null;
  onMarkDone: (followUp: FollowUpDashboardItem) => void;
}) {
  const {
    metrics,
    actionPlan,
    dueToday,
    overdue,
    highPriorityCompanies,
    openOpportunities,
    recentActivities,
  } = dashboard;

  return (
    <>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard label="Total empresas" value={metrics.companyCount} />
        <SummaryCard
          label="Alta prioridad / hot"
          value={metrics.hotPriorityCount}
          highlight={metrics.hotPriorityCount > 0 ? "warning" : undefined}
        />
        <SummaryCard
          label="Follow-ups para hoy"
          value={metrics.dueTodayCount}
          highlight={metrics.dueTodayCount > 0 ? "warning" : undefined}
        />
        <SummaryCard
          label="Follow-ups vencidos"
          value={metrics.overdueCount}
          highlight={metrics.overdueCount > 0 ? "danger" : undefined}
        />
        <SummaryCard
          label="Oportunidades abiertas"
          value={metrics.openOpportunityCount}
          subtext={`Ganadas: ${metrics.wonOpportunityCount} · Perdidas: ${metrics.lostOpportunityCount}`}
        />
        <SummaryCard
          label="Actividad últimos 7 días"
          value={metrics.recentActivityCount7d}
          subtext={
            metrics.lastActivityDate
              ? `Última actividad: ${formatDate(metrics.lastActivityDate)}`
              : "Sin actividad registrada"
          }
        />
      </div>

      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-zinc-900">Plan de acción de hoy</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Tareas prioritarias entre follow-ups, cuentas y oportunidades.
        </p>

        {actionPlan.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No hay tareas urgentes ahora. Revisa tus empresas o pipeline para
            planificar el día.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {actionPlan.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${actionPlanBadgeClass(item.kind)}`}
                    >
                      {actionPlanLabel(item.kind)}
                    </span>
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.title}
                    </p>
                  </div>
                  <p className="text-sm text-zinc-600">{item.detail}</p>
                </div>

                <Link
                  href={item.href}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AiBrokerAssistantSection />

      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Follow-ups de hoy
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Seguimientos programados para hoy
              </p>
            </div>
            <Link
              href="/follow-ups"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              Ver todos
            </Link>
          </div>

          {dueToday.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No tienes follow-ups para hoy.
            </p>
          ) : (
            <ul className="space-y-3">
              {dueToday.slice(0, LIST_LIMIT).map((followUp) => (
                <FollowUpRow
                  key={followUp.id}
                  followUp={followUp}
                  variant="today"
                  completing={completingId === followUp.id}
                  onMarkDone={onMarkDone}
                />
              ))}
            </ul>
          )}

          {dueToday.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-zinc-500">
              Mostrando {LIST_LIMIT} de {dueToday.length}.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Follow-ups vencidos
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Seguimientos atrasados que requieren atención
              </p>
            </div>
            <Link
              href="/follow-ups"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              Ver todos
            </Link>
          </div>

          {overdue.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No tienes follow-ups vencidos.
            </p>
          ) : (
            <ul className="space-y-3">
              {overdue.slice(0, LIST_LIMIT).map((followUp) => (
                <FollowUpRow
                  key={followUp.id}
                  followUp={followUp}
                  variant="overdue"
                  completing={completingId === followUp.id}
                  onMarkDone={onMarkDone}
                />
              ))}
            </ul>
          )}

          {overdue.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-zinc-500">
              Mostrando {LIST_LIMIT} de {overdue.length}.
            </p>
          )}
        </section>
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Empresas calientes para atacar
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Alta prioridad, sin actividad reciente o sin follow-up
                programado
              </p>
            </div>
            <Link
              href="/companies"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              Ver todas
            </Link>
          </div>

          {highPriorityCompanies.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No hay empresas calientes que requieran atención ahora.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {highPriorityCompanies.slice(0, LIST_LIMIT).map((company) => (
                <HighPriorityCompanyRow key={company.id} company={company} />
              ))}
            </ul>
          )}

          {highPriorityCompanies.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-zinc-500">
              Mostrando {LIST_LIMIT} de {highPriorityCompanies.length}.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                Oportunidades activas
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Oportunidades de carga abiertas en tus cuentas
              </p>
            </div>
            <Link
              href="/opportunities"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              Ver todas
            </Link>
          </div>

          {openOpportunities.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No tienes oportunidades abiertas todavía.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {openOpportunities.slice(0, LIST_LIMIT).map((opportunity) => (
                <OpenOpportunityRow
                  key={opportunity.id}
                  opportunity={opportunity}
                />
              ))}
            </ul>
          )}

          {openOpportunities.length > LIST_LIMIT && (
            <p className="mt-4 text-sm text-zinc-500">
              Mostrando {LIST_LIMIT} de {openOpportunities.length}.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-zinc-900">
              Actividad reciente
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Últimas notas y actividades registradas en el CRM
            </p>
          </div>
        </div>

        {recentActivities.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay actividad reciente.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {recentActivities.map((activity) => (
              <RecentActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function HomeDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [brokerDashboard, setBrokerDashboard] =
    useState<BrokerDashboardData | null>(null);
  const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(
    null,
  );
  const [completingId, setCompletingId] = useState<string | null>(null);

  const isAdmin = isAdminProfile(profile);

  const loadDashboard = useCallback(async (userId: string, asAdmin: boolean) => {
    setFetchError(null);

    if (asAdmin) {
      const { data, error } = await fetchAdminDashboardStats();

      if (error || !data) {
        setFetchError(
          formatSupabaseError(error ?? { message: "No se pudo cargar el panel." }),
        );
        return;
      }

      setAdminStats(data);
      setBrokerDashboard(null);
      return;
    }

    const { data, error } = await fetchBrokerDashboardData(userId);

    if (error || !data) {
      setFetchError(
        formatSupabaseError(error ?? { message: "No se pudo cargar el panel." }),
      );
      return;
    }

    setBrokerDashboard(data);
    setAdminStats(null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);

      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);

      await loadDashboard(
        session.user.id,
        isAdminProfile(userProfile),
      );
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      const { data: userProfile } = await fetchUserProfile(session.user.id);
      setProfile(userProfile);
      await loadDashboard(session.user.id, isAdminProfile(userProfile));
    });

    return () => subscription.unsubscribe();
  }, [router, loadDashboard]);

  async function handleMarkDone(followUp: FollowUpDashboardItem) {
    if (!user) return;

    setCompletingId(followUp.id);

    const { error } = await completeFollowUp(
      followUp.id,
      user.id,
      followUp.company_id,
    );

    if (error) {
      setFetchError(formatSupabaseError(error));
      setCompletingId(null);
      return;
    }

    await loadDashboard(user.id, false);
    setCompletingId(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Cargando...</p>
      </div>
    );
  }

  if (!user || (!brokerDashboard && !adminStats)) {
    return null;
  }

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Hoy
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            {getTodayHeading()}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {isAdmin
              ? "Vista operativa global para administradores."
              : "Tu panel operativo del día. Sesión iniciada como "}
            {!isAdmin && (
              <span className="font-medium text-zinc-900">{user.email}</span>
            )}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <QuickNav isAdmin={isAdmin} />
          {!isAdmin && (
            <Link
              href="/companies"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Agregar empresa
            </Link>
          )}
        </div>
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      {isAdmin && adminStats ? (
        <AdminDashboardView stats={adminStats} />
      ) : brokerDashboard ? (
        <BrokerDashboardView
          dashboard={brokerDashboard}
          completingId={completingId}
          onMarkDone={handleMarkDone}
        />
      ) : null}
    </AuthenticatedLayout>
  );
}
