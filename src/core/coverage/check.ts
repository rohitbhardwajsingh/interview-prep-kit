import type { KitQuestion, KitRequirement } from "../kit/schema";

export interface CoverageReport {
  covered_requirement_ids: string[];
  uncovered_requirement_ids: string[];
  uncovered_must_requirement_ids: string[];
  uncovered_nice_requirement_ids: string[];
  questions_by_requirement: Record<string, string[]>;
  orphan_question_ids: string[];
}

/**
 * A requirement counts as covered only when a question names its id. Questions
 * are never credited for requirement ids that do not exist on the kit, so a
 * model inventing references cannot close a gap.
 */
export function checkCoverage(
  requirements: readonly KitRequirement[],
  questions: readonly KitQuestion[],
): CoverageReport {
  const questionsByRequirement: Record<string, string[]> = {};
  for (const requirement of requirements) {
    questionsByRequirement[requirement.id] = [];
  }

  const orphanQuestionIds: string[] = [];
  for (const question of questions) {
    let matchedAny = false;
    for (const requirementId of question.requirement_ids) {
      const bucket = questionsByRequirement[requirementId];
      if (!bucket) continue;
      matchedAny = true;
      if (!bucket.includes(question.id)) bucket.push(question.id);
    }
    if (!matchedAny) orphanQuestionIds.push(question.id);
  }

  const covered: string[] = [];
  const uncovered: string[] = [];
  const uncoveredMust: string[] = [];
  const uncoveredNice: string[] = [];

  for (const requirement of requirements) {
    const hasQuestion = (questionsByRequirement[requirement.id] ?? []).length > 0;
    if (hasQuestion) {
      covered.push(requirement.id);
      continue;
    }
    uncovered.push(requirement.id);
    if (requirement.priority === "must") uncoveredMust.push(requirement.id);
    else uncoveredNice.push(requirement.id);
  }

  return {
    covered_requirement_ids: covered,
    uncovered_requirement_ids: uncovered,
    uncovered_must_requirement_ids: uncoveredMust,
    uncovered_nice_requirement_ids: uncoveredNice,
    questions_by_requirement: questionsByRequirement,
    orphan_question_ids: orphanQuestionIds,
  };
}
