export type Provenance = "generated" | "edited" | "pinned";
export type KitStatus = "pending" | "generating" | "ready" | "failed";
export type JobStatus = "running" | "succeeded" | "failed";

export interface Requirement {
  id: string;
  text: string;
  kind: string;
  priority: "must" | "nice";
}

export interface Question {
  id: string;
  requirement_ids: string[];
  category: string;
  prompt: string;
  answer_outline: string;
  difficulty: number;
  provenance: Provenance;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
  provenance: Provenance;
}

export interface ScheduleDay {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}

export interface Schedule {
  days_available: number;
  days: ScheduleDay[];
}

export interface Kit {
  source: {
    company: string;
    company_url: string;
    role: string;
    location: string;
    jd_chars: number;
    researched_at: string;
    pages_used: string[];
  };
  company_brief: {
    summary: string;
    what_they_do: string;
    sources: string[];
  };
  role: {
    title: string;
    seniority: string;
    responsibilities: string[];
    requirements: Requirement[];
  };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: Schedule;
  coverage: { uncovered_requirement_ids: string[]; passes: number };
}

export interface KitSummary {
  id: string;
  status: KitStatus;
  version: number;
  title: string;
  request: { jd: string; companyUrl: string; days: number };
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface KitDetail extends KitSummary {
  kit: Kit | null;
}

/** The sections the API can rebuild on their own. */
export const REGENERABLE_SECTIONS = ["questions", "flashcards"] as const;
export type RegenerableSection = (typeof REGENERABLE_SECTIONS)[number];

export interface TraceStep {
  step: string;
  status: "ok" | "failed" | "skipped";
  detail: string;
  duration_ms: number;
}

export interface Job {
  id: string;
  kind: string;
  scope: string | null;
  status: JobStatus;
  steps: TraceStep[];
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface Story {
  id: string;
  title: string;
  situation: string;
  action: string;
  result: string;
  tags: string[];
}

export interface EvidenceReport {
  byRequirement: {
    requirementId: string;
    priority: "must" | "nice";
    storyIds: string[];
    questionIds: string[];
  }[];
  unevidenced_requirement_ids: string[];
  critical_requirement_ids: string[];
  unused_story_ids: string[];
  overused_story_ids: string[];
}
