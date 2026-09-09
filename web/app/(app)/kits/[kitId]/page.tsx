"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ConflictDialog, type Conflict } from "@/components/conflict-dialog";
import { Editable } from "@/components/editable";
import { GenerationProgress } from "@/components/generation-progress";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { api, ApiError } from "@/lib/api";
import type { KitDetail } from "@/lib/types";
import { useKit } from "@/lib/use-kit";

type Tab = "plan" | "questions" | "flashcards" | "company";

const TABS: { id: Tab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "questions", label: "Questions" },
  { id: "flashcards", label: "Flashcards" },
  { id: "company", label: "Company" },
];

export default function KitPage() {
  const params = useParams<{ kitId: string }>();
  const kitId = params.kitId;
  const { kit, job, loading, error, apply, refresh, regenerate } = useKit(kitId);
  const [tab, setTab] = useState<Tab>("plan");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * One place where every edit is saved, so version handling and conflict
   * recovery are not reimplemented per field. A 409 is not an error shown to
   * the user, it is a decision handed back to them.
   */
  const save = useCallback(
    async (
      section: "questions" | "flashcards",
      itemId: string,
      field: string,
      value: string,
    ) => {
      if (!kit) return;
      try {
        const body = await api<{ kit: KitDetail; reconciled?: unknown }>(
          `/kits/${kitId}/${section}/${itemId}`,
          {
            method: "PATCH",
            body: { version: kit.version, patch: { [field]: value } },
          },
        );
        apply(body.kit);
        setNotice(null);
      } catch (cause) {
        if (cause instanceof ApiError && cause.isConflict) {
          // Re-read to find out what actually landed, then let the user choose.
          const current = await refresh();
          const theirs =
            current?.kit?.[section].find((item) => item.id === itemId) ?? null;
          setConflict({
            field: `${itemId}.${field}`,
            yours: value,
            theirs:
              (theirs as Record<string, unknown> | null)?.[field]?.toString() ??
              "(removed)",
          });
          // Swallowed deliberately: the dialog is the outcome, not a failure.
          return;
        }
        throw cause;
      }
    },
    [kit, kitId, apply, refresh],
  );

  async function resolveConflict(value: string) {
    if (!conflict || !kit) return;
    const [itemId, field] = conflict.field.split(".");
    const section = kit.kit?.questions.some((q) => q.id === itemId)
      ? "questions"
      : "flashcards";

    setConflict(null);
    try {
      const body = await api<{ kit: KitDetail }>(
        `/kits/${kitId}/${section}/${itemId}`,
        {
          method: "PATCH",
          // Against the version just re-read, so this retry is not stale.
          body: { version: kit.version, patch: { [field as string]: value } },
        },
      );
      apply(body.kit);
      setNotice("Your version was saved.");
    } catch {
      setNotice("That could not be saved. Reload and try once more.");
    }
  }

  async function togglePin(
    section: "questions" | "flashcards",
    itemId: string,
    pinned: boolean,
  ) {
    if (!kit) return;
    try {
      const body = await api<{ kit: KitDetail }>(
        `/kits/${kitId}/${section}/${itemId}/pin`,
        { method: "PUT", body: { version: kit.version, pinned } },
      );
      apply(body.kit);
    } catch (cause) {
      setNotice(
        cause instanceof ApiError ? cause.message : "Could not change that",
      );
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (error || !kit) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p role="alert" className="text-sm text-bad">
          {error ?? "This kit could not be loaded"}
        </p>
        <Link href="/kits" className="btn-ghost mt-4">
          Back to kits
        </Link>
      </main>
    );
  }

  const building = kit.status === "generating";
  const body = kit.kit;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/kits" className="text-sm text-muted hover:text-paper">
        ← Kits
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{kit.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {kit.request.days} day{kit.request.days === 1 ? "" : "s"} ·{" "}
            <a
              href={kit.request.companyUrl}
              rel="noreferrer noopener nofollow"
              className="hover:text-paper"
            >
              {kit.request.companyUrl}
            </a>
          </p>
        </div>

        <div className="flex gap-2">
          <Link href={`/kits/${kitId}/evidence`} className="btn-ghost">
            Evidence gaps
          </Link>
          <Link href={`/kits/${kitId}/practice`} className="btn-primary">
            Practise
          </Link>
        </div>
      </header>

      {notice && (
        <p className="mt-4 rounded-lg border border-edited/40 bg-edited/10 px-3 py-2 text-sm text-edited">
          {notice}
        </p>
      )}

      {/* While a run is in flight the progress view replaces the kit, because
          a half-written kit is not something anyone should be reading. */}
      {(building || (!body && kit.status !== "ready")) && (
        <section className="card mt-6 p-5">
          <h2 className="text-sm font-semibold">
            {building ? "Building your kit" : "This kit has not been built yet"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {building
              ? "This takes a minute or two. You can leave this page — it keeps going."
              : "Nothing was generated for this kit."}
          </p>

          <div className="mt-5">
            <GenerationProgress job={job} />
          </div>

          {!building && (
            <button
              type="button"
              className="btn-primary mt-5"
              onClick={() => void regenerate()}
            >
              {kit.status === "failed" ? "Try again" : "Build it"}
            </button>
          )}
        </section>
      )}

      {body && !building && (
        <>
          {body.coverage.uncovered_requirement_ids.length > 0 && (
            <p className="mt-6 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
              {body.coverage.uncovered_requirement_ids.length} requirement
              {body.coverage.uncovered_requirement_ids.length === 1 ? "" : "s"}{" "}
              could not be turned into a question after{" "}
              {body.coverage.passes} pass
              {body.coverage.passes === 1 ? "" : "es"}. They are marked below.
            </p>
          )}

          <nav className="mt-6 flex gap-1 border-b border-ink-line">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? "true" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
                  tab === item.id
                    ? "border-edited text-paper"
                    : "border-transparent text-muted hover:text-paper"
                }`}
              >
                {item.label}
                {item.id === "questions" && (
                  <span className="ml-1.5 text-xs text-muted">
                    {body.questions.length}
                  </span>
                )}
                {item.id === "flashcards" && (
                  <span className="ml-1.5 text-xs text-muted">
                    {body.flashcards.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-6">
            {tab === "plan" && <PlanTab kit={body} />}

            {tab === "questions" && (
              <ul className="space-y-3">
                {body.questions.map((question) => (
                  <li key={question.id} className="card p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-muted">
                        {question.id}
                      </span>
                      <span className="chip border-ink-line text-muted">
                        {question.category}
                      </span>
                      <span className="chip border-ink-line text-muted">
                        difficulty {question.difficulty}
                      </span>
                      <ProvenanceBadge state={question.provenance} />

                      <button
                        type="button"
                        onClick={() =>
                          void togglePin(
                            "questions",
                            question.id,
                            question.provenance !== "pinned",
                          )
                        }
                        className="ml-auto text-xs text-muted hover:text-pinned"
                      >
                        {question.provenance === "pinned" ? "Unpin" : "Pin"}
                      </button>
                    </div>

                    <div className="font-medium">
                      <Editable
                        label={`Question ${question.id}`}
                        value={question.prompt}
                        multiline
                        onSave={(next) =>
                          save("questions", question.id, "prompt", next)
                        }
                      />
                    </div>

                    <details className="mt-3 group">
                      <summary className="cursor-pointer text-xs text-muted hover:text-paper">
                        Answer outline
                      </summary>
                      <div className="mt-2 text-sm text-muted">
                        <Editable
                          label={`Answer outline for ${question.id}`}
                          value={question.answer_outline}
                          multiline
                          onSave={(next) =>
                            save(
                              "questions",
                              question.id,
                              "answer_outline",
                              next,
                            )
                          }
                        />
                      </div>
                    </details>

                    <p className="mt-3 flex flex-wrap gap-1.5">
                      {question.requirement_ids.map((id) => (
                        <span
                          key={id}
                          title={
                            body.role.requirements.find((r) => r.id === id)?.text
                          }
                          className="chip border-ink-line text-muted"
                        >
                          {id}
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {tab === "flashcards" && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {body.flashcards.map((card) => (
                  <li key={card.id} className="card p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted">
                        {card.id}
                      </span>
                      <ProvenanceBadge state={card.provenance} />
                      <button
                        type="button"
                        onClick={() =>
                          void togglePin(
                            "flashcards",
                            card.id,
                            card.provenance !== "pinned",
                          )
                        }
                        className="ml-auto text-xs text-muted hover:text-pinned"
                      >
                        {card.provenance === "pinned" ? "Unpin" : "Pin"}
                      </button>
                    </div>

                    <div className="text-sm font-medium">
                      <Editable
                        label={`Front of ${card.id}`}
                        value={card.front}
                        multiline
                        onSave={(next) =>
                          save("flashcards", card.id, "front", next)
                        }
                      />
                    </div>
                    <div className="mt-2 text-sm text-muted">
                      <Editable
                        label={`Back of ${card.id}`}
                        value={card.back}
                        multiline
                        onSave={(next) =>
                          save("flashcards", card.id, "back", next)
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {tab === "company" && <CompanyTab kit={body} />}
          </div>
        </>
      )}

      {conflict && (
        <ConflictDialog
          conflict={conflict}
          onResolve={(value) => void resolveConflict(value)}
          onCancel={() => {
            setConflict(null);
            setNotice("Kept the saved version. Your text was not applied.");
          }}
        />
      )}
    </main>
  );
}

function PlanTab({ kit }: { kit: NonNullable<KitDetail["kit"]> }) {
  const byId = new Map(kit.questions.map((question) => [question.id, question]));

  return (
    <ol className="space-y-3">
      {kit.schedule.days.map((day) => (
        <li key={day.day} className="card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-medium">
              Day {day.day}
              <span className="ml-2 text-sm font-normal text-muted">
                {day.focus}
              </span>
            </h3>
            <span className="shrink-0 font-mono text-xs text-muted">
              {day.minutes} min
            </span>
          </div>

          {day.question_ids.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Review day — no new material.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {day.question_ids.map((id) => (
                <li key={id} className="flex gap-2 text-sm">
                  <span className="font-mono text-[11px] text-muted">{id}</span>
                  <span className="min-w-0 truncate text-muted">
                    {byId.get(id)?.prompt ?? "(missing)"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function CompanyTab({ kit }: { kit: NonNullable<KitDetail["kit"]> }) {
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h3 className="text-sm font-semibold">What they do</h3>
        <p className="mt-2 text-sm text-muted">
          {kit.company_brief.what_they_do || "Nothing readable was found."}
        </p>
      </section>

      <section className="card p-4">
        <h3 className="text-sm font-semibold">Summary</h3>
        <p className="mt-2 text-sm text-muted">
          {kit.company_brief.summary || "Nothing readable was found."}
        </p>
      </section>

      <section className="card p-4">
        <h3 className="text-sm font-semibold">Requirements found</h3>
        <ul className="mt-2 space-y-1.5">
          {kit.role.requirements.map((requirement) => (
            <li key={requirement.id} className="flex items-start gap-2 text-sm">
              <span
                className={`chip mt-0.5 shrink-0 ${
                  requirement.priority === "must"
                    ? "border-paper/30 text-paper"
                    : "border-ink-line text-muted"
                }`}
              >
                {requirement.priority}
              </span>
              <span
                className={
                  kit.coverage.uncovered_requirement_ids.includes(requirement.id)
                    ? "text-warn"
                    : "text-muted"
                }
              >
                {requirement.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Sources are shown rather than summarised away, because a brief the
          user cannot check is a brief they cannot trust. */}
      <section className="card p-4">
        <h3 className="text-sm font-semibold">Pages read</h3>
        <ul className="mt-2 space-y-1">
          {kit.source.pages_used.map((url) => (
            <li key={url}>
              <a
                href={url}
                rel="noreferrer noopener nofollow"
                className="break-all font-mono text-xs text-muted hover:text-edited"
              >
                {url}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
