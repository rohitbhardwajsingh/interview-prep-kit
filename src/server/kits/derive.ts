import { checkEvidence } from "../../core/evidence/check";
import type { Kit } from "../../core/kit/schema";
import {
  buildCalendar,
  civilDateOf,
  type StudyCalendar,
} from "../../core/schedule/calendar";
import type { KitRecord } from "./types";

const MS_PER_DAY = 86_400_000;

/**
 * Where a kit sits on the calendar, resolved once for every screen that needs
 * it.
 *
 * The fallbacks matter: kits created before interview dates were asked for
 * have no stored dates, and rather than refusing to place them they are
 * treated as having started the day they were made, with the interview the
 * morning after the last study day. That keeps every kit addressable by the
 * same countdown, old and new alike.
 */
export function kitCalendar(
  record: KitRecord,
  kit: Kit,
  now: Date,
): StudyCalendar {
  const timeZone = record.timeZone ?? "UTC";
  const today = civilDateOf(now, timeZone);
  const startDate = record.startDate ?? civilDateOf(record.createdAt, timeZone);
  const interviewDate =
    record.interviewDate ??
    civilDateOf(
      new Date(
        record.createdAt.getTime() + kit.schedule.days_available * MS_PER_DAY,
      ),
      timeZone,
    );

  return buildCalendar({
    schedule: kit.schedule,
    startDate,
    interviewDate,
    today,
    timeZone,
  });
}

/**
 * Which requirements the candidate has a story for, or undefined when the
 * story bank has not been used at all.
 *
 * The distinction is deliberate and load-bearing: an empty array means "you
 * tried and covered nothing", which the readiness score counts against you,
 * while undefined means "you have not started", which it leaves out entirely.
 * Returning undefined for an unused bank is what stops declining to write
 * stories from making everyone look unprepared.
 */
export function evidencedRequirementIds(
  record: KitRecord,
  kit: Kit,
): string[] | undefined {
  if (record.evidenceLinks.length === 0) return undefined;

  const evidence = checkEvidence(
    kit.role.requirements,
    kit.questions,
    record.evidenceLinks,
  );

  return kit.role.requirements
    .map((requirement) => requirement.id)
    .filter((id) => !evidence.unevidenced_requirement_ids.includes(id));
}
