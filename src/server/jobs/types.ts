import type { TraceEntry } from "../../core/pipeline/trace";

export const JOB_STATUSES = ["running", "succeeded", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_KINDS = ["generate-kit", "regenerate-section"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export interface JobRecord {
  _id: string;
  userId: string;
  kitId: string;
  kind: JobKind;
  /** Distinguishes concurrent section regenerations from each other. */
  scope: string | null;
  status: JobStatus;
  /** The pipeline trace so far: this is the progress feed. */
  steps: TraceEntry[];
  error: { code: string; message: string } | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

/**
 * How long a job may go without an update before a reader may assume the
 * process running it died. Generation is slow, so this is generous; without it
 * a crashed worker would leave a kit permanently "generating".
 */
export const JOB_STALE_AFTER_MS = 5 * 60_000;

export function isStale(job: JobRecord, now: Date): boolean {
  if (job.status !== "running") return false;
  return now.getTime() - job.updatedAt.getTime() > JOB_STALE_AFTER_MS;
}
