import { mergeRegenerated, type MergeReport } from "../kit/merge";
import { reconcileKit, type ReconcileReport } from "../kit/reconcile";
import type { KitFlashcard, KitQuestion, KitRequirement } from "../kit/schema";
import type {
  TrackedFlashcard,
  TrackedKit,
  TrackedQuestion,
} from "../kit/tracked";
import { untrackKit } from "../kit/tracked";
import type {
  KitPipelinePorts,
  KitRequest,
  PipelineContext,
  ResearchFindings,
} from "./ports";
import { RunTrace, type TraceEntry } from "./trace";

export const REGENERABLE_SECTIONS = ["questions", "flashcards"] as const;
export type RegenerableSection = (typeof REGENERABLE_SECTIONS)[number];

export interface RegenerateSectionInput {
  kit: TrackedKit;
  request: KitRequest;
  section: RegenerableSection;
}

export interface RegenerateSectionOptions {
  deadlineAt?: number;
  now?: () => Date;
  trace?: RunTrace;
}

export interface RegenerateSectionResult {
  kit: TrackedKit;
  merge: MergeReport;
  reconciled: ReconcileReport;
  trace: TraceEntry[];
}

/**
 * Rebuilt from the stored kit rather than re-crawled. The pages were already
 * read once and are recorded on the kit, so asking for different questions
 * about the same role does not mean hitting the company's site again: it is
 * slower, it is ruder, and it risks a different brief silently appearing
 * underneath questions the user is only rewording.
 */
function findingsFromKit(kit: TrackedKit): ResearchFindings {
  return {
    company: kit.source.company,
    pagesUsed: kit.source.pages_used,
    brief: kit.company_brief,
    // Not stored apart from the brief, and inventing one here would put words
    // about their process into a prompt that never read it.
    hiringProcess: null,
    publicDiscussion: [],
  };
}

/**
 * Regenerates one slice of an existing kit.
 *
 * The user's edits and pins are the reason this is not simply "run the
 * pipeline again": they are handed to the model as context so it does not
 * reproduce them, and they are excluded from replacement by the merge. Every
 * other section is left exactly as it was, and the deterministic parts —
 * coverage, schedule, citations — are recomputed afterwards, so a kit cannot
 * be left describing itself incorrectly.
 */
export async function regenerateSection(
  input: RegenerateSectionInput,
  ports: KitPipelinePorts,
  options: RegenerateSectionOptions = {},
): Promise<RegenerateSectionResult> {
  const trace = options.trace ?? new RunTrace();
  const context: PipelineContext = {
    trace,
    deadlineAt: options.deadlineAt ?? Number.POSITIVE_INFINITY,
    now: options.now ?? (() => new Date()),
  };

  const plain = untrackKit(input.kit);
  const requirements = plain.role.requirements;

  const regenerated =
    input.section === "questions"
      ? await regenerateQuestions(input, ports, context, requirements)
      : await regenerateFlashcards(
          input,
          ports,
          context,
          requirements,
          plain.questions,
        );

  // Replacing questions changes what the kit covers and how the days divide,
  // so the arithmetic is redone rather than patched.
  const { kit, report } = reconcileKit(regenerated.kit);

  return {
    kit,
    merge: regenerated.merge,
    reconciled: report,
    trace: trace.snapshot(),
  };
}

async function regenerateQuestions(
  input: RegenerateSectionInput,
  ports: KitPipelinePorts,
  context: PipelineContext,
  requirements: KitRequirement[],
): Promise<{ kit: TrackedKit; merge: MergeReport }> {
  // Only the items that will survive are worth describing to the model: the
  // ones it is about to replace are precisely the ones it should feel free to
  // write over.
  const surviving = input.kit.questions
    .filter((question) => question.provenance !== "generated")
    .map(({ provenance: _provenance, ...rest }) => rest as KitQuestion);

  const drafts = await context.trace.step(
    "regenerate-questions",
    () =>
      ports.generateQuestions(
        {
          request: input.request,
          findings: findingsFromKit(input.kit),
          requirements,
          allRequirementIds: requirements.map((requirement) => requirement.id),
          existingQuestions: surviving,
          pass: 1,
        },
        context,
      ),
    (value) => `${value.length} questions`,
  );

  const { items, report } = mergeRegenerated<TrackedQuestion, KitQuestion>({
    existing: input.kit.questions,
    incoming: drafts,
    idPrefix: "q",
  });

  return { kit: { ...input.kit, questions: items }, merge: report };
}

async function regenerateFlashcards(
  input: RegenerateSectionInput,
  ports: KitPipelinePorts,
  context: PipelineContext,
  requirements: KitRequirement[],
  questions: KitQuestion[],
): Promise<{ kit: TrackedKit; merge: MergeReport }> {
  const drafts = await context.trace.step(
    "regenerate-flashcards",
    () =>
      ports.generateFlashcards(
        { request: input.request, requirements, questions },
        context,
      ),
    (value) => `${value.length} flashcards`,
  );

  const { items, report } = mergeRegenerated<TrackedFlashcard, KitFlashcard>({
    existing: input.kit.flashcards,
    incoming: drafts,
    idPrefix: "f",
  });

  return { kit: { ...input.kit, flashcards: items }, merge: report };
}
