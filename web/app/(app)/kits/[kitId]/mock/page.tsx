"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AnswerRecorder,
  type CapturedAnswer,
} from "@/components/answer-recorder";
import { AnswerScorecard } from "@/components/answer-scorecard";
import { useKitContext } from "@/components/kit-provider";
import { KitNotReady } from "@/components/kit-not-ready";
import { SelfRating } from "@/components/self-rating";
import { api, ApiError } from "@/lib/api";
import type { Attempt } from "@/lib/types";

/**
 * A rehearsal rather than a drill.
 *
 * Everything hard about an interview that practice mode removes is put back
 * here. No outline on screen, because there is not one in the room. No score
 * between questions, because nobody tells you how question two went before
 * asking question three — and carrying the doubt is most of what makes the
 * real thing difficult. No pausing, no retries, no skipping.
 *
 * The post-mortem lands all at once at the end, which is also when a
 * candidate can actually take it in. Handing someone a score mid-interview
 * would improve the feedback and ruin the rehearsal.
 */

interface MockQuestion {
  id: string;
  prompt: string;
  category: string;
  difficulty: number;
}

/** One answered question, held locally until the interview is over. */
interface Answered {
  question: MockQuestion;
  attempt: Attempt;
  judgeError: string | null;
}

type Phase = "briefing" | "answering" | "predicting" | "review";

/** The target window is not shown during a mock, so this is only the clock. */
const MOCK_TARGET: [number, number] = [60, 180];

function averageOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function MockPage() {
  const { kit, kitId } = useKitContext();
  const ready = kit?.status === "ready" && kit.kit !== null;

  const [questions, setQuestions] = useState<MockQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("briefing");
  const [captured, setCaptured] = useState<CapturedAnswer | null>(null);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();

    api<{ questions: MockQuestion[] }>(`/kits/${kitId}/mock`, {
      signal: controller.signal,
    })
      .then((body) => setQuestions(body.questions))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      });

    return () => controller.abort();
  }, [kitId, ready]);

  const current = questions?.[index];

  const submit = useCallback(
    async (selfRating: number) => {
      if (!captured || !current || busy) return;
      setBusy(true);
      try {
        const body = await api<{ attempt: Attempt; judgeError: string | null }>(
          `/kits/${kitId}/answers/${current.id}`,
          {
            method: "POST",
            // No `day`: a mock is a rehearsal, and letting it drive the
            // spaced-repetition schedule would mean sitting one twice
            // silently rewrote the week's plan.
            body: { ...captured, selfRating },
          },
        );

        setAnswered((previous) => [
          ...previous,
          { question: current, attempt: body.attempt, judgeError: body.judgeError },
        ]);
        setCaptured(null);

        const isLast = index + 1 >= (questions?.length ?? 0);
        if (isLast) {
          setPhase("review");
        } else {
          setIndex((previous) => previous + 1);
          setPhase("answering");
        }
      } catch (cause) {
        setError(
          cause instanceof ApiError ? cause.message : "Could not record that",
        );
        setPhase("answering");
      } finally {
        setBusy(false);
      }
    },
    [captured, current, busy, kitId, index, questions],
  );

  if (!ready) return <KitNotReady />;

  if (error && !questions) {
    return (
      <p role="alert" className="text-sm text-bad">
        {error}
      </p>
    );
  }

  if (!questions) {
    return <div className="skeleton h-72 w-full" aria-busy="true" />;
  }

  if (questions.length === 0) {
    return (
      <section className="card p-10 text-center">
        <h2 className="text-xl font-medium">Nothing to ask you yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
          This kit has no questions, so there is no interview to sit.
        </p>
      </section>
    );
  }

  if (phase === "briefing") {
    return (
      <div className="mx-auto max-w-2xl">
        <section className="card animate-scale-in p-8 sm:p-10">
          <p className="label">Mock interview</p>
          <h2 className="mt-2 text-2xl font-medium">
            {questions.length} questions, no outlines, no scores until the end.
          </h2>

          <ul className="mt-6 space-y-2.5 text-sm text-dim">
            {[
              "You will not see what a good answer covers. There is no outline in the room.",
              "You will not see a score between questions. Nobody tells you how the last one went.",
              "There is no going back. Answer it as you would there and move on.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-faint" />
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              className="btn-primary px-6 py-3 text-base"
              onClick={() => setPhase("answering")}
            >
              Start
            </button>
            <Link href={`/kits/${kitId}/practice`} className="btn-bare text-xs">
              Practise instead
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (phase === "review") {
    const scores = answered.map((entry) => entry.attempt.analysis.score);
    const overall = averageOf(scores);
    const surprises = answered.filter(
      (entry) => entry.attempt.prediction.surprising && entry.attempt.prediction.gap > 0,
    );

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="card animate-scale-in p-6">
          <p className="label">Post-mortem</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="tnum text-display-sm font-light">{overall}</span>
            <span className="text-sm text-faint">average of {scores.length}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-dim">
            {surprises.length === 0
              ? "No nasty surprises: your sense of how each answer went matched what you actually said."
              : `${surprises.length} of ${scores.length} came out materially weaker than they felt. Those are the ones to take back to practice.`}
          </p>
        </section>

        {answered.map((entry, position) => (
          <section key={entry.attempt.id} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="tnum text-xs text-faint">
                {String(position + 1).padStart(2, "0")}
              </span>
              <h3 className="text-sm font-medium leading-snug">
                {entry.question.prompt}
              </h3>
            </div>
            <AnswerScorecard
              attempt={entry.attempt}
              judgeError={entry.judgeError}
            />
          </section>
        ))}

        <div className="flex items-center gap-3 pt-2">
          <Link href={`/kits/${kitId}/practice`} className="btn-primary">
            Work on the weak ones
          </Link>
          <Link href={`/kits/${kitId}/calibration`} className="btn-ghost">
            See your calibration
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress is a count, not a bar with the questions on it: seeing what
          is coming lets a candidate prepare for question four during
          question two, which is not a thing the real room allows. */}
      <div className="mb-6 flex items-center justify-between">
        <p className="label">
          Question {index + 1} of {questions.length}
        </p>
        <div className="flex gap-1" aria-hidden>
          {questions.map((question, position) => (
            <span
              key={question.id}
              className={`h-1 w-6 rounded-full transition ${
                position < index
                  ? "bg-accent"
                  : position === index
                    ? "bg-paper"
                    : "bg-line"
              }`}
            />
          ))}
        </div>
      </div>

      <section className="card animate-scale-in p-8 sm:p-10">
        {current && (
          <>
            <span className="chip border-line text-faint">
              {current.category}
            </span>
            <h2 className="mt-5 text-2xl font-medium leading-snug">
              {current.prompt}
            </h2>
          </>
        )}

        <div className="mt-8">
          {phase === "answering" && current && (
            <AnswerRecorder
              key={current.id}
              targetSeconds={MOCK_TARGET}
              busy={busy}
              onSubmit={(answer) => {
                setCaptured(answer);
                setPhase("predicting");
              }}
            />
          )}

          {phase === "predicting" && (
            <SelfRating busy={busy} onRate={(rating) => void submit(rating)} />
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
