import type {
  Kit,
  KitFlashcard,
  KitQuestion,
  KitRequirement,
} from "./schema";
import { asGeneratedAll, untrack, type Tracked } from "./provenance";

export type TrackedRequirement = KitRequirement & Tracked;
export type TrackedQuestion = KitQuestion & Tracked;
export type TrackedFlashcard = KitFlashcard & Tracked;

export interface TrackedRole {
  title: string;
  seniority: string;
  responsibilities: string[];
  requirements: TrackedRequirement[];
}

/**
 * A kit as it is stored for a user: the Appendix A shape plus the provenance
 * the interface needs. Tracking lives here rather than in the pipeline so the
 * batch command keeps emitting exactly the documented structure.
 *
 * Written out field by field rather than as an Omit of `Kit`, because the
 * Appendix A schemas are permissive and an Omit over an index signature
 * collapses every known field back to `unknown`.
 */
export interface TrackedKit {
  source: Kit["source"];
  company_brief: Kit["company_brief"];
  role: TrackedRole;
  questions: TrackedQuestion[];
  flashcards: TrackedFlashcard[];
  schedule: Kit["schedule"];
  coverage: Kit["coverage"];
}

/** Everything in a freshly generated kit is the model's until the user acts. */
export function trackKit(kit: Kit): TrackedKit {
  return {
    source: kit.source,
    company_brief: kit.company_brief,
    role: {
      title: kit.role.title,
      seniority: kit.role.seniority,
      responsibilities: kit.role.responsibilities,
      requirements: asGeneratedAll(kit.role.requirements),
    },
    questions: asGeneratedAll(kit.questions),
    flashcards: asGeneratedAll(kit.flashcards),
    schedule: kit.schedule,
    coverage: kit.coverage,
  };
}

/** Back to the plain documented shape, for export and for validation. */
export function untrackKit(kit: TrackedKit): Kit {
  return {
    source: kit.source,
    company_brief: kit.company_brief,
    role: {
      title: kit.role.title,
      seniority: kit.role.seniority,
      responsibilities: kit.role.responsibilities,
      requirements: kit.role.requirements.map(untrack) as KitRequirement[],
    },
    questions: kit.questions.map(untrack) as KitQuestion[],
    flashcards: kit.flashcards.map(untrack) as KitFlashcard[],
    schedule: kit.schedule,
    coverage: kit.coverage,
  };
}
