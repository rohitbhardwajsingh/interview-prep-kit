import { load } from "cheerio";
import type { KitCompanyBrief, KitFlashcard, KitQuestion } from "../kit/schema";
import type { LlmClient, UntrustedDocument } from "../llm/types";
import type {
  FlashcardGenerationInput,
  KitPipelinePorts,
  KitRequest,
  PipelineContext,
  QuestionGenerationInput,
  ResearchFindings,
  RoleExtraction,
} from "../pipeline/ports";
import { crawlCompanySite, type CrawlResult } from "../retrieval/crawl";
import {
  adoptFlashcards,
  adoptQuestions,
  adoptRequirements,
  describeAdoption,
} from "./adopt";
import {
  COMPANY_BRIEF_INSTRUCTIONS,
  COMPANY_BRIEF_TASK,
  EXTRACT_ROLE_INSTRUCTIONS,
  EXTRACT_ROLE_TASK,
  FLASHCARDS_INSTRUCTIONS,
  FLASHCARDS_TASK,
  JD_LABEL,
  QUESTIONS_INSTRUCTIONS,
  REQUIREMENTS_LABEL,
  existingQuestionsDocument,
  pageLabel,
  questionsTask,
  requirementsDocument,
} from "./prompts";
import {
  companyBriefDraftSchema,
  flashcardBatchSchema,
  questionBatchSchema,
  roleExtractionSchema,
} from "./schemas";

/** Pages carrying the most signal, kept few so the token budget lasts. */
export const DEFAULT_MAX_BRIEF_PAGES = 5;

/** Below this much time left, a non-essential step is skipped, not started. */
export const MIN_MS_FOR_OPTIONAL_STEP = 20_000;

export interface LlmPortsOptions {
  llm: LlmClient;
  allowPrivateHosts: boolean;
  maxBriefPages?: number;
  /** Swapped for a fixture crawl in tests. */
  crawl?: typeof crawlCompanySite;
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A last-resort company name, so the kit is never blank where a name belongs. */
function nameFromUrl(url: string): string {
  const host = hostOf(url);
  const label = host.split(".")[0] ?? host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function pageDocuments(
  crawl: CrawlResult,
  limit: number,
): UntrustedDocument[] {
  const ordered = [...crawl.pages].sort(
    (left, right) =>
      right.hiringScore + right.aboutScore - (left.hiringScore + left.aboutScore),
  );

  const chosen = crawl.homepage
    ? [crawl.homepage, ...ordered.filter((page) => page.url !== crawl.homepage?.url)]
    : ordered;

  return chosen
    .slice(0, limit)
    .filter((page) => page.text.trim().length > 0)
    .map((page) => ({
      label: pageLabel(page.url),
      content: `${page.title}\n\n${page.text}`,
    }));
}

/**
 * The pipeline's outside world, built from a crawler and one language model.
 * Every step returns what it actually found: a failed crawl yields a thin
 * brief rather than an invented one, and a model's citation is only kept when
 * it names a requirement that really exists.
 */
export function createLlmPorts(options: LlmPortsOptions): KitPipelinePorts {
  const {
    llm,
    allowPrivateHosts,
    maxBriefPages = DEFAULT_MAX_BRIEF_PAGES,
    crawl = crawlCompanySite,
  } = options;

  function timeLeft(context: PipelineContext): number {
    return context.deadlineAt - context.now().getTime();
  }

  return {
    async extractRole(
      request: KitRequest,
      context: PipelineContext,
    ): Promise<RoleExtraction> {
      const draft = await llm.complete({
        name: "extract-role",
        instructions: EXTRACT_ROLE_INSTRUCTIONS,
        task: EXTRACT_ROLE_TASK,
        documents: [{ label: JD_LABEL, content: request.jd }],
        schema: roleExtractionSchema,
      });

      const { requirements, report } = adoptRequirements(draft.requirements);
      const note = describeAdoption(report);
      if (note) context.trace.skip("extract-role", note);

      return {
        title: draft.title || "Unspecified role",
        seniority: draft.seniority,
        location: draft.location,
        responsibilities: draft.responsibilities,
        requirements,
      };
    },

    async research(
      request: KitRequest,
      context: PipelineContext,
    ): Promise<ResearchFindings> {
      const result = await crawl({
        startUrl: request.companyUrl,
        allowPrivateHosts,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.resolveHost ? { resolveHost: options.resolveHost } : {}),
      });

      for (const skip of result.skipped) {
        context.trace.skip(skip.reason, `${skip.url}: ${skip.detail}`);
      }

      const pagesUsed = result.pages.map((page) => page.url);
      const documents = pageDocuments(result, maxBriefPages);

      // Nothing readable came back, so there is nothing to summarise. Saying so
      // costs one fewer model call than asking about an empty document.
      if (documents.length === 0) {
        context.trace.skip(
          "company-brief",
          `No readable page at ${request.companyUrl}, brief left empty`,
        );

        const brief: KitCompanyBrief = {
          summary: "",
          what_they_do: "",
          sources: [],
        };

        return {
          company: nameFromUrl(request.companyUrl),
          pagesUsed,
          brief,
          hiringProcess: null,
          publicDiscussion: [],
        };
      }

      const draft = await llm.complete({
        name: "company-brief",
        instructions: COMPANY_BRIEF_INSTRUCTIONS,
        task: COMPANY_BRIEF_TASK,
        documents,
        schema: companyBriefDraftSchema,
      });

      if (!draft.hiring_process) {
        context.trace.skip(
          "hiring-process",
          "No crawled page described the interview process",
        );
      }

      const brief: KitCompanyBrief = {
        summary: draft.summary,
        what_they_do: draft.what_they_do,
        // Citations are the URLs we read, never what the model claims to cite.
        sources: documents.map((document) =>
          document.label.replace(`${pageLabel("")}`, ""),
        ),
      };

      return {
        company: draft.company || nameFromUrl(request.companyUrl),
        pagesUsed,
        brief,
        hiringProcess: draft.hiring_process,
        publicDiscussion: [],
      };
    },

    /**
     * A best-effort look beyond the company's own site, using a keyless search
     * endpoint. Every failure mode — a timeout, a block, an empty page, no
     * search engine at all — collapses to an empty list, because a fabricated
     * account of an interview is worse than admitting none was found. Skipped
     * entirely when the case is nearly out of time.
     */
    async findPublicDiscussion(
      _request: KitRequest,
      company: string,
      context: PipelineContext,
    ): Promise<string[]> {
      if (timeLeft(context) < MIN_MS_FOR_OPTIONAL_STEP) return [];
      if (!company.trim()) return [];

      const fetchImpl = options.fetchImpl ?? fetch;
      const query = `${company} interview process questions experience`;
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal,
          headers: { "user-agent": "InterviewPrepKit/1.0 (+research)" },
        });
        if (!response.ok) return [];

        const html = await response.text();
        const $ = load(html);
        const snippets: string[] = [];
        $(".result__snippet").each((_index, element) => {
          const text = $(element).text().replace(/\s+/g, " ").trim();
          if (text.length > 40) snippets.push(text);
        });
        return snippets.slice(0, 5);
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    },

    async generateQuestions(
      input: QuestionGenerationInput,
      context: PipelineContext,
    ): Promise<KitQuestion[]> {
      if (input.requirements.length === 0) return [];

      const targetLabel =
        input.pass === 1 ? REQUIREMENTS_LABEL : "requirements-still-uncovered";

      const documents: UntrustedDocument[] = [
        requirementsDocument(input.requirements, targetLabel),
      ];

      if (input.existingQuestions.length > 0) {
        documents.push(existingQuestionsDocument(input.existingQuestions));
      }

      const brief = input.findings.brief;
      if (brief.what_they_do || brief.summary) {
        documents.push({
          label: "company-brief",
          content: `${brief.summary}\n\n${brief.what_they_do}`,
        });
      }

      if (input.findings.hiringProcess) {
        documents.push({
          label: "hiring-process",
          content: input.findings.hiringProcess,
        });
      }

      // Public accounts of how the company interviews shape which questions are
      // worth asking — a company known for a system-design round should produce
      // different questions from one that is not. Fed as untrusted content.
      if (input.findings.publicDiscussion.length > 0) {
        documents.push({
          label: "public-interview-discussion",
          content: input.findings.publicDiscussion.join("\n\n---\n\n"),
        });
      }

      const batch = await llm.complete({
        name: `generate-questions-pass-${input.pass}`,
        instructions: QUESTIONS_INSTRUCTIONS,
        task: questionsTask({
          targetLabel,
          pass: input.pass,
          hasExisting: input.existingQuestions.length > 0,
        }),
        documents,
        schema: questionBatchSchema,
      });

      const { questions, report } = adoptQuestions(batch.questions, {
        knownRequirementIds: input.allRequirementIds,
        existingQuestions: input.existingQuestions,
      });

      const note = describeAdoption(report);
      if (note) context.trace.skip(`generate-questions-pass-${input.pass}`, note);

      return questions;
    },

    async generateFlashcards(
      input: FlashcardGenerationInput,
      context: PipelineContext,
    ): Promise<KitFlashcard[]> {
      if (input.requirements.length === 0) return [];

      // Flashcards are the most droppable part of a kit, so when the clock is
      // nearly out they are skipped rather than risking the whole case.
      if (timeLeft(context) < MIN_MS_FOR_OPTIONAL_STEP) {
        context.trace.skip(
          "generate-flashcards",
          "Too little time left in the case budget, skipped",
        );
        return [];
      }

      const batch = await llm.complete({
        name: "generate-flashcards",
        instructions: FLASHCARDS_INSTRUCTIONS,
        task: FLASHCARDS_TASK,
        documents: [requirementsDocument(input.requirements)],
        schema: flashcardBatchSchema,
      });

      const { flashcards, report } = adoptFlashcards(batch.flashcards, {
        knownRequirementIds: input.requirements.map(
          (requirement) => requirement.id,
        ),
      });

      const note = describeAdoption(report);
      if (note) context.trace.skip("generate-flashcards", note);

      return flashcards;
    },
  };
}
