import { z } from "zod";
import type { EvidenceLink } from "../../core/evidence/check";
import {
  addDays,
  civilDateOf,
  studyDaysUntil,
  type CivilDate,
} from "../../core/schedule/calendar";
import type { TrackedKit } from "../../core/kit/tracked";

/**
 * pending is a kit that exists but has never been generated. It is distinct
 * from generating because the claim that starts a run refuses to start a
 * second one, so a kit cannot be born already claimed.
 */
export const KIT_STATUSES = [
  "pending",
  "generating",
  "ready",
  "failed",
] as const;
export type KitStatus = (typeof KIT_STATUSES)[number];

export interface KitRecord {
  _id: string;
  userId: string;
  status: KitStatus;
  /**
   * Bumped on every write. An edit carries the version it was made against,
   * so an edit built on a view the user can no longer see is refused rather
   * than silently overwriting whatever replaced it.
   */
  version: number;
  title: string;
  request: { jd: string; companyUrl: string; days: number };
  /**
   * The day the interview happens and the day planning started, as civil
   * dates in the user's own timezone. Null on kits made before dates were
   * asked for, which fall back to counting from creation.
   */
  interviewDate: CivilDate | null;
  startDate: CivilDate | null;
  timeZone: string | null;
  /** Null until the first generation finishes. */
  kit: TrackedKit | null;
  /**
   * Which stories evidence which requirements. Held on the kit rather than in
   * the browser so the audit survives a new machine and the readiness score
   * can see it.
   */
  evidenceLinks: EvidenceLink[];
  error: { code: string; message: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date as YYYY-MM-DD");

/**
 * Either a date or a count, never both.
 *
 * "Seven days" is the question a scheduler wants to ask and the worst one to
 * ask a person: seven days from when, and does that include the morning of?
 * A date removes the arithmetic and makes the whole plan addressable — days
 * become Tuesday and Wednesday, and a countdown becomes possible. The count
 * stays supported because the batch command has no user to ask.
 */
export const createKitSchema = z
  .object({
    jd: z
      .string()
      .trim()
      .min(1, "Paste the job description")
      .max(60_000, "That is longer than any real job description"),
    companyUrl: z
      .string()
      .trim()
      .url("Give the company's website address, including https://")
      .max(2_048),
    days: z
      .number({ invalid_type_error: "Days must be a number" })
      .int("Days must be a whole number")
      .min(1, "You need at least one day")
      .max(365, "A year is the most this plans for")
      .optional(),
    interviewDate: civilDateSchema.optional(),
    /** Needed to know when the user's own day rolls over. */
    timeZone: z.string().trim().min(1).max(64).optional(),
  })
  .refine((input) => input.days !== undefined || input.interviewDate !== undefined, {
    message: "Give either an interview date or a number of days",
    path: ["interviewDate"],
  });

export type CreateKitInput = z.infer<typeof createKitSchema>;

export interface PlanDates {
  days: number;
  startDate: CivilDate;
  interviewDate: CivilDate;
  timeZone: string;
}

/**
 * Reconciles the two ways a plan can be bounded into the one the allocator
 * needs. A date is authoritative when given; a count is turned into a date so
 * every kit is addressable the same way afterwards.
 *
 * The allocator needs at least one day, so an interview today still produces
 * a single-day plan. It is the calendar, not the schedule, that says the time
 * has gone — the plan itself stays well-formed.
 */
export function resolvePlanDates(
  input: CreateKitInput,
  now: Date,
  fallbackTimeZone = "UTC",
): PlanDates {
  const timeZone = input.timeZone ?? fallbackTimeZone;
  const startDate = civilDateOf(now, timeZone);

  if (input.interviewDate) {
    return {
      days: Math.max(1, studyDaysUntil(startDate, input.interviewDate)),
      startDate,
      interviewDate: input.interviewDate,
      timeZone,
    };
  }

  const days = input.days ?? 1;
  return {
    days,
    startDate,
    // The interview is the morning after the last study day.
    interviewDate: addDays(startDate, days),
    timeZone,
  };
}

/**
 * A short label for the list view. The role title is only known after
 * extraction, so until then the kit is named after the company it is about.
 */
export function provisionalTitle(companyUrl: string): string {
  try {
    const host = new URL(companyUrl).hostname.replace(/^www\./, "");
    return `New kit — ${host}`;
  } catch {
    return "New kit";
  }
}
