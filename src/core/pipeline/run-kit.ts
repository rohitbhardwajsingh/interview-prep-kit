import { checkCoverage } from "../coverage/check";
import { errorsOf, validateKit, warningsOf } from "../kit/validate";
import type { Kit, KitQuestion } from "../kit/schema";
import { allocateSchedule } from "../schedule/allocate";
import { PIPELINE_ERROR_CODES, PipelineError } from "./errors";
import type { KitPipelinePorts, KitRequest, PipelineContext } from "./ports";
import { RunTrace, type TraceEntry } from "./trace";

export const DEFAULT_MAX_COVERAGE_PASSES = 3;

export interface RunKitOptions {
  maxCoveragePasses?: number;
  deadlineAt?: number;
  now?: () => Date;
}

export interface KitRunResult {
  kit: Kit;
  trace: TraceEntry[];
  passes: number;
}

function dedupeById(questions: readonly KitQuestion[]): KitQuestion[] {
  const seen = new Set<string>();
  const unique: KitQuestion[] = [];
  for (const question of questions) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    unique.push(question);
  }
  return unique;
}

/**
 * The single path both the HTTP API and the batch command run. Retrieval and
 * generation arrive through ports; the coverage loop, the schedule and the
 * final validation are decided here so no provider can influence them.
 */
export async function runKit(
  request: KitRequest,
  ports: KitPipelinePorts,
  options: RunKitOptions = {},
): Promise<KitRunResult> {
  const now = options.now ?? (() => new Date());
  const maxPasses = options.maxCoveragePasses ?? DEFAULT_MAX_COVERAGE_PASSES;
  const trace = new RunTrace();
  const context: PipelineContext = {
    trace,
    deadlineAt: options.deadlineAt ?? Number.POSITIVE_INFINITY,
    now,
  };

  const extraction = await trace.step(
    "extract-role",
    () => ports.extractRole(request, context),
    (value) => `${value.requirements.length} requirements from ${request.jd.length} chars`,
  );

  const findings = await trace.step(
    "research-company",
    () => ports.research(request, context),
    (value) =>
      `${value.pagesUsed.length} pages used, hiring process ${value.hiringProcess ? "found" : "not found"}`,
  );

  let questions = await trace.step(
    "generate-questions",
    () =>
      ports.generateQuestions(
        {
          request,
          findings,
          requirements: extraction.requirements,
          existingQuestionIds: [],
          pass: 1,
        },
        context,
      ),
    (value) => `${value.length} questions`,
  );
  questions = dedupeById(questions);

  let coverage = checkCoverage(extraction.requirements, questions);
  let passes = 1;

  while (
    coverage.uncovered_must_requirement_ids.length > 0 &&
    passes < maxPasses
  ) {
    const targets = extraction.requirements.filter((requirement) =>
      coverage.uncovered_must_requirement_ids.includes(requirement.id),
    );
    const nextPass = passes + 1;

    const filled = await trace.step(
      `close-coverage-gap-pass-${nextPass}`,
      () =>
        ports.generateQuestions(
          {
            request,
            findings,
            requirements: targets,
            existingQuestionIds: questions.map((question) => question.id),
            pass: nextPass,
          },
          context,
        ),
      (value) => `${value.length} questions for ${targets.length} uncovered must-haves`,
    );

    const before = coverage.uncovered_must_requirement_ids.length;
    questions = dedupeById([...questions, ...filled]);
    coverage = checkCoverage(extraction.requirements, questions);
    passes = nextPass;

    if (coverage.uncovered_must_requirement_ids.length >= before) {
      trace.skip(
        "close-coverage-gap",
        `Pass ${nextPass} closed no gaps, stopping early`,
      );
      break;
    }
  }

  if (coverage.uncovered_must_requirement_ids.length > 0) {
    trace.skip(
      "close-coverage-gap",
      `Gave up with ${coverage.uncovered_must_requirement_ids.length} must-haves uncovered after ${passes} passes`,
    );
  }

  const flashcards = await trace.step(
    "generate-flashcards",
    () =>
      ports.generateFlashcards(
        { request, requirements: extraction.requirements, questions },
        context,
      ),
    (value) => `${value.length} flashcards`,
  );

  const schedule = await trace.step(
    "allocate-schedule",
    async () =>
      allocateSchedule({
        daysAvailable: request.days,
        questions,
        requirements: extraction.requirements,
      }),
    (value) => `${value.days.length} days`,
  );

  const kit: Kit = {
    source: {
      company: findings.company,
      company_url: request.companyUrl,
      role: extraction.title,
      location: extraction.location,
      jd_chars: request.jd.length,
      researched_at: now().toISOString(),
      pages_used: findings.pagesUsed,
    },
    company_brief: findings.brief,
    role: {
      title: extraction.title,
      seniority: extraction.seniority,
      responsibilities: extraction.responsibilities,
      requirements: extraction.requirements,
    },
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncovered_requirement_ids,
      passes,
    },
  };

  const validation = await trace.step(
    "validate-kit",
    async () => validateKit(kit),
    (value) => (value.ok ? "structure ok" : `${value.issues.length} issues`),
  );

  if (!validation.ok || !validation.kit) {
    throw new PipelineError(
      PIPELINE_ERROR_CODES.KIT_INVALID,
      `Generated kit failed validation: ${errorsOf(validation.issues)
        .map((issue) => `${issue.code} at ${issue.path || "<root>"}`)
        .join("; ")}`,
    );
  }

  for (const warning of warningsOf(validation.issues)) {
    trace.skip(warning.code, warning.message);
  }

  return { kit: validation.kit, trace: trace.snapshot(), passes };
}
