import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeProvider {
  /** Pass as LLM_BASE_URL. */
  baseUrl: string;
  /** The prompt text of every request, in order. */
  prompts: string[];
  close(): Promise<void>;
}

/**
 * Recognises which pipeline step is asking by a marker its task text contains,
 * so replies stay correct as prompt wording changes.
 */
const REPLIES: ReadonlyArray<{ marker: string; reply: unknown }> = [
  {
    marker: "job-description",
    reply: {
      title: "Senior Backend Engineer",
      seniority: "senior",
      location: "Remote",
      responsibilities: ["Own the routing service", "Mentor two engineers"],
      requirements: [
        { text: "Strong Go", kind: "technical", priority: "must" },
        { text: "Production Kubernetes", kind: "technical", priority: "must" },
        { text: "Postgres at scale", kind: "technical", priority: "must" },
        { text: "Mentoring engineers", kind: "behavioural", priority: "nice" },
      ],
    },
  },
  {
    marker: "company-page:",
    reply: {
      company: "Acme Freight",
      summary: "Acme builds freight routing software for mid-market carriers.",
      what_they_do: "Route optimisation sold to regional freight operators.",
      hiring_process: "Recruiter screen, technical round, then system design.",
    },
  },
  {
    marker: "interview questions",
    reply: {
      questions: ["r1", "r2", "r3", "r4"].map((id, index) => ({
        requirement_ids: [id],
        category: index === 3 ? "behavioural" : "technical",
        prompt: `Tell me about your experience relevant to ${id}.`,
        answer_outline: "Context, action taken, how it was verified.",
        difficulty: (index % 3) + 1,
      })),
    },
  },
  {
    marker: "flashcards",
    reply: {
      flashcards: [
        { requirement_ids: ["r1"], front: "Go: what is a goroutine?", back: "A green thread." },
        { requirement_ids: ["r2"], front: "K8s: what is a readiness probe?", back: "A traffic gate." },
      ],
    },
  },
];

function replyFor(prompt: string): unknown {
  // Questions and flashcards both name requirements, so the most specific
  // marker has to win; the list is ordered from most to least specific.
  for (const { marker, reply } of REPLIES) {
    if (prompt.includes(marker)) return reply;
  }
  return {};
}

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/**
 * A stand-in for Gemini's generateContent endpoint, so the batch command can
 * be run end to end on a clean clone without a key and without spending quota.
 */
export async function startFakeProvider(): Promise<FakeProvider> {
  const prompts: string[] = [];

  const server: Server = createServer(async (request, response) => {
    const raw = await readBody(request);
    let prompt = "";
    try {
      const parsed = JSON.parse(raw) as {
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      };
      prompt = parsed.contents?.[0]?.parts?.[0]?.text ?? "";
    } catch {
      prompt = "";
    }
    prompts.push(prompt);

    const text = JSON.stringify(replyFor(prompt));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }],
        usageMetadata: { totalTokenCount: 500 },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}/v1beta`,
    prompts,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
