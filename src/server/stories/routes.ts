import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireUser } from "../auth/guard";
import type { Store } from "../db";
import { notFound, route } from "../http/errors";
import { param } from "../http/params";
import { storySchema, toPublicStory, type StoryRecord } from "./types";

export function storyRoutes(store: Store): Router {
  const router = Router();

  // Applied to the router, so every story endpoint is private by construction.
  router.use(requireUser);

  router.get(
    "/",
    route(async (request, response) => {
      const stories = await store.stories
        .find({ userId: request.userId })
        .sort({ createdAt: -1 })
        .toArray();

      response.json({ stories: stories.map(toPublicStory) });
    }),
  );

  router.post(
    "/",
    route(async (request, response) => {
      const input = storySchema.parse(request.body);
      const at = new Date();

      const record: StoryRecord = {
        _id: randomUUID(),
        userId: request.userId,
        ...input,
        createdAt: at,
        updatedAt: at,
      };
      await store.stories.insertOne(record);

      response.status(201).json({ story: toPublicStory(record) });
    }),
  );

  router.put(
    "/:storyId",
    route(async (request, response) => {
      const input = storySchema.parse(request.body);

      // Scoped by userId as well as id, so guessing an id reaches nothing.
      const updated = await store.stories.findOneAndUpdate(
        { _id: param(request, "storyId"), userId: request.userId },
        { $set: { ...input, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
      if (!updated) throw notFound("No such story");

      response.json({ story: toPublicStory(updated) });
    }),
  );

  router.delete(
    "/:storyId",
    route(async (request, response) => {
      const result = await store.stories.deleteOne({
        _id: param(request, "storyId"),
        userId: request.userId,
      });
      if (result.deletedCount === 0) throw notFound("No such story");

      response.status(204).end();
    }),
  );

  return router;
}
