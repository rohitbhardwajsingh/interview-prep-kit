import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateKit } from "../kit/validate";
import { runKit } from "../pipeline/run-kit";
import type { KitRequest, PipelineContext } from "../pipeline/ports";
import { RunTrace } from "../pipeline/trace";
import { crawlCompanySite } from "../retrieval/crawl";
import {
  startFixtureServer,
  type FixtureServer,
} from "../testing/fixture-server";
import { createStubLlmClient } from "../testing/stub-llm";
import { createLlmPorts } from "./llm-ports";
import { EXISTING_QUESTIONS_LABEL, JD_LABEL } from "./prompts";

let site: FixtureServer;

beforeAll(async () => {
  site = await startFixtureServer();
});

afterAll(async () => {
  await site.close();
});

const JD = [
  "Senior Backend Engineer",
  "",
  "You will own our routing service. We need strong Go, production Kubernetes",
  "experience, and comfort with Postgres at scale. Mentoring is a plus.",
].join("\n");

function requestFor(path: string, days = 5): KitRequest {
  return { jd: JD, companyUrl: `${site.origin}${path}`, days };
}

const ROLE_REPLY = {
  title: "Senior Backend Engineer",
  seniority: "senior",
  location: "Remote",
  responsibilities: ["Own the routing service"],
  requirements: [
    { text: "Strong Go", kind: "technical", priority: "must" },
    { text: "Production Kubernetes", kind: "technical", priority: "must" },
    { text: "Postgres at scale", kind: "technical", priority: "must" },
    { text: "Mentoring", kind: "behavioural", priority: "nice" },
  ],
};

const BRIEF_REPLY = {
  company: "Acme Freight",
  summary: "Acme builds freight routing software.",
  what_they_do: "Routing for mid-market carriers.",
  hiring_process: "Screen, technical, then a system design round.",
};

function questionsFor(requirementIds: readonly string[]) {
  return {
    questions: requirementIds.map((id, index) => ({
      requirement_ids: [id],
      category: "technical",
      prompt: `Question about ${id} number ${index}`,
      answer_outline: "What a good answer covers.",
      difficulty: (index % 3) + 1,
    })),
  };
}

const FLASHCARDS_REPLY = {
  flashcards: [
    { requirement_ids: ["r1"], front: "What does Go's scheduler do?", back: "M:N." },
    { requirement_ids: ["r2"], front: "What is a readiness probe?", back: "Gate." },
  ],
};

function contextFor(deadlineAt = Number.POSITIVE_INFINITY): PipelineContext {
  return { trace: new RunTrace(), deadlineAt, now: () => new Date() };
}

function portsWith(responses: Record<string, unknown>) {
  const llm = createStubLlmClient(responses);
  const ports = createLlmPorts({
    llm,
    allowPrivateHosts: true,
    crawl: (options) =>
      crawlCompanySite({ ...options, politenessMs: 0, maxAttempts: 1 }),
  });
  return { llm, ports };
}

function fullResponses(requirementIds = ["r1", "r2", "r3", "r4"]) {
  return {
    "extract-role": ROLE_REPLY,
    "company-brief": BRIEF_REPLY,
    "generate-questions-pass-1": questionsFor(requirementIds),
    "generate-flashcards": FLASHCARDS_REPLY,
  };
}

describe("extractRole", () => {
  it("returns requirements with ids that code assigned", async () => {
    const { ports } = portsWith({ "extract-role": ROLE_REPLY });

    const extraction = await ports.extractRole(requestFor("/acme/"), contextFor());

    expect(extraction.requirements.map((item) => item.id)).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
    ]);
    expect(extraction.title).toBe("Senior Backend Engineer");
  });

  it("sends the posting as an untrusted document, never as instruction", async () => {
    const { llm, ports } = portsWith({ "extract-role": ROLE_REPLY });

    await ports.extractRole(requestFor("/acme/"), contextFor());

    const call = llm.calls[0];
    expect(call?.documents?.[0]?.label).toBe(JD_LABEL);
    expect(call?.documents?.[0]?.content).toBe(JD);
    expect(call?.instructions).not.toContain("routing service");
    expect(call?.task).not.toContain("routing service");
  });

  it("names the role rather than leaving it blank when the model gave none", async () => {
    const { ports } = portsWith({
      "extract-role": { ...ROLE_REPLY, title: "" },
    });

    const extraction = await ports.extractRole(requestFor("/acme/"), contextFor());

    expect(extraction.title).toBe("Unspecified role");
  });
});

describe("research", () => {
  it("cites the pages it actually read", async () => {
    const { ports } = portsWith({ "company-brief": BRIEF_REPLY });

    const findings = await ports.research(requestFor("/acme/"), contextFor());

    expect(findings.brief.sources.length).toBeGreaterThan(0);
    for (const source of findings.brief.sources) {
      expect(findings.pagesUsed).toContain(source);
    }
  });

  it("ignores sources the model tries to supply", async () => {
    const { ports } = portsWith({
      "company-brief": {
        ...BRIEF_REPLY,
        sources: ["http://invented.example/press"],
      },
    });

    const findings = await ports.research(requestFor("/acme/"), contextFor());

    expect(findings.brief.sources).not.toContain("http://invented.example/press");
  });

  it("reports a hiring process it found", async () => {
    const { ports } = portsWith({ "company-brief": BRIEF_REPLY });

    const findings = await ports.research(requestFor("/acme/"), contextFor());

    expect(findings.hiringProcess).toContain("system design");
  });

  it("records an absent hiring process instead of inventing one", async () => {
    const { ports } = portsWith({
      "company-brief": { ...BRIEF_REPLY, hiring_process: null },
    });
    const context = contextFor();

    const findings = await ports.research(requestFor("/acme/"), context);

    expect(findings.hiringProcess).toBeNull();
    expect(JSON.stringify(context.trace.snapshot())).toContain("hiring-process");
  });

  it("leaves the brief empty and calls no model when nothing was readable", async () => {
    // robots.txt refuses every crawler for this fixture, so there is no page.
    const { llm, ports } = portsWith({});
    const context = contextFor();

    const findings = await ports.research(requestFor("/blocked/"), context);

    expect(llm.calls).toEqual([]);
    expect(findings.brief.summary).toBe("");
    expect(findings.brief.sources).toEqual([]);
    expect(findings.pagesUsed).toEqual([]);
  });

  it("falls back to the host for a company name it could not read", async () => {
    const { ports } = portsWith({});

    const findings = await ports.research(requestFor("/blocked/"), contextFor());

    expect(findings.company).not.toBe("");
  });

  it("never claims to have found public discussion it did not search for", async () => {
    const { ports } = portsWith({ "company-brief": BRIEF_REPLY });

    const findings = await ports.research(requestFor("/acme/"), contextFor());

    expect(findings.publicDiscussion).toEqual([]);
  });
});

describe("generateQuestions", () => {
  const findings = {
    company: "Acme",
    pagesUsed: [],
    brief: { summary: "s", what_they_do: "w", sources: [] },
    hiringProcess: "Screen then onsite.",
    publicDiscussion: [],
  };

  const requirements = [
    { id: "r1", text: "Strong Go", kind: "technical" as const, priority: "must" as const },
    { id: "r2", text: "Kubernetes", kind: "technical" as const, priority: "must" as const },
  ];

  function inputFor(overrides = {}) {
    return {
      request: requestFor("/acme/"),
      findings,
      requirements,
      allRequirementIds: ["r1", "r2"],
      existingQuestions: [],
      pass: 1,
      ...overrides,
    };
  }

  it("keeps a citation the model invented out of the kit", async () => {
    const { ports } = portsWith({
      "generate-questions-pass-1": {
        questions: [
          {
            requirement_ids: ["r1", "r404"],
            category: "technical",
            prompt: "Tell me about Go.",
            answer_outline: "x",
            difficulty: 2,
          },
        ],
      },
    });
    const context = contextFor();

    const questions = await ports.generateQuestions(inputFor(), context);

    expect(questions[0]?.requirement_ids).toEqual(["r1"]);
    expect(JSON.stringify(context.trace.snapshot())).toContain("invented");
  });

  it("makes no model call when there is nothing to cover", async () => {
    const { llm, ports } = portsWith({});

    const questions = await ports.generateQuestions(
      inputFor({ requirements: [] }),
      contextFor(),
    );

    expect(questions).toEqual([]);
    expect(llm.calls).toEqual([]);
  });

  it("shows a later pass what has already been asked", async () => {
    const { llm, ports } = portsWith({
      "generate-questions-pass-2": questionsFor(["r2"]),
    });

    await ports.generateQuestions(
      inputFor({
        pass: 2,
        requirements: [requirements[1]],
        existingQuestions: [
          {
            id: "q1",
            requirement_ids: ["r1"],
            category: "technical" as const,
            prompt: "Already asked about Go.",
            answer_outline: "",
            difficulty: 2,
          },
        ],
      }),
      contextFor(),
    );

    const labels = llm.calls[0]?.documents?.map((doc) => doc.label) ?? [];
    expect(labels).toContain(EXISTING_QUESTIONS_LABEL);
  });

  it("validates a later pass against every requirement, not just the targets", async () => {
    const { ports } = portsWith({
      "generate-questions-pass-2": {
        questions: [
          {
            // r1 is already covered, but citing it is still legitimate.
            requirement_ids: ["r2", "r1"],
            category: "technical",
            prompt: "How do Go and Kubernetes interact here?",
            answer_outline: "x",
            difficulty: 3,
          },
        ],
      },
    });

    const questions = await ports.generateQuestions(
      inputFor({ pass: 2, requirements: [requirements[1]] }),
      contextFor(),
    );

    expect(questions[0]?.requirement_ids).toEqual(["r2", "r1"]);
  });
});

describe("generateFlashcards", () => {
  const requirements = [
    { id: "r1", text: "Go", kind: "technical" as const, priority: "must" as const },
  ];

  it("skips the call when the case is nearly out of time", async () => {
    const { llm, ports } = portsWith({});
    const context = contextFor(Date.now() + 500);

    const flashcards = await ports.generateFlashcards(
      { request: requestFor("/acme/"), requirements, questions: [] },
      context,
    );

    expect(flashcards).toEqual([]);
    expect(llm.calls).toEqual([]);
    expect(JSON.stringify(context.trace.snapshot())).toContain("time left");
  });

  it("generates when there is time", async () => {
    const { ports } = portsWith({ "generate-flashcards": FLASHCARDS_REPLY });

    const flashcards = await ports.generateFlashcards(
      { request: requestFor("/acme/"), requirements, questions: [] },
      contextFor(),
    );

    expect(flashcards.map((card) => card.id)).toEqual(["f1"]);
  });
});

describe("a whole kit built through the real ports", () => {
  it("passes the kit validator", async () => {
    const { ports } = portsWith(fullResponses());

    const result = await runKit(requestFor("/acme/", 5), ports);

    expect(validateKit(result.kit).ok).toBe(true);
  });

  it("covers every must-have requirement", async () => {
    const { ports } = portsWith(fullResponses());

    const result = await runKit(requestFor("/acme/", 5), ports);

    expect(result.kit.coverage.uncovered_requirement_ids).toEqual([]);
  });

  it("fills the schedule the user asked for", async () => {
    const { ports } = portsWith(fullResponses());

    const result = await runKit(requestFor("/acme/", 7), ports);

    expect(result.kit.schedule.days).toHaveLength(7);
    expect(result.kit.schedule.days_available).toBe(7);
  });

  it("records the crawled pages as the kit's sources", async () => {
    const { ports } = portsWith(fullResponses());

    const result = await runKit(requestFor("/acme/", 5), ports);

    expect(result.kit.source.pages_used.length).toBeGreaterThan(0);
    expect(result.kit.source.company).toBe("Acme Freight");
  });

  it("still produces a valid kit for a company site that cannot be read", async () => {
    const { ports } = portsWith({
      "extract-role": ROLE_REPLY,
      "generate-questions-pass-1": questionsFor(["r1", "r2", "r3", "r4"]),
      "generate-flashcards": FLASHCARDS_REPLY,
    });

    const result = await runKit(requestFor("/blocked/", 3), ports);

    expect(validateKit(result.kit).ok).toBe(true);
    expect(result.kit.company_brief.summary).toBe("");
  });

  it("loops to close a gap the first pass left, then validates", async () => {
    const { ports } = portsWith({
      "extract-role": ROLE_REPLY,
      "company-brief": BRIEF_REPLY,
      "generate-questions-pass-1": questionsFor(["r1", "r2"]),
      "generate-questions-pass-2": questionsFor(["r3"]),
      "generate-flashcards": FLASHCARDS_REPLY,
    });

    const result = await runKit(requestFor("/acme/", 4), ports);

    expect(result.passes).toBeGreaterThan(1);
    expect(validateKit(result.kit).ok).toBe(true);
    // r4 is a nice-to-have, so the loop is allowed to leave it uncovered.
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual(["r4"]);
  });
});
