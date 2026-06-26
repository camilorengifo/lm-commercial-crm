"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { urlHasAuthCallbackParams } from "@/lib/authRoutes";
import {
  hashIndicatesInvitation,
  hashIndicatesRecovery,
  sessionNeedsPasswordSetup,
} from "@/lib/invitationSession";
import {
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  setPasswordRecoveryPending,
} from "@/lib/passwordRecovery";
import { establishSessionFromAuthCallback } from "@/lib/supabaseAuthCallback";
import { supabase } from "@/lib/supabaseClient";

const MIN_PASSWORD_LENGTH = 8;
const INVALID_LINK_MESSAGE =
  "This reset link is invalid or expired. Please request a new password reset link.";

export default function ResetPasswordPage() {
  const router = useRouter();
  const hadAuthCallbackParams = useRef(false);
  const [checking, setChecking] = useState(true);
  const [hasValidRecovery, setHasValidRecovery] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    const initialSearch = window.location.search;
    const initialHash = window.location.hash;
    hadAuthCallbackParams.current = urlHasAuthCallbackParams(
      initialSearch,
      initialHash,
    );

    function markValidRecovery() {
      if (cancelled || resolved) {
        return;
      }

      resolved = true;
      setPasswordRecoveryPending();
      setHasValidRecovery(true);
      setInvalidLink(false);
      setChecking(false);
      window.history.replaceState({}, "", "/reset-password");
    }

    function markInvalidLink() {
      if (cancelled || resolved) {
        return;
      }

      resolved = true;
      setHasValidRecovery(false);
      setInvalidLink(true);
      setChecking(false);
    }

    function shouldAcceptRecoverySession(
      event: string,
      search: string,
      hash: string,
    ): boolean {
      return (
        event === "PASSWORD_RECOVERY" ||
        hashIndicatesRecovery(hash) ||
        isPasswordRecoveryPending() ||
        hadAuthCallbackParams.current ||
        Boolean(new URLSearchParams(search).get("code")) ||
        Boolean(new URLSearchParams(search).get("token_hash"))
      );
    }

    async function evaluateRecoverySession() {
      const result = await establishSessionFromAuthCallback(
        initialSearch,
        initialHash,
      );

      if (cancelled) {
        return;
      }

      if (result.status === "error") {
        markInvalidLink();
        return;
      }

      if (result.status === "session") {
        if (result.kind === "invite") {
          router.replace(`/set-password${initialSearch}${initialHash}`);
          return;
        }

        markValidRecovery();
        return;
      }

      if (
        !hadAuthCallbackParams.current &&
        !hashIndicatesRecovery(initialHash) &&
        !hashIndicatesInvitation(initialHash) &&
        !isPasswordRecoveryPending()
      ) {
        markInvalidLink();
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || !session) {
        return;
      }

      const search = window.location.search;
      const hash = window.location.hash;

      if (
        sessionNeedsPasswordSetup(session) ||
        hashIndicatesInvitation(hash)
      ) {
        router.replace(`/set-password${search}${hash}`);
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryPending();
      }

      if (shouldAcceptRecoverySession(event, search, hash)) {
        markValidRecovery();
      }
    });

    void evaluateRecoverySession();

    const timeoutId = window.setTimeout(() => {
      if (cancelled || resolved) {
        return;
      }

      void establishSessionFromAuthCallback(
        window.location.search,
        window.location.hash,
      ).then((result) => {
        if (cancelled || resolved) {
          return;
        }

        if (result.status === "session") {
          if (result.kind === "invite") {
            router.replace(
              `/set-password${window.location.search}${window.location.hash}`,
            );
            return;
          }

          markValidRecovery();
          return;
        }

        if (
          hadAuthCallbackParams.current ||
          hashIndicatesRecovery(window.location.hash) ||
          isPasswordRecoveryPending()
        ) {
          markInvalidLink();
        }
      });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password and confirm password must match.");
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(
        updateError.message ||
          "Unable to update your password. Please request a new reset link.",
      );
      setSubmitting(false);
      return;
    }

    clearPasswordRecoveryPending();
    setSuccessMessage(
      "Your password has been updated. You can now sign in.",
    );
    setSubmitting(false);

    await supabase.auth.signOut();

    window.setTimeout(() => {
      router.replace("/login");
    }, 2500);
  }

  if (checking) {
    return (
      <div className="crm-loading-screen">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (invalidLink) {
    return (
      <div className="crm-login-shell">
        <div className="crm-login-card">
          <div className="mb-6 text-center">
            <p className="crm-eyebrow">Logistics Masters</p>
            <h1 className="crm-page-title mt-2">Reset link unavailable</h1>
          </div>

          <p className="crm-alert-warning">{INVALID_LINK_MESSAGE}</p>

          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/forgot-password"
              className="crm-btn-primary w-full text-center"
            >
              Request a new link
            </Link>
            <Link
              href="/login"
              className="crm-btn-secondary w-full text-center"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!hasValidRecovery) {
    return null;
  }

  return (
    <div className="crm-login-shell">
      <div className="crm-login-card">
        <div className="mb-6 text-center">
          <p className="crm-eyebrow">Logistics Masters</p>
          <h1 className="crm-page-title mt-2">Choose a new password</h1>
          <p className="crm-page-subtitle mx-auto">
            Enter and confirm your new password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="new-password" className="crm-label">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="crm-input"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="crm-label">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="crm-input"
            />
          </div>

          {error && <p className="crm-alert-error">{error}</p>}

          {successMessage && (
            <p className="crm-alert-success">{successMessage}</p>
          )}

          <button
            type="submit"
            disabled={submitting || Boolean(successMessage)}
            className="crm-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Updating..." : "Update password"}
          </button>

          <p className="text-center text-sm">
            <Link href="/login" className="crm-link">
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
