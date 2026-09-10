"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface Command {
  id: string;
  label: string;
  /** Groups the list, and is searched alongside the label. */
  group: string;
  hint?: string;
  /** Shown right-aligned, e.g. "P" for a single-key shortcut. */
  shortcut?: string;
  run: () => void;
}

interface PaletteApi {
  open: () => void;
  close: () => void;
  /**
   * Publishes commands for as long as the caller is mounted. Pages own the
   * verbs that only make sense while you are looking at them.
   */
  register: (commands: Command[]) => void;
}

const PaletteContext = createContext<PaletteApi | null>(null);

/**
 * Matches the way people actually type into these things: initials, or a
 * run of letters from anywhere in the label. "rq" finds "Rebuild questions"
 * and so does "buildq". Consecutive hits and word beginnings score higher,
 * so the obvious answer sorts first.
 */
function score(query: string, text: string): number {
  if (query === "") return 1;

  const needle = query.toLowerCase();
  const hay = text.toLowerCase();
  let at = 0;
  let points = 0;
  let streak = 0;

  for (const character of needle) {
    const found = hay.indexOf(character, at);
    if (found === -1) return 0;

    const startsAWord = found === 0 || hay[found - 1] === " ";
    streak = found === at ? streak + 1 : 0;
    points += 1 + streak + (startsAWord ? 3 : 0);
    at = found + 1;
  }

  // Shorter labels win ties, so "Plan" beats "Planned questions" for "plan".
  return points + 10 / hay.length;
}

export function useCommandPalette(): PaletteApi {
  const api = useContext(PaletteContext);
  if (!api) throw new Error("useCommandPalette used outside its provider");
  return api;
}

/** Publishes a set of commands while the calling component is mounted. */
export function useCommands(commands: Command[], deps: unknown[]): void {
  const { register } = useCommandPalette();
  // The command list is rebuilt every render by its owner, so the caller
  // states what it actually depends on rather than us diffing closures.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => register(commands), deps);
}

export function CommandPaletteProvider({
  children,
  base,
}: {
  children: React.ReactNode;
  /** Always available, wherever you are. */
  base: Command[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [scoped, setScoped] = useState<Command[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const register = useCallback((commands: Command[]) => {
    setScoped(commands);
    return () => setScoped([]);
  }, []);

  const api = useMemo<PaletteApi>(
    () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      register,
    }),
    [register],
  );

  const results = useMemo(() => {
    const all = [...scoped, ...base];
    return all
      .map((command) => ({
        command,
        rank: score(query, `${command.label} ${command.group}`),
      }))
      .filter((entry) => entry.rank > 0)
      .sort((left, right) => right.rank - left.rank)
      .slice(0, 12)
      .map((entry) => entry.command);
  }, [query, scoped, base]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((was) => !was);
        setQuery("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keeps the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function onInputKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
      event.preventDefault();
      setCursor((at) => (at + 1) % Math.max(1, results.length));
      return;
    }
    if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
      event.preventDefault();
      setCursor((at) => (at - 1 + results.length) % Math.max(1, results.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[cursor];
      if (chosen) {
        setIsOpen(false);
        chosen.run();
      }
    }
  }

  return (
    <PaletteContext.Provider value={api}>
      {children}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center
            bg-void/70 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
          onMouseDown={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-xl overflow-hidden rounded-2xl border
              border-line-strong bg-surface shadow-float animate-scale-in"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKey}
              placeholder="Where to, or what next?"
              aria-label="Search commands"
              className="w-full border-b border-line bg-transparent px-5 py-4
                text-base text-paper outline-none placeholder:text-faint"
            />

            <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-faint">
                  Nothing matches “{query}”.
                </p>
              )}

              {results.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  data-active={index === cursor}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => {
                    setIsOpen(false);
                    command.run();
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3
                    py-2.5 text-left text-sm transition ${
                      index === cursor
                        ? "bg-accent-soft text-paper"
                        : "text-dim hover:bg-surface-high"
                    }`}
                >
                  <span className="w-16 shrink-0 truncate text-[11px] uppercase
                    tracking-wide text-faint">
                    {command.group}
                  </span>
                  <span className="flex-1 truncate">
                    {command.label}
                    {command.hint && (
                      <span className="ml-2 text-xs text-faint">
                        {command.hint}
                      </span>
                    )}
                  </span>
                  {command.shortcut && (
                    <kbd className="kbd">{command.shortcut}</kbd>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-line px-5
              py-2.5 text-[11px] text-faint">
              <span>
                <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> move
              </span>
              <span>
                <kbd className="kbd">↵</kbd> run
              </span>
              <span>
                <kbd className="kbd">esc</kbd> close
              </span>
            </div>
          </div>
        </div>
      )}
    </PaletteContext.Provider>
  );
}
