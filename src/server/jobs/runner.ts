import { randomUUID } from "node:crypto";
import { trackKit } from "../../core/kit/tracked";
import { toPipelineError } from "../../core/pipeline/errors";
import type { KitPipelinePorts } from "../../core/pipeline/ports";
import {
  regenerateSection,
  type RegenerableSection,
} from "../../core/pipeline/regenerate-section";
import { runKit } from "../../core/pipeline/run-kit";
import { RunTrace, type TraceEntry } from "../../core/pipeline/trace";
import type { Store } from "../db";
import { conflict, notFound } from "../http/errors";
import type { KitRecord } from "../kits/types";
import { JOB_STALE_AFTER_MS, type JobRecord } from "./types";

export interface StartGenerationInput {
  userId: string;
  kitId: string;
}

export interface StartRegenerationInput extends StartGenerationInput {
  section: RegenerableSection;
  /** The version the user was looking at when they asked. */
  version: number;
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
  startSectionRegeneration(input: StartRegenerationInput): Promise<JobRecord>;
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
   * Streams the pipeline's steps into the job as they happen, which is what
   * the client polls. Writes are serialised so steps cannot land out of order,
   * and each one doubles as the heartbeat that keeps the claim from going
   * stale while a slow run is still genuinely working.
   */
  function progressWriter(job: JobRecord) {
    const pending: TraceEntry[] = [];
    let flushing: Promise<void> = Promise.resolve();

    return {
      persist(entry: TraceEntry): void {
        pending.push(entry);
        flushing = flushing.then(async () => {
          const batch = pending.splice(0);
          if (batch.length === 0) return;
          const at = now();
          await store.jobs.updateOne(
            { _id: job._id },
            { $push: { steps: { $each: batch } }, $set: { updatedAt: at } },
          );
          await store.kits.updateOne(
            { _id: job.kitId },
            { $set: { updatedAt: at } },
          );
        });
      },
      settled: () => flushing,
    };
  }

  async function finishJob(
    job: JobRecord,
    update: Partial<Pick<JobRecord, "status" | "steps" | "error">>,
  ): Promise<void> {
    const at = now();
    await store.jobs.updateOne(
      { _id: job._id },
      { $set: { ...update, updatedAt: at, finishedAt: at } },
    );
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
    const writer = progressWriter(job);

    try {
      const result = await runKit(
        {
          jd: request.jd,
          companyUrl: request.companyUrl,
          days: request.days,
        },
        ports,
        {
          trace: new RunTrace(writer.persist),
          deadlineAt: Date.now() + timeoutMs,
        },
      );

      await writer.settled();
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
      await finishJob(job, { status: "succeeded", steps: result.trace });
    } catch (cause) {
      const error = toPipelineError(cause);
      await writer.settled().catch(() => {});
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
      await finishJob(job, {
        status: "failed",
        error: { code: error.code, message: error.message },
      });
    }
  }

  /**
   * Rebuilds one section of a kit that already exists.
   *
   * Unlike a first generation there is something to lose here, so the write is
   * guarded on the version the user was looking at when they asked. If they
   * edited the kit while the model was working, that filter matches nothing
   * and the regenerated result is dropped: their words are worth more than the
   * model's, and silently overwriting them is the one outcome this whole
   * provenance model exists to prevent.
   */
  async function startSectionRegeneration(
    input: StartRegenerationInput,
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
      kind: "regenerate-section",
      scope: input.section,
      status: "running",
      steps: [],
      error: null,
      createdAt: at,
      updatedAt: at,
      finishedAt: null,
    };
    await store.jobs.insertOne(job);

    const task = executeRegeneration(job, input, kit).finally(() => {
      inFlight.delete(task);
    });
    inFlight.add(task);

    return job;
  }

  async function executeRegeneration(
    job: JobRecord,
    input: StartRegenerationInput,
    kit: KitRecord,
  ): Promise<void> {
    const writer = progressWriter(job);

    // Restores the kit to usable after any outcome. It still holds everything
    // it held before, so leaving it "generating" or marking it "failed" would
    // both misdescribe a kit the user can still study from.
    const release = async (error: JobRecord["error"]) => {
      await store.kits.updateOne(
        { _id: job.kitId },
        { $set: { status: "ready", error, updatedAt: now() } },
      );
    };

    try {
      const stored = kit.kit;
      if (!stored) throw new Error("Kit has no content to regenerate");

      const result = await regenerateSection(
        { kit: stored, request: kit.request, section: input.section },
        ports,
        {
          trace: new RunTrace(writer.persist),
          deadlineAt: Date.now() + timeoutMs,
        },
      );

      await writer.settled();

      const saved = await store.kits.findOneAndUpdate(
        { _id: job.kitId, userId: input.userId, version: input.version },
        {
          $set: {
            status: "ready",
            kit: result.kit,
            error: null,
            updatedAt: now(),
          },
          $inc: { version: 1 },
        },
      );

      if (!saved) {
        await release(null);
        await finishJob(job, {
          status: "failed",
          steps: result.trace,
          error: {
            code: "SUPERSEDED",
            message:
              "You changed this kit while it was regenerating, so your version was kept and the new one discarded",
          },
        });
        return;
      }

      await finishJob(job, { status: "succeeded", steps: result.trace });
    } catch (cause) {
      const error = toPipelineError(cause);
      await writer.settled().catch(() => {});
      await release({ code: error.code, message: error.message });
      await finishJob(job, {
        status: "failed",
        error: { code: error.code, message: error.message },
      });
    }
  }

  return {
    startKitGeneration,
    startSectionRegeneration,
    async drain() {
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
      }
    },
  };
}
