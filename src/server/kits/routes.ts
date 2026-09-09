import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Router } from "express";
import { checkEvidence, type EvidenceLink } from "../../core/evidence/check";
import { requireUser } from "../auth/guard";
import type { Store } from "../db";
import { badRequest, conflict, notFound, route } from "../http/errors";
import { param } from "../http/params";
import type { JobRunner } from "../jobs/runner";
import {
  EDITABLE_SECTIONS,
  applyItemEdit,
  editItemSchemaFor,
  isEmptyPatch,
  pinItemSchema,
  setPinned,
} from "./edit";
import { createKitSchema, provisionalTitle, type KitRecord } from "./types";

const sectionSchema = z.enum(EDITABLE_SECTIONS);

const evidenceSchema = z.object({
  links: z
    .array(
      z.object({
        storyId: z.string().trim().min(1),
        requirementIds: z.array(z.string().trim().min(1)).max(50),
      }),
    )
    .max(200),
});

function summarise(record: KitRecord) {
  return {
    id: record._id,
    status: record.status,
    version: record.version,
    title: record.title,
    request: record.request,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function kitRoutes(store: Store, runner: JobRunner): Router {
  const router = Router();

  router.use(requireUser);

  async function load(userId: string, kitId: string): Promise<KitRecord> {
    const record = await store.kits.findOne({ _id: kitId, userId });
    if (!record) throw notFound("No such kit");
    return record;
  }

  router.get(
    "/",
    route(async (request, response) => {
      const kits = await store.kits
        .find({ userId: request.userId })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

      response.json({ kits: kits.map(summarise) });
    }),
  );

  router.post(
    "/",
    route(async (request, response) => {
      const input = createKitSchema.parse(request.body);
      const at = new Date();

      const record: KitRecord = {
        _id: randomUUID(),
        userId: request.userId,
        status: "pending",
        version: 0,
        title: provisionalTitle(input.companyUrl),
        request: input,
        kit: null,
        error: null,
        createdAt: at,
        updatedAt: at,
      };
      await store.kits.insertOne(record);

      // Returns as soon as the work is claimed rather than when it finishes,
      // so a ninety-second generation is a resource the client can watch
      // instead of a request that hangs and eventually times out.
      const job = await runner.startKitGeneration({
        userId: request.userId,
        kitId: record._id,
      });

      // The claim succeeded, so the kit is generating by the time this
      // returns, and reporting the inserted "pending" would be a lie the
      // client would briefly render.
      response.status(202).json({
        kit: { ...summarise(record), status: "generating" as const },
        jobId: job._id,
      });
    }),
  );

  router.get(
    "/:kitId",
    route(async (request, response) => {
      const record = await load(request.userId, param(request, "kitId"));
      response.json({ kit: { ...summarise(record), kit: record.kit } });
    }),
  );

  router.post(
    "/:kitId/generate",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      const job = await runner.startKitGeneration({
        userId: request.userId,
        kitId,
      });
      response.status(202).json({ jobId: job._id });
    }),
  );

  /**
   * The progress feed. Polled rather than streamed: the run is a handful of
   * coarse steps over ninety seconds, so a poll costs one small read and
   * survives a refresh, a second tab, and a dropped connection, none of which
   * an in-memory stream would.
   */
  router.get(
    "/:kitId/job",
    route(async (request, response) => {
      await load(request.userId, param(request, "kitId"));

      const job = await store.jobs
        .find({ kitId: param(request, "kitId"), userId: request.userId })
        .sort({ createdAt: -1 })
        .limit(1)
        .next();

      if (!job) {
        response.json({ job: null });
        return;
      }

      response.json({
        job: {
          id: job._id,
          kind: job.kind,
          scope: job.scope,
          status: job.status,
          steps: job.steps,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          finishedAt: job.finishedAt,
        },
      });
    }),
  );

  router.patch(
    "/:kitId/:section/:itemId",
    route(async (request, response) => {
      const section = sectionSchema.parse(param(request, "section"));
      const { version, patch } = editItemSchemaFor(section).parse(request.body);
      const kitId = param(request, "kitId");

      if (isEmptyPatch(patch)) throw badRequest("That edit changes nothing");

      const record = await load(request.userId, kitId);
      if (!record.kit) throw conflict("This kit has nothing to edit yet");

      const { kit, report } = applyItemEdit(
        record.kit,
        section,
        param(request, "itemId"),
        patch,
      );

      // Guarded on the version the edit was made against, so an edit racing a
      // regeneration loses rather than overwriting its result.
      const saved = await store.kits.findOneAndUpdate(
        { _id: kitId, userId: request.userId, version },
        {
          $set: { kit, updatedAt: new Date() },
          $inc: { version: 1 },
        },
        { returnDocument: "after" },
      );

      if (!saved) {
        throw conflict(
          "This kit changed while you were editing; reload to see the current version",
          { yourVersion: version, currentVersion: record.version },
        );
      }

      response.json({
        kit: { ...summarise(saved), kit: saved.kit },
        reconciled: report,
      });
    }),
  );

  router.put(
    "/:kitId/:section/:itemId/pin",
    route(async (request, response) => {
      const section = sectionSchema.parse(param(request, "section"));
      const { version, pinned } = pinItemSchema.parse(request.body);
      const kitId = param(request, "kitId");

      const record = await load(request.userId, kitId);
      if (!record.kit) throw conflict("This kit has nothing to pin yet");

      const kit = setPinned(
        record.kit,
        section,
        param(request, "itemId"),
        pinned,
      );

      const saved = await store.kits.findOneAndUpdate(
        { _id: kitId, userId: request.userId, version },
        { $set: { kit, updatedAt: new Date() }, $inc: { version: 1 } },
        { returnDocument: "after" },
      );
      if (!saved) throw conflict("This kit changed; reload and try again");

      response.json({ kit: { ...summarise(saved), kit: saved.kit } });
    }),
  );

  /**
   * The candidate-side coverage check. Recomputed on read from the stored
   * links rather than cached, because it depends on the kit's requirements and
   * questions, both of which change under it.
   */
  router.post(
    "/:kitId/evidence",
    route(async (request, response) => {
      const { links } = evidenceSchema.parse(request.body);
      const record = await load(request.userId, param(request, "kitId"));
      if (!record.kit) throw conflict("Generate this kit before auditing it");

      const stories = await store.stories
        .find({ userId: request.userId })
        .toArray();
      const owned = new Set(stories.map((story) => story._id));

      // A link naming someone else's story, or one since deleted, is dropped.
      const usable: EvidenceLink[] = links.filter((link) =>
        owned.has(link.storyId),
      );

      response.json({
        report: checkEvidence(
          record.kit.role.requirements,
          record.kit.questions,
          usable,
        ),
      });
    }),
  );

  router.delete(
    "/:kitId",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      const result = await store.kits.deleteOne({
        _id: kitId,
        userId: request.userId,
      });
      if (result.deletedCount === 0) throw notFound("No such kit");

      await store.jobs.deleteMany({ kitId, userId: request.userId });
      response.status(204).end();
    }),
  );

  return router;
}
