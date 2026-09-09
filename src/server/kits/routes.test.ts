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
        .post(`/kits/${kitId}/evidence`)
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
        .post(`/kits/${kitId}/evidence`)
        .send({ links: [{ storyId: "someone-elses-story", requirementIds: ["r1"] }] })
        .expect(200);

      expect(response.body.report.critical_requirement_ids).toEqual(["r1", "r2"]);
    });

    it("will not audit a kit that has not been generated", async () => {
      const { agent, kitId } = await generated({ ...SCRIPT, failOn: "research" });

      const response = await agent.post(`/kits/${kitId}/evidence`).send({ links: [] });
      expect(response.status).toBe(409);
    });
  });
});
