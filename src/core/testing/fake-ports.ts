import type {
  KitFlashcard,
  KitQuestion,
  KitRequirement,
} from "../kit/schema";
import type {
  KitPipelinePorts,
  QuestionGenerationInput,
  ResearchFindings,
} from "../pipeline/ports";

export interface FakePortsScript {
  requirements?: KitRequirement[];
  /** Questions returned on pass 1, 2, 3 … Later passes return nothing. */
  questionsByPass?: KitQuestion[][];
  flashcards?: KitFlashcard[];
  findings?: Partial<ResearchFindings>;
  failOn?: keyof KitPipelinePorts;
  /** Thrown instead of a generic Error, to check how a fault is classified. */
  failWith?: unknown;
  delayMs?: number;
}

export interface FakePorts extends KitPipelinePorts {
  readonly calls: { generateQuestions: QuestionGenerationInput[] };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFakePorts(script: FakePortsScript = {}): FakePorts {
  const calls: { generateQuestions: QuestionGenerationInput[] } = {
    generateQuestions: [],
  };

  async function guard(port: keyof KitPipelinePorts): Promise<void> {
    if (script.delayMs) await delay(script.delayMs);
    if (script.failOn !== port) return;
    throw script.failWith ?? new Error(`${port} failed`);
  }

  return {
    calls,

    async research() {
      await guard("research");
      return {
        company: "Acme",
        pagesUsed: ["http://localhost:8099/acme/careers"],
        brief: {
          summary: "Acme builds logistics software.",
          what_they_do: "Freight routing.",
          sources: ["http://localhost:8099/acme/about"],
        },
        hiringProcess: null,
        publicDiscussion: [],
        ...script.findings,
      };
    },

    async extractRole() {
      await guard("extractRole");
      return {
        title: "Senior Backend Engineer",
        seniority: "senior",
        location: "Remote",
        responsibilities: ["Own the routing service"],
        requirements: script.requirements ?? [],
      };
    },

    async generateQuestions(input) {
      await guard("generateQuestions");
      calls.generateQuestions.push(input);
      return script.questionsByPass?.[input.pass - 1] ?? [];
    },

    async generateFlashcards() {
      await guard("generateFlashcards");
      return script.flashcards ?? [];
    },
  };
}
