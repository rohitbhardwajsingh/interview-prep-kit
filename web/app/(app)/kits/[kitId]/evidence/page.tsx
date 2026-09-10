"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  EvidenceLink,
  EvidenceReport,
  KitDetail,
  Story,
} from "@/lib/types";

type Links = Record<string, string[]>;

function toRecord(links: EvidenceLink[]): Links {
  return Object.fromEntries(
    links.map((link) => [link.storyId, link.requirementIds]),
  );
}

function toList(links: Links): EvidenceLink[] {
  return Object.entries(links)
    .filter(([, requirementIds]) => requirementIds.length > 0)
    .map(([storyId, requirementIds]) => ({ storyId, requirementIds }));
}

export default function EvidencePage() {
  const { kitId } = useParams<{ kitId: string }>();
  const [kit, setKit] = useState<KitDetail | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [links, setLinks] = useState<Links>({});
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The kit, the stories and whatever links were saved last time, in one
  // pass. The links come back from the server so the audit follows the user
  // between machines rather than living in one browser.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ kit: KitDetail }>(`/kits/${kitId}`, { signal: controller.signal }),
      api<{ stories: Story[] }>("/stories", { signal: controller.signal }),
      api<{ links: EvidenceLink[]; report: EvidenceReport }>(
        `/kits/${kitId}/evidence`,
        { signal: controller.signal },
      ),
    ])
      .then(([kitBody, storyBody, evidenceBody]) => {
        setKit(kitBody.kit);
        setStories(storyBody.stories);
        setLinks(toRecord(evidenceBody.links));
        setReport(evidenceBody.report);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      });
    return () => controller.abort();
  }, [kitId]);

  /**
   * Saves and re-audits in the same call. The verdict always comes back from
   * the server's checker rather than being recomputed here, so the audit the
   * user reads is the same one the readiness score is built on.
   */
  const save = useCallback(
    async (next: Links) => {
      try {
        const body = await api<{ report: EvidenceReport }>(
          `/kits/${kitId}/evidence`,
          { method: "PUT", body: { links: toList(next) } },
        );
        setReport(body.report);
        setError(null);
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "Could not save");
      }
    },
    [kitId],
  );

  function toggle(storyId: string, requirementId: string) {
    const owned = links[storyId] ?? [];
    const next = {
      ...links,
      [storyId]: owned.includes(requirementId)
        ? owned.filter((id) => id !== requirementId)
        : [...owned, requirementId],
    };
    // Applied immediately and reconciled by the response: a checkbox that
    // waits for a round trip feels broken at this density.
    setLinks(next);
    void save(next);
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
        <p className="text-sm text-dim">
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
      <Link href={`/kits/${kitId}`} className="text-sm text-dim hover:text-paper">
        ← {kit.title}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Evidence gaps
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-dim">
        Tick the stories that genuinely back each requirement. What is left is
        what you will struggle to answer with anything concrete.
      </p>

      {stories.length === 0 ? (
        <div className="card mt-8 p-6 text-center">
          <p className="font-medium">Your story bank is empty</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-dim">
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
                <tr className="border-b border-line text-left">
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
                        className="block max-w-[7rem] truncate text-xs text-dim"
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
                      className="border-b border-line/50"
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
                        <span className="mt-0.5 block text-[11px] text-dim">
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
            <p className="mt-6 text-sm text-dim">
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
      <p className="text-xs text-dim">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-dim">{hint}</p>}
    </div>
  );
}
