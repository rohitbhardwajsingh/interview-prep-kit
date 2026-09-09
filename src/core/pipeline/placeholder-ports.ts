import type { KitPipelinePorts, KitRequest } from "./ports";

export const UNRESEARCHED_NOTE =
  "No company research has been performed for this kit.";

export const UNEXTRACTED_NOTE =
  "No requirements have been extracted from this posting.";

function companyNameFrom(companyUrl: string): string {
  try {
    return new URL(companyUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Honest do-nothing implementations of every port, so the batch command and the
 * coverage loop can be exercised end to end before retrieval and generation
 * exist. Each is replaced by a real step; none of them invent content.
 */
export function createPlaceholderPorts(): KitPipelinePorts {
  return {
    async research(request: KitRequest) {
      return {
        company: companyNameFrom(request.companyUrl),
        pagesUsed: [],
        brief: {
          summary: UNRESEARCHED_NOTE,
          what_they_do: UNRESEARCHED_NOTE,
          sources: [],
        },
        hiringProcess: null,
        publicDiscussion: [],
      };
    },

    async extractRole() {
      return {
        title: "",
        seniority: "",
        location: "",
        responsibilities: [],
        requirements: [],
      };
    },

    async generateQuestions() {
      return [];
    },

    async generateFlashcards() {
      return [];
    },
  };
}
