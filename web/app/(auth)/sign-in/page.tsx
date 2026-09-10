"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarClock,
  Mic,
  Sparkles,
  Target,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { useSession } from "@/components/session";

const SELLING_POINTS = [
  {
    icon: Target,
    title: "Questions built from the posting",
    body: "Every must-have in the job description becomes something you will be asked.",
  },
  {
    icon: CalendarClock,
    title: "A plan on real dates",
    body: "Say when the interview is; get a day-by-day plan that recuts itself when you fall behind.",
  },
  {
    icon: Mic,
    title: "Practise out loud",
    body: "Spaced repetition and a full mock interview, so you have said the answer before the room.",
  },
];

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
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-12 px-6 py-10 lg:grid-cols-2">
      {/* The pitch, so a first-time visitor knows what they are signing into
          before they hand over an email. Hidden on small screens where the
          form should not have to scroll past it. */}
      <section className="hidden lg:block">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-dim">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Interview Prep Kit
        </span>
        <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-tight">
          Walk in having already
          <br />
          <span className="bg-gradient-to-r from-accent to-cyan bg-clip-text text-transparent">
            done the interview.
          </span>
        </h2>
        <p className="mt-4 max-w-md text-dim">
          Paste the job posting and the company&apos;s site. Get tailored
          questions, a dated study plan, spaced practice, and a mock — built for
          the exact role you applied for.
        </p>

        <ul className="mt-8 space-y-5">
          {SELLING_POINTS.map((point) => (
            <li key={point.title} className="flex gap-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <point.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium text-paper">{point.title}</p>
                <p className="mt-0.5 text-sm text-dim">{point.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-dim hover:text-paper lg:hidden"
        >
          ← Interview Prep Kit
        </Link>

        <div className="card p-7 sm:p-8">
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
            className="mt-6 text-sm text-dim transition hover:text-paper"
          >
            {registering
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
        </div>
      </div>
    </main>
  );
}
