import { z } from "zod";
import {
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  QUESTION_CATEGORIES,
  REQUIREMENT_KINDS,
  REQUIREMENT_PRIORITIES,
} from "./constants";

const identifier = z.string().min(1);

export const kitSourceSchema = z
  .object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().min(0),
    researched_at: z.string().min(1),
    pages_used: z.array(z.string()),
  })
  .passthrough();

export const kitCompanyBriefSchema = z
  .object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  })
  .passthrough();

export const kitRequirementSchema = z
  .object({
    id: identifier,
    text: z.string().min(1),
    kind: z.enum(REQUIREMENT_KINDS),
    priority: z.enum(REQUIREMENT_PRIORITIES),
  })
  .passthrough();

export const kitRoleSchema = z
  .object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(kitRequirementSchema),
  })
  .passthrough();

export const kitQuestionSchema = z
  .object({
    id: identifier,
    requirement_ids: z.array(identifier),
    category: z.enum(QUESTION_CATEGORIES),
    prompt: z.string().min(1),
    answer_outline: z.string(),
    difficulty: z.number().int().min(MIN_DIFFICULTY).max(MAX_DIFFICULTY),
  })
  .passthrough();

export const kitFlashcardSchema = z
  .object({
    id: identifier,
    front: z.string().min(1),
    back: z.string(),
    requirement_ids: z.array(identifier),
  })
  .passthrough();

export const kitScheduleDaySchema = z
  .object({
    day: z.number().int().min(1),
    focus: z.string().min(1),
    question_ids: z.array(identifier),
    minutes: z.number().int().min(1),
  })
  .passthrough();

export const kitScheduleSchema = z
  .object({
    days_available: z.number().int().min(1),
    days: z.array(kitScheduleDaySchema),
  })
  .passthrough();

export const kitCoverageSchema = z
  .object({
    uncovered_requirement_ids: z.array(identifier),
    passes: z.number().int().min(0),
  })
  .passthrough();

export const kitSchema = z
  .object({
    source: kitSourceSchema,
    company_brief: kitCompanyBriefSchema,
    role: kitRoleSchema,
    questions: z.array(kitQuestionSchema),
    flashcards: z.array(kitFlashcardSchema),
    schedule: kitScheduleSchema,
    coverage: kitCoverageSchema,
  })
  .passthrough();

export type KitSource = z.infer<typeof kitSourceSchema>;
export type KitCompanyBrief = z.infer<typeof kitCompanyBriefSchema>;
export type KitRequirement = z.infer<typeof kitRequirementSchema>;
export type KitRole = z.infer<typeof kitRoleSchema>;
export type KitQuestion = z.infer<typeof kitQuestionSchema>;
export type KitFlashcard = z.infer<typeof kitFlashcardSchema>;
export type KitScheduleDay = z.infer<typeof kitScheduleDaySchema>;
export type KitSchedule = z.infer<typeof kitScheduleSchema>;
export type KitCoverage = z.infer<typeof kitCoverageSchema>;
export type Kit = z.infer<typeof kitSchema>;
