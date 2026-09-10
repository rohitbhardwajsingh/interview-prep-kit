"use client";

import Link from "next/link";
import { useKitContext } from "@/components/kit-provider";

/**
 * The morning of.
 *
 * Nobody learns anything new in the hour before an interview, so this screen
 * refuses to offer any. It is a crib sheet: the must-haves, the line you
 * intend to say about each, and the two or three facts about the company
 * that stop you sounding like you have not read anything. Everything is on
 * one page, in reading order, and it prints.
 */
export default function PanicPage() {
  const { kit } = useKitContext();
  const body = kit?.kit;

  if (!body) {
    return <p className="text-sm text-dim">This kit has not been built yet.</p>;
  }

  const musts = body.role.requirements.filter(
    (requirement) => requirement.priority === "must",
  );
  const questionFor = (requirementId: string) =>
    body.questions.find((question) =>
      question.requirement_ids.includes(requirementId),
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-medium">Before you walk in</h1>
          <p className="mt-1 text-sm text-dim">
            One page. Read it once, then close the laptop.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-ghost"
        >
          Print
        </button>
      </div>

      <article className="space-y-8 print:text-black">
        <section>
          <h2 className="label print:text-black">Who you are talking to</h2>
          <p className="mt-2 text-lg font-medium">
            {body.source.company} — {body.role.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-dim print:text-black">
            {body.company_brief.what_they_do}
          </p>
        </section>

        <section>
          <h2 className="label print:text-black">
            The {musts.length} things they said they need
          </h2>
          <ol className="mt-3 space-y-4">
            {musts.map((requirement, index) => {
              const question = questionFor(requirement.id);
              return (
                <li
                  key={requirement.id}
                  className="border-l-2 border-line pl-4 print:border-black"
                >
                  <p className="font-medium">
                    <span className="tnum mr-2 text-faint">{index + 1}</span>
                    {requirement.text}
                  </p>
                  {question ? (
                    <p className="mt-1.5 text-sm text-dim print:text-black">
                      {question.answer_outline}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm text-warn">
                      Nothing in this kit prepares you for this one. Have a
                      story ready.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {body.flashcards.length > 0 && (
          <section>
            <h2 className="label print:text-black">Facts worth having</h2>
            <dl className="mt-3 space-y-2.5">
              {body.flashcards.map((card) => (
                <div key={card.id} className="text-sm">
                  <dt className="font-medium">{card.front}</dt>
                  <dd className="text-dim print:text-black">{card.back}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="print:hidden">
          <h2 className="label">And then stop</h2>
          <p className="mt-2 text-sm text-dim">
            Cramming in the last hour reliably makes recall worse. Go for a
            walk.
          </p>
          <Link href={`/kits/${kit?.id}`} className="btn-ghost mt-4">
            Back to today
          </Link>
        </section>
      </article>
    </div>
  );
}
