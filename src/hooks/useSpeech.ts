import { useCallback, useEffect, useRef, useState } from "react";

// ─── Local type shims for Web Speech API ──────────────────────────────────
interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResultItem[];
}
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  _lastTranscript?: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
    | SpeechRecognitionConstructor
    | undefined;
}

// ─── Speech Recognition (STT) ──────────────────────────────────────────────

export type SpeechRecognitionStatus = "idle" | "listening" | "error" | "unsupported";

interface UseSpeechRecognitionOptions {
  /**
   * Called with the final transcript each time a recognition session ends.
   * The component decides whether to auto-send or just append to the draft.
   */
  onEnd: (transcript: string) => void;
  lang?: string;
}

export function useSpeechRecognition({
  onEnd,
  lang = "it-IT",
}: UseSpeechRecognitionOptions) {
  const [status, setStatus] = useState<SpeechRecognitionStatus>(() =>
    getSpeechRecognition() ? "idle" : "unsupported",
  );
  // Expose last interim transcript so the component can show it live
  const [interimTranscript, setInterimTranscript] = useState("");

  const recRef = useRef<SpeechRecognitionInstance | null>(null);

  const start = useCallback(() => {
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      setStatus("unsupported");
      return;
    }

    const rec = new SpeechRec();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (event) => {
      const list = event.results;
      const last = list[list.length - 1];
      const transcript = last[0].transcript.trim();
      rec._lastTranscript = transcript;
      setInterimTranscript(transcript);
    };

    rec.onerror = () => {
      setStatus("error");
      setInterimTranscript("");
      recRef.current = null;
    };

    rec.onend = () => {
      const transcript = recRef.current?._lastTranscript ?? "";
      setStatus("idle");
      setInterimTranscript("");
      recRef.current = null;
      if (transcript) {
        onEnd(transcript);
      }
    };

    recRef.current = rec;
    rec.start();
    setStatus("listening");
  }, [lang, onEnd]);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
    };
  }, []);

  return { status, interimTranscript, start, stop };
}

// ─── Text-to-Speech (TTS) ──────────────────────────────────────────────────

export type TtsStatus = "idle" | "speaking" | "unsupported";

export interface UseTtsOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
}

/**
 * Strip markdown-ish syntax so the TTS doesn't read asterisks and backticks.
 * Split on sentence-ending punctuation.
 */
function splitIntoSentences(text: string): string[] {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " codice ")
    .replace(/`[^`\n]+`/g, "")
    .replace(/^\s*#+\s+/gm, "")
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

  return stripped
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

export function useTts({ lang = "it-IT", rate = 1.0, pitch = 1.0 }: UseTtsOptions = {}) {
  const supported =
    typeof window !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";

  const [status, setStatus] = useState<TtsStatus>(supported ? "idle" : "unsupported");
  const [enabled, setEnabled] = useState(false);

  const queueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);
  const enabledRef = useRef(enabled);

  // Keep enabledRef in sync so callbacks always read the latest value
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const speakNext = useCallback(() => {
    if (!enabledRef.current || speakingRef.current || queueRef.current.length === 0) return;
    if (!supported) return;

    const text = queueRef.current.shift()!;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onstart = () => {
      speakingRef.current = true;
      setStatus("speaking");
    };

    utterance.onend = () => {
      speakingRef.current = false;
      setStatus(queueRef.current.length > 0 ? "speaking" : "idle");
      // Schedule next tick to avoid reentrant speak() calls
      setTimeout(speakNext, 0);
    };

    utterance.onerror = () => {
      speakingRef.current = false;
      setStatus("idle");
      setTimeout(speakNext, 0);
    };

    window.speechSynthesis.speak(utterance);
  }, [lang, pitch, rate, supported]);

  /**
   * Enqueue a full text block. Each call replaces only the NEW part relative
   * to the previous call when used in streaming mode — callers should pass
   * only the delta, not the full accumulated text.
   */
  const enqueue = useCallback(
    (text: string) => {
      if (!enabledRef.current || !supported) return;
      const sentences = splitIntoSentences(text);
      if (sentences.length === 0) return;
      queueRef.current.push(...sentences);
      speakNext();
    },
    [speakNext, supported],
  );

  const stopSpeaking = useCallback(() => {
    queueRef.current = [];
    speakingRef.current = false;
    if (supported) window.speechSynthesis.cancel();
    setStatus("idle");
  }, [supported]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) {
        // Turning TTS off: cancel immediately
        queueRef.current = [];
        speakingRef.current = false;
        if (supported) window.speechSynthesis.cancel();
        setStatus("idle");
      }
      return !prev;
    });
  }, [supported]);

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { status, enabled, enqueue, stopSpeaking, toggle };
}
