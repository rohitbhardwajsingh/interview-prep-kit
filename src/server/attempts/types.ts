import { z } from "zod";
import type { AnswerAnalysis } from "../../core/answer/analyse";
import type { AnswerJudgement } from "../../core/answer/judge";
import { CONFIDENCE_LEVELS } from "../../core/practice/leitner";

export const ANSWER_SOURCES = ["voice", "typed"] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

/**
 * One answer, as given. Kept rather than reduced to a score, because the
 * transcript is the only thing that lets a candidate see what they actually
 * said rather than what they remember saying — and because the second
 * attempt at a question is only meaningful next to the first.
 */
export interface AttemptRecord {
  _id: string;
  userId: string;
  kitId: string;
  questionId: string;
  /** Denormalised so calibration can name a question after a regeneration. */
  prompt: string;
  category: string;
  transcript: string;
  source: AnswerSource;
  spokenSeconds: number | null;
  /** What the candidate thought, recorded before any score was shown. */
  selfRating: number;
  analysis: AnswerAnalysis;
  /** Null when the model was not asked, or could not be reached. */
  judgement: AnswerJudgement | null;
  createdAt: Date;
}

const confidence = z
  .number()
  .int()
  .refine(
    (value): value is (typeof CONFIDENCE_LEVELS)[number] =>
      (CONFIDENCE_LEVELS as readonly number[]).includes(value),
    { message: "Confidence must be 1 to 5" },
  );

/**
 * `selfRating` is required, and that is the point of the whole feature.
 *
 * It has to be captured before the score is computed, or it stops being a
 * prediction and becomes a reaction — and calibration built on a reaction
 * measures nothing at all. The client asks for it while the answer is still
 * unscored, and the server never returns a score without having been given
 * one first.
 */
export const attemptSchema = z.object({
  transcript: z
    .string()
    .trim()
    .min(1, "There is no answer here to look at")
    .max(20_000, "That is longer than any spoken answer"),
  source: z.enum(ANSWER_SOURCES).default("typed"),
  /** Absent for a typed answer, which has no clock. */
  spokenSeconds: z.number().min(0).max(3_600).optional(),
  selfRating: confidence,
  /** Which day of the plan, so an attempt can also advance the review queue. */
  day: z.number().int().min(1).max(365).optional(),
  /** Lets a caller skip the model call, for a fast retry or when offline. */
  judge: z.boolean().default(true),
});

export type AttemptInput = z.infer<typeof attemptSchema>;
