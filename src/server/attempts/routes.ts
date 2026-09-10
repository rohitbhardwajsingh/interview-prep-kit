import { randomUUID } from "node:crypto";
import { Router } from "express";
import { analyseAnswer } from "../../core/answer/analyse";
import {
  calibrate,
  comparePrediction,
  type ScoredAttempt,
} from "../../core/answer/calibration";
import { judgeAnswer } from "../../core/answer/judge";
import type { LlmClient } from "../../core/llm/types";
import { review, initialState } from "../../core/practice/leitner";
import {
  mockSet,
  triage,
  type QuestionState,
} from "../../core/practice/triage";
import { checkEvidence } from "../../core/evidence/check";
import { requireUser } from "../auth/guard";
import type { Store } from "../db";
import { conflict, notFound, route } from "../http/errors";
import { param } from "../http/params";
import type { KitRecord } from "../kits/types";
import { reviewId } from "../practice/types";
import { attemptSchema, type AttemptRecord } from "./types";

/** Newest first, and few: this is a history panel, not an archive browser. */
const HISTORY_LIMIT = 10;

/** Long enough to be tiring, short enough that people finish it. */
const MOCK_QUESTIONS = 5;

/** What "I have a few minutes" defaults to when nothing else is said. */
const DEFAULT_TRIAGE_MINUTES = 10;

/**
 * What the client is told about an attempt.
 *
 * The transcript comes back because seeing what you actually said is most of
 * the value, and a scorecard without it is a number to argue with.
 */
function present(record: AttemptRecord) {
  return {
    id: record._id,
    questionId: record.questionId,
    transcript: record.transcript,
    source: record.source,
    spokenSeconds: record.spokenSeconds,
    selfRating: record.selfRating,
    analysis: record.analysis,
    judgement: record.judgement,
    // Computed here rather than in the browser, so the score bands and the
    // threshold for "surprising" exist in exactly one place.
    prediction: comparePrediction(record.selfRating, record.analysis.score),
    createdAt: record.createdAt,
  };
}

export interface AttemptRoutesOptions {
  store: Store;
  /**
   * Absent in a deployment with no model configured, in which case answers are
   * still measured and only the judgement is missing. Measurement is the part
   * that must never depend on a network call.
   */
  llm?: LlmClient;
}

export function attemptRoutes({ store, llm }: AttemptRoutesOptions): Router {
  const router = Router();

  router.use(requireUser);

  async function loadReady(userId: string, kitId: string): Promise<KitRecord> {
    const record = await store.kits.findOne({ _id: kitId, userId });
    if (!record) throw notFound("No such kit");
    if (!record.kit) throw conflict("Generate this kit before answering it");
    return record;
  }

  /**
   * Records an answer and scores it.
   *
   * Measurement happens first and always. The model judgement is attempted
   * second and allowed to fail: a candidate who has just spoken for two
   * minutes gets their transcript and their coverage back either way, because
   * losing the answer to a provider outage is the one unacceptable outcome.
   */
  router.post(
    "/:kitId/answers/:questionId",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      const questionId = param(request, "questionId");
      const input = attemptSchema.parse(request.body);

      const record = await loadReady(request.userId, kitId);
      const question = record.kit?.questions.find(
        (candidate) => candidate.id === questionId,
      );
      if (!question) throw notFound("This kit has no such question");

      const analysis = analyseAnswer({
        transcript: input.transcript,
        question,
        ...(input.spokenSeconds === undefined
          ? {}
          : { spokenSeconds: input.spokenSeconds }),
      });

      let judgement = null;
      let judgeError: string | null = null;
      if (input.judge && llm) {
        try {
          judgement = await judgeAnswer(llm, {
            transcript: input.transcript,
            question,
            analysis,
          });
        } catch (cause) {
          // Reported, not thrown: the measurement is still worth returning.
          judgeError =
            cause instanceof Error ? cause.message : "The reviewer was unreachable";
        }
      }

      const attempt: AttemptRecord = {
        _id: randomUUID(),
        userId: request.userId,
        kitId,
        questionId,
        prompt: question.prompt,
        category: question.category,
        transcript: input.transcript,
        source: input.source,
        spokenSeconds: input.spokenSeconds ?? null,
        selfRating: input.selfRating,
        analysis,
        judgement,
        createdAt: new Date(),
      };
      await store.attempts.insertOne(attempt);

      // Answering a question out loud is a stronger review than clicking a
      // number, so it advances the spaced-repetition queue as well. Skipped
      // when the client did not say which day it is on, rather than guessed.
      if (input.day !== undefined) {
        const id = reviewId(kitId, questionId);
        const stored = await store.reviews.findOne({
          _id: id,
          userId: request.userId,
        });

        const next = review(stored ?? initialState(questionId), input.selfRating, {
          today: input.day,
          daysAvailable: record.request.days,
        });

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
      }

      response.status(201).json({ attempt: present(attempt), judgeError });
    }),
  );

  /** Every attempt at one question, so improvement is visible. */
  router.get(
    "/:kitId/answers/:questionId",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      const questionId = param(request, "questionId");
      await loadReady(request.userId, kitId);

      const attempts = await store.attempts
        .find({ userId: request.userId, kitId, questionId })
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT)
        .toArray();

      response.json({ attempts: attempts.map(present) });
    }),
  );

  /**
   * The gap between what the candidate thinks and what they demonstrated.
   *
   * Recomputed on read from the stored attempts rather than maintained as a
   * running total, because the rule for what counts has changed once already
   * and a cached aggregate would have preserved the old one.
   */
  router.get(
    "/:kitId/calibration",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      await loadReady(request.userId, kitId);

      const attempts = await store.attempts
        .find({ userId: request.userId, kitId })
        .sort({ createdAt: 1 })
        .toArray();

      const scored: ScoredAttempt[] = attempts.map((attempt) => ({
        questionId: attempt.questionId,
        prompt: attempt.prompt,
        category: attempt.category,
        selfRating: attempt.selfRating,
        measuredScore: attempt.analysis.score,
      }));

      response.json({ calibration: calibrate(scored) });
    }),
  );

  /**
   * Per-question state, assembled from the two histories that exist.
   *
   * Reviews know how the spacing is going and attempts know how the answers
   * actually went; neither is sufficient on its own, and the interesting
   * cases live in the disagreement between them.
   */
  async function statesFor(
    userId: string,
    kitId: string,
  ): Promise<QuestionState[]> {
    const [reviews, attempts] = await Promise.all([
      store.reviews.find({ userId, kitId }).toArray(),
      store.attempts.find({ userId, kitId }).sort({ createdAt: 1 }).toArray(),
    ]);

    const byQuestion = new Map<string, QuestionState>();

    for (const item of reviews) {
      byQuestion.set(item.questionId, {
        questionId: item.questionId,
        box: item.box,
        timesSeen: item.timesSeen,
        bestScore: null,
        predictionGap: null,
      });
    }

    for (const attempt of attempts) {
      const current =
        byQuestion.get(attempt.questionId) ??
        ({
          questionId: attempt.questionId,
          box: 0,
          timesSeen: 0,
          bestScore: null,
          predictionGap: null,
        } satisfies QuestionState);

      const prediction = comparePrediction(
        attempt.selfRating,
        attempt.analysis.score,
      );

      byQuestion.set(attempt.questionId, {
        ...current,
        // The best attempt, not the last: having once answered something well
        // is evidence you can, and triage should not chase a bad retry.
        bestScore: Math.max(current.bestScore ?? 0, attempt.analysis.score),
        // The latest gap, because this one is about current self-knowledge.
        predictionGap: prediction.gap,
      });
    }

    return [...byQuestion.values()];
  }

  /**
   * The highest-value work that fits in the time the user actually has.
   *
   * Exists because the honest answer to "I have ten minutes" was previously
   * "here is your whole plan for the day", which is the answer that makes
   * someone close the tab.
   */
  router.get(
    "/:kitId/triage",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      const record = await loadReady(request.userId, kitId);
      const kit = record.kit;
      if (!kit) throw conflict("Generate this kit before planning it");

      const asked = Number(request.query["minutes"]);
      const minutes =
        Number.isFinite(asked) && asked > 0 && asked <= 480
          ? Math.round(asked)
          : DEFAULT_TRIAGE_MINUTES;

      const evidence = checkEvidence(
        kit.role.requirements,
        kit.questions,
        record.evidenceLinks ?? [],
      );

      response.json(
        triage({
          questions: kit.questions,
          requirements: kit.role.requirements,
          states: await statesFor(request.userId, kitId),
          unevidencedRequirementIds: evidence.unevidenced_requirement_ids,
          minutes,
        }),
      );
    }),
  );

  /**
   * A set of questions shaped like a real interview.
   *
   * Chosen on the server so the client cannot reshuffle until it likes the
   * look of them, which would defeat the point of a rehearsal.
   */
  router.get(
    "/:kitId/mock",
    route(async (request, response) => {
      const kitId = param(request, "kitId");
      const record = await loadReady(request.userId, kitId);
      const kit = record.kit;
      if (!kit) throw conflict("Generate this kit before sitting it");

      const questions = mockSet({
        questions: kit.questions,
        requirements: kit.role.requirements,
        states: await statesFor(request.userId, kitId),
        count: MOCK_QUESTIONS,
      });

      response.json({
        // The outline is withheld: a mock interview where the answer is on
        // screen is a reading exercise.
        questions: questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          category: question.category,
          difficulty: question.difficulty,
        })),
      });
    }),
  );

  return router;
}
