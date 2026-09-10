"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useSession } from "@/components/session";

export default function SignInPage() {
  const { signIn, register } = useSession();
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registering = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (registering ? register(email, password) : signIn(email, password));
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm text-dim hover:text-paper">
        ← Interview Prep Kit
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">
        {registering ? "Create an account" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-dim">
        {registering
          ? "Your kits and your story bank stay yours."
          : "Sign in to pick up where you left off."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete={registering ? "new-password" : "current-password"}
            className="field"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {registering && (
            <p className="mt-1.5 text-xs text-dim">
              At least 10 characters. A passphrase beats a clever password.
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
          >
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "One moment…" : registering ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(registering ? "sign-in" : "register");
          setError(null);
        }}
        className="mt-6 text-sm text-dim hover:text-paper"
      >
        {registering
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </button>
    </main>
  );
}
