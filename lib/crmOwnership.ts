export interface CrmReassignmentCounts {
  companies: number;
  contacts: number;
  activities: number;
  followUps: number;
  loadOpportunities: number;
  companyAiInsights: number;
  outreachSuppressions: number;
  brokerReminderLogs: number;
  userCarriers: number;
  aiBrokerAssistantRuns: number;
}

export interface CrmOwnershipInspection {
  inProgress: boolean;
  counts: CrmReassignmentCounts;
}

export const EMPTY_REASSIGNMENT_COUNTS: CrmReassignmentCounts = {
  companies: 0,
  contacts: 0,
  activities: 0,
  followUps: 0,
  loadOpportunities: 0,
  companyAiInsights: 0,
  outreachSuppressions: 0,
  brokerReminderLogs: 0,
  userCarriers: 0,
  aiBrokerAssistantRuns: 0,
};

const COUNT_KEYS: Array<keyof CrmReassignmentCounts> = [
  "companies",
  "contacts",
  "activities",
  "followUps",
  "loadOpportunities",
  "companyAiInsights",
  "outreachSuppressions",
  "brokerReminderLogs",
  "userCarriers",
  "aiBrokerAssistantRuns",
];

export function mandatoryOwnershipRemaining(
  counts: CrmReassignmentCounts,
): number {
  return (
    counts.companies +
    counts.contacts +
    counts.activities +
    counts.followUps +
    counts.loadOpportunities +
    counts.companyAiInsights +
    counts.outreachSuppressions
  );
}

export function deletionAllowedAfterReassignment(
  counts: CrmReassignmentCounts,
): boolean {
  return mandatoryOwnershipRemaining(counts) === 0;
}

export type SlowReassignmentDecision = {
  autoRetry: false;
  action: "wait" | "retry-allowed" | "complete";
  message: string;
};

export function decideAfterSlowReassignment(input: {
  inProgress: boolean;
  counts: CrmReassignmentCounts;
  accountDeleted: boolean;
}): SlowReassignmentDecision {
  if (input.accountDeleted) {
    return {
      autoRetry: false,
      action: "complete",
      message: "The departing account was deleted.",
    };
  }

  if (input.inProgress) {
    return {
      autoRetry: false,
      action: "wait",
      message:
        "Reassignment is still running. This screen will not start another one. Check again after the current operation finishes.",
    };
  }

  const remaining = mandatoryOwnershipRemaining(input.counts);
  if (remaining > 0) {
    return {
      autoRetry: false,
      action: "retry-allowed",
      message: `${formatCount(remaining, "required CRM record")} still assigned to this user. The previous attempt is no longer running, so a retry is safe and will continue from the records that remain.`,
    };
  }

  return {
    autoRetry: false,
    action: "complete",
    message:
      "Required CRM records are no longer assigned to this user. The departing account is still active.",
  };
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatCrmRemovalMessage(input: {
  counts: CrmReassignmentCounts;
  accountDeleted: boolean;
  destinationName: string;
}): string {
  const parts = [
    formatCount(input.counts.companies, "company", "companies"),
    formatCount(input.counts.contacts, "contact"),
    formatCount(input.counts.activities, "activity", "activities"),
    formatCount(input.counts.followUps, "follow-up"),
    formatCount(input.counts.loadOpportunities, "opportunity", "opportunities"),
  ];

  const moved = mandatoryOwnershipRemaining(input.counts);
  const reassignmentSentence =
    moved === 0
      ? `No CRM records remained to reassign to ${input.destinationName}.`
      : `Reassigned ${parts.join(", ")} to ${input.destinationName}.`;

  const accountSentence = input.accountDeleted
    ? "The departing account was deleted."
    : "The departing account is still active.";

  return `${reassignmentSentence} ${accountSentence}`;
}

export function parseReassignmentCounts(value: unknown): CrmReassignmentCounts | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const counts = { ...EMPTY_REASSIGNMENT_COUNTS };

  for (const key of COUNT_KEYS) {
    const raw = record[key];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return null;
    }
    counts[key] = raw;
  }

  return counts;
}
