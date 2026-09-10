import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type { LlmClient, StructuredRequest } from "../../core/llm/types";
import {
  buildFlashcard,
  buildQuestion,
  buildRequirement,
} from "../../core/testing/builders";
import { createFakePorts, type FakePortsScript } from "../../core/testing/fake-ports";
import { createStubLlmClient } from "../../core/testing/stub-llm";
import { createHarness, mongoAvailable, type Harness } from "../testing/harness";

const available = await mongoAvailable();

const NEW_KIT = {
  jd: "Senior Backend Engineer. Go, Postgres, Kubernetes.",
  companyUrl: "http://localhost:8099/acme/",
  days: 3,
};

const OUTLINE = [
  "- How the slow query was measured",
  "- The index chosen and why",
  "- The latency figure afterwards",
].join("\n");

const SCRIPT: FakePortsScript = {
  requirements: [buildRequirement("r1", { text: "Postgres at scale" })],
  questionsByPass: [
    [
      buildQuestion("q1", ["r1"], {
        prompt: "Tell me about a slow query you fixed.",
        answer_outline: OUTLINE,
        category: "behavioural",
      }),
    ],
  ],
  flashcards: [buildFlashcard("f1", ["r1"])],
};

/** Several questions across categories, for triage and mock selection. */
const WIDE_SCRIPT: FakePortsScript = {
  requirements: [
    buildRequirement("r1", { text: "Postgres at scale" }),
    buildRequirement("r2", { text: "Mentoring", priority: "nice" }),
  ],
  questionsByPass: [
    [
      buildQuestion("q1", ["r1"], {
        prompt: "Tell me about a slow query you fixed.",
        answer_outline: OUTLINE,
        category: "behavioural",
        difficulty: 2,
      }),
      buildQuestion("q2", ["r1"], {
        prompt: "How would you shard this table?",
        category: "system-design",
        difficulty: 3,
      }),
      buildQuestion("q3", ["r2"], {
        prompt: "How do you give difficult feedback?",
        category: "behavioural",
        difficulty: 1,
      }),
    ],
  ],
  flashcards: [buildFlashcard("f1", ["r1"])],
};

/** Reaches every outline point and names real figures, so it scores well. */
const STRONG = [
  "The dashboard was timing out, so I measured it first: the slow query was a",
  "sequential scan showing 800ms at p99 in Datadog. I chose a composite index",
  "on tenant_id and created_at, because the planner needed both columns in that",
  "order. Afterwards the latency figure came in at 120ms.",
].join(" ");

const JUDGEMENT = {
  substance: "strong",
  verdict: "That would land.",
  strongest: "Measured before changing anything.",
  gap: "",
  follow_up: "Why a composite index rather than two separate ones?",
  cut: null,
};

function judgingLlm(): LlmClient {
  return createStubLlmClient({ "judge-answer": JUDGEMENT });
}

/** A model that is down, to prove the measurement survives it. */
function brokenLlm(): LlmClient {
  return {
    model: "broken",
    async complete<T>(_request: StructuredRequest<T>): Promise<T> {
      throw new Error("upstream is on fire");
    },
  };
}

describe.skipIf(!available)("attempt routes", () => {
  const open: Harness[] = [];

  afterEach(async () => {
    await Promise.all(open.splice(0).map((harness) => harness.close()));
  });

  async function generated(llm?: LlmClient, script: FakePortsScript = SCRIPT) {
    const harness = await createHarness(createFakePorts(script), {
      ...(llm ? { llm } : {}),
    });
    open.push(harness);

    const agent = request.agent(harness.app);
    await agent
      .post("/auth/register")
      .send({ email: `u${Date.now()}${Math.random()}@example.com`, password: "a-long-passphrase" })
      .expect(201);

    const created = await agent.post("/kits").send(NEW_KIT).expect(202);
    await harness.runner.drain();

    return { harness, agent, kitId: created.body.kit.id as string };
  }

  describe("recording an answer", () => {
    it("measures what was said and keeps the transcript", async () => {
      const { agent, kitId } = await generated();

      const response = await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 4, source: "voice", spokenSeconds: 55 })
        .expect(201);

      const attempt = response.body.attempt;
      expect(attempt.transcript).toBe(STRONG);
      expect(attempt.source).toBe("voice");
      expect(attempt.spokenSeconds).toBe(55);
      expect(attempt.analysis.coverage).toBe(1);
      expect(attempt.analysis.specifics).toContain("800ms");
      expect(attempt.analysis.score).toBeGreaterThan(0);
    });

    it("will not score an answer without knowing what the candidate expected", async () => {
      const { agent, kitId } = await generated();

      const response = await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG });

      // Without a prediction there is nothing to calibrate against, so the
      // field is required rather than defaulted to a middling 3.
      expect(response.status).toBe(400);
    });

    it("rejects an empty answer", async () => {
      const { agent, kitId } = await generated();

      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: "   ", selfRating: 3 })
        .expect(400);
    });

    it("refuses a question the kit does not have", async () => {
      const { agent, kitId } = await generated();

      await agent
        .post(`/kits/${kitId}/answers/nope`)
        .send({ transcript: STRONG, selfRating: 3 })
        .expect(404);
    });

    it("keeps one user's answers away from another's", async () => {
      const { kitId } = await generated();
      const { agent: other } = await generated();

      await other
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 3 })
        .expect(404);
    });
  });

  describe("the model's judgement", () => {
    it("comes back alongside the measurement", async () => {
      const { agent, kitId } = await generated(judgingLlm());

      const response = await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 4 })
        .expect(201);

      expect(response.body.attempt.judgement.substance).toBe("strong");
      expect(response.body.attempt.judgement.follow_up).toContain("composite index");
      expect(response.body.judgeError).toBeNull();
    });

    it("still returns the measurement when the model is down", async () => {
      const { agent, kitId } = await generated(brokenLlm());

      const response = await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 4 })
        .expect(201);

      // The answer is not lost because a provider was unreachable.
      expect(response.body.attempt.analysis.score).toBeGreaterThan(0);
      expect(response.body.attempt.judgement).toBeNull();
      expect(response.body.judgeError).toContain("on fire");
    });

    it("is skipped when the caller asks for measurement only", async () => {
      const llm = createStubLlmClient({ "judge-answer": JUDGEMENT });
      const { agent, kitId } = await generated(llm);

      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 4, judge: false })
        .expect(201);

      expect(llm.calls).toHaveLength(0);
    });

    it("is absent, not fatal, when no model is configured", async () => {
      const { agent, kitId } = await generated();

      const response = await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 4 })
        .expect(201);

      expect(response.body.attempt.judgement).toBeNull();
      expect(response.body.judgeError).toBeNull();
    });
  });

  describe("answering as a review", () => {
    it("advances the spaced-repetition queue when told the day", async () => {
      const { agent, kitId } = await generated();

      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 5, day: 1 })
        .expect(201);

      const practice = await agent
        .get(`/kits/${kitId}/practice?day=1`)
        .expect(200);

      expect(practice.body.progress.attempted).toBe(1);
    });

    it("leaves the queue alone when the day was not given", async () => {
      const { agent, kitId } = await generated();

      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 5 })
        .expect(201);

      const practice = await agent
        .get(`/kits/${kitId}/practice?day=1`)
        .expect(200);

      expect(practice.body.progress.attempted).toBe(0);
    });
  });

  describe("history", () => {
    it("returns a question's attempts newest first", async () => {
      const { agent, kitId } = await generated();

      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: `First. ${STRONG}`, selfRating: 2 })
        .expect(201);
      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: `Second. ${STRONG}`, selfRating: 4 })
        .expect(201);

      const response = await agent
        .get(`/kits/${kitId}/answers/q1`)
        .expect(200);

      expect(response.body.attempts).toHaveLength(2);
      expect(response.body.attempts[0].transcript).toContain("Second");
    });

    it("is empty rather than missing before anything is answered", async () => {
      const { agent, kitId } = await generated();

      const response = await agent
        .get(`/kits/${kitId}/answers/q1`)
        .expect(200);

      expect(response.body.attempts).toEqual([]);
    });
  });

  describe("calibration", () => {
    it("withholds a verdict until there is enough to go on", async () => {
      const { agent, kitId } = await generated();

      const response = await agent.get(`/kits/${kitId}/calibration`).expect(200);

      expect(response.body.calibration.verdict).toBe("unknown");
      expect(response.body.calibration.attempts).toBe(0);
    });

    it("compares what was claimed against what was measured", async () => {
      const { agent, kitId } = await generated();

      const weak = "Um, so basically I think I sort of looked at it and, like, fixed it.";
      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: weak, selfRating: 5 })
        .expect(201);

      const response = await agent.get(`/kits/${kitId}/calibration`).expect(200);
      const calibration = response.body.calibration;

      expect(calibration.attempts).toBe(1);
      expect(calibration.averageClaimed).toBe(90);
      expect(calibration.averageMeasured).toBeLessThan(50);
      // One attempt is not a trend, so it is measured but not pronounced on.
      expect(calibration.verdict).toBe("unknown");
    });

    it("counts only the latest attempt at a question", async () => {
      const { agent, kitId } = await generated();

      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: "Um, like, I dunno, I basically just sort of fixed it somehow.", selfRating: 5 })
        .expect(201);
      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 5 })
        .expect(201);

      const response = await agent.get(`/kits/${kitId}/calibration`).expect(200);

      expect(response.body.calibration.attempts).toBe(1);
      expect(response.body.calibration.blindSpots).toEqual([]);
    });
  });

  describe("triage", () => {
    it("names the most valuable work that fits the time given", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      const response = await agent
        .get(`/kits/${kitId}/triage?minutes=10`)
        .expect(200);

      // Answering costs four minutes, so ten minutes buys two of three.
      expect(response.body.actions).toHaveLength(2);
      expect(response.body.deferred).toBe(1);
      // Must-haves lead an untouched kit.
      expect(
        response.body.actions.map((action: { questionId: string }) => action.questionId),
      ).not.toContain("q3");
    });

    it("gives every choice a reason", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      const response = await agent.get(`/kits/${kitId}/triage`).expect(200);

      for (const action of response.body.actions) {
        expect(action.reason).toBeTruthy();
      }
    });

    it("raises a question whose must-have has no story behind it", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      const response = await agent.get(`/kits/${kitId}/triage`).expect(200);

      // No stories exist yet, so every requirement is unevidenced.
      expect(response.body.actions[0]?.reason).toContain("no story");
    });

    it("brings a blind spot to the front once one exists", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      // Rated top marks on an answer that measures poorly.
      await agent
        .post(`/kits/${kitId}/answers/q3`)
        .send({
          transcript: "Um, so basically I sort of just, like, tell them honestly I guess.",
          selfRating: 5,
        })
        .expect(201);

      const response = await agent.get(`/kits/${kitId}/triage`).expect(200);

      expect(response.body.actions[0]?.questionId).toBe("q3");
      expect(response.body.actions[0]?.reason).toContain("rated this well above");
    });

    it("falls back to a sensible budget when asked for nonsense", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      const response = await agent
        .get(`/kits/${kitId}/triage?minutes=banana`)
        .expect(200);

      expect(response.body.actions.length).toBeGreaterThan(0);
    });
  });

  describe("mock interview", () => {
    it("returns a spread of questions without their outlines", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      const response = await agent.get(`/kits/${kitId}/mock`).expect(200);

      expect(response.body.questions).toHaveLength(3);
      // The outline is the answer, so it must not reach a mock interview.
      for (const question of response.body.questions) {
        expect(question.answer_outline).toBeUndefined();
      }
    });

    it("opens with the easiest question", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      const response = await agent.get(`/kits/${kitId}/mock`).expect(200);

      const difficulties = response.body.questions.map(
        (question: { difficulty: number }) => question.difficulty,
      );
      expect(difficulties).toEqual([...difficulties].sort());
    });

    it("does not touch the practice schedule", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      // A mock answer sends no day, so the spacing is left alone.
      await agent
        .post(`/kits/${kitId}/answers/q1`)
        .send({ transcript: STRONG, selfRating: 4 })
        .expect(201);

      const practice = await agent
        .get(`/kits/${kitId}/practice?day=1`)
        .expect(200);

      expect(practice.body.progress.attempted).toBe(0);
    });
  });

  describe("the practice queue", () => {
    it("carries the target window each question is measured against", async () => {
      const { agent, kitId } = await generated(undefined, WIDE_SCRIPT);

      const response = await agent
        .get(`/kits/${kitId}/practice?day=1`)
        .expect(200);

      // Behavioural and system-design have different windows, and the client
      // must not have to know which is which.
      for (const item of response.body.queue) {
        expect(item.targetSeconds).toHaveLength(2);
        expect(item.targetSeconds[0]).toBeLessThan(item.targetSeconds[1]);
      }
    });
  });
});
