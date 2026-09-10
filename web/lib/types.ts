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
  /** Civil dates, YYYY-MM-DD. Null on kits created before dates were asked. */
  interviewDate: string | null;
  startDate: string | null;
  timeZone: string | null;
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

export interface CalendarDay {
  day: number;
  date: string;
  weekday: string;
  state: "past" | "today" | "future";
  isEve: boolean;
}

export interface StudyCalendar {
  days: CalendarDay[];
  todayDay: number | null;
  daysUntilInterview: number;
  elapsedDays: number;
  interviewDate: string;
  startDate: string;
  isInterviewDay: boolean;
  isPast: boolean;
}

export interface ReadinessComponent {
  id: "practice" | "evidence";
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface Readiness {
  score: number;
  band: "not-started" | "early" | "getting-there" | "ready";
  components: ReadinessComponent[];
  ceiling: { score: number; detail: string };
  nextAction: string;
  blockers: string[];
}

export interface ReplanReport {
  carriedOver: number;
  alreadyDone: number;
  deferredQuestionIds: string[];
  peakDayMinutes: number;
  overloaded: boolean;
  summary: string;
}

/** Everything the home screen needs, recomputed on every read. */
export interface TodayView {
  calendar: StudyCalendar;
  countdown: string;
  readiness: Readiness;
  plan: ScheduleDay | null;
  questions: Question[];
  replan: ReplanReport;
  behind: boolean;
}

/** One story's claim to evidence a set of requirements. */
export interface EvidenceLink {
  storyId: string;
  requirementIds: string[];
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

/** One line of the outline, and whether the answer actually reached it. */
export interface OutlinePoint {
  text: string;
  covered: boolean;
  matched: string[];
}

export interface Pacing {
  wordCount: number;
  spokenSeconds: number | null;
  wordsPerMinute: number | null;
  targetSeconds: [number, number];
  verdict: "too-short" | "good" | "too-long" | "unknown";
  secondsToFirstSpecific: number | null;
}

/** Measured, not judged: every field here is reproducible from the words. */
export interface AnswerAnalysis {
  points: OutlinePoint[];
  coverage: number;
  specifics: string[];
  fillers: { word: string; count: number }[];
  fillerRatePer100: number;
  hedges: string[];
  star: { situation: boolean; action: boolean; result: boolean; applies: boolean };
  pacing: Pacing;
  score: number;
  notes: string[];
}

/** The model's read on whether the answer had substance behind the words. */
export interface AnswerJudgement {
  substance: "strong" | "thin" | "off-target";
  verdict: string;
  strongest: string;
  gap: string;
  follow_up: string;
  cut: string | null;
}

/**
 * The prediction against the measurement, compared server-side so the score
 * bands and the threshold live in one place rather than two.
 */
export interface PredictionGap {
  claimed: number;
  measured: number;
  /** Positive when the answer was weaker than it felt. */
  gap: number;
  surprising: boolean;
}

export interface Attempt {
  id: string;
  questionId: string;
  transcript: string;
  source: "voice" | "typed";
  spokenSeconds: number | null;
  selfRating: number;
  analysis: AnswerAnalysis;
  judgement: AnswerJudgement | null;
  prediction: PredictionGap;
  createdAt: string;
}

export interface BlindSpot {
  questionId: string;
  prompt: string;
  category: string;
  selfRating: number;
  measuredScore: number;
  gap: number;
}

export interface Calibration {
  attempts: number;
  verdict: "overconfident" | "calibrated" | "underconfident" | "unknown";
  averageGap: number;
  averageClaimed: number;
  averageMeasured: number;
  blindSpots: BlindSpot[];
  byCategory: { category: string; attempts: number; averageGap: number }[];
  summary: string;
}
