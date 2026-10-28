import {
  ACTIVITY_TYPES,
  MANUAL_ACTIVITY_TYPES,
  type ActivityType,
} from "@/lib/crmConstants";

export const ACTIVITY_COMMENT_MAX_LENGTH = 20000;
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 2000;

export const ACTIVITY_UPDATED_MESSAGE = "Activity updated.";
export const ACTIVITY_UNCHANGED_MESSAGE = "No changes to save.";
export const ACTIVITY_DELETED_MESSAGE = "Timeline entry deleted.";

const LOCKED_ACTIVITY_TYPES = new Set<ActivityType>([
  "follow_up_no_response",
  "follow_up_rescheduled_contact",
  "do_not_follow_up",
  "outreach_suppression",
]);

const MANUAL_ACTIVITY_TYPE_VALUES = new Set<ActivityType>(
  MANUAL_ACTIVITY_TYPES.map((option) => option.value),
);

export interface ActivityEditDraft {
  subject: string;
  notes: string;
  activityType: ActivityType;
}

export interface NormalizedActivityEdit {
  subject: string | null;
  notes: string;
  activityType: ActivityType;
}

export function isKnownActivityType(value: string): value is ActivityType {
  return ACTIVITY_TYPES.some((option) => option.value === value);
}

/** System timeline rows keep their type so follow-up outcomes stay intact. */
export function canChangeActivityType(activityType: ActivityType): boolean {
  return !LOCKED_ACTIVITY_TYPES.has(activityType);
}

/**
 * UI permission. The database still enforces ownership through RLS and
 * update_commercial_activity.
 */
export function canEditCommercialActivity(input: {
  canManage: boolean;
  isAdmin: boolean;
  viewerUserId: string;
  activityUserId: string;
}): boolean {
  if (!input.canManage) return false;
  if (input.isAdmin) return true;
  return (
    input.viewerUserId.length > 0 &&
    input.viewerUserId === input.activityUserId
  );
}

/** Automatic follow-up and suppression rows stay on the timeline. */
export function supportsCommercialActivityDeletion(
  activityType: ActivityType,
): boolean {
  return !LOCKED_ACTIVITY_TYPES.has(activityType);
}

/**
 * UI permission. delete_commercial_activity enforces the same ownership
 * rules and refuses automatic follow-up and suppression history.
 */
export function canDeleteCommercialActivity(input: {
  canManage: boolean;
  isAdmin: boolean;
  viewerUserId: string;
  activityUserId: string;
  activityType: ActivityType;
}): boolean {
  if (!supportsCommercialActivityDeletion(input.activityType)) return false;
  return canEditCommercialActivity(input);
}

export function normalizeActivityEditDraft(
  draft: ActivityEditDraft,
): NormalizedActivityEdit {
  const subject = draft.subject.trim();
  return {
    subject: subject.length > 0 ? subject : null,
    notes: draft.notes.trim(),
    activityType: draft.activityType,
  };
}

export function validateActivityEditContent(draft: ActivityEditDraft): string | null {
  const normalized = normalizeActivityEditDraft(draft);

  if (!normalized.notes) {
    return "Comment is required.";
  }

  if (normalized.notes.length > ACTIVITY_COMMENT_MAX_LENGTH) {
    return `Comment must be ${ACTIVITY_COMMENT_MAX_LENGTH} characters or less.`;
  }

  if (
    normalized.subject &&
    normalized.subject.length > ACTIVITY_DESCRIPTION_MAX_LENGTH
  ) {
    return `Description must be ${ACTIVITY_DESCRIPTION_MAX_LENGTH} characters or less.`;
  }

  if (!isKnownActivityType(normalized.activityType)) {
    return "Invalid activity type.";
  }

  return null;
}

export function validateActivityTypeChange(input: {
  originalActivityType: ActivityType;
  nextActivityType: ActivityType;
}): string | null {
  if (input.nextActivityType === input.originalActivityType) {
    return null;
  }

  if (!canChangeActivityType(input.originalActivityType)) {
    return "This activity type cannot be changed.";
  }

  if (!MANUAL_ACTIVITY_TYPE_VALUES.has(input.nextActivityType)) {
    return "This activity type cannot be changed.";
  }

  return null;
}

export function validateActivityEdit(input: {
  draft: ActivityEditDraft;
  originalActivityType: ActivityType;
}): string | null {
  const contentError = validateActivityEditContent(input.draft);
  if (contentError) return contentError;

  return validateActivityTypeChange({
    originalActivityType: input.originalActivityType,
    nextActivityType: input.draft.activityType,
  });
}

export function activityEditIsUnchanged(input: {
  originalSubject: string | null;
  originalNotes: string | null;
  originalActivityType: ActivityType;
  draft: ActivityEditDraft;
}): boolean {
  const normalized = normalizeActivityEditDraft(input.draft);
  const originalSubject = input.originalSubject?.trim() || null;
  const originalNotes = input.originalNotes?.trim() ?? "";

  return (
    originalSubject === normalized.subject &&
    originalNotes === normalized.notes &&
    input.originalActivityType === normalized.activityType
  );
}

/** Identifies one timeline entry. Related records are intentionally absent. */
export function commercialActivityDeleteBody(input: {
  activityId: string;
  companyId: string;
}) {
  return {
    activityId: input.activityId,
    companyId: input.companyId,
  };
}

/** Fields sent to the server. Associations and dates are intentionally absent. */
export function commercialActivityUpdateBody(input: {
  activityId: string;
  companyId: string;
  draft: ActivityEditDraft;
}) {
  const normalized = normalizeActivityEditDraft(input.draft);
  return {
    activityId: input.activityId,
    companyId: input.companyId,
    subject: normalized.subject ?? "",
    notes: normalized.notes,
    activityType: normalized.activityType,
  };
}
