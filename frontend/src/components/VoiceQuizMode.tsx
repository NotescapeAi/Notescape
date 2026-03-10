import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  endStudySession,
  heartbeatStudySession,
  listClasses,
  listFlashcards,
  saveVoiceFlashcardAttempt,
  startStudySession,
  transcribeVoiceFlashcardAnswer,
  type Flashcard,
} from "../lib/api";
import Button from "./Button";
import { useAudioRecorder } from "../hooks/useAudioRecorder";

type VoiceState =
  | "initializing"
  | "speaking"
  | "waiting_to_answer"
  | "recording"
  | "transcribing"
  | "reviewed"
  | "saving"
  | "completed"
  | "error";

type Props = {
  classId: number;
  initialCards?: Flashcard[];
  initialClassName?: string;
  startIndex?: number;
};

function sanitizeText(value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("{") && text.includes("\"cards\"")) {
    return "This card needs regeneration.";
  }
  return text;
}

function clampIndex(index: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(index, total - 1));
}

function stateCue(state: VoiceState) {
  if (state === "initializing") return "Getting your next question ready...";
  if (state === "speaking") return "Listen carefully...";
  if (state === "waiting_to_answer") return "Your turn. Start answering when you are ready.";
  if (state === "recording") return "Listening...";
  if (state === "transcribing") return "Processing your answer...";
  if (state === "reviewed") return "Here is what you said. Now rate how well you knew it.";
  if (state === "saving") return "Saving your rating...";
  if (state === "completed") return "Session complete.";
  return "Something went wrong. You can retry this card.";
}

export default function VoiceQuizMode({ classId, initialCards, initialClassName, startIndex }: Props) {
  const [cards, setCards] = useState<Flashcard[]>(Array.isArray(initialCards) ? initialCards : []);
  const [className, setClassName] = useState(initialClassName || "");
  const [idx, setIdx] = useState(() => Math.max(0, startIndex ?? 0));
  const [loading, setLoading] = useState(!Array.isArray(initialCards));
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<VoiceState>("initializing");
  const [transcript, setTranscript] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [autoRecordArmed, setAutoRecordArmed] = useState(false);
  const sessionStartRef = useRef<number>(Date.now());
  const autoSpokenCardRef = useRef<string | null>(null);
  const nextTimerRef = useRef<number | null>(null);

  const recorder = useAudioRecorder();
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const currentCard = useMemo(() => cards[clampIndex(idx, cards.length)], [cards, idx]);

  useEffect(() => {
    if (!Number.isFinite(classId) || classId <= 0) {
      setError("Invalid class id.");
      setLoading(false);
      setState("error");
      return;
    }
    let cancelled = false;
    async function load() {
      if (Array.isArray(initialCards)) {
        setState(initialCards.length ? "initializing" : "completed");
        return;
      }
      setLoading(true);
      try {
        const [fetchedCards, classes] = await Promise.all([
          listFlashcards(classId),
          listClasses(),
        ]);
        if (cancelled) return;
        setCards(Array.isArray(fetchedCards) ? fetchedCards : []);
        setIdx(0);
        setClassName(classes.find((c) => c.id === classId)?.name || "");
        setState(Array.isArray(fetchedCards) && fetchedCards.length ? "initializing" : "completed");
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load flashcards for voice quiz.");
          setState("error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [classId, initialCards]);

  useEffect(() => {
    if (!Number.isFinite(classId) || classId <= 0) return;
    let cancelled = false;
    let sessionId: string | null = null;
    (async () => {
      try {
        const session = await startStudySession({ class_id: classId, mode: "voice" });
        if (cancelled) {
          endStudySession({ session_id: session.id }).catch(() => undefined);
          return;
        }
        setStudySessionId(session.id);
        sessionId = session.id;
      } catch {
        // keep voice quiz usable without study session logging
      }
    })();
    return () => {
      cancelled = true;
      const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000));
      if (sessionId) {
        endStudySession({ session_id: sessionId, accumulated_seconds: elapsed }).catch(() => undefined);
      }
      if (canSpeak) {
        window.speechSynthesis.cancel();
      }
      if (nextTimerRef.current) {
        window.clearTimeout(nextTimerRef.current);
        nextTimerRef.current = null;
      }
    };
  }, [classId, canSpeak]);

  useEffect(() => {
    if (recorder.error) {
      setError(recorder.error);
      setState("error");
    }
  }, [recorder.error]);

  const nextCard = useCallback(() => {
    if (!cards.length) return;
    const next = idx + 1;
    setTranscript("");
    setAudioUrl(null);
    setSavedAttemptId(null);
    setError(null);
    recorder.reset();
    if (next >= cards.length) {
      setState("completed");
      return;
    }
    setIdx(next);
    setState("initializing");
  }, [cards.length, idx, recorder]);

  const startAnswering = useCallback(async (fromAuto = false) => {
    if (!currentCard) return;
    setError(null);
    if (!fromAuto) {
      setTranscript("");
      setSavedAttemptId(null);
      setAudioUrl(null);
    }
    const started = await recorder.startRecording({
      maxDurationMs: 25000,
      silenceDurationMs: 1800,
      minDurationMs: 1200,
    });
    if (started) {
      setState("recording");
      if (!fromAuto) {
        setAutoRecordArmed(true);
      }
      return;
    }
    if (recorder.permission === "denied") {
      setError("Microphone access is blocked. Enable microphone permission in your browser and retry.");
    }
    setState("error");
  }, [currentCard, recorder]);

  const speakQuestion = useCallback((isReplay = false) => {
    if (!currentCard) return;
    if (!canSpeak) {
      setState("waiting_to_answer");
      return;
    }
    if (!isReplay && autoSpokenCardRef.current === currentCard.id) {
      return;
    }
    autoSpokenCardRef.current = currentCard.id;
    setError(null);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sanitizeText(currentCard.question));
    utterance.onstart = () => setState("speaking");
    utterance.onend = async () => {
      if (!isReplay && autoRecordArmed && recorder.permission === "granted") {
        await startAnswering(true);
        return;
      }
      setState("waiting_to_answer");
    };
    utterance.onerror = () => {
      setError("Unable to read this question aloud. You can still answer by voice.");
      setState("waiting_to_answer");
    };
    window.speechSynthesis.speak(utterance);
  }, [autoRecordArmed, canSpeak, currentCard, recorder.permission, startAnswering]);

  async function transcribeBlob(blob: Blob) {
    setState("transcribing");
    setError(null);
    try {
      const result = await transcribeVoiceFlashcardAnswer(blob);
      setTranscript(result.transcript || "");
      setAudioUrl(result.audio_url ?? null);
      setState("reviewed");
      setSavedAttemptId(null);
    } catch (err: any) {
      const raw = err?.message || "Failed to transcribe audio.";
      const msg = /transcription is unavailable|TRANSCRIPTION_PROVIDER|OPENAI_API_KEY|GROQ_API_KEY/i.test(raw)
        ? "Voice transcription is currently unavailable. Please ask an admin to configure OpenAI or Groq transcription."
        : raw;
      setError(msg);
      setState("error");
    }
  }

  useEffect(() => {
    if (!recorder.audioBlob || recorder.status !== "stopped") return;
    if (state === "recording" || state === "transcribing") {
      transcribeBlob(recorder.audioBlob);
    }
  }, [recorder.audioBlob, recorder.status, state]);

  useEffect(() => {
    if (loading || !currentCard) return;
    setTranscript("");
    setAudioUrl(null);
    setSavedAttemptId(null);
    setError(null);

    if (canSpeak) {
      speakQuestion(false);
      return;
    }
    setState("waiting_to_answer");
  }, [canSpeak, currentCard?.id, loading]);

  async function saveRating(rating: 1 | 2 | 3 | 4 | 5) {
    if (!currentCard || !transcript.trim()) {
      setError("Transcript is required before rating this attempt.");
      return;
    }
    setSaving(true);
    setState("saving");
    setError(null);
    try {
      const result = await saveVoiceFlashcardAttempt({
        card_id: currentCard.id,
        transcript: transcript.trim(),
        user_rating: rating,
        response_time_seconds: recorder.durationSeconds ?? undefined,
        audio_url: audioUrl,
      });
      setSavedAttemptId(result.attempt_id);
      setState("reviewed");
      setSavedCount((n) => n + 1);

      if (studySessionId) {
        const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000));
        heartbeatStudySession({
          session_id: studySessionId,
          accumulated_seconds: elapsed,
          cards_seen: idx + 1,
          cards_completed: savedCount + 1,
        }).catch(() => undefined);
      }

      nextTimerRef.current = window.setTimeout(() => {
        nextCard();
      }, 700);
    } catch (err: any) {
      setError(err?.message || "Failed to save voice attempt.");
      setState("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[22px] surface p-4 shadow-token">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <div>
            Voice quiz for <span className="font-semibold text-main">{className || `Class #${classId}`}</span>
          </div>
          <div>
            Card {cards.length ? clampIndex(idx, cards.length) + 1 : 0} of {cards.length}
          </div>
        </div>
      </div>

      {!canSpeak && (
        <div className="rounded-2xl border border-token bg-[var(--surface-2)] px-4 py-3 text-sm text-muted">
          Speech playback is unavailable in this browser. Questions remain visible and voice answering still works.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm text-accent">
          {error}
        </div>
      )}

      <div className="rounded-[28px] surface p-6 shadow-token">
        {loading ? (
          <div className="text-sm text-muted">Loading cards...</div>
        ) : !currentCard ? (
          <div className="text-sm text-muted">No flashcards available for voice quiz mode.</div>
        ) : state === "completed" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-token bg-[var(--surface-2)] px-4 py-3 text-sm text-muted">
              Session complete. You reached the end of this deck.
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setIdx(0);
                  setState("initializing");
                  autoSpokenCardRef.current = null;
                }}
              >
                Restart from first card
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--primary)]">Question</div>
              <div className="mt-2 text-xl font-semibold text-main">{sanitizeText(currentCard.question)}</div>
            </div>

            <div className="rounded-2xl border border-token bg-[var(--surface-2)] px-4 py-3 text-sm text-main">
              {stateCue(state)}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => speakQuestion(true)} disabled={state === "recording" || state === "transcribing"}>
                Replay question
              </Button>
              <Button
                variant="primary"
                onClick={() => startAnswering(false)}
                disabled={state === "recording" || state === "transcribing" || state === "saving"}
              >
                Start answering
              </Button>
              <Button onClick={() => recorder.stopRecording()} disabled={state !== "recording"}>
                Stop
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  setTranscript("");
                  setAudioUrl(null);
                  setSavedAttemptId(null);
                  recorder.reset();
                  setState("waiting_to_answer");
                }}
                disabled={state === "recording" || state === "transcribing" || state === "saving"}
              >
                Retry
              </Button>
              {recorder.audioBlob && state !== "recording" && state !== "transcribing" && (
                <Button onClick={() => transcribeBlob(recorder.audioBlob)}>
                  Retry transcription
                </Button>
              )}
              <Button onClick={nextCard} disabled={state === "transcribing" || state === "saving"}>
                Skip card
              </Button>
            </div>

            {state === "recording" && (
              <div className="text-sm text-muted">
                Listening through your microphone... we will stop automatically after silence.
              </div>
            )}
            {state === "transcribing" && (
              <div className="text-sm text-muted">Transcribing your answer...</div>
            )}

            {(state === "reviewed" || state === "saving") && (
              <>
                <div className="rounded-2xl border border-token bg-[var(--surface-2)] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--primary)]">Here is what you said</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-main">{transcript || "(Empty transcript)"}</p>
                </div>

                <div className="rounded-2xl border border-token bg-[var(--surface-2)] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--primary)]">Correct answer</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-main">{sanitizeText(currentCard.answer)}</p>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-main">Rate your attempt (1 to 5)</div>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        aria-label={`Rate ${score}`}
                        disabled={saving}
                        onClick={() => saveRating(score as 1 | 2 | 3 | 4 | 5)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                          saving ? "border-token text-muted" : "border-token text-main hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {savedAttemptId && (
              <div className="rounded-2xl border border-token bg-[var(--surface-2)] px-4 py-3 text-sm text-muted">
                Attempt saved{savedAttemptId ? ` (#${savedAttemptId.slice(0, 8)})` : ""}. Moving to the next card...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
