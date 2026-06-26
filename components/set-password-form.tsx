"use client";

import Link from "next/link";
import { FormEvent, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/lib/invitationClient";
import type { InvitationValidationResult } from "@/lib/invitationTypes";
import { supabase } from "@/lib/supabaseClient";

const MIN_PASSWORD_LENGTH = 8;

export function SetPasswordForm({
  token,
  validation,
}: {
  token: string;
  validation: InvitationValidationResult;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!validation.valid) {
    if (validation.reason === "already_accepted") {
      return (
        <InviteShell title="Invitation already used">
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {validation.email
              ? `The invitation for ${validation.email} has already been accepted. Sign in with your password.`
              : "This invitation has already been accepted. Sign in with your password."}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Go to login
          </Link>
        </InviteShell>
      );
    }

    if (validation.reason === "existing_user_has_password") {
      return (
        <InviteShell title="Account already exists">
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {validation.email
              ? `An account for ${validation.email} already exists. Sign in with your existing password, or ask an admin to send a new invitation.`
              : "This email already has a CRM account. Sign in with your existing password, or ask an admin to send a new invitation."}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Go to login
          </Link>
        </InviteShell>
      );
    }

    return (
      <InviteShell title="Invitation unavailable">
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
      </InviteShell>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!token) {
      setError("Invitation token is missing.");
      return;
    }

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

    const { data, error: acceptError } = await acceptInvitation({
      token,
      password,
    });

    if (acceptError || !data) {
      setError(acceptError ?? "Unable to create password.");
      setSubmitting(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password,
    });

    if (signInError) {
      setSuccessMessage(
        "Password created successfully. Redirecting to sign in...",
      );
      setSubmitting(false);

      window.setTimeout(() => {
        router.replace("/login");
      }, 1500);
      return;
    }

    setSuccessMessage("Password created successfully. Redirecting to the CRM...");
    setSubmitting(false);

    window.setTimeout(() => {
      router.replace("/");
    }, 1500);
  }

  return (
    <InviteShell title="Create your CRM password">
      <p className="mb-6 text-center text-sm text-zinc-600">
        {validation.existingUser
          ? "Set a new password to access the Logistics Masters CRM."
          : "You have been invited to access the Logistics Masters CRM."}
      </p>
      <p className="mb-6 text-center text-sm text-zinc-600">
        {validation.fullName} ({validation.email})
      </p>
      <p className="mb-6 text-center text-sm text-zinc-600">
        Please create your password to continue.
      </p>

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
    </InviteShell>
  );
}

function InviteShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Logistics Masters AI Commercial Assistant
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
            {title}
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}
