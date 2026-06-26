"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import {
  buildAuthCallbackRedirect,
  redirectPathForAuthCallback,
} from "@/lib/authRoutes";
import { sessionNeedsPasswordSetup } from "@/lib/invitationSession";
import {
  isPasswordRecoveryPending,
  setPasswordRecoveryPending,
} from "@/lib/passwordRecovery";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchUserProfile,
  isActiveProfile,
} from "@/lib/userProfile";

function formatSignInError(error: AuthError): string {
  const message = error.message ?? "";

  if (
    message === "Failed to fetch" ||
    message.toLowerCase().includes("network")
  ) {
    return "Unable to connect to Supabase. Check your internet connection, verify NEXT_PUBLIC_SUPABASE_URL in .env.local, and restart the dev server after changing env vars.";
  }

  if (message === "Invalid login credentials") {
    return "Invalid email or password. Please try again.";
  }

  if (error.status === 429) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }

  return message || "Sign-in failed. Please try again.";
}

function formatUnexpectedSignInError(error: unknown): string {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return "Unable to connect to Supabase. Check your internet connection, verify NEXT_PUBLIC_SUPABASE_URL in .env.local, and restart the dev server after changing env vars.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "An unexpected error occurred during sign-in. Check the browser console for details.";
}

export default function LoginPage() {
  const router = useRouter();
  const [inactiveNotice, setInactiveNotice] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    setInactiveNotice(
      new URLSearchParams(window.location.search).get("inactive") === "1",
    );
  }, []);

  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    const authCallbackPath = redirectPathForAuthCallback(search, hash);

    if (authCallbackPath && authCallbackPath !== "/login") {
      router.replace(buildAuthCallbackRedirect(authCallbackPath, search, hash));
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setPasswordRecoveryPending();
        router.replace("/reset-password");
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setCheckingSession(false);
        return;
      }

      if (isPasswordRecoveryPending()) {
        router.replace("/reset-password");
        return;
      }

      const { data: profile } = await fetchUserProfile(session.user.id);
      if (profile && !isActiveProfile(profile)) {
        await supabase.auth.signOut();
        setCheckingSession(false);
        return;
      }

      if (sessionNeedsPasswordSetup(session)) {
        router.replace("/set-password");
        return;
      }

      router.replace("/");
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error("Supabase sign-in error (full):", signInError);
        setError(formatSignInError(signInError));
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const { data: profile } = await fetchUserProfile(session.user.id);
        if (profile && !isActiveProfile(profile)) {
          await supabase.auth.signOut();
          setError(
            "Your CRM access is inactive. Please contact an administrator.",
          );
          setLoading(false);
          return;
        }

        if (sessionNeedsPasswordSetup(session)) {
          router.replace("/set-password");
          return;
        }
      }

      router.replace("/");
    } catch (signInException) {
      console.error("Unexpected sign-in error:", signInException);
      setError(formatUnexpectedSignInError(signInException));
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="crm-loading-screen">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="crm-login-shell">
      <div className="crm-login-card">
        <div className="mb-8 text-center">
          <p className="crm-eyebrow">Logistics Masters</p>
          <h1 className="crm-page-title mt-2">Sign in</h1>
          <p className="crm-page-subtitle mx-auto">
            Commercial CRM
          </p>
        </div>

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

          <div>
            <label htmlFor="password" className="crm-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="crm-input"
            />
            <div className="mt-2 text-right">
              <Link href="/forgot-password" className="text-sm text-slate-500 transition hover:text-slate-800">
                Forgot your password?
              </Link>
            </div>
          </div>

          {inactiveNotice && (
            <p className="crm-alert-warning">
              Your CRM access is inactive. Please contact an administrator.
            </p>
          )}

          {error && (
            <p className="crm-alert-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="crm-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
