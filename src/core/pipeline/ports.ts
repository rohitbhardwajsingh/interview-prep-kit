import type {
  KitCompanyBrief,
  KitFlashcard,
  KitQuestion,
  KitRequirement,
} from "../kit/schema";
import type { RunTrace } from "./trace";

export interface KitRequest {
  jd: string;
  companyUrl: string;
  days: number;
}

export interface PipelineContext {
  trace: RunTrace;
  deadlineAt: number;
  now: () => Date;
}

export interface ResearchFindings {
  company: string;
  pagesUsed: string[];
  brief: KitCompanyBrief;
  /** Null when no hiring-process page was found, which is reported, not faked. */
  hiringProcess: string | null;
  publicDiscussion: string[];
}

export interface RoleExtraction {
  title: string;
  seniority: string;
  location: string;
  responsibilities: string[];
  requirements: KitRequirement[];
}

export interface QuestionGenerationInput {
  request: KitRequest;
  findings: ResearchFindings;
  /** The requirements this call must produce questions for. */
  requirements: KitRequirement[];
  /**
   * Every requirement id on the kit, not just the targeted ones. A later pass
   * validates citations against this, so a question that also happens to cover
   * an already-covered requirement keeps that reference instead of losing it.
   */
  allRequirementIds: string[];
  /** Already-generated questions, so a later pass can avoid repeating them. */
  existingQuestions: KitQuestion[];
  pass: number;
}

export interface FlashcardGenerationInput {
  request: KitRequest;
  requirements: KitRequirement[];
  questions: KitQuestion[];
}

/**
 * The pipeline's outside world. `extractRole` deliberately receives no company
 * findings: requirements must come from the posting alone, so crawled pages
 * cannot leak into them.
 */
export interface KitPipelinePorts {
  research(request: KitRequest, context: PipelineContext): Promise<ResearchFindings>;
  extractRole(request: KitRequest, context: PipelineContext): Promise<RoleExtraction>;
  generateQuestions(
    input: QuestionGenerationInput,
    context: PipelineContext,
  ): Promise<KitQuestion[]>;
  generateFlashcards(
    input: FlashcardGenerationInput,
    context: PipelineContext,
  ): Promise<KitFlashcard[]>;
}
