import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  RotateCcw,
  SkipForward,
  Square,
  Volume2,
  Waves,
} from "lucide-react";
import {
  endStudySession,
  evaluateVoiceFlashcardAnswer,
  heartbeatStudySession,
  listClasses,
  listFlashcards,
  saveVoiceFlashcardAttempt,
  startStudySession,
  transcribeVoiceFlashcardAnswer,
  type Flashcard,
  type VoiceEvaluationResult,
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

type QuizMode = "manual" | "handsfree";
type HandsFreeState =
  | "idle"
  | "speaking_question"
  | "listening_answer"
  | "evaluating_answer"
  | "speaking_feedback"
  | "asking_rating"
  | "listening_rating"
  | "moving_next"
  | "paused"
  | "completed";

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

function handsFreeCue(state: HandsFreeState) {
  if (state === "speaking_question") return "Speaking question";
  if (state === "listening_answer") return "Listening for answer";
  if (state === "evaluating_answer") return "Evaluating answer";
  if (state === "speaking_feedback") return "Speaking feedback";
  if (state === "asking_rating") return "Asking for confidence";
  if (state === "listening_rating") return "Listening for rating";
  if (state === "moving_next") return "Moving to next card";
  if (state === "paused") return "Paused";
  if (state === "completed") return "Session complete";
  return "Ready";
}

function conciseManualCue(state: VoiceState) {
  if (state === "speaking") return "Speaking question";
  if (state === "recording") return "Listening...";
  if (state === "transcribing") return "Evaluating answer";
  if (state === "reviewed") return "Waiting for rating";
  if (state === "saving") return "Saving";
  if (state === "error") return "Needs attention";
  return "Ready";
}

function normalizeVoiceCommand(value: string) {
  return value.toLowerCase().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
}

function parseRatingCommand(value: string): "easy" | "medium" | "hard" | "repeat" | "skip" | "stop" | "pause" | null {
  const text = normalizeVoiceCommand(value);
  if (/\b(stop|stop quiz|end session|end quiz)\b/.test(text)) return "stop";
  if (/\b(pause)\b/.test(text)) return "pause";
  if (/\b(skip|next)\b/.test(text)) return "skip";
  if (/\b(repeat|again|replay)\b/.test(text)) return "repeat";
  if (/\b(easy|i knew it|got it|confident)\b/.test(text)) return "easy";
  if (/\b(medium|not sure|somewhat|partially)\b/.test(text)) return "medium";
  if (/\b(hard|i don't know|i dont know|review this|forgot|difficult|mark hard)\b/.test(text)) return "hard";
  return null;
}

function ratingToScore(rating: "easy" | "medium" | "hard"): 1 | 2 | 3 | 4 | 5 {
  if (rating === "easy") return 5;
  if (rating === "medium") return 3;
  return 1;
}

function localEvaluate(expected: string, actual: string): VoiceEvaluationResult {
  const clean = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ");
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "you", "your", "have", "has"]);
  const expectedTerms = clean(expected).split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  const actualTerms = new Set(clean(actual).split(/\s+/).filter(Boolean));
  const unique = Array.from(new Set(expectedTerms));
  const ratio = unique.length ? unique.filter((w) => actualTerms.has(w)).length / unique.length : 0.5;
  const score = ratio >= 0.82 ? 5 : ratio >= 0.62 ? 4 : ratio >= 0.4 ? 3 : ratio >= 0.18 ? 2 : actual.trim() ? 1 : 0;
  return {
    score,
    feedback: score >= 4
      ? "Good answer. You covered the key points."
      : score >= 2
        ? "Partially correct. Some important details were missing."
        : "Attempt recorded, but it did not match the expected answer closely.",
    missingPoints: unique.filter((w) => !actualTerms.has(w)).slice(0, 6),
    isCorrectEnough: score >= 4,
  };
}

export default function VoiceQuizMode({ classId, initialCards, initialClassName, startIndex }: Props) {
  const [cards, setCards] = useState<Flashcard[]>(Array.isArray(initialCards) ? initialCards : []);
  const [className, setClassName] = useState(initialClassName || "");
  const [idx, setIdx] = useState(() => Math.max(0, startIndex ?? 0));
  const [loading, setLoading] = useState(!Array.isArray(initialCards));
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<VoiceState>("initializing");
  const [quizMode, setQuizMode] = useState<QuizMode>("manual");
  const [handsFreeState, setHandsFreeState] = useState<HandsFreeState>("idle");
  const [handsFreeActive, setHandsFreeActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [evaluation, setEvaluation] = useState<VoiceEvaluationResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [autoRecordArmed, setAutoRecordArmed] = useState(false);
  const [handsFreeError, setHandsFreeError] = useState<string | null>(null);
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [ratingCounts, setRatingCounts] = useState({ easy: 0, medium: 0, hard: 0 });
  const [scores, setScores] = useState<number[]>([]);
  const sessionStartRef = useRef<number>(Date.now());
  const autoSpokenCardRef = useRef<string | null>(null);
  const nextTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const handsFreeActiveRef = useRef(false);
  const answerStartedAtRef = useRef<number>(Date.now());
  const nextHandsFreeIndexRef = useRef<number | null>(null);

  const recorder = useAudioRecorder();
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const SpeechRecognitionCtor = typeof window !== "undefined"
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    : null;
  const canRecognizeSpeech = !!SpeechRecognitionCtor;
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
      if (recognitionRef.current) {
        recognitionRef.current.abort?.();
        recognitionRef.current = null;
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

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.abort?.();
      recognitionRef.current = null;
    }
  }, []);

  const speakHandsFree = useCallback((text: string, onDone: () => void) => {
    stopRecognition();
    if (!canSpeak) {
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.volume = 1;
    utterance.onend = onDone;
    utterance.onerror = () => {
      setHandsFreeError("Text-to-speech failed. Continuing without spoken audio.");
      onDone();
    };
    window.speechSynthesis.speak(utterance);
  }, [canSpeak, stopRecognition]);

  const listenHandsFree = useCallback((kind: "answer" | "rating", onFinal: (text: string) => void) => {
    if (!SpeechRecognitionCtor) {
      setHandsFreeError("Hands-free voice recognition is not supported in this browser. Please use Chrome or manual mode.");
      return;
    }
    stopRecognition();
    setLiveTranscript("");
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    let finalText = "";
    let interimText = "";
    recognition.onresult = (event: any) => {
      interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += ` ${text}`;
        else interimText += ` ${text}`;
      }
      setLiveTranscript(`${finalText} ${interimText}`.trim());
    };
    recognition.onerror = (event: any) => {
      const message = event?.error === "not-allowed"
        ? "Microphone permission was denied. Enable microphone access or use manual mode."
        : "Speech recognition stopped unexpectedly. You can retry or use manual mode.";
      setHandsFreeError(message);
      setHandsFreeState("paused");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (!handsFreeActiveRef.current) return;
      const text = finalText.trim() || interimText.trim();
      if (!text) {
        const prompt = kind === "answer"
          ? "I didn't hear anything. You can answer now, say repeat, or say skip."
          : "Say easy, medium, hard, repeat, skip, or stop.";
        speakHandsFree(prompt, () => listenHandsFree(kind, onFinal));
        return;
      }
      onFinal(text);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [SpeechRecognitionCtor, speakHandsFree, stopRecognition]);

  const saveHandsFreeResult = useCallback(async (
    card: Flashcard,
    answerText: string,
    evalResult: VoiceEvaluationResult,
    rating: "easy" | "medium" | "hard"
  ) => {
    const attemptNumber = (attemptCounts[card.id] || 0) + 1;
    await saveVoiceFlashcardAttempt({
      card_id: card.id,
      transcript: answerText,
      user_rating: ratingToScore(rating),
      response_time_seconds: Math.max(1, Math.round((Date.now() - answerStartedAtRef.current) / 1000)),
      audio_url: null,
      score: evalResult.score,
      feedback: evalResult.feedback,
      missing_points: evalResult.missingPoints,
      session_id: studySessionId,
      attempt_number: attemptNumber,
    });
    setAttemptCounts((prev) => ({ ...prev, [card.id]: attemptNumber }));
    setSavedCount((n) => n + 1);
    setScores((prev) => [...prev, evalResult.score]);
    setRatingCounts((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    if (studySessionId) {
      const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000));
      heartbeatStudySession({
        session_id: studySessionId,
        accumulated_seconds: elapsed,
        cards_seen: idx + 1,
        cards_completed: savedCount + 1,
      }).catch(() => undefined);
    }
  }, [attemptCounts, idx, savedCount, studySessionId]);

  const endHandsFree = useCallback((complete = false) => {
    handsFreeActiveRef.current = false;
    setHandsFreeActive(false);
    stopRecognition();
    if (canSpeak) window.speechSynthesis.cancel();
    setHandsFreeState(complete ? "completed" : "idle");
  }, [canSpeak, stopRecognition]);

  const advanceHandsFree = useCallback(() => {
    if (!cards.length) return;
    setHandsFreeState("moving_next");
    const next = idx + 1;
    nextHandsFreeIndexRef.current = next;
    window.setTimeout(() => {
      setTranscript("");
      setLiveTranscript("");
      setEvaluation(null);
      if (next >= cards.length) {
        setState("completed");
        endHandsFree(true);
        speakHandsFree("Session complete. Nice work.", () => undefined);
        return;
      }
      setIdx(next);
      setState("waiting_to_answer");
    }, 550);
  }, [cards.length, endHandsFree, idx, speakHandsFree]);

  const runHandsFreeCard = useCallback((card: Flashcard, cardIndex: number) => {
    setHandsFreeError(null);
    setTranscript("");
    setLiveTranscript("");
    setEvaluation(null);
    setHandsFreeState("speaking_question");
    const questionText = `Question ${cardIndex + 1} of ${cards.length}. ${sanitizeText(card.question)}. Answer when you are ready.`;
    speakHandsFree(questionText, () => {
      if (!handsFreeActiveRef.current) return;
      answerStartedAtRef.current = Date.now();
      setHandsFreeState("listening_answer");
      listenHandsFree("answer", async (answerText) => {
        const command = parseRatingCommand(answerText);
        if (command === "stop") return endHandsFree(false);
        if (command === "pause") {
          setHandsFreeState("paused");
          return;
        }
        if (command === "repeat") {
          runHandsFreeCard(card, cardIndex);
          return;
        }
        if (command === "skip") {
          advanceHandsFree();
          return;
        }
        setTranscript(answerText);
        setHandsFreeState("evaluating_answer");
        let evalResult: VoiceEvaluationResult;
        try {
          evalResult = await evaluateVoiceFlashcardAnswer({
            flashcard_id: card.id,
            question: sanitizeText(card.question),
            expected_answer: sanitizeText(card.answer),
            user_answer_transcript: answerText,
          });
        } catch {
          evalResult = localEvaluate(sanitizeText(card.answer), answerText);
        }
        setEvaluation(evalResult);
        const missing = evalResult.missingPoints?.length ? ` Missing points: ${evalResult.missingPoints.join(", ")}.` : "";
        setHandsFreeState("speaking_feedback");
        speakHandsFree(`${evalResult.feedback} Score: ${evalResult.score} out of 5.${missing} How well did you know this? Say easy, medium, hard, or repeat.`, () => {
          if (!handsFreeActiveRef.current) return;
          setHandsFreeState("listening_rating");
          const handleRating = async (ratingText: string) => {
            const rating = parseRatingCommand(ratingText);
            if (rating === "stop") return endHandsFree(false);
            if (rating === "pause") {
              setHandsFreeState("paused");
              return;
            }
            if (rating === "repeat") {
              runHandsFreeCard(card, cardIndex);
              return;
            }
            if (rating === "skip") {
              advanceHandsFree();
              return;
            }
            if (!rating) {
              speakHandsFree("I didn't catch that. Say easy, medium, hard, repeat, skip, or stop.", () => {
                setHandsFreeState("listening_rating");
                listenHandsFree("rating", handleRating);
              });
              return;
            }
            try {
              await saveHandsFreeResult(card, answerText, evalResult, rating);
            } catch (err: any) {
              setHandsFreeError(err?.message || "Failed to save this hands-free attempt.");
            }
            advanceHandsFree();
          };
          listenHandsFree("rating", handleRating);
        });
      });
    });
  }, [advanceHandsFree, cards.length, endHandsFree, listenHandsFree, saveHandsFreeResult, speakHandsFree]);

  const startHandsFree = useCallback(() => {
    if (!currentCard) return;
    if (!canRecognizeSpeech) {
      setHandsFreeError("Hands-free voice recognition is not supported in this browser. Please use Chrome or manual mode.");
      return;
    }
    setQuizMode("handsfree");
    setHandsFreeActive(true);
    handsFreeActiveRef.current = true;
    runHandsFreeCard(currentCard, clampIndex(idx, cards.length));
  }, [canRecognizeSpeech, cards.length, currentCard, idx, runHandsFreeCard]);

  useEffect(() => {
    if (!handsFreeActive || quizMode !== "handsfree" || handsFreeState !== "moving_next" || !currentCard) return;
    if (nextHandsFreeIndexRef.current !== idx) return;
    nextHandsFreeIndexRef.current = null;
    const timer = window.setTimeout(() => runHandsFreeCard(currentCard, clampIndex(idx, cards.length)), 250);
    return () => window.clearTimeout(timer);
  }, [cards.length, currentCard, handsFreeActive, handsFreeState, idx, quizMode, runHandsFreeCard]);

  useEffect(() => {
    if (loading || !currentCard) return;
    setTranscript("");
    setAudioUrl(null);
    setSavedAttemptId(null);
    setError(null);

    if (quizMode === "manual" && canSpeak) {
      speakQuestion(false);
      return;
    }
    setState("waiting_to_answer");
  }, [canSpeak, currentCard?.id, loading, quizMode]);

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

  const currentNumber = cards.length ? clampIndex(idx, cards.length) + 1 : 0;
  const progressPercent = cards.length ? Math.round((currentNumber / cards.length) * 100) : 0;
  const modeStatus = quizMode === "handsfree" ? handsFreeCue(handsFreeState) : conciseManualCue(state);
  const isListening = quizMode === "handsfree"
    ? handsFreeState === "listening_answer" || handsFreeState === "listening_rating"
    : state === "recording";
  const transcriptText = liveTranscript || transcript;
  const showManualReview = state === "reviewed" || state === "saving";
  const showFeedback = Boolean(evaluation) || showManualReview;

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-muted">{className || `Class #${classId}`}</div>
        </div>
        <div className="min-w-[180px]">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
            <span>Card {currentNumber} of {cards.length}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {(!canSpeak || error || handsFreeError || (quizMode === "handsfree" && !canRecognizeSpeech)) && (
        <div className="rounded-2xl border border-token surface px-4 py-3 text-sm">
          {!canSpeak && <div className="text-muted">Speech playback is unavailable in this browser.</div>}
          {quizMode === "handsfree" && !canRecognizeSpeech && (
            <div className="text-muted">Hands-free voice recognition is not supported in this browser. Use Chrome or manual mode.</div>
          )}
          {error && <div className="text-accent">{error}</div>}
          {handsFreeError && <div className="text-accent">{handsFreeError}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-[28px] border border-token surface shadow-token">
        <div className="h-1 bg-[var(--surface-2)]">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="p-4 sm:p-6 lg:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-token pb-4">
            <div className="inline-flex rounded-xl border border-token surface-2 p-1">
              <button
                type="button"
                onClick={() => {
                  setQuizMode("manual");
                  endHandsFree(false);
                }}
                className={`h-9 rounded-lg px-4 text-sm font-semibold transition ${quizMode === "manual" ? "bg-[var(--primary)] text-inverse shadow-sm" : "text-muted hover:text-main"}`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setQuizMode("handsfree")}
                className={`h-9 rounded-lg px-4 text-sm font-semibold transition ${quizMode === "handsfree" ? "bg-[var(--primary)] text-inverse shadow-sm" : "text-muted hover:text-main"}`}
              >
                Hands-free
              </button>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-token surface-2 px-3 py-1.5 text-sm font-medium text-main">
              <span className={`h-2 w-2 rounded-full ${isListening ? "animate-pulse bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
              {modeStatus}
            </div>
          </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted">Loading cards...</div>
        ) : !currentCard ? (
          <div className="py-12 text-center text-sm text-muted">No flashcards available for voice quiz.</div>
        ) : state === "completed" ? (
          <div className="space-y-4">
            <div className="text-xl font-semibold text-main">Session complete</div>
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl border border-token surface-2 p-3">
                <div className="text-xs text-muted">Attempted</div>
                <div className="mt-1 text-lg font-semibold text-main">{savedCount}</div>
              </div>
              <div className="rounded-xl border border-token surface-2 p-3">
                <div className="text-xs text-muted">Average score</div>
                <div className="mt-1 text-lg font-semibold text-main">
                  {scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "-"} / 5
                </div>
              </div>
              <div className="rounded-xl border border-token surface-2 p-3">
                <div className="text-xs text-muted">Easy / Medium</div>
                <div className="mt-1 text-lg font-semibold text-main">{ratingCounts.easy} / {ratingCounts.medium}</div>
              </div>
              <div className="rounded-xl border border-token surface-2 p-3">
                <div className="text-xs text-muted">Hard</div>
                <div className="mt-1 text-lg font-semibold text-main">{ratingCounts.hard}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setIdx(0);
                  setState("initializing");
                  autoSpokenCardRef.current = null;
                  setScores([]);
                  setRatingCounts({ easy: 0, medium: 0, hard: 0 });
                  setSavedCount(0);
                }}
              >
                Restart from first card
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 pt-5">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Question</div>
                <div className="mt-3 text-2xl font-semibold leading-snug text-main sm:text-3xl">
                  {sanitizeText(currentCard.question)}
                </div>
              </div>
              <div className="rounded-2xl border border-token surface-2 p-4">
                <div className="flex items-center gap-3">
                  <div className={`grid h-11 w-11 place-items-center rounded-2xl ${isListening ? "bg-[var(--primary)] text-inverse" : "surface text-muted"}`}>
                    {isListening ? <Waves className="h-5 w-5 animate-pulse" /> : <Mic className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-main">{isListening ? "Listening for your answer..." : modeStatus}</div>
                    <div className="text-xs text-muted">{isListening ? "Speak now" : quizMode === "handsfree" ? "Hands-free controls are ready" : "Manual controls are ready"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-token surface-2 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Transcript</div>
                <p className="mt-3 min-h-[86px] whitespace-pre-wrap text-sm leading-6 text-main">
                  {transcriptText || "Your spoken answer will appear here."}
                </p>
              </div>
              {showFeedback ? (
                <div className="rounded-2xl border border-token surface-2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Feedback</div>
                    {evaluation && <div className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-inverse">{evaluation.score} / 5</div>}
                  </div>
                  {evaluation ? (
                    <>
                      <p className="mt-3 text-sm leading-6 text-main">{evaluation.feedback}</p>
                      {evaluation.missingPoints?.length ? (
                        <p className="mt-2 text-xs text-muted">Missing: {evaluation.missingPoints.join(", ")}</p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-main">{transcript || "Answer captured."}</p>
                      <p className="mt-3 text-xs text-muted">Rate your attempt below.</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-token surface-2 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Feedback</div>
                  <p className="mt-3 text-sm text-muted">Score and feedback appear after your answer.</p>
                </div>
              )}
            </div>

            {quizMode === "manual" ? (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-token surface-2 p-3">
                <Button onClick={() => speakQuestion(true)} disabled={state === "recording" || state === "transcribing"}>
                  <Volume2 className="mr-2 h-4 w-4" /> Replay
                </Button>
                <Button
                  variant="primary"
                  onClick={() => startAnswering(false)}
                  disabled={state === "recording" || state === "transcribing" || state === "saving"}
                >
                  <Mic className="mr-2 h-4 w-4" /> Start answering
                </Button>
                <Button onClick={() => recorder.stopRecording()} disabled={state !== "recording"}>
                  <Square className="mr-2 h-4 w-4" /> Stop
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
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry
                </Button>
                {recorder.audioBlob && state !== "recording" && state !== "transcribing" && (
                  <Button onClick={() => transcribeBlob(recorder.audioBlob)}>
                    Retry transcription
                  </Button>
                )}
                <Button onClick={nextCard} disabled={state === "transcribing" || state === "saving"}>
                  <SkipForward className="mr-2 h-4 w-4" /> Skip
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-token surface-2 p-3">
                {!handsFreeActive && currentCard && (
                  <Button variant="primary" onClick={startHandsFree}>
                    <Mic className="mr-2 h-4 w-4" /> Start hands-free
                  </Button>
                )}
                <Button
                  onClick={() => {
                    stopRecognition();
                    if (canSpeak) window.speechSynthesis.pause();
                    setHandsFreeState("paused");
                  }}
                  disabled={!handsFreeActive}
                >
                  Pause
                </Button>
                {handsFreeState === "paused" && (
                  <Button
                    onClick={() => {
                      if (canSpeak) window.speechSynthesis.cancel();
                      if (currentCard) runHandsFreeCard(currentCard, clampIndex(idx, cards.length));
                    }}
                  >
                    Resume
                  </Button>
                )}
                <Button onClick={() => currentCard && runHandsFreeCard(currentCard, clampIndex(idx, cards.length))} disabled={!currentCard}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Repeat
                </Button>
                <Button onClick={advanceHandsFree} disabled={!currentCard || handsFreeState === "moving_next"}>
                  <SkipForward className="mr-2 h-4 w-4" /> Skip
                </Button>
                <Button onClick={() => endHandsFree(false)} disabled={!handsFreeActive}>
                  <Square className="mr-2 h-4 w-4" /> Stop
                </Button>
              </div>
            )}

            {(state === "reviewed" || state === "saving") && (
              <div className="rounded-2xl border border-token surface-2 p-4">
                <div className="mb-3 text-sm font-semibold text-main">Self rating</div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      aria-label={`Rate ${score}`}
                      disabled={saving}
                      onClick={() => saveRating(score as 1 | 2 | 3 | 4 | 5)}
                      className={`h-10 rounded-xl border text-sm font-semibold transition ${
                        saving ? "border-token text-muted" : "border-token text-main hover:border-[var(--primary)] hover:bg-[var(--surface)]"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {savedAttemptId && (
              <div className="rounded-2xl border border-token surface-2 px-4 py-3 text-sm text-muted">
                Attempt saved. Moving to the next card...
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
