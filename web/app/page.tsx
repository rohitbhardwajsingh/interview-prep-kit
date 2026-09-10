import Link from "next/link";

const POINTS = [
  {
    title: "Grounded in the posting, not invented",
    body: "Every question cites the requirement it tests. A must-have with no question is reported rather than hidden, and coverage is checked by code, not claimed by a model.",
  },
  {
    title: "A plan that fits the days you have",
    body: "Two days and fourteen days are different plans, not the same list cut short. The allocation is deterministic, so the same kit always schedules the same way.",
  },
  {
    title: "Your edits survive regeneration",
    body: "Anything you change is marked as yours. Regenerate a section and your work is kept, not overwritten — and if two saves race, you choose what to keep.",
  },
  {
    title: "Evidence Gaps",
    body: "Knowing the answer is not the same as having a story. Record what you have actually done once, and see which must-haves you cannot back up with real experience.",
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim">
        Interview Prep Kit
      </p>

      <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
        Paste a job posting.
        <br />
        Get a study plan you can actually work through.
      </h1>

      <p className="mt-5 max-w-xl text-dim">
        It reads the posting, researches the company from its own site, and
        builds questions, flashcards and a day-by-day schedule — then checks its
        own work before showing you anything.
      </p>

      <div className="mt-8 flex gap-3">
        <Link href="/sign-in" className="btn-primary">
          Get started
        </Link>
        <a
          href="https://github.com"
          className="btn-ghost"
          rel="noreferrer noopener"
        >
          How it works
        </a>
      </div>

      <dl className="mt-16 grid gap-5 sm:grid-cols-2">
        {POINTS.map((point) => (
          <div key={point.title} className="card p-4">
            <dt className="text-sm font-semibold">{point.title}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-dim">
              {point.body}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
