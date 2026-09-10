"use client";

import { useKitContext } from "@/components/kit-provider";
import { KitNotReady } from "@/components/kit-not-ready";
import { formatCivilDateShort, formatMinutes, plural } from "@/lib/format";
import { useToday } from "@/lib/use-today";

export default function PlanPage() {
  const { kit, kitId } = useKitContext();
  const ready = kit?.status === "ready" && kit.kit !== null;
  const { today } = useToday(kitId, ready);

  const body = kit?.kit;
  if (!body) return <KitNotReady />;

  const byId = new Map(
    body.questions.map((question) => [question.id, question]),
  );
  // Dates come from the calendar when there is one; a kit made before dates
  // were asked for still shows its plan, just numbered rather than dated.
  const dates = new Map(
    (today?.calendar.days ?? []).map((day) => [day.day, day]),
  );

  return (
    <ol className="stagger space-y-3">
      {body.schedule.days.map((day, index) => {
        const dated = dates.get(day.day);
        const state = dated?.state ?? "future";

        return (
          <li
            key={day.day}
            style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
            className={`card p-5 transition ${
              state === "today" ? "border-accent/50" : ""
            } ${state === "past" ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-medium">
                {dated ? (
                  <>
                    {dated.weekday}
                    <span className="ml-2 text-sm font-normal text-faint">
                      {formatCivilDateShort(dated.date)}
                    </span>
                  </>
                ) : (
                  `Day ${day.day}`
                )}
                {state === "today" && (
                  <span className="ml-2 chip border-accent/50 text-accent">
                    today
                  </span>
                )}
                {dated?.isEve && (
                  <span className="ml-2 chip border-warn/50 text-warn">
                    eve of the interview
                  </span>
                )}
              </h2>
              <span className="shrink-0 font-mono text-xs text-faint">
                {formatMinutes(day.minutes)}
              </span>
            </div>

            <p className="mt-1 text-sm text-dim">{day.focus}</p>

            {day.question_ids.length === 0 ? (
              <p className="mt-3 text-sm text-faint">
                Review day — no new material.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {day.question_ids.map((id) => (
                  <li key={id} className="flex gap-2 text-sm">
                    <span className="shrink-0 font-mono text-[11px] text-faint">
                      {id}
                    </span>
                    <span className="min-w-0 truncate text-dim">
                      {byId.get(id)?.prompt ?? "(missing)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-xs text-faint">
              {plural(day.question_ids.length, "question")}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
