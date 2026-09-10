"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speech capture for practising out loud.
 *
 * Interviews are spoken, and an answer typed at a keyboard is a different
 * skill from one delivered under a stranger's gaze. Typing also silently
 * removes the two failure modes worth catching — rambling and filler — so a
 * typed-only practice mode would flatter the candidate exactly where they
 * need not to be flattered.
 *
 * Built on the browser's own recogniser rather than a server round trip.
 * That decision buys live captions, which turn out to matter more than
 * accuracy: watching your own words appear is what makes a person notice
 * they have said "basically" four times.
 *
 * Every path here degrades to typing. Support is uneven, microphone
 * permission is refusable, and a rejected prompt must not be a dead end.
 */

/**
 * The vendor-prefixed shape, declared locally because it is absent from the
 * DOM lib and only these five members are used.
 */
interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}

interface RecognitionEvent extends Event {
  resultIndex: number;
  results: {
    readonly length: number;
    [index: number]: RecognitionResult;
  };
}

interface RecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recogniser(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Why voice is unavailable, in words that tell the user what to do next.
 * "not-allowed" is the one that matters: it is recoverable, and a generic
 * failure message would leave someone stuck at a permission prompt.
 */
const REASONS: Readonly<Record<string, string>> = {
  "not-allowed":
    "Microphone access was blocked. Allow it in your browser's address bar, or type your answer instead.",
  "service-not-allowed":
    "Your browser would not start speech recognition. Type your answer instead.",
  network: "Speech recognition needs a connection. Type your answer instead.",
  "audio-capture":
    "No microphone was found. Type your answer instead.",
};

export type VoiceStatus = "idle" | "listening" | "stopped" | "unsupported";

export interface VoiceCapture {
  status: VoiceStatus;
  supported: boolean;
  /** Everything recognised as settled. */
  transcript: string;
  /** The phrase still being spoken, for live captions. */
  interim: string;
  /** Wall-clock seconds of speaking, which the pacing measurement needs. */
  seconds: number;
  error: string | null;
  start(): void;
  stop(): void;
  reset(): void;
}

export function useVoiceCapture(): VoiceCapture {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const startedAt = useRef<number | null>(null);
  /** Set when we stopped on purpose, to tell a deliberate end from a drop. */
  const stopping = useRef(false);

  const supported = recogniser() !== null;

  useEffect(() => {
    if (!supported) setStatus("unsupported");
  }, [supported]);

  // The clock is wall-clock rather than a tick count, so a throttled
  // background tab does not under-report how long someone spoke.
  useEffect(() => {
    if (status !== "listening") return;

    const timer = window.setInterval(() => {
      if (startedAt.current !== null) {
        setSeconds((Date.now() - startedAt.current) / 1000);
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [status]);

  const stop = useCallback(() => {
    stopping.current = true;
    recognition.current?.stop();
    if (startedAt.current !== null) {
      setSeconds((Date.now() - startedAt.current) / 1000);
    }
    setStatus((current) => (current === "listening" ? "stopped" : current));
  }, []);

  const start = useCallback(() => {
    const Constructor = recogniser();
    if (!Constructor) {
      setStatus("unsupported");
      return;
    }

    setError(null);
    setInterim("");
    stopping.current = false;

    const instance = new Constructor();
    // Continuous, because an interview answer contains pauses and the
    // default one-phrase mode would cut the candidate off mid-thought.
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = navigator.language || "en-US";

    instance.onresult = (event) => {
      let settled = "";
      let pending = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal) settled += text;
        else pending += text;
      }

      if (settled) {
        setTranscript((current) => `${current}${current ? " " : ""}${settled.trim()}`);
      }
      setInterim(pending);
    };

    instance.onerror = (event) => {
      // "no-speech" fires on an ordinary pause and is not worth alarming
      // anyone about; the others end the attempt.
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(REASONS[event.error] ?? "Speech recognition stopped unexpectedly.");
      setStatus("stopped");
    };

    instance.onend = () => {
      setInterim((pending) => {
        // A phrase left mid-flight when recognition ended is still something
        // the candidate said, so it is kept rather than dropped.
        if (pending.trim()) {
          setTranscript((current) => `${current}${current ? " " : ""}${pending.trim()}`);
        }
        return "";
      });

      if (stopping.current) return;

      // Chrome ends the session on its own after a silence. Restarting keeps
      // a thinking pause from silently ending the answer.
      try {
        instance.start();
      } catch {
        setStatus("stopped");
      }
    };

    recognition.current = instance;
    startedAt.current = Date.now();
    setSeconds(0);

    try {
      instance.start();
      setStatus("listening");
    } catch {
      setError("Speech recognition would not start. Type your answer instead.");
      setStatus("stopped");
    }
  }, []);

  const reset = useCallback(() => {
    stopping.current = true;
    recognition.current?.abort();
    recognition.current = null;
    startedAt.current = null;
    setTranscript("");
    setInterim("");
    setSeconds(0);
    setError(null);
    setStatus(supported ? "idle" : "unsupported");
  }, [supported]);

  // A recogniser left running after the component goes holds the microphone
  // open, which shows an indicator the user cannot explain or dismiss.
  useEffect(() => {
    return () => {
      stopping.current = true;
      recognition.current?.abort();
    };
  }, []);

  return {
    status,
    supported,
    transcript,
    interim,
    seconds: Math.round(seconds),
    error,
    start,
    stop,
    reset,
  };
}
