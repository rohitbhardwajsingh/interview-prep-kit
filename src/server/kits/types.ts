import { z } from "zod";
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
  /** Null until the first generation finishes. */
  kit: TrackedKit | null;
  error: { code: string; message: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createKitSchema = z.object({
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
    .max(365, "A year is the most this plans for"),
});

export type CreateKitInput = z.infer<typeof createKitSchema>;

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
