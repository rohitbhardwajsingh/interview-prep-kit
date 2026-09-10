"use client";

import { useKitContext } from "@/components/kit-provider";

export default function CompanyPage() {
  const { kit } = useKitContext();
  const body = kit?.kit;

  if (!body) {
    return <p className="text-sm text-dim">This kit has not been built yet.</p>;
  }

  return (
    <div className="stagger space-y-4">
      <section className="card p-6" style={{ "--i": 0 } as React.CSSProperties}>
        <h2 className="label">What they do</h2>
        <p className="mt-3 text-sm leading-relaxed text-dim">
          {body.company_brief.what_they_do || "Nothing readable was found."}
        </p>
      </section>

      <section className="card p-6" style={{ "--i": 1 } as React.CSSProperties}>
        <h2 className="label">Summary</h2>
        <p className="mt-3 text-sm leading-relaxed text-dim">
          {body.company_brief.summary || "Nothing readable was found."}
        </p>
      </section>

      <section className="card p-6" style={{ "--i": 2 } as React.CSSProperties}>
        <h2 className="label">Requirements found</h2>
        <ul className="mt-3 space-y-2">
          {body.role.requirements.map((requirement) => {
            const uncovered = body.coverage.uncovered_requirement_ids.includes(
              requirement.id,
            );
            return (
              <li
                key={requirement.id}
                className="flex items-start gap-2.5 text-sm"
              >
                <span
                  className={`chip mt-0.5 shrink-0 ${
                    requirement.priority === "must"
                      ? "border-paper/30 text-paper"
                      : "border-line text-faint"
                  }`}
                >
                  {requirement.priority}
                </span>
                <span className={uncovered ? "text-warn" : "text-dim"}>
                  {requirement.text}
                  {uncovered && (
                    <span className="ml-2 text-xs">
                      (no question covers this)
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Sources are shown rather than summarised away, because a brief the
          user cannot check is a brief they cannot trust. */}
      <section className="card p-6" style={{ "--i": 3 } as React.CSSProperties}>
        <h2 className="label">Pages read</h2>
        <ul className="mt-3 space-y-1.5">
          {body.source.pages_used.map((url) => (
            <li key={url}>
              <a
                href={url}
                rel="noreferrer noopener nofollow"
                className="break-all font-mono text-xs text-faint transition
                  hover:text-edited"
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
