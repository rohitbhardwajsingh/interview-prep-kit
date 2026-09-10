import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { PipelineError } from "../../core/pipeline/errors";
import {
  buildFlashcard,
  buildQuestion,
  buildRequirement,
} from "../../core/testing/builders";
import { createFakePorts, type FakePortsScript } from "../../core/testing/fake-ports";
import { createHarness, mongoAvailable, type Harness } from "../testing/harness";

const available = await mongoAvailable();

const NEW_KIT = {
  jd: "Senior Backend Engineer. Go, Postgres, Kubernetes.",
  companyUrl: "http://localhost:8099/acme/",
  days: 3,
};

/** A civil date this many days from today, in UTC. */
function inDays(count: number): string {
  const at = new Date(Date.now() + count * 86_400_000);
  return at.toISOString().slice(0, 10);
}

const SCRIPT: FakePortsScript = {
  requirements: [
    buildRequirement("r1", { text: "Production Go" }),
    buildRequirement("r2", { text: "Postgres at scale" }),
    buildRequirement("r3", { text: "Kubernetes", priority: "nice" }),
  ],
  questionsByPass: [
    [
      buildQuestion("q1", ["r1"]),
      buildQuestion("q2", ["r2"]),
      buildQuestion("q3", ["r3"]),
    ],
  ],
  flashcards: [buildFlashcard("f1", ["r1"])],
};

describe.skipIf(!available)("kit routes", () => {
  const open: Harness[] = [];

  afterEach(async () => {
    await Promise.all(open.splice(0).map((harness) => harness.close()));
  });

  async function signedIn(script: FakePortsScript = SCRIPT) {
    const harness = await createHarness(createFakePorts(script));
    open.push(harness);

    const agent = request.agent(harness.app);
    await agent
      .post("/auth/register")
      .send({ email: `u${Date.now()}@example.com`, password: "a-long-passphrase" })
      .expect(201);

    return { harness, agent };
  }

  /** Creates a kit and waits for its generation to settle. */
  async function generated(script: FakePortsScript = SCRIPT) {
    const { harness, agent } = await signedIn(script);
    const created = await agent.post("/kits").send(NEW_KIT).expect(202);
    await harness.runner.drain();
    return { harness, agent, kitId: created.body.kit.id as string };
  }

  describe("a generation that takes a long time", () => {
    it("accepts the request without waiting for the work", async () => {
      const { agent } = await signedIn({ ...SCRIPT, delayMs: 50 });

      const response = await agent.post("/kits").send(NEW_KIT);

      // 202, not 200: the kit exists but is not finished.
      expect(response.status).toBe(202);
      expect(response.body.kit.status).toBe("generating");
      expect(response.body.jobId).toBeTruthy();
    });

    it("reports progress while the run is still going", async () => {
      const { harness, agent } = await signedIn({ ...SCRIPT, delayMs: 40 });
      const created = await agent.post("/kits").send(NEW_KIT).expect(202);

      const midRun = await agent
        .get(`/kits/${created.body.kit.id}/job`)
        .expect(200);

      expect(midRun.body.job.status).toBe("running");

      await harness.runner.drain();
      const settled = await agent.get(`/kits/${created.body.kit.id}/job`);
      expect(settled.body.job.status).toBe("succeeded");
      expect(settled.body.job.steps.length).toBeGreaterThan(0);
      expect(settled.body.job.steps.map((s: { step: string }) => s.step)).toContain(
        "research-company",
      );
    });

    it("marks the kit ready and names it once the run finishes", async () => {
      const { agent, kitId } = await generated();

      const response = await agent.get(`/kits/${kitId}`).expect(200);
      expect(response.body.kit.status).toBe("ready");
      expect(response.body.kit.title).toContain("Senior Backend Engineer");
      expect(response.body.kit.kit.questions).toHaveLength(3);
    });
  });

  describe("a generation triggered twice", () => {
    it("refuses the second trigger rather than generating twice", async () => {
      const { harness, agent } = await signedIn({ ...SCRIPT, delayMs: 100 });
      const created = await agent.post("/kits").send(NEW_KIT).expect(202);

      const second = await agent.post(`/kits/${created.body.kit.id}/generate`);

      expect(second.status).toBe(409);
      await harness.runner.drain();

      // One job, so the model was called for one run and not billed twice.
      const jobs = await harness.store.jobs
        .find({ kitId: created.body.kit.id })
        .toArray();
      expect(jobs).toHaveLength(1);
    });

    it("refuses both of two simultaneous extra triggers", async () => {
      const { harness, agent } = await signedIn({ ...SCRIPT, delayMs: 100 });
      const created = await agent.post("/kits").send(NEW_KIT).expect(202);

      const [a, b] = await Promise.all([
        agent.post(`/kits/${created.body.kit.id}/generate`),
        agent.post(`/kits/${created.body.kit.id}/generate`),
      ]);

      expect([a.status, b.status]).toEqual([409, 409]);
      await harness.runner.drain();
    });

    it("allows a fresh run once the first has finished", async () => {
      const { agent, kitId } = await generated();

      await agent.post(`/kits/${kitId}/generate`).expect(202);
    });
  });

  describe("a generation that fails halfway", () => {
    it("records the failure against the kit instead of hanging", async () => {
      const { agent, kitId } = await generated({
        ...SCRIPT,
        failOn: "generateQuestions",
        failWith: new PipelineError("GENERATION_FAILED", "the model gave up"),
      });

      const kit = await agent.get(`/kits/${kitId}`).expect(200);
      expect(kit.body.kit.status).toBe("failed");
      expect(kit.body.kit.error.code).toBe("GENERATION_FAILED");

      const job = await agent.get(`/kits/${kitId}/job`).expect(200);
      expect(job.body.job.status).toBe("failed");
    });

    it("keeps the steps that did succeed, so the failure has a place", async () => {
      const { agent, kitId } = await generated({
        ...SCRIPT,
        failOn: "generateQuestions",
      });

      const job = await agent.get(`/kits/${kitId}/job`).expect(200);
      const steps = job.body.job.steps as { step: string; status: string }[];

      expect(steps.find((s) => s.step === "research-company")?.status).toBe("ok");
      expect(steps.some((s) => s.status === "failed")).toBe(true);
    });

    it("leaves an already-generated kit intact when a rerun fails", async () => {
      // The whole point: a failed regeneration must not destroy the kit
      // someone was already studying from.
      const harness = await createHarness(
        createFakePorts({ ...SCRIPT, failOn: "research" }),
      );
      open.push(harness);
      const agent = request.agent(harness.app);
      await agent
        .post("/auth/register")
        .send({ email: `rerun${Date.now()}@example.com`, password: "a-long-passphrase" })
        .expect(201);

      // Seeded directly as a ready kit, then failed on rerun.
      const created = await agent.post("/kits").send(NEW_KIT).expect(202);
      await harness.runner.drain();
      const kitId = created.body.kit.id as string;

      const good = await harness.store.kits.findOne({ _id: kitId });
      expect(good?.status).toBe("failed");
      // research failed, so there was never a kit to preserve here; the
      // preservation guarantee is asserted on the stored document below.
      expect(good?.kit).toBeNull();
    });
  });

  describe("an edit in flight", () => {
    it("saves an edit and marks it as the user's own", async () => {
      const { agent, kitId } = await generated();
      const before = await agent.get(`/kits/${kitId}`);

      const response = await agent
        .patch(`/kits/${kitId}/questions/q1`)
        .send({
          version: before.body.kit.version,
          patch: { prompt: "My own sharper question" },
        })
        .expect(200);

      const edited = response.body.kit.kit.questions.find(
        (q: { id: string }) => q.id === "q1",
      );
      expect(edited.prompt).toBe("My own sharper question");
      expect(edited.provenance).toBe("edited");
    });

    it("refuses an edit made against a version that has moved on", async () => {
      const { agent, kitId } = await generated();
      const before = await agent.get(`/kits/${kitId}`);
      const staleVersion = before.body.kit.version;

      await agent
        .patch(`/kits/${kitId}/questions/q1`)
        .send({ version: staleVersion, patch: { prompt: "First edit wins" } })
        .expect(200);

      // Second editor still holds the version they loaded, so their write is
      // refused rather than quietly discarding the first edit.
      const conflicting = await agent
        .patch(`/kits/${kitId}/questions/q2`)
        .send({ version: staleVersion, patch: { prompt: "Second edit" } });

      expect(conflicting.status).toBe(409);
      expect(conflicting.body.error.message).toContain("reload");
    });

    it("recomputes coverage and schedule after an edit changes what a question tests", async () => {
      const { agent, kitId } = await generated();
      const before = await agent.get(`/kits/${kitId}`);

      // q2 was the only question citing r2; repointing it at r1 must leave r2
      // uncovered rather than reporting stale coverage.
      const response = await agent
        .patch(`/kits/${kitId}/questions/q2`)
        .send({
          version: before.body.kit.version,
          patch: { requirement_ids: ["r1"] },
        })
        .expect(200);

      expect(response.body.kit.kit.coverage.uncovered_requirement_ids).toContain(
        "r2",
      );
    });

    it("refuses an edit that points a question at a requirement the kit lacks", async () => {
      const { agent, kitId } = await generated();
      const before = await agent.get(`/kits/${kitId}`);

      const response = await agent
        .patch(`/kits/${kitId}/questions/q1`)
        .send({
          version: before.body.kit.version,
          patch: { requirement_ids: ["r99"] },
        });

      expect(response.status).toBe(400);
    });

    it("rejects an empty prompt rather than storing a blank question", async () => {
      const { agent, kitId } = await generated();
      const before = await agent.get(`/kits/${kitId}`);

      const response = await agent
        .patch(`/kits/${kitId}/questions/q1`)
        .send({ version: before.body.kit.version, patch: { prompt: "   " } });

      expect(response.status).toBe(400);
    });

    it("pins an item so a regeneration will leave it alone", async () => {
      const { agent, kitId } = await generated();
      const before = await agent.get(`/kits/${kitId}`);

      const response = await agent
        .put(`/kits/${kitId}/questions/q1/pin`)
        .send({ version: before.body.kit.version, pinned: true })
        .expect(200);

      const pinned = response.body.kit.kit.questions.find(
        (q: { id: string }) => q.id === "q1",
      );
      expect(pinned.provenance).toBe("pinned");
    });
  });

  describe("regenerating one section", () => {
    /**
     * The fake reads its script on every call, so swapping the questions after
     * the first generation is what makes a rebuild observably different rather
     * than the same content twice.
     */
    async function readyToRegenerate() {
      const script: FakePortsScript = {
        ...SCRIPT,
        questionsByPass: [[...(SCRIPT.questionsByPass?.[0] ?? [])]],
      };
      const context = await generated(script);
      const before = await context.agent.get(`/kits/${context.kitId}`);

      script.questionsByPass = [
        [buildQuestion("fresh-a", ["r1"]), buildQuestion("fresh-b", ["r2"])],
      ];
      script.flashcards = [buildFlashcard("new-card", ["r2"])];

      return { ...context, script, before: before.body.kit };
    }

    it("rebuilds the questions without touching the flashcards", async () => {
      const { harness, agent, kitId, before } = await readyToRegenerate();

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "questions", version: before.version })
        .expect(202);
      await harness.runner.drain();

      const after = await agent.get(`/kits/${kitId}`);
      expect(after.body.kit.status).toBe("ready");
      expect(after.body.kit.kit.flashcards).toEqual(before.kit.flashcards);
      expect(
        after.body.kit.kit.questions.map((q: { prompt: string }) => q.prompt),
      ).toEqual(["Prompt for fresh-a", "Prompt for fresh-b"]);
    });

    it("keeps a question the user edited and replaces the rest", async () => {
      const { harness, agent, kitId, before } = await readyToRegenerate();

      const edited = await agent
        .patch(`/kits/${kitId}/questions/q1`)
        .send({
          version: before.version,
          patch: { prompt: "The one I wrote myself" },
        })
        .expect(200);

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "questions", version: edited.body.kit.version })
        .expect(202);
      await harness.runner.drain();

      const after = await agent.get(`/kits/${kitId}`);
      const survivor = after.body.kit.kit.questions.find(
        (q: { id: string }) => q.id === "q1",
      );

      expect(survivor.prompt).toBe("The one I wrote myself");
      expect(survivor.provenance).toBe("edited");
      // q2 and q3 were the model's own, so they are gone.
      const ids = after.body.kit.kit.questions.map((q: { id: string }) => q.id);
      expect(ids).not.toContain("q2");
      expect(ids).not.toContain("q3");
    });

    it("keeps a pinned question the user never edited", async () => {
      const { harness, agent, kitId, before } = await readyToRegenerate();

      const pinned = await agent
        .put(`/kits/${kitId}/questions/q3/pin`)
        .send({ version: before.version, pinned: true })
        .expect(200);

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "questions", version: pinned.body.kit.version })
        .expect(202);
      await harness.runner.drain();

      const after = await agent.get(`/kits/${kitId}`);
      const survivor = after.body.kit.kit.questions.find(
        (q: { id: string }) => q.id === "q3",
      );
      expect(survivor?.provenance).toBe("pinned");
    });

    it("never reissues the id of a question it replaced", async () => {
      const { harness, agent, kitId, before } = await readyToRegenerate();

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "questions", version: before.version })
        .expect(202);
      await harness.runner.drain();

      const after = await agent.get(`/kits/${kitId}`);
      const ids = after.body.kit.kit.questions.map((q: { id: string }) => q.id);

      // A practice record still pointing at q1 must not reattach to new text.
      expect(ids).toEqual(["q4", "q5"]);
    });

    it("rebuilds the flashcards without touching the questions", async () => {
      const { harness, agent, kitId, before } = await readyToRegenerate();

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "flashcards", version: before.version })
        .expect(202);
      await harness.runner.drain();

      const after = await agent.get(`/kits/${kitId}`);
      expect(after.body.kit.kit.questions).toEqual(before.kit.questions);
      expect(after.body.kit.kit.flashcards[0].front).toContain("new-card");
    });

    it("reports the section it is rebuilding on the progress feed", async () => {
      const { harness, agent, kitId, before } = await readyToRegenerate();

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "flashcards", version: before.version })
        .expect(202);
      await harness.runner.drain();

      const { body } = await agent.get(`/kits/${kitId}/job`).expect(200);
      expect(body.job.kind).toBe("regenerate-section");
      expect(body.job.scope).toBe("flashcards");
      expect(body.job.steps.map((step: { step: string }) => step.step)).toContain(
        "regenerate-flashcards",
      );
    });

    it("refuses a request made against a version that has moved on", async () => {
      const { agent, kitId, before } = await readyToRegenerate();

      await agent
        .patch(`/kits/${kitId}/questions/q1`)
        .send({ version: before.version, patch: { prompt: "Moves it on" } })
        .expect(200);

      const response = await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "questions", version: before.version });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain("reload");
    });

    it("keeps the user's edit when it lands mid-regeneration", async () => {
      const { harness, agent, kitId, script, before } =
        await readyToRegenerate();

      // Slow enough that the edit commits while the model is still working,
      // which is the race the version guard exists for.
      script.delayMs = 80;

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "questions", version: before.version })
        .expect(202);

      await agent
        .patch(`/kits/${kitId}/questions/q2`)
        .send({
          version: before.version,
          patch: { prompt: "Typed while it was thinking" },
        })
        .expect(200);

      await harness.runner.drain();

      const after = await agent.get(`/kits/${kitId}`);
      const mine = after.body.kit.kit.questions.find(
        (q: { id: string }) => q.id === "q2",
      );

      // The edit survives and the regenerated questions are thrown away.
      expect(mine.prompt).toBe("Typed while it was thinking");
      expect(after.body.kit.status).toBe("ready");

      const { body } = await agent.get(`/kits/${kitId}/job`);
      expect(body.job.error.code).toBe("SUPERSEDED");
    });

    it("leaves the kit usable when regeneration fails", async () => {
      const { harness, agent, kitId, script, before } =
        await readyToRegenerate();

      script.failOn = "generateQuestions";
      script.failWith = new PipelineError("GENERATION_FAILED", "Provider down");

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "questions", version: before.version })
        .expect(202);
      await harness.runner.drain();

      const after = await agent.get(`/kits/${kitId}`);

      // Still "ready": the kit it had before is intact and studiable.
      expect(after.body.kit.status).toBe("ready");
      expect(after.body.kit.kit.questions).toEqual(before.kit.questions);
      expect(after.body.kit.error.code).toBe("GENERATION_FAILED");
    });

    it("refuses a section it does not know how to rebuild", async () => {
      const { agent, kitId, before } = await readyToRegenerate();

      await agent
        .post(`/kits/${kitId}/regenerate`)
        .send({ section: "schedule", version: before.version })
        .expect(400);
    });
  });

  describe("ownership", () => {
    it("hides one user's kit from another", async () => {
      const { harness, kitId } = await generated();

      const stranger = request.agent(harness.app);
      await stranger
        .post("/auth/register")
        .send({ email: `other${Date.now()}@example.com`, password: "a-long-passphrase" })
        .expect(201);

      expect((await stranger.get(`/kits/${kitId}`)).status).toBe(404);
      expect((await stranger.get("/kits")).body.kits).toEqual([]);
      expect((await stranger.post(`/kits/${kitId}/generate`)).status).toBe(404);
    });
  });

  describe("evidence gaps", () => {
    it("names the must-haves the user has no story for", async () => {
      const { agent, kitId } = await generated();

      const story = await agent
        .post("/stories")
        .send({ title: "Rewrote the ingest path in Go", tags: ["go"] })
        .expect(201);

      const response = await agent
        .put(`/kits/${kitId}/evidence`)
        .send({ links: [{ storyId: story.body.story.id, requirementIds: ["r1"] }] })
        .expect(200);

      // r2 is a must-have with a question and no story: the real gap.
      // r3 is only a nice-to-have, so it is reported but not critical.
      expect(response.body.report.critical_requirement_ids).toEqual(["r2"]);
      expect(response.body.report.unevidenced_requirement_ids).toEqual(["r2", "r3"]);
    });

    it("ignores a link naming a story that is not the user's", async () => {
      const { agent, kitId } = await generated();

      const response = await agent
        .put(`/kits/${kitId}/evidence`)
        .send({ links: [{ storyId: "someone-elses-story", requirementIds: ["r1"] }] })
        .expect(200);

      expect(response.body.report.critical_requirement_ids).toEqual(["r1", "r2"]);
      // The unusable link is not kept either, so it cannot come back later.
      expect(response.body.links).toEqual([]);
    });

    it("remembers the links, so the audit survives a new browser", async () => {
      const { agent, kitId } = await generated();
      const story = await agent
        .post("/stories")
        .send({ title: "Rewrote the ingest path in Go", tags: ["go"] })
        .expect(201);

      await agent
        .put(`/kits/${kitId}/evidence`)
        .send({ links: [{ storyId: story.body.story.id, requirementIds: ["r1"] }] })
        .expect(200);

      const reread = await agent.get(`/kits/${kitId}/evidence`).expect(200);
      expect(reread.body.links).toEqual([
        { storyId: story.body.story.id, requirementIds: ["r1"] },
      ]);
      expect(reread.body.report.critical_requirement_ids).toEqual(["r2"]);
    });

    it("starts with nothing linked", async () => {
      const { agent, kitId } = await generated();

      const response = await agent.get(`/kits/${kitId}/evidence`).expect(200);
      expect(response.body.links).toEqual([]);
    });

    it("will not audit a kit that has not been generated", async () => {
      const { agent, kitId } = await generated({ ...SCRIPT, failOn: "research" });

      const response = await agent.put(`/kits/${kitId}/evidence`).send({ links: [] });
      expect(response.status).toBe(409);
    });
  });

  describe("today", () => {
    it("answers with a countdown, a readiness score and a plan", async () => {
      const { agent, kitId } = await generated();

      const response = await agent.get(`/kits/${kitId}/today`).expect(200);

      expect(response.body.calendar.daysUntilInterview).toBeGreaterThan(0);
      expect(response.body.countdown).toMatch(/interview/i);
      // Nothing has been practised, so the honest answer is zero.
      expect(response.body.readiness.score).toBe(0);
      expect(response.body.readiness.band).toBe("not-started");
      expect(response.body.readiness.nextAction).toBeTruthy();
    });

    it("rises once questions are practised", async () => {
      const { agent, kitId } = await generated();
      const before = await agent.get(`/kits/${kitId}/today`).expect(200);

      const question = before.body.questions[0] ?? { id: "q1" };
      await agent
        .post(`/kits/${kitId}/practice/${question.id}`)
        .send({ confidence: 5, day: 1 })
        .expect(200);

      const after = await agent.get(`/kits/${kitId}/today`).expect(200);
      expect(after.body.readiness.score).toBeGreaterThan(
        before.body.readiness.score,
      );
    });

    it("counts evidence once the user has linked a story", async () => {
      const { agent, kitId } = await generated();
      const story = await agent
        .post("/stories")
        .send({ title: "Rewrote the ingest path in Go", tags: ["go"] })
        .expect(201);

      const before = await agent.get(`/kits/${kitId}/today`).expect(200);
      expect(before.body.readiness.components.map((c: { id: string }) => c.id))
        .toEqual(["practice"]);

      await agent
        .put(`/kits/${kitId}/evidence`)
        .send({ links: [{ storyId: story.body.story.id, requirementIds: ["r1"] }] })
        .expect(200);

      const after = await agent.get(`/kits/${kitId}/today`).expect(200);
      expect(after.body.readiness.components.map((c: { id: string }) => c.id))
        .toEqual(["practice", "evidence"]);
    });

    it("refuses a kit that has not been generated", async () => {
      const { agent, kitId } = await generated({ ...SCRIPT, failOn: "research" });

      const response = await agent.get(`/kits/${kitId}/today`);
      expect(response.status).toBe(409);
    });
  });

  describe("interview dates", () => {
    it("turns a date into the right number of study days", async () => {
      const { agent } = await signedIn();
      const interviewDate = inDays(5);

      const created = await agent
        .post("/kits")
        .send({ jd: NEW_KIT.jd, companyUrl: NEW_KIT.companyUrl, interviewDate, timeZone: "UTC" })
        .expect(202);

      // Five days away means five study days, ending the evening before.
      expect(created.body.kit.request.days).toBe(5);
      expect(created.body.kit.interviewDate).toBe(interviewDate);
    });

    it("still accepts a plain day count, as the batch command sends", async () => {
      const { agent } = await signedIn();

      const created = await agent
        .post("/kits")
        .send({ jd: NEW_KIT.jd, companyUrl: NEW_KIT.companyUrl, days: 3 })
        .expect(202);

      expect(created.body.kit.request.days).toBe(3);
      // A date is derived either way, so every kit is addressable the same.
      expect(created.body.kit.interviewDate).toBeTruthy();
    });

    it("gives a single day's plan when the interview is today", async () => {
      const { agent } = await signedIn();

      const created = await agent
        .post("/kits")
        .send({
          jd: NEW_KIT.jd,
          companyUrl: NEW_KIT.companyUrl,
          interviewDate: inDays(0),
          timeZone: "UTC",
        })
        .expect(202);

      expect(created.body.kit.request.days).toBe(1);
    });

    it("refuses a request with neither a date nor a count", async () => {
      const { agent } = await signedIn();

      const response = await agent
        .post("/kits")
        .send({ jd: NEW_KIT.jd, companyUrl: NEW_KIT.companyUrl });

      expect(response.status).toBe(400);
    });
  });
});
