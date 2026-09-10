"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useCommands, type Command } from "@/components/command-palette";
import { ConflictDialog } from "@/components/conflict-dialog";
import { useKitContext } from "@/components/kit-provider";

interface Section {
  segment: string;
  label: string;
  /** Single keystroke that jumps here from anywhere in the kit. */
  key: string;
}

const SECTIONS: Section[] = [
  { segment: "", label: "Today", key: "t" },
  { segment: "plan", label: "Plan", key: "l" },
  { segment: "questions", label: "Questions", key: "q" },
  { segment: "practice", label: "Practise", key: "p" },
  { segment: "mock", label: "Mock", key: "m" },
  { segment: "calibration", label: "Calibration", key: "k" },
  { segment: "evidence", label: "Evidence", key: "e" },
  { segment: "company", label: "Company", key: "c" },
];

function hrefFor(kitId: string, segment: string): string {
  return segment === "" ? `/kits/${kitId}` : `/kits/${kitId}/${segment}`;
}

/**
 * The frame every kit screen sits in.
 *
 * Sections are routes rather than tabs so each one is addressable, survives
 * a refresh, and can be reached by a single keystroke. Someone preparing for
 * an interview visits these dozens of times in a week, and making them
 * reach for a mouse each time is the difference between a tool and a chore.
 */
export function KitShell({ children }: { children: React.ReactNode }) {
  const { kit, kitId, conflict, resolveConflict, dismissConflict, notice } =
    useKitContext();
  const pathname = usePathname();
  const router = useRouter();

  const commands = useMemo<Command[]>(
    () => [
      ...SECTIONS.map((section) => ({
        id: `kit-${section.segment || "today"}`,
        group: "This kit",
        label: section.label,
        shortcut: section.key.toUpperCase(),
        run: () => router.push(hrefFor(kitId, section.segment)),
      })),
      {
        id: "kit-panic",
        group: "This kit",
        label: "Panic mode",
        hint: "everything on one page",
        run: () => router.push(`/kits/${kitId}/panic`),
      },
    ],
    [kitId, router],
  );

  useCommands(commands, [commands]);

  // Single-key navigation, suppressed whenever the user is actually typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) {
        return;
      }

      const section = SECTIONS.find((entry) => entry.key === event.key);
      if (!section) return;

      event.preventDefault();
      router.push(hrefFor(kitId, section.segment));
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kitId, router]);

  const active =
    SECTIONS.filter(
      (section) => pathname === hrefFor(kitId, section.segment),
    )[0]?.segment ?? null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href="/kits"
          className="text-sm text-faint transition hover:text-paper"
        >
          ← Kits
        </Link>
        <span className="text-faint">/</span>
        <h1 className="min-w-0 truncate text-sm font-medium text-paper">
          {kit?.title ?? "Loading…"}
        </h1>
      </div>

      <nav
        aria-label="Kit sections"
        className="mt-4 flex gap-1 overflow-x-auto border-b border-line pb-px"
      >
        {SECTIONS.map((section) => {
          const isActive = active === section.segment;
          return (
            <Link
              key={section.segment}
              href={hrefFor(kitId, section.segment)}
              aria-current={isActive ? "page" : undefined}
              className={`group -mb-px flex shrink-0 items-center gap-2
                border-b-2 px-3 py-2 text-sm transition ${
                  isActive
                    ? "border-accent text-paper"
                    : "border-transparent text-dim hover:text-paper"
                }`}
            >
              {section.label}
              <kbd
                className="kbd opacity-0 transition group-hover:opacity-100"
                aria-hidden="true"
              >
                {section.key}
              </kbd>
            </Link>
          );
        })}
      </nav>

      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-edited/40 bg-edited/10 px-3
            py-2 text-sm text-edited animate-fade-up"
        >
          {notice}
        </p>
      )}

      <div className="mt-6">{children}</div>

      {conflict && (
        <ConflictDialog
          conflict={conflict}
          onResolve={(value) => void resolveConflict(value)}
          onCancel={dismissConflict}
        />
      )}
    </div>
  );
}
