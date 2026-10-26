export const DO_NOT_FOLLOW_UP_REASONS = [
  {
    value: "customer_requested_no_contact",
    label: "Customer Requested No Contact",
  },
  {
    value: "no_response_after_multiple_attempts",
    label: "No Response After Multiple Attempts",
  },
  {
    value: "not_interested",
    label: "Not Interested",
  },
  {
    value: "not_a_good_fit",
    label: "Not a Good Fit",
  },
  {
    value: "other",
    label: "Other",
  },
] as const;

export type DoNotFollowUpReason =
  (typeof DO_NOT_FOLLOW_UP_REASONS)[number]["value"];

export type FollowUpSuppressionChoice = "none" | "contact" | "company";

export type OutreachSuppressionScope = "contact" | "company";

export interface SuppressionIndex {
  suppressedCompanyIds: Set<string>;
  suppressedContactIds: Set<string>;
}

export interface SuppressionIndexRow {
  company_id: string;
  contact_id: string | null;
  scope: string;
}

export const COMPANY_FOLLOW_UP_SUPPRESSED_MESSAGE =
  "Follow-ups are suppressed for this company because further contact was declined. New follow-ups cannot be scheduled. The company record is not archived or deleted.";

export const CONTACT_FOLLOW_UP_SUPPRESSED_MESSAGE =
  "Follow-ups are suppressed for this contact because further contact was declined. Other people at this company can still be scheduled.";

export function emptySuppressionIndex(): SuppressionIndex {
  return {
    suppressedCompanyIds: new Set<string>(),
    suppressedContactIds: new Set<string>(),
  };
}

export function isDoNotFollowUpReason(
  value: string,
): value is DoNotFollowUpReason {
  return DO_NOT_FOLLOW_UP_REASONS.some((option) => option.value === value);
}

export function doNotFollowUpReasonLabel(value: string | null | undefined): string {
  const match = DO_NOT_FOLLOW_UP_REASONS.find((option) => option.value === value);
  return match?.label ?? value?.trim() ?? "Unknown reason";
}

export function buildSuppressionIndex(
  rows: SuppressionIndexRow[],
): SuppressionIndex {
  const index = emptySuppressionIndex();

  for (const row of rows) {
    if (row.scope === "company" && row.company_id) {
      index.suppressedCompanyIds.add(row.company_id);
    }

    if (row.scope === "contact" && row.contact_id) {
      index.suppressedContactIds.add(row.contact_id);
    }
  }

  return index;
}

export function isCompanyOutreachSuppressed(
  index: SuppressionIndex,
  companyId: string | null | undefined,
): boolean {
  return Boolean(companyId && index.suppressedCompanyIds.has(companyId));
}

export function isContactOutreachSuppressed(
  index: SuppressionIndex,
  contactId: string | null | undefined,
): boolean {
  return Boolean(contactId && index.suppressedContactIds.has(contactId));
}

export function isFollowUpOutreachSuppressed(
  index: SuppressionIndex,
  followUp: { company_id: string; contact_id?: string | null },
): boolean {
  return (
    isCompanyOutreachSuppressed(index, followUp.company_id) ||
    isContactOutreachSuppressed(index, followUp.contact_id)
  );
}

export function newFollowUpBlockMessage(input: {
  companySuppressed: boolean;
  contactSuppressed: boolean;
}): string | null {
  if (input.companySuppressed) {
    return COMPANY_FOLLOW_UP_SUPPRESSED_MESSAGE;
  }

  if (input.contactSuppressed) {
    return CONTACT_FOLLOW_UP_SUPPRESSED_MESSAGE;
  }

  return null;
}

export function suppressionChoiceLabel(
  choice: FollowUpSuppressionChoice,
  contactName: string | null,
): string {
  if (choice === "company") {
    return "Future follow-ups are suppressed for the entire company. The company was not archived or deleted.";
  }

  if (choice === "contact") {
    const name = contactName?.trim() || "the selected contact";
    return `Future follow-ups are suppressed for ${name} only. Other people at the company are not affected.`;
  }

  return "Only this follow-up was stopped. Future follow-ups for the company and its other contacts were not suppressed.";
}
