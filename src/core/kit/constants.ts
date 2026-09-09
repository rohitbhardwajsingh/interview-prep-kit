export const REQUIREMENT_KINDS = ["technical", "behavioural", "domain"] as const;

export const REQUIREMENT_PRIORITIES = ["must", "nice"] as const;

export const QUESTION_CATEGORIES = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
] as const;

export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 3;
