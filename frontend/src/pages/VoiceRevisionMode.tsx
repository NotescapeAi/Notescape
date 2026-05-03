/**
 * Voice Revision — hands-free flashcard *practice* (revision), not a scored Voice Quiz.
 * Data: same flashcards as the rest of the app (`listFlashcards` + optional `postReview` for SRS).
 * Voice Quiz (class Flashcards → Voice) focuses on testing / evaluation; this page is recall + self-rating only.
 */
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  BookOpen,
  CheckCircle2,
  Headphones,
  Layers,
  Mic,
  MicOff,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import {
  listClasses,
  listFlashcards,
  postReview,
  type ClassRow,
  type Flashcard,
} from "../lib/api";

type UiStatus =
  | "setup"
  | "loading_cards"
  | "speaking"
  | "listening"
  | "answer_captured"
  | "reviewing"
  | "saving_rating"
  | "session_complete";

const STATUS_LABEL: Record<UiStatus, string> = {
  setup: "Ready",
  loading_cards: "Loading cards",
  speaking: "Speaking question",
  listening: "Listening",
  answer_captured: "Answer captured",
  reviewing: "Reviewing answer",
  saving_rating: "Saving",
  session_complete: "Session complete",
};

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }>;
};

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function friendlyApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return "Could not reach the server. Check that it is running and try again.";
    }
    const status = err.response.status;
    if (status === 401 || status === 403) {
      return "You may need to sign in again, then retry.";
    }
    if (status >= 500) {
      return "The server had a problem. Please try again in a moment.";
    }
  }
  if (err instanceof Error && err.message === "Network Error") {
    return "Could not load voice revision cards. Check your connection or try again.";
  }
  return fallback;
}

function speechRecognitionErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
      return "Microphone permission was denied. Allow microphone access to answer aloud, or type your answer.";
    case "no-speech":
      return "No speech was detected. Try again or type your answer.";
    case "audio-capture":
      return "No microphone was found. Check your device or type your answer.";
    case "network":
      return "Speech recognition had a network issue. You can still listen and type your answer.";
    case "aborted":
      return "";
    default:
      return "Speech recognition stopped. You can try again or type your answer.";
  }
}

const RATING_OPTIONS = [
  { score: 1 as const, label: "Again", tone: "var(--danger)" },
  { score: 2 as const, label: "Hard", tone: "var(--warning)" },
  { score: 3 as const, label: "Good", tone: "#2563eb" },
  { score: 4 as const, label: "Easy", tone: "var(--success)" },
  { score: 5 as const, label: "Mastered", tone: "var(--primary)" },
] as const;

export default function VoiceRevisionMode() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [status, setStatus] = useState<UiStatus>("setup");
  const [transcript, setTranscript] = useState("");
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [cardCount, setCardCount] = useState<number | null>(null);

  const [ttsSupported, setTtsSupported] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [micHint, setMicHint] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRec | null>(null);
  const responseStartRef = useRef<number | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const SpeechRecognitionCtor = useMemo((): (new () => SpeechRec) | null => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }, []);

  useEffect(() => {
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    setSttSupported(!!SpeechRecognitionCtor);
  }, [SpeechRecognitionCtor]);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      rec.onend = null;
      rec.onerror = null;
      rec.onresult = null;
      rec.onstart = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    setRecognizing(false);
  }, []);

  const resetSessionState = useCallback(() => {
    stopRecognition();
    cancelSpeech();
    setSessionActive(false);
    setDeck([]);
    setCardIndex(0);
    setTranscript("");
    setAnswerRevealed(false);
    setStatus("setup");
    setMicHint(null);
    responseStartRef.current = null;
  }, [stopRecognition, cancelSpeech]);

  useEffect(() => {
    (async () => {
      try {
        const cs = await listClasses();
        setClasses(cs);
        if (cs[0]) setSelectedClassId(cs[0].id);
      } catch (err: unknown) {
        setLoadError(friendlyApiError(err, "Could not load your classes. Try again."));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedClassId) {
      setCardCount(null);
      return;
    }
    let cancelled = false;
    setDeckLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const cards = await listFlashcards(selectedClassId);
        if (cancelled) return;
        setCardCount(Array.isArray(cards) ? cards.length : 0);
      } catch (err: unknown) {
        if (!cancelled) {
          setCardCount(null);
          setLoadError(friendlyApiError(err, "Could not check flashcards for this class."));
        }
      } finally {
        if (!cancelled) setDeckLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  useEffect(() => {
    if (!sessionActive) return;
    return () => {
      stopRecognition();
      cancelSpeech();
    };
  }, [sessionActive, stopRecognition, cancelSpeech]);

  const currentCard = sessionActive && deck.length > 0 ? deck[Math.min(cardIndex, deck.length - 1)] : null;

  /** After TTS ends, return to `captured` (before reveal) or stay in `reviewing` (after reveal). */
  const speakQuestion = useCallback(
    (text: string, afterSpeak: "captured" | "reviewing" = "captured") => {
      cancelSpeech();
      if (!ttsSupported || !text.trim()) {
        setStatus(afterSpeak === "reviewing" ? "reviewing" : "answer_captured");
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 1;
      utteranceRef.current = u;
      const done = () => {
        utteranceRef.current = null;
        setStatus(afterSpeak === "reviewing" ? "reviewing" : "answer_captured");
      };
      u.onend = done;
      u.onerror = done;
      setStatus("speaking");
      window.speechSynthesis.speak(u);
    },
    [ttsSupported, cancelSpeech]
  );

  const startRevisionSession = async () => {
    if (!selectedClassId) return;
    stopRecognition();
    cancelSpeech();
    setBannerError(null);
    setMicHint(null);
    setStatus("loading_cards");
    try {
      const cards = await listFlashcards(selectedClassId);
      const list = Array.isArray(cards) ? cards.filter((c) => (c.question || "").trim()) : [];
      if (list.length === 0) {
        setStatus("setup");
        setBannerError(null);
        setLoadError(null);
        setCardCount(0);
        return;
      }
      const shuffled = shuffle(list);
      setDeck(shuffled);
      setCardIndex(0);
      setTranscript("");
      setAnswerRevealed(false);
      setSessionActive(true);
      setCardCount(shuffled.length);
      speakQuestion(shuffled[0].question, "captured");
    } catch (err: unknown) {
      setStatus("setup");
      setBannerError(friendlyApiError(err, "Unable to load voice revision cards. Please try again."));
    }
  };

  const endRevisionSession = useCallback(() => {
    resetSessionState();
    setBannerError(null);
  }, [resetSessionState]);

  const handleRate = async (score: 1 | 2 | 3 | 4 | 5) => {
    if (!sessionActive) return;
    const idx = cardIndex;
    const card = deck[idx];
    if (!card) return;
    setBannerError(null);
    setStatus("saving_rating");
    const started = responseStartRef.current;
    const responseTimeMs = started ? Date.now() - started : undefined;
    try {
      await postReview(card.id, score, responseTimeMs);
    } catch (err: unknown) {
      setBannerError(friendlyApiError(err, "Could not save your rating. Try again."));
      setStatus("reviewing");
      return;
    }
    const nextIdx = idx + 1;
    if (nextIdx >= deck.length) {
      stopRecognition();
      cancelSpeech();
      setSessionActive(false);
      setStatus("session_complete");
      return;
    }
    setCardIndex(nextIdx);
    setTranscript("");
    setAnswerRevealed(false);
    setMicHint(null);
    responseStartRef.current = null;
    stopRecognition();
    speakQuestion(deck[nextIdx].question, "captured");
  };

  const startListening = () => {
    if (!SpeechRecognitionCtor || !sessionActive) return;
    setMicHint(null);
    setBannerError(null);
    stopRecognition();
    responseStartRef.current = Date.now();
    const rec = new SpeechRecognitionCtor();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onstart = () => {
      setRecognizing(true);
      setStatus("listening");
      setTranscript("");
    };
    rec.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? "")
        .join("");
      setTranscript(text.trim());
    };
    rec.onerror = (e) => {
      const msg = speechRecognitionErrorMessage(e.error);
      if (msg) setMicHint(msg);
      setRecognizing(false);
      setStatus((s) => (s === "listening" ? "answer_captured" : s));
    };
    rec.onend = () => {
      setRecognizing(false);
      setStatus((s) => (s === "listening" ? "answer_captured" : s));
      recognitionRef.current = null;
    };
    try {
      rec.start();
    } catch {
      setMicHint("Could not start listening. Try again or type your answer.");
      setStatus("answer_captured");
    }
  };

  const finishListening = () => {
    stopRecognition();
    setStatus("answer_captured");
  };

  const handleClassChange = (id: number | null) => {
    if (sessionActive) {
      endRevisionSession();
    }
    setSelectedClassId(id);
    setBannerError(null);
    setLoadError(null);
  };

  const hasCards = (cardCount ?? 0) > 0;
  const canStart = !!selectedClassId && hasCards && !deckLoading && status !== "loading_cards" && !sessionActive;

  const statusRing =
    status === "listening"
      ? "bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.22)]"
      : status === "speaking"
        ? "bg-[var(--primary)] shadow-[0_0_0_6px_color-mix(in_srgb,var(--primary)_28%,transparent)]"
        : status === "saving_rating" || status === "loading_cards"
          ? "bg-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.22)]"
          : status === "session_complete"
            ? "bg-[var(--success)] shadow-[0_0_0_6px_color-mix(in_srgb,var(--success)_25%,transparent)]"
            : "bg-[var(--text-muted-soft)]";

  return (
    <AppShell
      title="Voice Revision"
      subtitle="Listen to your flashcards, answer aloud, compare with the answer, and rate how well you remembered them."
      headerMaxWidthClassName="max-w-3xl"
      contentGapClassName="gap-4"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-10">
        {/* Product context */}
        <div className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[var(--primary-soft)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-main)]">Voice Revision</span> is for{" "}
          <span className="text-[var(--text-main)]">practice and recall</span>: same cards as Flashcards, no score out of 100.
          {" "}
          <span className="font-semibold text-[var(--text-main)]">Voice Quiz</span> (under a class → Flashcards → Voice) is for{" "}
          <span className="text-[var(--text-main)]">testing</span> with evaluated answers.
        </div>

        {/* Setup */}
        <div className="ns-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <Headphones className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">Session</div>
              <h2 className="mt-1 text-lg font-semibold text-[var(--text-main)] sm:text-xl">Hands-free revision</h2>
              <p className="mt-2 max-w-[560px] text-sm leading-relaxed text-[var(--text-secondary)]">
                Choose a class with generated flashcards. Notescape will read each question aloud and help you revise using your voice.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-[13px] text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
              <Volume2 className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
              {ttsSupported ? "Text-to-speech ready" : "Text-to-speech not available"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
              {sttSupported ? (
                <>
                  <Mic className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden />
                  Speech recognition available
                </>
              ) : (
                <>
                  <MicOff className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
                  Voice input not supported — listen and type instead
                </>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
              <Layers className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
              {deckLoading ? "Checking deck…" : cardCount === null ? "—" : `${cardCount} flashcard${cardCount === 1 ? "" : "s"}`}
            </span>
          </div>

          {loadError ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {loadError}
            </div>
          ) : null}

          {!sttSupported ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Speech recognition is not supported in this browser. You can still listen to questions and revise manually (type your answer).
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="min-w-[200px] flex-1 text-sm font-semibold text-[var(--text-main)]">
              Class
              <select
                value={selectedClassId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  handleClassChange(v ? Number(v) : null);
                }}
                disabled={sessionActive}
                className="mt-2 h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-main)]"
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={startRevisionSession}
                disabled={!canStart}
                className="gap-1.5"
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                Start revision
              </Button>
              {sessionActive ? (
                <Button type="button" variant="secondary" size="md" onClick={endRevisionSession} className="gap-1.5">
                  <Square className="h-4 w-4 shrink-0" aria-hidden />
                  End session
                </Button>
              ) : null}
            </div>
          </div>

          {!deckLoading && selectedClassId && cardCount === 0 ? (
            <div className="mt-5 flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--text-secondary)]">
                No flashcards found for this class. Generate flashcards first, then return to Voice Revision.
              </p>
              <Button
                type="button"
                size="sm"
                variant="primary"
                className="gap-1.5 shrink-0"
                onClick={() => navigate(`/classes/${selectedClassId}/flashcards`)}
              >
                <BookOpen className="h-4 w-4" aria-hidden />
                Generate flashcards
              </Button>
            </div>
          ) : null}
        </div>

        {/* Status + main panel */}
        <div className="ns-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 shrink-0 rounded-full transition-all ${statusRing}`} aria-hidden />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Status</div>
                  <div className="text-base font-semibold text-[var(--text-main)]">{STATUS_LABEL[status]}</div>
                </div>
              </div>
              {sessionActive && deck.length > 0 ? (
                <div className="text-xs font-semibold tabular-nums text-[var(--text-muted)]">
                  Card {cardIndex + 1} / {deck.length}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            {bannerError ? (
              <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                {bannerError}
              </div>
            ) : null}
            {micHint ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                {micHint}
              </div>
            ) : null}

            {status === "session_complete" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-[var(--success)]" aria-hidden />
                <div className="text-lg font-semibold text-[var(--text-main)]">Session complete</div>
                <p className="max-w-md text-sm text-[var(--text-muted)]">Nice work. Start another round whenever you want.</p>
                <Button type="button" variant="primary" onClick={() => { setStatus("setup"); }}>
                  Done
                </Button>
              </div>
            ) : (
              <>
                <div className="mx-auto w-full max-w-xl rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface)] px-5 py-7 text-center shadow-[var(--shadow-sm)] sm:px-8 sm:py-9">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Question</div>
                  <p className="mt-3 text-lg font-semibold leading-relaxed text-[var(--text-main)] sm:text-xl">
                    {currentCard?.question ?? "Start a session to hear your first question."}
                  </p>
                  {currentCard?.topic ? (
                    <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">Topic: {currentCard.topic}</p>
                  ) : null}
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        currentCard && speakQuestion(currentCard.question, answerRevealed ? "reviewing" : "captured")
                      }
                      disabled={!currentCard || !ttsSupported}
                      className="gap-1.5"
                    >
                      <Volume2 className="h-4 w-4" aria-hidden />
                      Replay question
                    </Button>
                  </div>
                </div>

                {sessionActive && currentCard ? (
                  <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)]/50 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Your answer</div>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          {sttSupported
                            ? recognizing
                              ? "Listening… speak naturally."
                              : "Use the microphone or type what you remember."
                            : "Type what you remember."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sttSupported ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={startListening}
                              disabled={recognizing || answerRevealed}
                              className="gap-1.5"
                            >
                              <Mic className="h-4 w-4" aria-hidden />
                              Start answering
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={finishListening}
                              disabled={!recognizing}
                              className="gap-1.5"
                            >
                              Done speaking
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      placeholder="Your spoken answer appears here, or type…"
                      disabled={answerRevealed}
                      className="mt-4 min-h-[96px] w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text-main)] placeholder:text-[var(--placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      rows={3}
                    />
                  </div>
                ) : null}

                {sessionActive && currentCard ? (
                  <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                    {!answerRevealed ? (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          setAnswerRevealed(true);
                          setStatus("reviewing");
                        }}
                        className="w-full sm:w-auto"
                      >
                        Show answer
                      </Button>
                    ) : (
                      <>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Correct answer</div>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--text-main)]">{currentCard.answer}</p>
                        <div className="mt-5">
                          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
                            How well did you remember it?
                          </div>
                          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                            {RATING_OPTIONS.map((opt) => (
                              <button
                                key={opt.score}
                                type="button"
                                onClick={() => void handleRate(opt.score)}
                                disabled={status === "saving_rating"}
                                className="rating-btn rating-btn--ready"
                                style={{ ["--tone" as string]: opt.tone } as CSSProperties}
                                aria-label={opt.label}
                                title={`${opt.label} (${opt.score})`}
                              >
                                <span className="rating-btn__label">{opt.label}</span>
                                <span className="rating-btn__key">{opt.score}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
