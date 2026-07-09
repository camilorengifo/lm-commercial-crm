import type { UserRole } from "@/lib/userProfile";

export function isBrokerProductivityEligibleRole(
  role: UserRole | string | null | undefined,
): boolean {
  return role === "broker" || role === "admin";
}

export function productivityRoleLabel(role: UserRole): string {
  return role === "admin" ? "Admin" : "Broker";
}

export const PRODUCTIVITY_SCORE_EXPLANATION =
  "Score is based on recent follow-ups, notes, new accounts, contacts, opportunities, wins, and overdue items.";

export type BrokerActivityLevel =
  | "all"
  | "high"
  | "medium"
  | "low"
  | "needs_attention";

export type BrokerProductivitySort =
  | "productivityScore"
  | "overdueFollowUps"
  | "followUpsCompleted7d"
  | "openPipelineValue"
  | "lastActivityAt"
  | "name";

export interface ProductivityScoreInput {
  followUpsCompleted7d: number;
  activities7d: number;
  companiesCreated30d: number;
  contactsCreated30d: number;
  opportunitiesCreated30d: number;
  opportunitiesWon30d: number;
  overdueFollowUps: number;
}

export function computeProductivityScore(
  input: ProductivityScoreInput,
): number {
  return (
    input.followUpsCompleted7d * 2 +
    input.activities7d * 1 +
    input.companiesCreated30d * 2 +
    input.contactsCreated30d * 2 +
    input.opportunitiesCreated30d * 5 +
    input.opportunitiesWon30d * 10 -
    input.overdueFollowUps * 3
  );
}

export function classifyBrokerActivityLevel(input: {
  productivityScore: number;
  activities7d: number;
  overdueFollowUps: number;
}): Exclude<BrokerActivityLevel, "all"> {
  if (
    input.overdueFollowUps >= 3 ||
    input.activities7d === 0 ||
    input.productivityScore < 0
  ) {
    return "needs_attention";
  }

  if (input.productivityScore >= 20 || input.activities7d >= 10) {
    return "high";
  }

  if (input.productivityScore >= 8 || input.activities7d >= 3) {
    return "medium";
  }

  return "low";
}

export function activityLevelLabel(level: BrokerActivityLevel): string {
  switch (level) {
    case "all":
      return "All";
    case "high":
      return "High activity";
    case "medium":
      return "Medium activity";
    case "low":
      return "Low activity";
    case "needs_attention":
      return "Needs attention";
  }
}

export function getOpportunityPipelineValue(opportunity: {
  estimated_revenue_usd: number | null;
  quoted_rate: number | null;
  target_rate: number | null;
}): number {
  return (
    opportunity.estimated_revenue_usd ??
    opportunity.quoted_rate ??
    opportunity.target_rate ??
    0
  );
}

export function formatPipelineValue(value: number): string {
  if (value <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function filterBrokersByActivityLevel<
  T extends { activityLevel: Exclude<BrokerActivityLevel, "all"> },
>(rows: T[], level: BrokerActivityLevel): T[] {
  if (level === "all") return rows;
  return rows.filter((row) => row.activityLevel === level);
}

export function sortBrokerProductivityRows<
  T extends {
    name: string;
    productivityScore: number;
    overdueFollowUps: number;
    followUpsCompleted7d: number;
    openPipelineValue: number;
    lastActivityAt: string | null;
  },
>(rows: T[], sort: BrokerProductivitySort): T[] {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    switch (sort) {
      case "productivityScore":
        return b.productivityScore - a.productivityScore;
      case "overdueFollowUps":
        return b.overdueFollowUps - a.overdueFollowUps;
      case "followUpsCompleted7d":
        return b.followUpsCompleted7d - a.followUpsCompleted7d;
      case "openPipelineValue":
        return b.openPipelineValue - a.openPipelineValue;
      case "lastActivityAt": {
        const aTime = a.lastActivityAt
          ? new Date(a.lastActivityAt).getTime()
          : 0;
        const bTime = b.lastActivityAt
          ? new Date(b.lastActivityAt).getTime()
          : 0;
        return bTime - aTime;
      }
      case "name":
        return a.name.localeCompare(b.name);
    }
  });

  return sorted;
}
