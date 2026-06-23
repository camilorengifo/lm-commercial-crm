"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INVITE_PASSWORD_SETUP_KEY,
  hashIndicatesInvitation,
  parseHashParams,
  sessionNeedsPasswordSetup,
} from "@/lib/invitationSession";
import { fetchUserProfile, isActiveProfile } from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

const MIN_PASSWORD_LENGTH = 8;

export default function SetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasValidInvite, setHasValidInvite] = useState(false);
  const [invalidInvite, setInvalidInvite] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function markValidInvite() {
      if (cancelled) {
        return;
      }

      setHasValidInvite(true);
      setInvalidInvite(false);
      setChecking(false);
      window.history.replaceState({}, "", "/set-password");
    }

    function markInvalidInvite() {
      if (cancelled) {
        return;
      }

      setHasValidInvite(false);
      setInvalidInvite(true);
      setChecking(false);
    }

    async function evaluateSession() {
      const hashParams = parseHashParams(window.location.hash);
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          markInvalidInvite();
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (hashIndicatesInvitation(window.location.hash)) {
          return;
        }

        markInvalidInvite();
        return;
      }

      const { data: profile } = await fetchUserProfile(session.user.id);
      if (profile && !isActiveProfile(profile)) {
        await supabase.auth.signOut();
        markInvalidInvite();
        return;
      }

      if (
        sessionNeedsPasswordSetup(session) ||
        hashIndicatesInvitation(window.location.hash) ||
        hashParams.type === "invite"
      ) {
        markValidInvite();
        return;
      }

      router.replace("/");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled || !session) {
        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "TOKEN_REFRESHED"
      ) {
        if (
          sessionNeedsPasswordSetup(session) ||
          hashIndicatesInvitation(window.location.hash)
        ) {
          markValidInvite();
        }
      }
    });

    void evaluateSession();

    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) {
          return;
        }

        if (session && sessionNeedsPasswordSetup(session)) {
          markValidInvite();
          return;
        }

        if (hashIndicatesInvitation(window.location.hash)) {
          markInvalidInvite();
        }
      });
    }, 4000);

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
      data: {
        [INVITE_PASSWORD_SETUP_KEY]: false,
      },
    });

    if (updateError) {
      setError(updateError.message || "Unable to create password.");
      setSubmitting(false);
      return;
    }

    setSuccessMessage("Password created successfully. Redirecting to the CRM...");
    setSubmitting(false);

    window.setTimeout(() => {
      router.replace("/");
    }, 1500);
  }

  if (checking) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (invalidInvite) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Logistics Masters AI Commercial Assistant
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
              Invitation unavailable
            </h1>
          </div>

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This invitation link is invalid or expired. Please request a new
            invitation.
          </p>

          <Link
            href="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  if (!hasValidInvite) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Logistics Masters AI Commercial Assistant
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
            Create your CRM password
          </h1>
          <p className="mt-3 text-sm text-zinc-600">
            You have been invited to access the Logistics Masters CRM.
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Please create your password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="new-password"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
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
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
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
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {successMessage && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || Boolean(successMessage)}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating password..." : "Create Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
