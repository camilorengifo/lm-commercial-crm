import type { UserRole } from "@/lib/userProfile";

/** Canonical primary super admin — only this account may grant/revoke super_admin. */
export const PRIMARY_SUPER_ADMIN_EMAIL = "camilo@armstrongtransport.com";

export class SuperAdminProtectionError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "SuperAdminProtectionError";
  }
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isPrimarySuperAdminEmail(
  email: string | null | undefined,
): boolean {
  return normalizeEmail(email) === PRIMARY_SUPER_ADMIN_EMAIL;
}

export function isPrimarySuperAdminProfile(profile: {
  email?: string | null;
  role?: UserRole | string | null;
} | null | undefined): boolean {
  return (
    isPrimarySuperAdminEmail(profile?.email) &&
    profile?.role === "super_admin"
  );
}

export function canManageSuperAdminRole(actingEmail: string | null | undefined): boolean {
  return isPrimarySuperAdminEmail(actingEmail);
}

export function getAssignableRolesForActor(
  actingEmail: string | null | undefined,
): UserRole[] {
  if (canManageSuperAdminRole(actingEmail)) {
    return ["broker", "admin", "super_admin"];
  }

  return ["broker", "admin"];
}

/**
 * Validates role / access mutations against primary super admin rules.
 * Throws SuperAdminProtectionError on violation.
 */
export function assertSuperAdminRoleMutationAllowed(input: {
  actingEmail: string | null | undefined;
  targetEmail: string | null | undefined;
  currentRole: UserRole | string;
  nextRole?: UserRole;
  nextIsActive?: boolean;
  nextIsBlocked?: boolean;
}): void {
  const actingIsPrimary = isPrimarySuperAdminEmail(input.actingEmail);
  const targetIsPrimary = isPrimarySuperAdminEmail(input.targetEmail);
  const currentRole = input.currentRole;
  const nextRole = input.nextRole;

  if (targetIsPrimary) {
    if (nextRole !== undefined && nextRole !== "super_admin") {
      throw new SuperAdminProtectionError(
        "The primary super admin role cannot be changed.",
      );
    }

    if (input.nextIsActive === false) {
      throw new SuperAdminProtectionError(
        "The primary super admin account cannot be deactivated.",
      );
    }

    if (input.nextIsBlocked === true) {
      throw new SuperAdminProtectionError(
        "The primary super admin account cannot be blocked.",
      );
    }
  }

  if (nextRole === undefined) {
    return;
  }

  const grantingSuperAdmin =
    nextRole === "super_admin" && currentRole !== "super_admin";
  const revokingSuperAdmin =
    currentRole === "super_admin" && nextRole !== "super_admin";

  if ((grantingSuperAdmin || revokingSuperAdmin) && !actingIsPrimary) {
    throw new SuperAdminProtectionError(
      "Only the primary super admin can grant or revoke super_admin.",
    );
  }

  if (
    !actingIsPrimary &&
    currentRole === "super_admin" &&
    nextRole !== currentRole
  ) {
    throw new SuperAdminProtectionError(
      "Only the primary super admin can change a super_admin user's role.",
    );
  }
}

export function assertPrimarySuperAdminNotRemovable(input: {
  targetEmail: string | null | undefined;
}): void {
  if (isPrimarySuperAdminEmail(input.targetEmail)) {
    throw new SuperAdminProtectionError(
      "The primary super admin account cannot be removed, deactivated, or deleted.",
    );
  }
}
