export const PASSWORD_RECOVERY_PENDING_KEY = "password_recovery_pending";

export function isPasswordRecoveryPending(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return sessionStorage.getItem(PASSWORD_RECOVERY_PENDING_KEY) === "1";
}

export function setPasswordRecoveryPending(): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(PASSWORD_RECOVERY_PENDING_KEY, "1");
}

export function clearPasswordRecoveryPending(): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY);
}
