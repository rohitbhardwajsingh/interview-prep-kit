import { z } from "zod";
import {
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  QUESTION_CATEGORIES,
  REQUIREMENT_KINDS,
  REQUIREMENT_PRIORITIES,
} from "../kit/constants";

/**
 * Spellings a model reaches for often enough that rejecting them would spend a
 * repair call on a synonym. Keys are stripped to letters before lookup.
 */
const ALIASES: Readonly<Record<string, string>> = {
  behavioral: "behavioural",
  behavior: "behavioural",
  soft: "behavioural",
  systemsdesign: "system-design",
  architecture: "system-design",
  design: "system-design",
  culture: "company-fit",
  culturefit: "company-fit",
  company: "company-fit",
  values: "company-fit",
  coding: "technical",
  required: "must",
  musthave: "must",
  essential: "must",
  preferred: "nice",
  nicetohave: "nice",
  optional: "nice",
  bonus: "nice",
};

function letters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * An enum that forgives casing, spacing and common synonyms, so only a
 * genuinely wrong answer costs a repair call.
 */
function looseEnum<const T extends readonly [string, ...string[]]>(values: T) {
  const canonical = new Map<string, T[number]>(
    values.map((value) => [letters(value), value]),
  );

  return z.string().transform((raw, ctx) => {
    const key = letters(raw);
    const match =
      canonical.get(key) ?? canonical.get(letters(ALIASES[key] ?? ""));
    if (match !== undefined) return match;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Expected one of ${values.join(", ")}, received "${raw}"`,
    });
    return z.NEVER;
  });
}

/** Clamped rather than rejected: an out-of-range 4 is a scale slip, not a fault. */
const difficulty = z
  .union([z.number(), z.string()])
  .transform((raw, ctx) => {
    const value = typeof raw === "string" ? Number.parseFloat(raw) : raw;
    if (!Number.isFinite(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Expected a number from ${MIN_DIFFICULTY} to ${MAX_DIFFICULTY}`,
      });
      return z.NEVER;
    }
    return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, Math.round(value)));
  });

const nonEmpty = z.string().trim().min(1);

/** Tolerates a bare string where a list of one was meant. */
function listOf<T extends z.ZodTypeAny>(item: T, max: number) {
  return z.union([
    z.array(item).max(max),
    item.transform((only: z.output<T>) => [only]),
  ]);
}

/**
 * Requirements arrive without ids. The model is never asked to invent one,
 * because ids are the kit's referential backbone and must be ours.
 */
export const draftRequirementSchema = z.object({
  text: nonEmpty.max(400),
  kind: looseEnum(REQUIREMENT_KINDS),
  priority: looseEnum(REQUIREMENT_PRIORITIES),
});

export const roleExtractionSchema = z.object({
  title: z.string().trim().default(""),
  seniority: z.string().trim().default(""),
  location: z.string().trim().default(""),
  responsibilities: listOf(nonEmpty.max(400), 25).default([]),
  requirements: z.array(draftRequirementSchema).max(40).default([]),
});

/**
 * The company brief carries no `sources`. Citations are the crawled URLs we
 * actually read, filled in by code, so a model cannot invent a reference.
 */
export const companyBriefDraftSchema = z.object({
  company: z.string().trim().default(""),
  summary: z.string().trim().default(""),
  what_they_do: z.string().trim().default(""),
  hiring_process: z.string().trim().nullable().default(null),
});

/**
 * Questions must cite requirements, so this is the one place the model handles
 * ids. Every one is checked against the real set before it reaches a kit.
 */
export const draftQuestionSchema = z.object({
  requirement_ids: listOf(nonEmpty, 10).default([]),
  category: looseEnum(QUESTION_CATEGORIES),
  prompt: nonEmpty.max(1_000),
  answer_outline: z.string().trim().default(""),
  difficulty,
});

export const questionBatchSchema = z.object({
  questions: z.array(draftQuestionSchema).max(60).default([]),
});

export const draftFlashcardSchema = z.object({
  requirement_ids: listOf(nonEmpty, 10).default([]),
  front: nonEmpty.max(500),
  back: z.string().trim().default(""),
});

export const flashcardBatchSchema = z.object({
  flashcards: z.array(draftFlashcardSchema).max(60).default([]),
});

export type DraftRequirement = z.infer<typeof draftRequirementSchema>;
export type RoleExtractionDraft = z.infer<typeof roleExtractionSchema>;
export type CompanyBriefDraft = z.infer<typeof companyBriefDraftSchema>;
export type DraftQuestion = z.infer<typeof draftQuestionSchema>;
export type DraftFlashcard = z.infer<typeof draftFlashcardSchema>;
