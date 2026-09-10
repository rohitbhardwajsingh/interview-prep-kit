import { Router } from "express";
import { TARGET_SECONDS } from "../../core/answer/analyse";
import {
  buildQueue,
  initialState,
  review,
  summarise,
  type ReviewState,
} from "../../core/practice/leitner";
import { requireUser } from "../auth/guard";
import type { Store } from "../db";
import { conflict, notFound, route } from "../http/errors";
import { param } from "../http/params";
import type { KitRecord } from "../kits/types";
import { reviewId, reviewSchema, type ReviewRecord } from "./types";

function toState(record: ReviewRecord): ReviewState {
  return {
    questionId: record.questionId,
    box: record.box,
    dueOnDay: record.dueOnDay,
    lastConfidence: record.lastConfidence,
    timesSeen: record.timesSeen,
  };
}

export function practiceRoutes(store: Store): Router {
  const router = Router();

  router.use(requireUser);

  async function loadReady(userId: string, kitId: string): Promise<KitRecord> {
    const record = await store.kits.findOne({ _id: kitId, userId });
    if (!record) throw notFound("No such kit");
    if (!record.kit) throw conflict("Generate this kit before practising");
    return record;
  }

  /**
   * The queue for a given day. States are held per question and merged with
   * the kit's current questions on read, so a question added or removed by a
   * regeneration does not leave a stale or orphaned review behind.
   */
  router.get(
    "/:kitId/practice",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      const record = await loadReady(request.userId, kitId);
      const day = Number(request.query["day"] ?? 1);
      const today = Number.isInteger(day) && day > 0 ? day : 1;

      const stored = await store.reviews
        .find({ userId: request.userId, kitId })
        .toArray();
      const byQuestion = new Map(
        stored.map((item) => [item.questionId, toState(item)]),
      );

      const states = (record.kit?.questions ?? []).map(
        (question) => byQuestion.get(question.id) ?? initialState(question.id),
      );

      const categories = new Map(
        (record.kit?.questions ?? []).map((question) => [
          question.id,
          question.category,
        ]),
      );

      response.json({
        day: today,
        daysAvailable: record.request.days,
        // The target window travels with the queue so the recorder can show
        // a live clock against it. Duplicating the table in the browser
        // would leave two versions of the same judgement to drift apart.
        queue: buildQueue(states, today).map((item) => ({
          ...item.state,
          targetSeconds:
            TARGET_SECONDS[categories.get(item.questionId) ?? ""] ??
            TARGET_SECONDS["technical"],
        })),
        progress: summarise(states, today),
      });
    }),
  );

  router.post(
    "/:kitId/practice/:questionId",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      const questionId = param(request, "questionId");
      const { confidence, day } = reviewSchema.parse(request.body);

      const record = await loadReady(request.userId, kitId);
      const exists = record.kit?.questions.some((q) => q.id === questionId);
      if (!exists) throw notFound("This kit has no such question");

      const id = reviewId(kitId, questionId);
      const stored = await store.reviews.findOne({
        _id: id,
        userId: request.userId,
      });

      const next = review(
        stored ? toState(stored) : initialState(questionId),
        confidence,
        { today: day, daysAvailable: record.request.days },
      );

      // Upserted, so a first answer and a repeat answer take the same path.
      await store.reviews.updateOne(
        { _id: id },
        {
          $set: {
            ...next,
            userId: request.userId,
            kitId,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );

      response.json({ state: next });
    }),
  );

  router.delete(
    "/:kitId/practice",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      await loadReady(request.userId, kitId);

      await store.reviews.deleteMany({ userId: request.userId, kitId });
      response.status(204).end();
    }),
  );

  return router;
}
