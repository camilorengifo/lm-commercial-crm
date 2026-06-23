"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/");
      } else {
        setCheckingSession(false);
      }
    });
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

      router.replace("/");
    } catch (signInException) {
      console.error("Unexpected sign-in error:", signInException);
      setError(formatUnexpectedSignInError(signInException));
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Logistics Masters AI Commercial Assistant
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
