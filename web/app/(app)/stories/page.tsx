"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Story } from "@/lib/types";

const EMPTY = { title: "", situation: "", action: "", result: "", tags: "" };

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<{ stories: Story[] }>("/stories", { signal: controller.signal })
      .then((body) => setStories(body.stories))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load");
      });
    return () => controller.abort();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      title: draft.title,
      situation: draft.situation,
      action: draft.action,
      result: draft.result,
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    try {
      if (editingId) {
        const body = await api<{ story: Story }>(`/stories/${editingId}`, {
          method: "PUT",
          body: payload,
        });
        setStories((current) =>
          (current ?? []).map((story) =>
            story.id === editingId ? body.story : story,
          ),
        );
      } else {
        const body = await api<{ story: Story }>("/stories", {
          method: "POST",
          body: payload,
        });
        setStories((current) => [body.story, ...(current ?? [])]);
      }
      setDraft(EMPTY);
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/stories/${id}`, { method: "DELETE" });
      setStories((current) => (current ?? []).filter((story) => story.id !== id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Story bank</h1>
      <p className="mt-1 max-w-2xl text-sm text-dim">
        The things you have actually done. Record them once here and every kit
        can check its requirements against them — because knowing an answer and
        having a story are not the same thing.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
            >
              {error}
            </p>
          )}

          {stories?.length === 0 && (
            <div className="card p-6 text-center">
              <p className="font-medium">No stories yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-dim">
                Most people have six or seven that cover almost everything.
                Start with the projects you would mention unprompted.
              </p>
            </div>
          )}

          <ul className="space-y-3">
            {stories?.map((story) => (
              <li key={story.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium">{story.title}</h2>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="text-xs text-dim hover:text-paper"
                      onClick={() => {
                        setEditingId(story.id);
                        setDraft({
                          title: story.title,
                          situation: story.situation,
                          action: story.action,
                          result: story.result,
                          tags: story.tags.join(", "),
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-xs text-dim hover:text-bad"
                      onClick={() => void remove(story.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {story.tags.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {story.tags.map((tag) => (
                      <span key={tag} className="chip border-line text-dim">
                        {tag}
                      </span>
                    ))}
                  </p>
                )}

                <dl className="mt-3 space-y-2 text-sm">
                  {(
                    [
                      ["Situation", story.situation],
                      ["What you did", story.action],
                      ["Result", story.result],
                    ] as const
                  )
                    .filter(([, text]) => text)
                    .map(([label, text]) => (
                      <div key={label}>
                        <dt className="text-[11px] uppercase tracking-wide text-dim">
                          {label}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-dim">
                          {text}
                        </dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="card h-fit space-y-3 p-4 lg:sticky lg:top-20">
          <h2 className="font-medium">
            {editingId ? "Edit story" : "Add a story"}
          </h2>

          <div>
            <label htmlFor="title" className="mb-1 block text-xs text-dim">
              What would you call it?
            </label>
            <input
              id="title"
              required
              className="field"
              placeholder="Cut checkout latency by 60%"
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </div>

          {(
            [
              ["situation", "Situation", "What was going on?"],
              ["action", "What you did", "Your part specifically, not the team's"],
              ["result", "Result", "Ideally a number you can defend"],
            ] as const
          ).map(([key, label, hint]) => (
            <div key={key}>
              <label htmlFor={key} className="mb-1 block text-xs text-dim">
                {label}
              </label>
              <textarea
                id={key}
                rows={3}
                className="field"
                placeholder={hint}
                value={draft[key]}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </div>
          ))}

          <div>
            <label htmlFor="tags" className="mb-1 block text-xs text-dim">
              Skills it shows
            </label>
            <input
              id="tags"
              className="field"
              placeholder="postgres, profiling, incident response"
              value={draft.tags}
              onChange={(event) =>
                setDraft({ ...draft, tags: event.target.value })
              }
            />
            <p className="mt-1 text-[11px] text-dim">Comma separated.</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? "Saving…" : editingId ? "Save changes" : "Add story"}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setEditingId(null);
                  setDraft(EMPTY);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
