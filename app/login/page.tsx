"use client";

import Image from "next/image";
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
import {
  confirmAuthSession,
  logLoginError,
  navigateAfterLogin,
  resolvePostLoginRoute,
  SESSION_CHECK_TIMEOUT_MS,
  validateProfileForLogin,
} from "@/lib/postLoginNavigation";
import { supabase } from "@/lib/supabaseClient";

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
    let cancelled = false;

    const checkingTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setCheckingSession(false);
        setError(
          (current) =>
            current ?? "Session check timed out. You can sign in below.",
        );
      }
    }, SESSION_CHECK_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Password-recovery only. Manual sign-in redirects explicitly in handleSubmit.
      if (event === "PASSWORD_RECOVERY" && session) {
        setPasswordRecoveryPending();
        router.replace("/reset-password");
        router.refresh();
      }
    });

    async function checkExistingSession() {
      try {
        const search = window.location.search;
        const hash = window.location.hash;
        const authCallbackPath = redirectPathForAuthCallback(search, hash);

        if (authCallbackPath && authCallbackPath !== "/login") {
          router.replace(buildAuthCallbackRedirect(authCallbackPath, search, hash));
          return;
        }

        if (isPasswordRecoveryPending()) {
          router.replace("/reset-password");
          return;
        }

        const session = await confirmAuthSession();
        if (cancelled || !session) {
          return;
        }

        if (sessionNeedsPasswordSetup(session)) {
          const route = "/set-password";
          router.replace(route);
          router.refresh();
          return;
        }

        const profileResult = await validateProfileForLogin(session);
        if (!profileResult.ok && !cancelled) {
          if (profileResult.inactive) {
            setInactiveNotice(true);
          }
          setError(profileResult.message);
          return;
        }

        const route = resolvePostLoginRoute(session);
        await navigateAfterLogin(router, route);
      } catch (sessionError) {
        logLoginError("existing session check failed", sessionError);
        if (!cancelled) {
          setError("Unable to verify your session. Please sign in.");
        }
      } finally {
        if (!cancelled) {
          window.clearTimeout(checkingTimeout);
          setCheckingSession(false);
        }
      }
    }

    void checkExistingSession();

    return () => {
      cancelled = true;
      window.clearTimeout(checkingTimeout);
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const submitTimeout = window.setTimeout(() => {
      setLoading(false);
      setError(
        (current) =>
          current ??
          "Sign-in is taking longer than expected. Please try again.",
      );
    }, SESSION_CHECK_TIMEOUT_MS);

    try {
      if (process.env.NODE_ENV === "development") {
        console.info("[login] sign-in started");
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword(
        {
          email,
          password,
        },
      );

      if (signInError) {
        logLoginError("sign-in failed", signInError);
        setError(formatSignInError(signInError));
        return;
      }

      if (process.env.NODE_ENV === "development") {
        console.info("[login] sign-in succeeded");
      }

      const session = await confirmAuthSession(data.session);
      if (!session) {
        setError("Signed in, but no session was available. Please try again.");
        return;
      }

      const profileResult = await validateProfileForLogin(session);
      if (!profileResult.ok) {
        if (profileResult.inactive) {
          setInactiveNotice(true);
        }
        setError(profileResult.message);
        return;
      }

      // Explicit navigation after signInWithPassword — never wait for onAuthStateChange.
      const route = resolvePostLoginRoute(session);
      await navigateAfterLogin(router, route);
    } catch (signInException) {
      logLoginError("unexpected sign-in error", signInException);
      setError(formatUnexpectedSignInError(signInException));
    } finally {
      window.clearTimeout(submitTimeout);
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
          <div className="mb-6 flex justify-center">
            <Image
              src="/logistics-masters-logo.png"
              alt="Logistics Masters"
              width={220}
              height={72}
              className="h-auto w-full max-w-[200px] object-contain"
              priority
            />
          </div>
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
