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
import { useToday } from "@/lib/use-today";

interface QueueItem {
  questionId: string;
  box: number;
  dueOnDay: number;
  lastConfidence: number | null;
  timesSeen: number;
  targetSeconds: [number, number];
}

interface PracticeBody {
  day: number;
  daysAvailable: number;
  queue: QueueItem[];
  progress: {
    total: number;
    attempted: number;
    solid: number;
    shaky: number;
    dueToday: number;
  };
}

/**
 * Five grades, each bound to the digit above the letters. The hint says what
 * the grade does to the schedule, because a rating whose consequence is
 * hidden gets guessed at, and a guessed rating makes the spacing worthless.
 */
const CONFIDENCE = [
  { value: 1, label: "No idea", hint: "Start again", tone: "bad" },
  { value: 2, label: "Shaky", hint: "Start again", tone: "bad" },
  { value: 3, label: "Partly", hint: "Same interval", tone: "warn" },
  { value: 4, label: "Good", hint: "Longer gap", tone: "good" },
  { value: 5, label: "Nailed it", hint: "Longest gap", tone: "good" },
] as const;

const TONE: Record<string, string> = {
  bad: "border-bad/40 text-bad hover:border-bad hover:bg-bad/10",
  warn: "border-warn/40 text-warn hover:border-warn hover:bg-warn/10",
  good: "border-good/40 text-good hover:border-good hover:bg-good/10",
};

/**
 * Where the user is in one question.
 *
 * The two paths through it are deliberate. Reviewing an outline is cheap and
 * keeps the spacing alive on a day with ten minutes in it; answering out
 * loud is the expensive one that actually finds out whether the answer
 * exists. Making the cheap path available is what stops the expensive one
 * from being skipped entirely on a bad day.
 *
 * The order within the spoken path is not negotiable: answer, then predict,
 * then score. `predicting` cannot be reached with a score on screen, which
 * is the whole basis of the calibration number.
 */
type Stage = "choosing" | "reviewing" | "answering" | "predicting" | "scored";

/** A follow-up being drilled, which is judged against its parent's outline. */
interface Drill {
  prompt: string;
}

export default function PracticePage() {
  const { kit, kitId } = useKitContext();
  const ready = kit?.status === "ready" && kit.kit !== null;
  const { today, reload: refreshToday } = useToday(kitId, ready);

  const [practice, setPractice] = useState<PracticeBody | null>(null);
  const [stage, setStage] = useState<Stage>("choosing");
  const [captured, setCaptured] = useState<CapturedAnswer | null>(null);
  const [scored, setScored] = useState<{
    attempt: Attempt;
    judgeError: string | null;
  } | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The day comes from the calendar rather than a picker: which day it is is
  // a fact, not a preference, and asking the user to choose invites them to
  // quietly re-answer yesterday.
  const day = today?.calendar.todayDay ?? 1;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!ready) return;
      try {
        const body = await api<PracticeBody>(
          `/kits/${kitId}/practice?day=${day}`,
          { signal },
        );
        setPractice(body);
        setError(null);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      }
    },
    [kitId, day, ready],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const current = practice?.queue[0];
  const question = kit?.kit?.questions.find(
    (entry) => entry.id === current?.questionId,
  );

  /** Resets to the top of the next question. */
  const advance = useCallback(async () => {
    setStage("choosing");
    setCaptured(null);
    setScored(null);
    setDrill(null);
    // Re-read rather than mutating locally, so the next item comes from the
    // same scheduler the server just updated.
    await load();
    await refreshToday();
  }, [load, refreshToday]);

  /** The cheap path: grade an outline review without answering it. */
  const grade = useCallback(
    async (confidence: number) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        await api(`/kits/${kitId}/practice/${current.questionId}`, {
          method: "POST",
          body: { confidence, day },
        });
        await advance();
      } catch (cause) {
        setError(
          cause instanceof ApiError ? cause.message : "Could not save that",
        );
      } finally {
        setBusy(false);
      }
    },
    [current, busy, kitId, day, advance],
  );

  /**
   * The expensive path. The answer is held unsent until the prediction is
   * in, because the server returns a score and there is no way to show one
   * without spoiling the question it was about to ask.
   */
  const submitPrediction = useCallback(
    async (selfRating: number) => {
      if (!captured || !current || busy) return;
      setBusy(true);
      try {
        const body = await api<{ attempt: Attempt; judgeError: string | null }>(
          `/kits/${kitId}/answers/${current.questionId}`,
          {
            method: "POST",
            body: {
              ...captured,
              selfRating,
              // A drilled follow-up is extra work on a question already
              // graded, so it must not re-advance the schedule.
              ...(drill ? {} : { day }),
            },
          },
        );
        setScored(body);
        setStage("scored");
      } catch (cause) {
        setError(
          cause instanceof ApiError ? cause.message : "Could not score that",
        );
        setStage("answering");
      } finally {
        setBusy(false);
      }
    },
    [captured, current, busy, kitId, day, drill],
  );

  // Space starts and ends the answer. Everything else on this screen is
  // reachable by keyboard too, because a session that needs a mouse gets
  // abandoned by the third day.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (["INPUT", "TEXTAREA"].includes(target?.tagName ?? "")) return;
      if (!current) return;

      const isSpace = event.key === " " || event.code === "Space";

      if (stage === "choosing" && isSpace) {
        event.preventDefault();
        setStage("answering");
        return;
      }

      if (stage === "choosing" && (event.key === "r" || event.key === "R")) {
        event.preventDefault();
        setStage("reviewing");
        return;
      }

      if (stage === "reviewing") {
        const digit = Number(event.key);
        if (digit >= 1 && digit <= 5) {
          event.preventDefault();
          void grade(digit);
        }
        return;
      }

      if (stage === "scored" && isSpace) {
        event.preventDefault();
        void advance();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, stage, grade, advance]);

  if (!ready) return <KitNotReady />;

  if (error && !practice) {
    return (
      <p role="alert" className="text-sm text-bad">
        {error}
      </p>
    );
  }

  if (!practice) {
    return <div className="skeleton h-80 w-full" aria-busy="true" />;
  }

  const { progress } = practice;
  const attempted = progress.total === 0 ? 0 : progress.attempted / progress.total;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="label">Day {day}</p>
          {/* "Solid" is deliberately hard to reach: it means an item has
              survived several spaced sightings, not that it went well once.
              Saying so stops the counter looking broken after a good answer
              fails to move it. */}
          <p
            className="tnum text-xs text-faint"
            title="Solid means an item has survived four or more spaced sightings. One confident answer is not enough."
          >
            {progress.attempted} of {progress.total} seen · {progress.solid}{" "}
            solid · {progress.shaky} still shaky
          </p>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-[width]
              duration-500 ease-spring"
            style={{ width: `${Math.max(1, attempted * 100)}%` }}
          />
        </div>
      </div>

      {!current || !question ? (
        <section className="card animate-scale-in p-10 text-center">
          <h2 className="text-xl font-medium">Nothing due right now</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
            {progress.attempted === 0
              ? "This kit has not been practised yet. Come back when there is a plan for today."
              : "Everything scheduled for today has been through once. The next items come back on their own."}
          </p>
          <Link href={`/kits/${kitId}`} className="btn-ghost mt-6">
            Back to today
          </Link>
        </section>
      ) : (
        <section className="card animate-scale-in p-8 sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip border-line text-faint">
              {question.category}
            </span>
            <span className="chip border-line text-faint">box {current.box}</span>
            {current.timesSeen > 0 && (
              <span className="chip border-line text-faint">
                seen {current.timesSeen}×
              </span>
            )}
            {drill && (
              <span className="chip border-accent/40 text-accent">
                follow-up
              </span>
            )}
          </div>

          <h2 className="mt-5 text-2xl font-medium leading-snug">
            {drill?.prompt ?? question.prompt}
          </h2>

          <div className="mt-8">
            {stage === "choosing" && (
              <div className="animate-fade-in space-y-3">
                <button
                  type="button"
                  onClick={() => setStage("answering")}
                  className="btn-primary w-full justify-center py-4 text-base"
                >
                  Answer it out loud
                  <kbd className="kbd">␣</kbd>
                </button>

                <button
                  type="button"
                  onClick={() => setStage("reviewing")}
                  className="btn-ghost w-full justify-center py-3"
                >
                  Just review the outline
                  <kbd className="kbd">R</kbd>
                </button>

                <p className="pt-1 text-center text-xs text-faint">
                  Answering out loud is the one that finds out whether you can
                  actually say it.
                </p>
              </div>
            )}

            {stage === "reviewing" && (
              <div className="animate-fade-up space-y-8">
                <div className="rounded-xl border border-line bg-void p-5">
                  <p className="label">What a good answer covers</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-dim">
                    {question.answer_outline}
                  </p>
                </div>

                <div>
                  <p className="label">How did that go?</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {CONFIDENCE.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={busy}
                        onClick={() => void grade(option.value)}
                        className={`flex flex-col items-center gap-0.5 rounded-xl
                          border bg-surface px-3 py-3 text-sm transition
                          disabled:opacity-40 ${TONE[option.tone]}`}
                      >
                        <kbd className="kbd mb-1">{option.value}</kbd>
                        <span className="font-medium">{option.label}</span>
                        <span className="text-[10px] text-faint">
                          {option.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {stage === "answering" && (
              <AnswerRecorder
                key={drill?.prompt ?? question.id}
                targetSeconds={current.targetSeconds}
                busy={busy}
                onSubmit={(answer) => {
                  setCaptured(answer);
                  setStage("predicting");
                }}
              />
            )}

            {stage === "predicting" && (
              <SelfRating busy={busy} onRate={(rating) => void submitPrediction(rating)} />
            )}

            {stage === "scored" && scored && (
              <AnswerScorecard
                attempt={scored.attempt}
                judgeError={scored.judgeError}
                onDrill={
                  // One level of follow-up. A second would turn a five-minute
                  // session into an interrogation, and the schedule still has
                  // other questions in it.
                  drill
                    ? undefined
                    : (followUp) => {
                        setDrill({ prompt: followUp });
                        setCaptured(null);
                        setScored(null);
                        setStage("answering");
                      }
                }
                footer={
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      className="btn-bare text-xs"
                      onClick={() => {
                        setCaptured(null);
                        setScored(null);
                        setStage("answering");
                      }}
                    >
                      Try that again
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void advance()}
                    >
                      Next question
                      <kbd className="kbd">␣</kbd>
                    </button>
                  </div>
                }
              />
            )}
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-bad">
          {error}
        </p>
      )}

      {stage === "choosing" && (
        <p className="mt-6 text-center text-xs text-faint">
          <kbd className="kbd">␣</kbd> answer aloud · <kbd className="kbd">R</kbd>{" "}
          review only · <kbd className="kbd">t</kbd> back to today
        </p>
      )}
    </div>
  );
}
