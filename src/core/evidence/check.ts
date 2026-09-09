import type { KitQuestion, KitRequirement } from "../kit/schema";

/** One story's claim to evidence a set of requirements. */
export interface EvidenceLink {
  storyId: string;
  requirementIds: string[];
}

export interface RequirementEvidence {
  requirementId: string;
  priority: KitRequirement["priority"];
  storyIds: string[];
  questionIds: string[];
}

export interface EvidenceReport {
  byRequirement: RequirementEvidence[];
  /** Requirements with no story at all behind them. */
  unevidenced_requirement_ids: string[];
  /**
   * The ones that actually matter: a must-have the kit will interview them on,
   * for which they have no story to tell. Everything else is a nice-to-have
   * gap or a requirement nobody will ask about.
   */
  critical_requirement_ids: string[];
  /** Stories that back nothing in this kit, so they are not worth rehearsing. */
  unused_story_ids: string[];
  /** Stories carrying an unusual share of the load, and so a single point of failure. */
  overused_story_ids: string[];
}

/**
 * A story is credited to more requirements than this and it is being stretched:
 * one anecdote answering five different must-haves usually means it answers
 * none of them convincingly.
 */
export const OVERUSE_THRESHOLD = 4;

/**
 * The mirror of the kit's own coverage check, pointed at the candidate instead
 * of the question bank. Links are only ever credited to requirements that
 * exist, so a suggested mapping cannot invent evidence, exactly as a generated
 * question cannot invent a requirement.
 */
export function checkEvidence(
  requirements: readonly KitRequirement[],
  questions: readonly KitQuestion[],
  links: readonly EvidenceLink[],
): EvidenceReport {
  const storiesByRequirement = new Map<string, string[]>();
  const questionsByRequirement = new Map<string, string[]>();
  for (const requirement of requirements) {
    storiesByRequirement.set(requirement.id, []);
    questionsByRequirement.set(requirement.id, []);
  }

  for (const question of questions) {
    for (const id of question.requirement_ids) {
      const bucket = questionsByRequirement.get(id);
      if (bucket && !bucket.includes(question.id)) bucket.push(question.id);
    }
  }

  const creditedPerStory = new Map<string, number>();
  for (const link of links) {
    let credited = 0;
    for (const id of link.requirementIds) {
      const bucket = storiesByRequirement.get(id);
      if (!bucket) continue;
      if (!bucket.includes(link.storyId)) bucket.push(link.storyId);
      credited += 1;
    }
    creditedPerStory.set(
      link.storyId,
      (creditedPerStory.get(link.storyId) ?? 0) + credited,
    );
  }

  const byRequirement: RequirementEvidence[] = [];
  const unevidenced: string[] = [];
  const critical: string[] = [];

  for (const requirement of requirements) {
    const storyIds = storiesByRequirement.get(requirement.id) ?? [];
    const questionIds = questionsByRequirement.get(requirement.id) ?? [];

    byRequirement.push({
      requirementId: requirement.id,
      priority: requirement.priority,
      storyIds,
      questionIds,
    });

    if (storyIds.length > 0) continue;

    unevidenced.push(requirement.id);
    if (requirement.priority === "must" && questionIds.length > 0) {
      critical.push(requirement.id);
    }
  }

  const unused: string[] = [];
  const overused: string[] = [];
  for (const [storyId, credited] of creditedPerStory) {
    if (credited === 0) unused.push(storyId);
    else if (credited >= OVERUSE_THRESHOLD) overused.push(storyId);
  }

  // A story that claimed nothing at all never reached creditedPerStory.
  for (const link of links) {
    if (!creditedPerStory.has(link.storyId)) unused.push(link.storyId);
  }

  return {
    byRequirement,
    unevidenced_requirement_ids: unevidenced,
    critical_requirement_ids: critical,
    unused_story_ids: [...new Set(unused)],
    overused_story_ids: overused,
  };
}
