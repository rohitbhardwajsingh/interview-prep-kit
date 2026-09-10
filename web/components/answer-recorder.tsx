"use client";

import { useEffect, useRef, useState } from "react";
import { useVoiceCapture } from "@/lib/use-voice";

/**
 * Where an answer is given.
 *
 * The hard part is not capture, it is nerve. A blank box and a red dot make
 * people rehearse in their head instead of speaking, so this shows the words
 * arriving as they are said: live captions, a running clock, and nothing
 * else. No score, no outline, no hint of a verdict — anything evaluative on
 * screen while someone is mid-sentence changes the answer being measured.
 *
 * Typing is a peer, not a fallback of last resort. It is one click away at
 * all times and identical in every other respect, because a candidate on a
 * train still deserves to practise.
 */

export interface CapturedAnswer {
  transcript: string;
  source: "voice" | "typed";
  spokenSeconds?: number;
}

interface Props {
  /** Seconds a good answer runs for, from the question's category. */
  targetSeconds: [number, number];
  onSubmit(answer: CapturedAnswer): void;
  busy?: boolean;
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * The clock's colour is the only feedback given while speaking, and it is
 * deliberately about time rather than quality: dim until the answer is long
 * enough to be worth giving, then plain, then a warning once it has run past
 * where an interviewer stops listening.
 */
function paceTone(seconds: number, [low, high]: [number, number]): string {
  if (seconds < low * 0.7) return "text-faint";
  if (seconds > high) return "text-warn";
  return "text-paper";
}

export function AnswerRecorder({ targetSeconds, onSubmit, busy = false }: Props) {
  const voice = useVoiceCapture();
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const area = useRef<HTMLTextAreaElement | null>(null);
  const captions = useRef<HTMLDivElement | null>(null);

  // Voice is the default, so a browser that cannot do it must not present a
  // microphone button that does nothing.
  useEffect(() => {
    if (voice.status === "unsupported") setTyping(true);
  }, [voice.status]);

  useEffect(() => {
    if (typing) area.current?.focus();
  }, [typing]);

  // Captions scroll themselves, so the newest words are always the ones
  // being read.
  useEffect(() => {
    const node = captions.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [voice.transcript, voice.interim]);

  const spoken = `${voice.transcript} ${voice.interim}`.trim();
  const words = spoken ? spoken.split(/\s+/).length : 0;

  function submitSpoken() {
    if (!voice.transcript.trim()) return;
    voice.stop();
    onSubmit({
      transcript: voice.transcript.trim(),
      source: "voice",
      spokenSeconds: voice.seconds,
    });
  }

  if (typing) {
    return (
      <div className="animate-fade-in space-y-4">
        <textarea
          ref={area}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          rows={10}
          placeholder="Answer as you would out loud. Write it the way you would say it, not the way you would write it."
          className="field resize-none leading-relaxed"
          onKeyDown={(event) => {
            // Enter is a paragraph break in a spoken answer, so submitting
            // takes the modifier.
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (typed.trim()) onSubmit({ transcript: typed.trim(), source: "typed" });
            }
          }}
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-faint">
            {typed.trim() ? `${typed.trim().split(/\s+/).length} words` : "\u00a0"}
          </p>

          <div className="flex items-center gap-2">
            {voice.supported && (
              <button
                type="button"
                className="btn-bare text-xs"
                onClick={() => {
                  setTyping(false);
                  voice.reset();
                }}
              >
                Speak instead
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={!typed.trim() || busy}
              onClick={() => onSubmit({ transcript: typed.trim(), source: "typed" })}
            >
              Done
              <kbd className="kbd">⌘↵</kbd>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {voice.status === "listening" ? (
        <div className="animate-scale-in space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Three bars rather than a waveform: this needs to say
                  "you are being heard" and nothing more. */}
              <div className="flex items-end gap-0.5" aria-hidden>
                {[0, 1, 2].map((bar) => (
                  <span
                    key={bar}
                    className="w-1 rounded-full bg-accent animate-pulse-line"
                    style={{
                      height: `${8 + bar * 4}px`,
                      animationDelay: `${bar * 180}ms`,
                    }}
                  />
                ))}
              </div>
              <span className="label text-accent">Listening</span>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="tnum text-xs text-faint">{words} words</span>
              <span
                className={`tnum text-2xl font-light tabular-nums ${paceTone(voice.seconds, targetSeconds)}`}
              >
                {clock(voice.seconds)}
              </span>
            </div>
          </div>

          <div
            ref={captions}
            aria-live="polite"
            className="max-h-56 overflow-y-auto rounded-xl border border-line bg-void p-4 text-[15px] leading-relaxed"
          >
            {spoken ? (
              <p>
                {voice.transcript}{" "}
                {/* The phrase still in flight is dimmed, so the candidate can
                    see the recogniser has not settled on it yet. */}
                <span className="text-faint">{voice.interim}</span>
              </p>
            ) : (
              <p className="text-faint">Start talking. Your words will appear here.</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-faint">
              A good answer here runs {targetSeconds[0]}–{targetSeconds[1]} seconds.
            </p>
            <button
              type="button"
              className="btn-primary"
              disabled={!voice.transcript.trim() || busy}
              onClick={submitSpoken}
            >
              Stop and score
              <kbd className="kbd">␣</kbd>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {voice.transcript && voice.status === "stopped" ? (
            <>
              <div className="rounded-xl border border-line bg-void p-4 text-[15px] leading-relaxed">
                {voice.transcript}
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="btn-bare text-xs"
                  onClick={voice.reset}
                >
                  Start again
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() =>
                    onSubmit({
                      transcript: voice.transcript.trim(),
                      source: "voice",
                      spokenSeconds: voice.seconds,
                    })
                  }
                >
                  Score this
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6">
              <button
                type="button"
                className="btn-primary px-6 py-3 text-base"
                onClick={voice.start}
                disabled={!voice.supported}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full bg-white/90"
                  aria-hidden
                />
                Answer out loud
                <kbd className="kbd">␣</kbd>
              </button>

              <button
                type="button"
                className="btn-bare text-xs"
                onClick={() => setTyping(true)}
              >
                {voice.supported
                  ? "Or type it instead"
                  : "Type your answer"}
              </button>
            </div>
          )}
        </div>
      )}

      {voice.error && (
        <p className="rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          {voice.error}
        </p>
      )}
    </div>
  );
}
