import type { TraceStep } from "./types";

interface ExpectedStep {
  id: string;
  label: string;
  hint: string;
  /**
   * Coverage runs an unknown number of passes, each recorded under its own
   * name, so that stage is matched by prefix and collapses into one row.
   */
  matchesPrefix?: boolean;
  /** A stage that only happens when there is a gap to close. */
  conditional?: boolean;
}

/**
 * The pipeline's step names are internal identifiers. These are what someone
 * waiting ninety seconds should read instead, in the order they happen, so the
 * wait has a shape rather than being an indeterminate spinner.
 */
export const EXPECTED_STEPS: ExpectedStep[] = [
  {
    id: "extract-role",
    label: "Reading the posting",
    hint: "Pulling out what they actually require",
  },
  {
    id: "research-company",
    label: "Researching the company",
    hint: "Reading their site, respecting robots.txt",
  },
  {
    id: "generate-questions",
    label: "Writing questions",
    hint: "Grounded in the requirements, with a marking guide",
  },
  {
    id: "close-coverage-gap",
    label: "Closing coverage gaps",
    hint: "Re-asking for any must-have left untested",
    matchesPrefix: true,
    conditional: true,
  },
  {
    id: "generate-flashcards",
    label: "Building flashcards",
    hint: "The facts worth recalling cold",
  },
  {
    id: "allocate-schedule",
    label: "Allocating your days",
    hint: "Fitting the work into the time you have",
  },
  {
    id: "validate-kit",
    label: "Checking the result",
    hint: "Verifying every reference resolves",
  },
];

export type StepState = "waiting" | "running" | "ok" | "failed" | "skipped";

export interface DisplayStep {
  id: string;
  label: string;
  hint: string;
  state: StepState;
  detail: string;
  durationMs: number;
}

function matching(expected: ExpectedStep, steps: TraceStep[]): TraceStep[] {
  return steps.filter((step) =>
    expected.matchesPrefix
      ? step.step.startsWith(expected.id)
      : step.step === expected.id,
  );
}

/**
 * Merges what has happened onto what is expected, which is what makes a long
 * wait legible: the user sees the whole journey with their position in it,
 * rather than a list that grows from nothing towards an unknown end.
 */
export function describeProgress(
  steps: TraceStep[],
  jobStatus: "running" | "succeeded" | "failed" | null,
): DisplayStep[] {
  const seen = EXPECTED_STEPS.map((expected) => matching(expected, steps));
  const failedAt = seen.findIndex((group) =>
    group.some((step) => step.status === "failed"),
  );

  // Where the run currently is: the first expected stage with nothing
  // recorded against it, ignoring stages that may legitimately not happen.
  const position = EXPECTED_STEPS.findIndex(
    (expected, index) => seen[index]?.length === 0 && !expected.conditional,
  );

  return EXPECTED_STEPS.map((expected, index) => {
    const group = seen[index] ?? [];

    if (group.length > 0) {
      const failed = group.find((step) => step.status === "failed");
      const chosen = failed ?? group[group.length - 1];
      return {
        id: expected.id,
        label: expected.label,
        hint: expected.hint,
        state: (chosen?.status ?? "ok") as StepState,
        // Several passes collapse into one row, so the count is the detail
        // that matters, not just the last pass's own summary.
        detail:
          group.length > 1
            ? `${group.length} passes — ${chosen?.detail ?? ""}`
            : (chosen?.detail ?? ""),
        durationMs: group.reduce((total, step) => total + step.duration_ms, 0),
      };
    }

    // Past a failure nothing more was attempted, so later stages are shown as
    // never reached rather than still pending.
    const reached = failedAt === -1 || index < failedAt;
    const running = jobStatus === "running" && reached && index === position;

    return {
      id: expected.id,
      label: expected.label,
      hint: expected.hint,
      state: running ? "running" : "waiting",
      detail: "",
      durationMs: 0,
    };
  });
}

/** Steps the run recorded that are not part of the expected sequence. */
export function extraSteps(steps: TraceStep[]): TraceStep[] {
  return steps.filter(
    (step) =>
      !EXPECTED_STEPS.some((expected) =>
        expected.matchesPrefix
          ? step.step.startsWith(expected.id)
          : step.step === expected.id,
      ),
  );
}
