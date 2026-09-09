import { z } from "zod";
import { CONFIDENCE_LEVELS, type ReviewState } from "../../core/practice/leitner";

export interface ReviewRecord extends ReviewState {
  _id: string;
  userId: string;
  kitId: string;
  updatedAt: Date;
}

export const reviewSchema = z.object({
  confidence: z
    .number()
    .int()
    .refine(
      (value): value is (typeof CONFIDENCE_LEVELS)[number] =>
        (CONFIDENCE_LEVELS as readonly number[]).includes(value),
      { message: "Confidence must be 1 to 5" },
    ),
  /**
   * Which day of the plan the user is on. Sent by the client because the plan
   * is relative to the interview, not to the calendar, and only the user knows
   * where they are in it.
   */
  day: z.number().int().min(1).max(365),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

/** One document per question per kit. */
export function reviewId(kitId: string, questionId: string): string {
  return `${kitId}:${questionId}`;
}
