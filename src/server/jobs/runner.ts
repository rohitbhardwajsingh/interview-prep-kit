import { randomUUID } from "node:crypto";
import { trackKit } from "../../core/kit/tracked";
import { toPipelineError } from "../../core/pipeline/errors";
import type { KitPipelinePorts } from "../../core/pipeline/ports";
import { runKit } from "../../core/pipeline/run-kit";
import { RunTrace, type TraceEntry } from "../../core/pipeline/trace";
import type { Store } from "../db";
import { conflict, notFound } from "../http/errors";
import { JOB_STALE_AFTER_MS, type JobRecord } from "./types";

export interface StartGenerationInput {
  userId: string;
  kitId: string;
}

export interface JobRunnerOptions {
  store: Store;
  ports: KitPipelinePorts;
  /** Ceiling for one generation, matching the batch command's per-case budget. */
  timeoutMs?: number;
  now?: () => Date;
}

export const DEFAULT_GENERATION_TIMEOUT_MS = 170_000;

export interface JobRunner {
  startKitGeneration(input: StartGenerationInput): Promise<JobRecord>;
  /** Resolves once no generation is in flight. Used by tests. */
  drain(): Promise<void>;
}

export function createJobRunner(options: JobRunnerOptions): JobRunner {
  const { store, ports } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());
  const inFlight = new Set<Promise<void>>();

  /**
   * Claims the kit for one generation, atomically. The filter is the whole
   * duplicate-trigger guard: a second request arriving while the first is
   * running matches nothing and is refused, because Mongo applies the
   * condition and the write as one operation. A kit whose worker died is
   * reclaimable once its heartbeat goes quiet.
   */
  async function claim(input: StartGenerationInput): Promise<void> {
    const at = now();
    const staleBefore = new Date(at.getTime() - JOB_STALE_AFTER_MS);

    const claimed = await store.kits.findOneAndUpdate(
      {
        _id: input.kitId,
        userId: input.userId,
        $or: [
          { status: { $ne: "generating" } },
          { updatedAt: { $lt: staleBefore } },
        ],
      },
      { $set: { status: "generating", error: null, updatedAt: at } },
    );

    if (claimed) return;

    // Nothing matched, so either it is not this user's kit or a generation is
    // genuinely in flight. One extra read tells the client which.
    const existing = await store.kits.findOne({
      _id: input.kitId,
      userId: input.userId,
    });
    if (!existing) throw notFound("No such kit");

    throw conflict("This kit is already being generated", {
      startedAt: existing.updatedAt,
    });
  }

  async function startKitGeneration(
    input: StartGenerationInput,
  ): Promise<JobRecord> {
    await claim(input);

    const kit = await store.kits.findOne({
      _id: input.kitId,
      userId: input.userId,
    });
    if (!kit) throw notFound("No such kit");

    const at = now();
    const job: JobRecord = {
      _id: randomUUID(),
      userId: input.userId,
      kitId: input.kitId,
      kind: "generate-kit",
      scope: null,
      status: "running",
      steps: [],
      error: null,
      createdAt: at,
      updatedAt: at,
      finishedAt: null,
    };
    await store.jobs.insertOne(job);

    const task = execute(job, kit.request).finally(() => {
      inFlight.delete(task);
    });
    inFlight.add(task);

    return job;
  }

  /**
   * Runs after the response has already gone out, so a ninety-second
   * generation never holds a request open. Progress is written as it happens
   * and read back by polling, and every failure path leaves a terminal state:
   * a kit is never left claimed by a run that is no longer happening.
   */
  async function execute(
    job: JobRecord,
    request: { jd: string; companyUrl: string; days: number },
  ): Promise<void> {
    const pending: TraceEntry[] = [];
    let flushing: Promise<void> = Promise.resolve();

    const persist = (entry: TraceEntry): void => {
      pending.push(entry);
      // Serialised, so steps cannot be written out of order.
      flushing = flushing.then(async () => {
        const batch = pending.splice(0);
        if (batch.length === 0) return;
        const at = now();
        await store.jobs.updateOne(
          { _id: job._id },
          { $push: { steps: { $each: batch } }, $set: { updatedAt: at } },
        );
        // Doubles as the heartbeat that keeps the claim from going stale.
        await store.kits.updateOne(
          { _id: job.kitId },
          { $set: { updatedAt: at } },
        );
      });
    };

    try {
      const result = await runKit(
        {
          jd: request.jd,
          companyUrl: request.companyUrl,
          days: request.days,
        },
        ports,
        {
          trace: new RunTrace(persist),
          deadlineAt: Date.now() + timeoutMs,
        },
      );

      await flushing;
      const at = now();

      await store.kits.updateOne(
        { _id: job.kitId },
        {
          $set: {
            status: "ready",
            title: `${result.kit.role.title} — ${result.kit.source.company}`,
            kit: trackKit(result.kit),
            error: null,
            updatedAt: at,
          },
        },
      );
      await store.jobs.updateOne(
        { _id: job._id },
        {
          $set: {
            status: "succeeded",
            steps: result.trace,
            updatedAt: at,
            finishedAt: at,
          },
        },
      );
    } catch (cause) {
      const error = toPipelineError(cause);
      await flushing.catch(() => {});
      const at = now();

      // The kit keeps whatever it had before, so a failure halfway through a
      // regeneration does not destroy a kit the user was already using.
      await store.kits.updateOne(
        { _id: job.kitId },
        {
          $set: {
            status: "failed",
            error: { code: error.code, message: error.message },
            updatedAt: at,
          },
        },
      );
      await store.jobs.updateOne(
        { _id: job._id },
        {
          $set: {
            status: "failed",
            error: { code: error.code, message: error.message },
            updatedAt: at,
            finishedAt: at,
          },
        },
      );
    }
  }

  return {
    startKitGeneration,
    async drain() {
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
      }
    },
  };
}
