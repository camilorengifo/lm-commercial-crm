"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const SAFE_SUCCESS_MESSAGE =
  "If an account exists for this email, we sent a password reset link.";

function shouldShowResetError(message: string, status?: number): boolean {
  if (status === 429) {
    return true;
  }

  const normalized = message.toLowerCase();
  return (
    message === "Failed to fetch" ||
    normalized.includes("network") ||
    normalized.includes("rate limit")
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);

    const trimmedEmail = email.trim();

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );

      if (
        resetError &&
        shouldShowResetError(resetError.message ?? "", resetError.status)
      ) {
        setError(
          resetError.status === 429
            ? "Too many requests. Please wait a moment and try again."
            : "Unable to send the reset link right now. Please try again.",
        );
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Unable to send the reset link right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="crm-login-shell">
      <div className="crm-login-card">
        <div className="mb-6 text-center">
          <p className="crm-eyebrow">Logistics Masters</p>
          <h1 className="crm-page-title mt-2">Reset your password</h1>
          <p className="crm-page-subtitle mx-auto">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {success ? (
          <div className="space-y-5">
            <p className="crm-alert-success">{SAFE_SUCCESS_MESSAGE}</p>
            <Link href="/login" className="crm-btn-secondary block w-full text-center">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="crm-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="crm-input"
                placeholder="you@company.com"
              />
            </div>

            {error && <p className="crm-alert-error">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="crm-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>

            <p className="text-center text-sm">
              <Link href="/login" className="crm-link">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
