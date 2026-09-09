import type { KitQuestion, KitRequirement } from "../kit/schema";
import type { UntrustedDocument } from "../llm/types";

export const JD_LABEL = "job-description";
export const REQUIREMENTS_LABEL = "extracted-requirements";
export const EXISTING_QUESTIONS_LABEL = "questions-already-written";

export function pageLabel(url: string): string {
  return `company-page:${url}`;
}

/**
 * Requirement text was derived from the pasted posting, so it is untrusted too
 * and travels as a document rather than as part of the instruction. Ids are
 * still readable there, which is all a citation needs.
 */
export function requirementsDocument(
  requirements: readonly KitRequirement[],
  label = REQUIREMENTS_LABEL,
): UntrustedDocument {
  return {
    label,
    content: requirements
      .map(
        (requirement) =>
          `${requirement.id} | ${requirement.priority} | ${requirement.kind} | ${requirement.text}`,
      )
      .join("\n"),
  };
}

export function existingQuestionsDocument(
  questions: readonly KitQuestion[],
): UntrustedDocument {
  return {
    label: EXISTING_QUESTIONS_LABEL,
    content: questions.map((question) => `- ${question.prompt}`).join("\n"),
  };
}

export const EXTRACT_ROLE_INSTRUCTIONS = [
  "You are an analyst who reads a job posting and states plainly what the",
  "employer is asking for. You never invent a requirement that the posting",
  "does not support, and you never soften one that it does. A short posting",
  "yields a short list; padding it would mislead the candidate.",
].join(" ");

export const EXTRACT_ROLE_TASK = [
  `Read the ${JD_LABEL} document and return JSON of this shape:`,
  "",
  "{",
  '  "title": string,',
  '  "seniority": string,',
  '  "location": string,',
  '  "responsibilities": string[],',
  '  "requirements": [{ "text": string, "kind": string, "priority": string }]',
  "}",
  "",
  'Set "kind" to one of technical, behavioural, domain.',
  'Set "priority" to "must" when the posting treats it as required, and "nice"',
  "when it is preferred, bonus or optional.",
  "",
  "Each requirement must be one self-contained, testable capability. Split a",
  'sentence that bundles several ("Go, Kubernetes and Postgres") into one',
  "requirement each. Do not assign ids; they are added afterwards.",
  "",
  "Use an empty string for a field the posting does not state. Do not guess a",
  "location or a seniority that is not there.",
].join("\n");

export const COMPANY_BRIEF_INSTRUCTIONS = [
  "You are a researcher summarising a company from pages of its own website.",
  "You report only what those pages actually say. You would rather return an",
  "empty field than a plausible guess, because a candidate repeating an",
  "invented fact in an interview is worse than one who says nothing.",
].join(" ");

export const COMPANY_BRIEF_TASK = [
  `Read the ${pageLabel("...")} documents and return JSON of this shape:`,
  "",
  "{",
  '  "company": string,',
  '  "summary": string,',
  '  "what_they_do": string,',
  '  "hiring_process": string | null',
  "}",
  "",
  '"company" is the organisation\'s own name for itself.',
  '"summary" is two or three sentences a candidate could use to show they did',
  "their reading.",
  '"what_they_do" is the product or service in concrete terms: who the customer',
  "is and what problem is being solved. Avoid slogans.",
  '"hiring_process" describes the interview stages only if a page actually',
  "describes them. Return null otherwise. Do not infer a typical process.",
  "",
  "Do not list sources; the URLs actually read are recorded separately.",
].join("\n");

export const QUESTIONS_INSTRUCTIONS = [
  "You are an interviewer who writes questions that discriminate between a",
  "candidate who has done the work and one who has only read about it. You",
  "prefer a concrete scenario over a definition, and you never write a question",
  "whose answer is a single remembered word.",
].join(" ");

export function questionsTask(options: {
  targetLabel: string;
  pass: number;
  hasExisting: boolean;
}): string {
  const lines = [
    `Write interview questions for the requirements in the ${options.targetLabel}`,
    "document. Return JSON of this shape:",
    "",
    "{",
    '  "questions": [{',
    '    "requirement_ids": string[],',
    '    "category": string,',
    '    "prompt": string,',
    '    "answer_outline": string,',
    '    "difficulty": number',
    "  }]",
    "}",
    "",
    "Rules:",
    `- Every requirement in the ${options.targetLabel} document must be cited by`,
    "  at least one question. This is the point of the task.",
    '- "requirement_ids" must contain ids copied exactly from that document. Never',
    "  invent an id. A question citing an id that is not there is discarded.",
    '- "category" is one of technical, behavioural, system-design, company-fit.',
    '- "difficulty" is 1, 2 or 3, where 1 is a warm-up and 3 would stretch a',
    "  strong candidate.",
    '- "answer_outline" is what a good answer covers, in a few bullet-like',
    "  sentences. It is a marking guide, not a script to memorise.",
    "- One question may cite several requirements when it genuinely tests them",
    "  together. Prefer that over repeating yourself.",
    "- Use the company documents to ground company-fit questions in what this",
    "  employer actually does, not in generic culture language.",
  ];

  if (options.hasExisting) {
    lines.push(
      `- The ${EXISTING_QUESTIONS_LABEL} document lists questions already written.`,
      "  Do not repeat or lightly reword them. Cover the gap from a new angle.",
    );
  }

  return lines.join("\n");
}

export const FLASHCARDS_INSTRUCTIONS = [
  "You write flashcards for spaced repetition. A good card has exactly one",
  "fact or idea on it, phrased as a question the learner answers from memory.",
  "You never put a paragraph on a card, and you never write a card whose front",
  "gives away its back.",
].join(" ");

export const FLASHCARDS_TASK = [
  `Write flashcards for the requirements in the ${REQUIREMENTS_LABEL} document.`,
  "Return JSON of this shape:",
  "",
  "{",
  '  "flashcards": [{',
  '    "requirement_ids": string[],',
  '    "front": string,',
  '    "back": string',
  "  }]",
  "}",
  "",
  "Rules:",
  '- "front" is a single prompt, short enough to read at a glance.',
  '- "back" is the answer, a sentence or two at most.',
  '- "requirement_ids" must be ids copied exactly from that document. Never',
  "  invent an id; a card citing an unknown id is discarded.",
  "- Favour the must-priority requirements, and the ideas a candidate is most",
  "  likely to be asked to recall cold.",
  "- One card per idea. Split anything that needs an \"and\".",
].join("\n");
