"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { EvidenceReport, KitDetail, Story } from "@/lib/types";

/**
 * Links live in the browser's storage rather than the database. They are a
 * personal annotation on a kit, cheap to redo, and keeping them local means
 * the audit works without adding a write path for something the deterministic
 * checker treats as input anyway.
 */
function storageKey(kitId: string): string {
  return `prepkit.evidence.${kitId}`;
}

type Links = Record<string, string[]>;

function readLinks(kitId: string): Links {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(kitId));
    return raw ? (JSON.parse(raw) as Links) : {};
  } catch {
    return {};
  }
}

export default function EvidencePage() {
  const { kitId } = useParams<{ kitId: string }>();
  const [kit, setKit] = useState<KitDetail | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [links, setLinks] = useState<Links>({});
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLinks(readLinks(kitId));
  }, [kitId]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ kit: KitDetail }>(`/kits/${kitId}`, { signal: controller.signal }),
      api<{ stories: Story[] }>("/stories", { signal: controller.signal }),
    ])
      .then(([kitBody, storyBody]) => {
        setKit(kitBody.kit);
        setStories(storyBody.stories);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      });
    return () => controller.abort();
  }, [kitId]);

  const audit = useCallback(
    async (next: Links) => {
      try {
        const body = await api<{ report: EvidenceReport }>(
          `/kits/${kitId}/evidence`,
          {
            method: "POST",
            body: {
              links: Object.entries(next).map(([storyId, requirementIds]) => ({
                storyId,
                requirementIds,
              })),
            },
          },
        );
        setReport(body.report);
        setError(null);
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "Could not audit");
      }
    },
    [kitId],
  );

  // Re-audited on the server after every change, so the verdict always comes
  // from the same checker the rest of the pipeline uses.
  useEffect(() => {
    if (kit?.kit) void audit(links);
  }, [kit, links, audit]);

  function toggle(storyId: string, requirementId: string) {
    setLinks((current) => {
      const owned = current[storyId] ?? [];
      const next = {
        ...current,
        [storyId]: owned.includes(requirementId)
          ? owned.filter((id) => id !== requirementId)
          : [...owned, requirementId],
      };
      window.localStorage.setItem(storageKey(kitId), JSON.stringify(next));
      return next;
    });
  }

  const requirements = kit?.kit?.role.requirements ?? [];
  const byRequirement = useMemo(
    () => new Map((report?.byRequirement ?? []).map((row) => [row.requirementId, row])),
    [report],
  );

  const critical = new Set(report?.critical_requirement_ids ?? []);
  const covered = requirements.length - (report?.unevidenced_requirement_ids.length ?? 0);

  if (error && !kit) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      </main>
    );
  }

  if (!kit?.kit) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted">
          {kit ? "Generate this kit before auditing it." : "Loading…"}
        </p>
        <Link href={`/kits/${kitId}`} className="btn-ghost mt-4">
          Back to the kit
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href={`/kits/${kitId}`} className="text-sm text-muted hover:text-paper">
        ← {kit.title}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Evidence gaps
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Tick the stories that genuinely back each requirement. What is left is
        what you will struggle to answer with anything concrete.
      </p>

      {stories.length === 0 ? (
        <div className="card mt-8 p-6 text-center">
          <p className="font-medium">Your story bank is empty</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            This audit compares the role&apos;s requirements against what you
            have actually done, so it needs a few stories first.
          </p>
          <Link href="/stories" className="btn-primary mt-5">
            Add your first story
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Backed by a story"
              value={`${covered}/${requirements.length}`}
              tone="text-paper"
            />
            <Stat
              label="Critical gaps"
              value={String(critical.size)}
              tone={critical.size > 0 ? "text-bad" : "text-good"}
              hint="Must-haves you will be asked about with no story behind them"
            />
            <Stat
              label="Overworked stories"
              value={String(report?.overused_story_ids.length ?? 0)}
              tone={
                (report?.overused_story_ids.length ?? 0) > 0
                  ? "text-warn"
                  : "text-good"
              }
              hint="One anecdote stretched across too many requirements"
            />
          </div>

          {critical.size > 0 && (
            <p className="mt-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              {critical.size} must-have
              {critical.size === 1 ? "" : "s"} will be interviewed and you have
              nothing to point at. These are marked below — they are the ones
              worth fixing before anything else.
            </p>
          )}

          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Requirements against the stories that evidence them
              </caption>
              <thead>
                <tr className="border-b border-ink-line text-left">
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Requirement
                  </th>
                  {stories.map((story) => (
                    <th
                      key={story.id}
                      scope="col"
                      className="pb-2 px-2 text-center align-bottom font-normal"
                    >
                      <span
                        title={story.title}
                        className="block max-w-[7rem] truncate text-xs text-muted"
                      >
                        {story.title}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requirements.map((requirement) => {
                  const row = byRequirement.get(requirement.id);
                  const isCritical = critical.has(requirement.id);
                  const questionCount = row?.questionIds.length ?? 0;

                  return (
                    <tr
                      key={requirement.id}
                      className="border-b border-ink-line/50"
                    >
                      <th
                        scope="row"
                        className="max-w-md py-2 pr-4 text-left font-normal"
                      >
                        <span
                          className={isCritical ? "text-bad" : "text-paper"}
                        >
                          {requirement.text}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {requirement.priority === "must" ? "Must have" : "Nice to have"}
                          {" · "}
                          {questionCount} question
                          {questionCount === 1 ? "" : "s"}
                          {isCritical ? " · no story" : ""}
                        </span>
                      </th>

                      {stories.map((story) => {
                        const ticked = (links[story.id] ?? []).includes(
                          requirement.id,
                        );
                        return (
                          <td key={story.id} className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={ticked}
                              onChange={() => toggle(story.id, requirement.id)}
                              aria-label={`${story.title} evidences ${requirement.text}`}
                              className="h-4 w-4 cursor-pointer accent-edited"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(report?.unused_story_ids.length ?? 0) > 0 && (
            <p className="mt-6 text-sm text-muted">
              Not used for this role:{" "}
              {report?.unused_story_ids
                .map((id) => stories.find((s) => s.id === id)?.title ?? id)
                .join(", ")}
              . Worth skipping when you rehearse for this one.
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}
