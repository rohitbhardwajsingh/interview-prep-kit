import { checkCoverage } from "../coverage/check";
import { kitSchema, type Kit } from "./schema";

export const KIT_ISSUE_CODES = {
  SCHEMA: "SCHEMA",
  DUPLICATE_ID: "DUPLICATE_ID",
  UNKNOWN_REQUIREMENT_REFERENCE: "UNKNOWN_REQUIREMENT_REFERENCE",
  UNKNOWN_QUESTION_REFERENCE: "UNKNOWN_QUESTION_REFERENCE",
  SCHEDULE_LENGTH_MISMATCH: "SCHEDULE_LENGTH_MISMATCH",
  SCHEDULE_DAY_SEQUENCE: "SCHEDULE_DAY_SEQUENCE",
  COVERAGE_MISMATCH: "COVERAGE_MISMATCH",
  UNSCHEDULED_MUST_REQUIREMENT: "UNSCHEDULED_MUST_REQUIREMENT",
} as const;

export type KitIssueCode = (typeof KIT_ISSUE_CODES)[keyof typeof KIT_ISSUE_CODES];

export interface KitIssue {
  code: KitIssueCode;
  path: string;
  message: string;
}

export interface KitValidationResult {
  ok: boolean;
  issues: KitIssue[];
  kit: Kit | null;
}

function collectDuplicateIds(
  ids: readonly string[],
  path: string,
  issues: KitIssue[],
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        code: KIT_ISSUE_CODES.DUPLICATE_ID,
        path,
        message: `Duplicate id "${id}"`,
      });
    }
    seen.add(id);
  }
}

function checkReferences(kit: Kit, issues: KitIssue[]): void {
  const requirementIds = new Set(kit.role.requirements.map((item) => item.id));
  const questionIds = new Set(kit.questions.map((item) => item.id));

  collectDuplicateIds(
    kit.role.requirements.map((item) => item.id),
    "role.requirements",
    issues,
  );
  collectDuplicateIds(kit.questions.map((item) => item.id), "questions", issues);
  collectDuplicateIds(kit.flashcards.map((item) => item.id), "flashcards", issues);

  kit.questions.forEach((question, index) => {
    for (const referenced of question.requirement_ids) {
      if (requirementIds.has(referenced)) continue;
      issues.push({
        code: KIT_ISSUE_CODES.UNKNOWN_REQUIREMENT_REFERENCE,
        path: `questions[${index}].requirement_ids`,
        message: `Question "${question.id}" references unknown requirement "${referenced}"`,
      });
    }
  });

  kit.flashcards.forEach((flashcard, index) => {
    for (const referenced of flashcard.requirement_ids) {
      if (requirementIds.has(referenced)) continue;
      issues.push({
        code: KIT_ISSUE_CODES.UNKNOWN_REQUIREMENT_REFERENCE,
        path: `flashcards[${index}].requirement_ids`,
        message: `Flashcard "${flashcard.id}" references unknown requirement "${referenced}"`,
      });
    }
  });

  kit.schedule.days.forEach((day, index) => {
    for (const referenced of day.question_ids) {
      if (questionIds.has(referenced)) continue;
      issues.push({
        code: KIT_ISSUE_CODES.UNKNOWN_QUESTION_REFERENCE,
        path: `schedule.days[${index}].question_ids`,
        message: `Day ${day.day} references unknown question "${referenced}"`,
      });
    }
  });
}

function checkSchedule(kit: Kit, issues: KitIssue[]): void {
  const { days, days_available: daysAvailable } = kit.schedule;

  if (days.length !== daysAvailable) {
    issues.push({
      code: KIT_ISSUE_CODES.SCHEDULE_LENGTH_MISMATCH,
      path: "schedule.days",
      message: `Schedule spans ${days.length} days but ${daysAvailable} were requested`,
    });
  }

  days.forEach((day, index) => {
    if (day.day === index + 1) return;
    issues.push({
      code: KIT_ISSUE_CODES.SCHEDULE_DAY_SEQUENCE,
      path: `schedule.days[${index}].day`,
      message: `Expected day ${index + 1}, found day ${day.day}`,
    });
  });
}

function checkCoverageHonesty(kit: Kit, issues: KitIssue[]): void {
  const recomputed = checkCoverage(kit.role.requirements, kit.questions);
  const recorded = [...kit.coverage.uncovered_requirement_ids].sort();
  const actual = [...recomputed.uncovered_requirement_ids].sort();

  if (recorded.join("|") !== actual.join("|")) {
    issues.push({
      code: KIT_ISSUE_CODES.COVERAGE_MISMATCH,
      path: "coverage.uncovered_requirement_ids",
      message: `Recorded [${recorded.join(", ")}] but questions leave [${actual.join(", ")}] uncovered`,
    });
  }
}

function checkMustHavesAreScheduled(kit: Kit, issues: KitIssue[]): void {
  const scheduled = new Set(
    kit.schedule.days.flatMap((day) => day.question_ids),
  );
  const answering = new Map<string, boolean>();

  for (const question of kit.questions) {
    if (!scheduled.has(question.id)) continue;
    for (const referenced of question.requirement_ids) {
      answering.set(referenced, true);
    }
  }

  for (const requirement of kit.role.requirements) {
    if (requirement.priority !== "must") continue;
    if (answering.get(requirement.id)) continue;
    issues.push({
      code: KIT_ISSUE_CODES.UNSCHEDULED_MUST_REQUIREMENT,
      path: "schedule.days",
      message: `Must-have requirement "${requirement.id}" has no scheduled question`,
    });
  }
}

/**
 * Shape first, then the cross-references and invariants a JSON schema cannot
 * express. Returns issues rather than throwing so a batch run can record a
 * malformed kit and carry on to the next case.
 */
export function validateKit(input: unknown): KitValidationResult {
  const parsed = kitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      kit: null,
      issues: parsed.error.issues.map((issue) => ({
        code: KIT_ISSUE_CODES.SCHEMA,
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const kit = parsed.data;
  const issues: KitIssue[] = [];

  checkReferences(kit, issues);
  checkSchedule(kit, issues);
  checkCoverageHonesty(kit, issues);
  checkMustHavesAreScheduled(kit, issues);

  return { ok: issues.length === 0, issues, kit };
}
