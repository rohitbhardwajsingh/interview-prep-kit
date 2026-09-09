import { checkCoverage } from "../coverage/check";
import { allocateSchedule } from "../schedule/allocate";
import type { TrackedFlashcard, TrackedKit, TrackedQuestion } from "./tracked";

export interface ReconcileReport {
  /** Citations dropped because the requirement no longer exists. */
  danglingReferencesRemoved: number;
  /** Questions left citing nothing, which cover no requirement. */
  orphanQuestionIds: string[];
  uncoveredRequirementIds: string[];
}

function pruneReferences<T extends { requirement_ids: string[] }>(
  items: readonly T[],
  known: ReadonlySet<string>,
  counter: { removed: number },
): T[] {
  return items.map((item) => {
    const kept = item.requirement_ids.filter((id) => known.has(id));
    if (kept.length === item.requirement_ids.length) return item;
    counter.removed += item.requirement_ids.length - kept.length;
    return { ...item, requirement_ids: kept };
  });
}

/**
 * Restores every invariant that an edit can break, by recomputing rather than
 * patching. Deleting a requirement leaves citations pointing at nothing;
 * adding or removing a question makes the schedule and the coverage record
 * stale. All three are arithmetic, so the code redoes them and the kit is
 * valid again by construction instead of by the interface being careful.
 *
 * Deliberately never deletes a question for citing nothing: a question the
 * user wrote is theirs to keep, even after the requirement it answered is gone.
 */
export function reconcileKit(kit: TrackedKit): {
  kit: TrackedKit;
  report: ReconcileReport;
} {
  const known = new Set(kit.role.requirements.map((item) => item.id));
  const counter = { removed: 0 };

  const questions: TrackedQuestion[] = pruneReferences(
    kit.questions,
    known,
    counter,
  );
  const flashcards: TrackedFlashcard[] = pruneReferences(
    kit.flashcards,
    known,
    counter,
  );

  const coverage = checkCoverage(kit.role.requirements, questions);

  const schedule = allocateSchedule({
    daysAvailable: kit.schedule.days_available,
    questions,
    requirements: kit.role.requirements,
  });

  return {
    kit: {
      ...kit,
      questions,
      flashcards,
      schedule,
      coverage: {
        ...kit.coverage,
        uncovered_requirement_ids: coverage.uncovered_requirement_ids,
      },
    },
    report: {
      danglingReferencesRemoved: counter.removed,
      orphanQuestionIds: coverage.orphan_question_ids,
      uncoveredRequirementIds: coverage.uncovered_requirement_ids,
    },
  };
}
