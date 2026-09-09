import { allocateSchedule } from "../schedule/allocate";
import { checkCoverage } from "../coverage/check";
import type {
  Kit,
  KitFlashcard,
  KitQuestion,
  KitRequirement,
} from "../kit/schema";

export function buildRequirement(
  id: string,
  overrides: Partial<KitRequirement> = {},
): KitRequirement {
  return {
    id,
    text: `Requirement ${id}`,
    kind: "technical",
    priority: "must",
    ...overrides,
  };
}

export function buildQuestion(
  id: string,
  requirementIds: string[],
  overrides: Partial<KitQuestion> = {},
): KitQuestion {
  return {
    id,
    requirement_ids: requirementIds,
    category: "technical",
    prompt: `Prompt for ${id}`,
    answer_outline: `Outline for ${id}`,
    difficulty: 2,
    ...overrides,
  };
}

export function buildFlashcard(
  id: string,
  requirementIds: string[],
  overrides: Partial<KitFlashcard> = {},
): KitFlashcard {
  return {
    id,
    front: `Front ${id}`,
    back: `Back ${id}`,
    requirement_ids: requirementIds,
    ...overrides,
  };
}

export interface BuildKitOptions {
  requirements?: KitRequirement[];
  questions?: KitQuestion[];
  flashcards?: KitFlashcard[];
  daysAvailable?: number;
  passes?: number;
}

/**
 * A structurally valid kit with a real allocated schedule and honest coverage,
 * so tests can assert on a single deliberate deviation from it.
 */
export function buildKit(options: BuildKitOptions = {}): Kit {
  const requirements = options.requirements ?? [
    buildRequirement("r1"),
    buildRequirement("r2", { priority: "nice", kind: "behavioural" }),
  ];
  const questions = options.questions ?? [
    buildQuestion("q1", ["r1"], { difficulty: 3 }),
    buildQuestion("q2", ["r2"], { category: "behavioural", difficulty: 1 }),
  ];
  const flashcards = options.flashcards ?? [buildFlashcard("f1", ["r1"])];
  const daysAvailable = options.daysAvailable ?? 3;

  return {
    source: {
      company: "Acme",
      company_url: "http://localhost:8099/acme/",
      role: "Senior Backend Engineer",
      location: "Remote",
      jd_chars: 1200,
      researched_at: "2026-09-01T09:12:44.000Z",
      pages_used: ["http://localhost:8099/acme/careers"],
    },
    company_brief: {
      summary: "Acme builds logistics software.",
      what_they_do: "Freight routing for mid-market carriers.",
      sources: ["http://localhost:8099/acme/about"],
    },
    role: {
      title: "Senior Backend Engineer",
      seniority: "senior",
      responsibilities: ["Own the routing service"],
      requirements,
    },
    questions,
    flashcards,
    schedule: allocateSchedule({ daysAvailable, questions, requirements }),
    coverage: {
      uncovered_requirement_ids: checkCoverage(requirements, questions)
        .uncovered_requirement_ids,
      passes: options.passes ?? 2,
    },
  };
}
