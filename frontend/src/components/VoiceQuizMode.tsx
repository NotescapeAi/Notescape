import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Mic, RotateCcw, SkipForward, Square, Volume2, Waves } from "lucide-react";
import {
  apiErrorMessage,
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
import {
  localEvaluateVoiceAnswer,
  pickEnglishVoice,
  quizResultFromEvaluation,
  sm2RatingFromEvaluationScore,
  type QuizVerdict,
} from "../lib/voiceQuizUtils";
import { parseVoiceQuizCommand } from "../lib/voiceCommands";
import Button from "./Button";
import { useAudioRecorder } from "../hooks/useAudioRecorder";

const PAUSE_AFTER_QUESTION_MS = 1000;
const HANDS_FREE_FEEDBACK_TTS_MAX_CHARS = 220;

type VoiceState =
  | "initializing"
  | "speaking"
  | "waiting_to_answer"
  | "recording"
  | "transcribing"
  | "evaluating"
  | "feedback"
  | "saving"
  | "completed"
  | "error";

type QuizMode = "manual" | "handsfree";

type HandsFreeState =
  | "idle"
  | "speaking_question"
  | "pause_before_listen"
  | "listening_answer"
  | "evaluating_answer"
  | "feedback_ready"
  | "listening_quiz_command"
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

function manualStatusLabel(state: VoiceState): string {
  if (state === "initializing") return "Getting ready";
  if (state === "speaking") return "Speaking question";
  if (state === "waiting_to_answer") return "Ready";
  if (state === "recording") return "Listening";
  if (state === "transcribing") return "Transcribing";
  if (state === "evaluating") return "Evaluating answer";
  if (state === "feedback") return "Feedback ready";
  if (state === "saving") return "Saving";
  if (state === "completed") return "Complete";
  if (state === "error") return "Needs attention";
  return "Ready";
}

function handsFreeStatusLabel(state: HandsFreeState): string {
  if (state === "speaking_question") return "Speaking question";
  if (state === "pause_before_listen") return "Pause";
  if (state === "listening_answer") return "Listening for your answer";
  if (state === "evaluating_answer") return "Evaluating answer";
  if (state === "feedback_ready") return "Feedback ready";
  if (state === "listening_quiz_command") return "Listening for command";
  if (state === "moving_next") return "Next card";
  if (state === "paused") return "Paused";
  if (state === "completed") return "Complete";
  return "Ready";
}

function friendlyLoadError(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return "Could not load flashcards. Check your connection and that the server is running.";
  }
  return apiErrorMessage(err, "Could not load flashcards for this quiz.");
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
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [handsFreeError, setHandsFreeError] = useState<string | null>(null);
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [normalizedScores, setNormalizedScores] = useState<number[]>([]);
  const [verdictCounts, setVerdictCounts] = useState<Record<QuizVerdict, number>>({
    correct: 0,
    partial: 0,
    incorrect: 0,
  });
  const [showExpectedAnswer, setShowExpectedAnswer] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [autoReadQuestion, setAutoReadQuestion] = useState(true);

  const sessionStartRef = useRef<number>(Date.now());
  const autoSpokenCardRef = useRef<string | null>(null);
  const nextTimerRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const handsFreeActiveRef = useRef(false);
  const answerStartedAtRef = useRef<number>(Date.now());
  const nextHandsFreeIndexRef = useRef<number | null>(null);
  const cardDuringAnswerRef = useRef<Flashcard | null>(null);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const listenMaxTimerRef = useRef<number | null>(null);
  const handsFreePackRef = useRef<{ card: Flashcard; text: string; ev: VoiceEvaluationResult } | null>(null);
  const quizCmdListenTimerRef = useRef<number | null>(null);
  const handsFreeStateRef = useRef<HandsFreeState>("idle");
  const quizCmdUnknownAttemptsRef = useRef(0);
  const listenForQuizCommandRef = useRef<() => void>(() => {});
  const listenHandsFreeRef = useRef<(onFinal: (text: string) => void) => void>(() => {});
  const handsFreeContinueNextRef = useRef<() => Promise<void>>(async () => {});
  const advanceHandsFreeRef = useRef<() => void>(() => {});
  const runHandsFreeCardRef = useRef<(card: Flashcard, cardIndex: number) => void>(() => {});
  const processHandsFreeAnswerRef = useRef<(card: Flashcard, answerText: string) => Promise<void>>(async () => {});
  const endHandsFreeRef = useRef<(complete?: boolean) => void>(() => {});
  const idxRef = useRef(idx);
  const cardsLenRef = useRef(cards.length);

  const recorder = useAudioRecorder();
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const SpeechRecognitionCtor =
    typeof window !== "undefined"
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;
  const canRecognizeSpeech = !!SpeechRecognitionCtor;

  const currentCard = useMemo(() => cards[clampIndex(idx, cards.length)], [cards, idx]);

  useEffect(() => {
    handsFreeStateRef.current = handsFreeState;
  }, [handsFreeState]);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);
  useEffect(() => {
    cardsLenRef.current = cards.length;
  }, [cards.length]);

  useEffect(() => {
    if (!canSpeak) return;
    const sync = () => {
      selectedVoiceRef.current = pickEnglishVoice();
    };
    sync();
    window.speechSynthesis.onvoiceschanged = sync;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [canSpeak]);

  useEffect(() => {
    if (!Number.isFinite(classId) || classId <= 0) {
      setError("Invalid class.");
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
        const [fetchedCards, classes] = await Promise.all([listFlashcards(classId), listClasses()]);
        if (cancelled) return;
        setCards(Array.isArray(fetchedCards) ? fetchedCards : []);
        setIdx(0);
        setClassName(classes.find((c) => c.id === classId)?.name || "");
        setState(Array.isArray(fetchedCards) && fetchedCards.length ? "initializing" : "completed");
      } catch (err: unknown) {
        if (!cancelled) {
          setError(friendlyLoadError(err));
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
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
      const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000));
      if (sessionId) {
        endStudySession({ session_id: sessionId, accumulated_seconds: elapsed }).catch(() => undefined);
      }
      if (canSpeak) window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        recognitionRef.current.abort?.();
        recognitionRef.current = null;
      }
      if (nextTimerRef.current) {
        window.clearTimeout(nextTimerRef.current);
        nextTimerRef.current = null;
      }
      if (pauseTimerRef.current) {
        window.clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
      if (listenMaxTimerRef.current) {
        window.clearTimeout(listenMaxTimerRef.current);
        listenMaxTimerRef.current = null;
      }
    };
  }, [classId, canSpeak]);

  useEffect(() => {
    if (recorder.error) {
      setError(recorder.error);
      setState("error");
    }
  }, [recorder.error]);

  const stopRecognition = useCallback(() => {
    if (quizCmdListenTimerRef.current) {
      window.clearTimeout(quizCmdListenTimerRef.current);
      quizCmdListenTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.abort?.();
      recognitionRef.current = null;
    }
  }, []);

  const nextCard = useCallback(() => {
    if (!cards.length) return;
    const next = idx + 1;
    setTranscript("");
    setLiveTranscript("");
    setAudioUrl(null);
    setEvaluation(null);
    setShowExpectedAnswer(false);
    setError(null);
    recorder.reset();
    cardDuringAnswerRef.current = null;
    handsFreePackRef.current = null;
    if (next >= cards.length) {
      setState("completed");
      return;
    }
    setIdx(next);
    setState("initializing");
  }, [cards.length, idx, recorder]);

  const startAnswering = useCallback(async () => {
    if (!currentCard) return;
    cardDuringAnswerRef.current = currentCard;
    setError(null);
    setTranscript("");
    setAudioUrl(null);
    setEvaluation(null);
    const started = await recorder.startRecording({
      maxDurationMs: 42000,
      silenceDurationMs: 3200,
      minDurationMs: 800,
    });
    if (started) {
      setState("recording");
      return;
    }
    if (recorder.permission === "denied") {
      setError("Microphone permission was denied. Allow microphone access to answer aloud.");
    }
    setState("error");
  }, [currentCard, recorder]);

  const speakQuestion = useCallback(
    (isReplay = false) => {
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
      utterance.rate = speechRate;
      utterance.pitch = 1;
      utterance.volume = 1;
      const v = selectedVoiceRef.current || pickEnglishVoice();
      if (v) utterance.voice = v;
      utterance.onstart = () => setState("speaking");
      utterance.onend = () => {
        setState("waiting_to_answer");
      };
      utterance.onerror = () => {
        setError("Could not read this question aloud. You can still answer by voice or type.");
        setState("waiting_to_answer");
      };
      window.speechSynthesis.speak(utterance);
    },
    [canSpeak, currentCard, speechRate]
  );

  const evaluateAnswerForCard = useCallback(async (card: Flashcard, answerText: string): Promise<VoiceEvaluationResult> => {
    const trimmed = answerText.trim();
    if (!trimmed) {
      return localEvaluateVoiceAnswer(sanitizeText(card.answer), "");
    }
    try {
      return await evaluateVoiceFlashcardAnswer({
        flashcard_id: card.id,
        question: sanitizeText(card.question),
        expected_answer: sanitizeText(card.answer),
        user_answer_transcript: trimmed,
      });
    } catch {
      return localEvaluateVoiceAnswer(sanitizeText(card.answer), trimmed);
    }
  }, []);

  const transcribeAndEvaluate = useCallback(
    async (blob: Blob) => {
      const card = cardDuringAnswerRef.current;
      if (!card) return;
      setState("transcribing");
      setError(null);
      let text = "";
      try {
        const result = await transcribeVoiceFlashcardAnswer(blob);
        text = (result.transcript || "").trim();
        setTranscript(text);
        setAudioUrl(result.audio_url ?? null);
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : "";
        const msg = /transcription is unavailable|TRANSCRIPTION_PROVIDER|OPENAI_API_KEY|GROQ_API_KEY/i.test(raw)
          ? "Voice transcription is not configured. Please try again later or contact your administrator."
          : apiErrorMessage(err, "Could not transcribe your answer. Try again.");
        setError(msg);
        setState("error");
        return;
      }
      setState("evaluating");
      const ev = await evaluateAnswerForCard(card, text);
      setEvaluation(ev);
      setState("feedback");
    },
    [evaluateAnswerForCard]
  );

  useEffect(() => {
    if (!recorder.audioBlob || recorder.status !== "stopped") return;
    if (state === "recording" || state === "transcribing") {
      void transcribeAndEvaluate(recorder.audioBlob);
    }
  }, [recorder.audioBlob, recorder.status, state, transcribeAndEvaluate]);

  const speakHandsFree = useCallback(
    (text: string, onDone: () => void) => {
      stopRecognition();
      if (!canSpeak) {
        onDone();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechRate;
      utterance.pitch = 1;
      utterance.volume = 1;
      const v = selectedVoiceRef.current || pickEnglishVoice();
      if (v) utterance.voice = v;
      utterance.onend = onDone;
      utterance.onerror = () => {
        setHandsFreeError("Text-to-speech had a problem. Continuing.");
        onDone();
      };
      window.speechSynthesis.speak(utterance);
    },
    [canSpeak, speechRate, stopRecognition]
  );

  const listenHandsFree = useCallback(
    (onFinal: (text: string) => void) => {
      if (!SpeechRecognitionCtor) {
        setHandsFreeError("Voice input is not supported in this browser. Use manual mode.");
        return;
      }
      stopRecognition();
      if (listenMaxTimerRef.current) {
        window.clearTimeout(listenMaxTimerRef.current);
        listenMaxTimerRef.current = null;
      }
      setLiveTranscript("");
      const heardRef = { current: "" };
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => {
        let line = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          line += event.results[i][0]?.transcript || "";
        }
        heardRef.current = line.trim();
        setLiveTranscript(heardRef.current);
      };
      recognition.onerror = (event: any) => {
        if (listenMaxTimerRef.current) {
          window.clearTimeout(listenMaxTimerRef.current);
          listenMaxTimerRef.current = null;
        }
        const code = event?.error || "";
        if (code === "aborted") return;
        const msg =
          code === "not-allowed"
            ? "Microphone permission was denied. Allow access or switch to manual mode."
            : code === "no-speech"
              ? "No speech was detected. Try again or speak closer to the microphone."
              : code === "audio-capture"
                ? "No microphone was found."
                : "Speech recognition stopped. You can retry.";
        if (msg) setHandsFreeError(msg);
        setHandsFreeState("paused");
      };
      recognition.onend = () => {
        if (listenMaxTimerRef.current) {
          window.clearTimeout(listenMaxTimerRef.current);
          listenMaxTimerRef.current = null;
        }
        recognitionRef.current = null;
        if (!handsFreeActiveRef.current) return;
        const text = heardRef.current.trim();
        if (!text) {
          setHandsFreeError("No speech was detected. Tap Resume to try again, or Skip to move on.");
          setHandsFreeState("paused");
          return;
        }
        setTranscript(text);
        onFinal(text);
      };
      recognitionRef.current = recognition;
      recognition.start();
      listenMaxTimerRef.current = window.setTimeout(() => {
        listenMaxTimerRef.current = null;
        try {
          recognition.stop();
        } catch {
          /* ignore */
        }
      }, 42000);
    },
    [SpeechRecognitionCtor, speakHandsFree, stopRecognition]
  );

  useLayoutEffect(() => {
    listenHandsFreeRef.current = listenHandsFree;
  }, [listenHandsFree]);

  const saveAttempt = useCallback(
    async (card: Flashcard, answerText: string, ev: VoiceEvaluationResult) => {
      const attemptNumber = (attemptCounts[card.id] || 0) + 1;
      await saveVoiceFlashcardAttempt({
        card_id: card.id,
        transcript: answerText,
        user_rating: sm2RatingFromEvaluationScore(ev.score),
        response_time_seconds: Math.max(1, Math.round((Date.now() - answerStartedAtRef.current) / 1000)),
        audio_url: null,
        score: ev.score,
        feedback: ev.feedback,
        missing_points: ev.missingPoints,
        session_id: studySessionId,
        attempt_number: attemptNumber,
      });
      const qr = quizResultFromEvaluation(ev);
      setVerdictCounts((c) => ({ ...c, [qr.verdict]: c[qr.verdict] + 1 }));
      setNormalizedScores((prev) => [...prev, qr.normalized]);
      setAttemptCounts((prev) => ({ ...prev, [card.id]: attemptNumber }));
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
    },
    [attemptCounts, idx, savedCount, studySessionId]
  );

  const endHandsFree = useCallback(
    (complete = false) => {
      handsFreeActiveRef.current = false;
      setHandsFreeActive(false);
      stopRecognition();
      if (pauseTimerRef.current) {
        window.clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
      if (listenMaxTimerRef.current) {
        window.clearTimeout(listenMaxTimerRef.current);
        listenMaxTimerRef.current = null;
      }
      if (canSpeak) window.speechSynthesis.cancel();
      handsFreePackRef.current = null;
      setHandsFreeState(complete ? "completed" : "idle");
    },
    [canSpeak, stopRecognition]
  );

  const listenForQuizCommand = useCallback(() => {
    if (!handsFreeActiveRef.current || !SpeechRecognitionCtor) return;
    stopRecognition();
    setHandsFreeError(null);
    setLiveTranscript("");
    if (quizCmdListenTimerRef.current) {
      window.clearTimeout(quizCmdListenTimerRef.current);
      quizCmdListenTimerRef.current = null;
    }
    const heardRef = { current: "" };
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      let line = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        line += event.results[i][0]?.transcript || "";
      }
      heardRef.current = line.trim();
      setLiveTranscript(heardRef.current);
    };
    recognition.onerror = (event: any) => {
      if (quizCmdListenTimerRef.current) {
        window.clearTimeout(quizCmdListenTimerRef.current);
        quizCmdListenTimerRef.current = null;
      }
      const code = event?.error || "";
      if (code === "aborted") return;
      recognitionRef.current = null;
      if (!handsFreeActiveRef.current) return;
      quizCmdUnknownAttemptsRef.current = 0;
      setHandsFreeState("feedback_ready");
      if (code === "not-allowed") {
        setHandsFreeError("Microphone permission was denied. Use the Next question button when you are ready.");
      }
    };
    recognition.onend = () => {
      if (quizCmdListenTimerRef.current) {
        window.clearTimeout(quizCmdListenTimerRef.current);
        quizCmdListenTimerRef.current = null;
      }
      recognitionRef.current = null;
      if (!handsFreeActiveRef.current) return;
      if (handsFreeStateRef.current === "paused") return;
      const text = heardRef.current.trim();
      const cmd = parseVoiceQuizCommand(text);
      if (cmd === "unknown" || !text) {
        quizCmdUnknownAttemptsRef.current += 1;
        if (quizCmdUnknownAttemptsRef.current > 2) {
          quizCmdUnknownAttemptsRef.current = 0;
          setHandsFreeState("feedback_ready");
          setHandsFreeError('Did not catch that. Try "next question", "repeat question", or the buttons.');
          return;
        }
        speakHandsFree("Say next question, repeat question, or skip.", () => {
          if (!handsFreeActiveRef.current || handsFreeStateRef.current === "paused") return;
          listenForQuizCommandRef.current();
        });
        return;
      }
      quizCmdUnknownAttemptsRef.current = 0;
      switch (cmd) {
        case "next_question":
          void handsFreeContinueNextRef.current();
          break;
        case "repeat_question": {
          const card = cardDuringAnswerRef.current;
          if (!card || !handsFreeActiveRef.current) break;
          handsFreePackRef.current = null;
          runHandsFreeCardRef.current(card, clampIndex(idxRef.current, cardsLenRef.current));
          break;
        }
        case "retry_answer": {
          const card = cardDuringAnswerRef.current;
          if (!card || !handsFreeActiveRef.current) break;
          answerStartedAtRef.current = Date.now();
          setHandsFreeState("listening_answer");
          listenHandsFreeRef.current(async (answerText) => {
            if (!handsFreeActiveRef.current) return;
            await processHandsFreeAnswerRef.current(card, answerText);
          });
          break;
        }
        case "skip_question":
          handsFreePackRef.current = null;
          advanceHandsFreeRef.current();
          break;
        case "pause_quiz":
          stopRecognition();
          if (canSpeak) window.speechSynthesis.pause();
          setHandsFreeState("paused");
          break;
        case "resume_quiz":
          if (canSpeak) window.speechSynthesis.resume();
          setHandsFreeState("feedback_ready");
          listenForQuizCommandRef.current();
          break;
        case "end_quiz":
          endHandsFreeRef.current(false);
          break;
        default:
          listenForQuizCommandRef.current();
      }
    };
    recognitionRef.current = recognition;
    setHandsFreeState("listening_quiz_command");
    try {
      recognition.start();
    } catch {
      setHandsFreeState("feedback_ready");
      setHandsFreeError("Could not start listening. Use Next question when you are ready.");
      return;
    }
    quizCmdListenTimerRef.current = window.setTimeout(() => {
      quizCmdListenTimerRef.current = null;
      try {
        recognition.stop();
      } catch {
        /* */
      }
    }, 12000);
  }, [SpeechRecognitionCtor, stopRecognition, speakHandsFree, canSpeak]);

  const processHandsFreeAnswer = useCallback(
    async (card: Flashcard, answerText: string) => {
      if (!handsFreeActiveRef.current) return;
      setHandsFreeState("evaluating_answer");
      const ev = await evaluateAnswerForCard(card, answerText);
      setEvaluation(ev);
      handsFreePackRef.current = { card, text: answerText, ev };
      const qr = quizResultFromEvaluation(ev);
      const shortFb = `${qr.label}. ${ev.feedback}`.slice(0, HANDS_FREE_FEEDBACK_TTS_MAX_CHARS);
      setHandsFreeState("feedback_ready");
      speakHandsFree(shortFb, () => {
        if (!handsFreeActiveRef.current) return;
        quizCmdUnknownAttemptsRef.current = 0;
        listenForQuizCommandRef.current();
      });
    },
    [evaluateAnswerForCard, speakHandsFree]
  );

  useLayoutEffect(() => {
    listenForQuizCommandRef.current = listenForQuizCommand;
  }, [listenForQuizCommand]);

  useLayoutEffect(() => {
    processHandsFreeAnswerRef.current = processHandsFreeAnswer;
  }, [processHandsFreeAnswer]);

  const advanceHandsFree = useCallback(() => {
    if (!cards.length) return;
    handsFreePackRef.current = null;
    setHandsFreeState("moving_next");
    const next = idx + 1;
    nextHandsFreeIndexRef.current = next;
    window.setTimeout(() => {
      setLiveTranscript("");
      setEvaluation(null);
      setShowExpectedAnswer(false);
      if (next >= cards.length) {
        setState("completed");
        endHandsFree(true);
        return;
      }
      setIdx(next);
      setState("waiting_to_answer");
    }, 400);
  }, [cards.length, endHandsFree, idx]);

  const runHandsFreeCard = useCallback(
    (card: Flashcard, cardIndex: number) => {
      if (!handsFreeActiveRef.current) return;
      setHandsFreeError(null);
      setTranscript("");
      setLiveTranscript("");
      setEvaluation(null);
      setShowExpectedAnswer(false);
      cardDuringAnswerRef.current = card;
      setHandsFreeState("speaking_question");
      const q = sanitizeText(card.question);
      const intro = `Question ${cardIndex + 1} of ${cards.length}. ${q}`;
      speakHandsFree(intro, () => {
        if (!handsFreeActiveRef.current) return;
        setHandsFreeState("pause_before_listen");
        pauseTimerRef.current = window.setTimeout(() => {
          pauseTimerRef.current = null;
          if (!handsFreeActiveRef.current) return;
          answerStartedAtRef.current = Date.now();
          setHandsFreeState("listening_answer");
          listenHandsFree(async (answerText) => {
            if (!handsFreeActiveRef.current) return;
            await processHandsFreeAnswer(card, answerText);
          });
        }, PAUSE_AFTER_QUESTION_MS);
      });
    },
    [cards.length, listenHandsFree, processHandsFreeAnswer, speakHandsFree]
  );

  const handsFreeContinueNext = useCallback(async () => {
    const hs = handsFreeStateRef.current;
    if (hs !== "feedback_ready" && hs !== "listening_quiz_command") return;
    window.speechSynthesis.cancel();
    stopRecognition();
    const pack = handsFreePackRef.current;
    if (pack) {
      try {
        await saveAttempt(pack.card, pack.text, pack.ev);
      } catch (err: unknown) {
        setHandsFreeError(apiErrorMessage(err, "Could not save this attempt."));
        return;
      }
      handsFreePackRef.current = null;
    }
    advanceHandsFree();
  }, [advanceHandsFree, saveAttempt, stopRecognition]);

  useLayoutEffect(() => {
    advanceHandsFreeRef.current = advanceHandsFree;
  }, [advanceHandsFree]);

  useLayoutEffect(() => {
    handsFreeContinueNextRef.current = handsFreeContinueNext;
  }, [handsFreeContinueNext]);

  useLayoutEffect(() => {
    runHandsFreeCardRef.current = runHandsFreeCard;
  }, [runHandsFreeCard]);

  useLayoutEffect(() => {
    endHandsFreeRef.current = endHandsFree;
  }, [endHandsFree]);

  const startHandsFree = useCallback(() => {
    if (!currentCard) return;
    if (!canRecognizeSpeech) {
      setHandsFreeError("Hands-free needs speech recognition. Use Chrome/Edge or manual mode.");
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
    const t = window.setTimeout(() => runHandsFreeCard(currentCard, clampIndex(idx, cards.length)), 280);
    return () => window.clearTimeout(t);
  }, [cards.length, currentCard, handsFreeActive, handsFreeState, idx, quizMode, runHandsFreeCard]);

  useEffect(() => {
    if (loading || !currentCard) return;
    if (quizMode !== "manual") {
      setState("waiting_to_answer");
      return;
    }
    setTranscript("");
    setAudioUrl(null);
    setEvaluation(null);
    setShowExpectedAnswer(false);
    setError(null);
    if (autoReadQuestion && canSpeak) {
      speakQuestion(false);
    } else {
      setState("waiting_to_answer");
    }
  }, [autoReadQuestion, canSpeak, currentCard?.id, loading, quizMode, speakQuestion]);

  const submitManualAndNext = useCallback(async () => {
    const card = cardDuringAnswerRef.current || currentCard;
    const ev = evaluation;
    if (!card || !ev || !transcript.trim()) {
      setError("Answer the question to receive feedback.");
      return;
    }
    setSaving(true);
    setState("saving");
    setError(null);
    try {
      await saveAttempt(card, transcript.trim(), ev);
      nextCard();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Could not save your attempt. Try again."));
      setState("feedback");
    } finally {
      setSaving(false);
    }
  }, [currentCard, evaluation, nextCard, saveAttempt, transcript]);

  const retryTranscription = useCallback(
    async (blob: Blob | null) => {
      if (!blob) return;
      await transcribeAndEvaluate(blob);
    },
    [transcribeAndEvaluate]
  );

  const currentNumber = cards.length ? clampIndex(idx, cards.length) + 1 : 0;
  const progressPercent = cards.length ? Math.round((currentNumber / cards.length) * 100) : 0;
  const modeStatus = quizMode === "handsfree" ? handsFreeStatusLabel(handsFreeState) : manualStatusLabel(state);
  const isListening =
    quizMode === "handsfree"
      ? handsFreeState === "listening_answer" || handsFreeState === "listening_quiz_command"
      : state === "recording";
  const transcriptDisplay = liveTranscript || transcript;
  const finalScorePercent =
    normalizedScores.length > 0
      ? Math.round((normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length) * 100)
      : 0;

  const verdictBadgeClass = (v: QuizVerdict) => {
    if (v === "correct") return "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[var(--success-soft)] text-[var(--success)]";
    if (v === "partial") return "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-soft)] text-[var(--warning)]";
    return "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-soft)] text-[var(--danger)]";
  };

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-main)]">{className || `Class #${classId}`}</span>
            {" · "}
            Notescape scores your spoken answer — no self-rating. For hands-free study without grading, use{" "}
            <span className="font-medium text-[var(--text-main)]">Voice Flashcards</span>.
          </p>
        </div>
        <div className="min-w-[200px]">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--text-muted)]">
            <span>
              Card {currentNumber} of {cards.length}
            </span>
            <span>Score {finalScorePercent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {(error || handsFreeError || !canSpeak || (quizMode === "handsfree" && !canRecognizeSpeech)) && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          {!canSpeak && <div>Speech playback is not available in this browser.</div>}
          {quizMode === "handsfree" && !canRecognizeSpeech && (
            <div>Voice input is not supported in this browser. Use manual mode to control recording.</div>
          )}
          {error && <div className="mt-1 font-medium text-[var(--danger)]">{error}</div>}
          {handsFreeError && <div className="mt-1 font-medium text-[var(--warning)]">{handsFreeError}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="h-1 bg-[var(--surface-2)]">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="p-4 sm:p-6 lg:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
            <div className="inline-flex rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-1">
              <button
                type="button"
                onClick={() => {
                  setQuizMode("manual");
                  endHandsFree(false);
                }}
                className={`h-9 rounded-md px-4 text-sm font-semibold transition ${
                  quizMode === "manual" ? "bg-[var(--primary)] text-[var(--text-inverse)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setQuizMode("handsfree")}
                className={`h-9 rounded-md px-4 text-sm font-semibold transition ${
                  quizMode === "handsfree" ? "bg-[var(--primary)] text-[var(--text-inverse)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                Hands-free
              </button>
            </div>
            <div className="inline-flex max-w-[min(100%,420px)] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${isListening ? "animate-pulse bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
              <span className="truncate">{modeStatus}</span>
            </div>
          </div>

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-main)]">Manual:</span> you replay, start/stop recording, then review automatic feedback and tap{" "}
            <span className="font-semibold">Next question</span>.{" "}
            <span className="font-semibold text-[var(--text-main)]">Hands-free:</span> the app reads the question, listens, scores your answer, then listens for{" "}
            <span className="font-semibold">next question</span>, <span className="font-semibold">repeat question</span>, or <span className="font-semibold">skip</span> — or tap{" "}
            <span className="font-semibold">Next question</span>.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={autoReadQuestion} onChange={(e) => setAutoReadQuestion(e.target.checked)} className="rounded border-[var(--border)]" />
              Auto-read question
            </label>
            <label className="inline-flex items-center gap-2">
              Speed
              <input
                type="range"
                min={0.75}
                max={1}
                step={0.05}
                value={speechRate}
                onChange={(e) => setSpeechRate(Number(e.target.value))}
                className="w-24"
              />
              <span className="tabular-nums">{speechRate.toFixed(2)}</span>
            </label>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-[var(--text-muted)]">Loading cards…</div>
          ) : !currentCard ? (
            <div className="py-12 text-center text-sm text-[var(--text-muted)]">
              No flashcards are available for this quiz. Generate flashcards for this class first.
            </div>
          ) : state === "completed" ? (
            <div className="space-y-5 pt-6">
              <div className="text-2xl font-semibold text-[var(--text-main)]">Voice Quiz complete</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted-soft)]">Correct</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-main)]">{verdictCounts.correct}</div>
                </div>
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted-soft)]">Partially correct</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-main)]">{verdictCounts.partial}</div>
                </div>
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted-soft)]">Incorrect</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-main)]">{verdictCounts.incorrect}</div>
                </div>
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted-soft)]">Final score</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--primary)]">{finalScorePercent}%</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setIdx(0);
                    setState("initializing");
                    autoSpokenCardRef.current = null;
                    setNormalizedScores([]);
                    setVerdictCounts({ correct: 0, partial: 0, incorrect: 0 });
                    setSavedCount(0);
                  }}
                >
                  Restart quiz
                </Button>
                <Button onClick={() => window.history.back()}>Back to flashcards</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 pt-5">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Question</div>
                  <div className="mt-2 text-2xl font-semibold leading-snug text-[var(--text-main)] sm:text-3xl">{sanitizeText(currentCard.question)}</div>
                </div>
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid h-11 w-11 place-items-center rounded-[var(--radius-lg)] ${
                        isListening ? "bg-[var(--primary)] text-[var(--text-inverse)]" : "bg-[var(--surface)] text-[var(--text-muted)]"
                      }`}
                    >
                      {isListening ? <Waves className="h-5 w-5 animate-pulse" /> : <Mic className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-main)]">{modeStatus}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {state === "evaluating" || handsFreeState === "evaluating_answer"
                          ? "Evaluating your answer…"
                          : isListening
                            ? "Speak clearly"
                            : "Follow the steps below"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">Your answer</div>
                  <p className="mt-3 min-h-[88px] whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]">
                    {transcriptDisplay.trim() ? transcriptDisplay : "Your spoken answer will appear here."}
                  </p>
                </div>
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">Feedback</div>
                  {state === "evaluating" || handsFreeState === "evaluating_answer" ? (
                    <p className="mt-3 text-sm text-[var(--text-muted)]">Evaluating your answer…</p>
                  ) : evaluation ? (
                    <>
                      {(() => {
                        const qr = quizResultFromEvaluation(evaluation);
                        return (
                          <div className="mt-3 space-y-2">
                            <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${verdictBadgeClass(qr.verdict)}`}>{qr.label}</div>
                            <p className="text-sm leading-relaxed text-[var(--text-main)]">{evaluation.feedback}</p>
                            {evaluation.missingPoints?.length ? (
                              <p className="text-xs text-[var(--text-muted)]">
                                <span className="font-semibold text-[var(--text-main)]">Missed key points: </span>
                                {evaluation.missingPoints.join(", ")}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              className="mt-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                              onClick={() => setShowExpectedAnswer((v) => !v)}
                            >
                              {showExpectedAnswer ? "Hide" : "Show"} expected answer
                            </button>
                            {showExpectedAnswer ? (
                              <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--text-main)]">{sanitizeText(currentCard.answer)}</p>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--text-muted)]">Answer the question to receive feedback.</p>
                  )}
                </div>
              </div>

              {quizMode === "manual" ? (
                <div className="flex flex-wrap gap-2 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <Button onClick={() => speakQuestion(true)} disabled={state === "recording" || state === "transcribing" || state === "evaluating"}>
                    <Volume2 className="mr-2 h-4 w-4" /> Replay question
                  </Button>
                  <Button variant="primary" onClick={() => void startAnswering()} disabled={state === "recording" || state === "transcribing" || state === "evaluating" || state === "saving"}>
                    <Mic className="mr-2 h-4 w-4" /> Start answering
                  </Button>
                  <Button onClick={() => recorder.stopRecording()} disabled={state !== "recording"}>
                    <Square className="mr-2 h-4 w-4" /> Done answering
                  </Button>
                  <Button
                    onClick={() => {
                      setError(null);
                      setTranscript("");
                      setAudioUrl(null);
                      setEvaluation(null);
                      recorder.reset();
                      setState("waiting_to_answer");
                    }}
                    disabled={state === "recording" || state === "transcribing" || state === "evaluating" || state === "saving"}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Retry
                  </Button>
                  {recorder.audioBlob && state !== "recording" && state !== "transcribing" && state !== "evaluating" ? (
                    <Button onClick={() => void retryTranscription(recorder.audioBlob)}>Retry transcription</Button>
                  ) : null}
                  <Button onClick={nextCard} disabled={state === "transcribing" || state === "evaluating" || state === "saving"}>
                    <SkipForward className="mr-2 h-4 w-4" /> Skip
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  {!handsFreeActive && (
                    <Button variant="primary" onClick={startHandsFree}>
                      <Mic className="mr-2 h-4 w-4" /> Start hands-free
                    </Button>
                  )}
                  {handsFreeState === "listening_answer" && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        try {
                          recognitionRef.current?.stop?.();
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      <Square className="mr-2 h-4 w-4" /> Done answering
                    </Button>
                  )}
                  {(handsFreeState === "feedback_ready" || handsFreeState === "listening_quiz_command") && (
                    <Button variant="primary" onClick={() => void handsFreeContinueNext()}>
                      Next question
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      stopRecognition();
                      window.speechSynthesis.pause();
                      setHandsFreeState("paused");
                    }}
                    disabled={!handsFreeActive}
                  >
                    Pause
                  </Button>
                  {handsFreeState === "paused" && (
                    <Button
                      onClick={() => {
                        window.speechSynthesis.cancel();
                        if (currentCard) runHandsFreeCard(currentCard, clampIndex(idx, cards.length));
                      }}
                    >
                      Resume
                    </Button>
                  )}
                  <Button onClick={() => currentCard && runHandsFreeCard(currentCard, clampIndex(idx, cards.length))} disabled={!currentCard}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Repeat card
                  </Button>
                  <Button onClick={advanceHandsFree} disabled={!currentCard || handsFreeState === "moving_next"}>
                    <SkipForward className="mr-2 h-4 w-4" /> Skip
                  </Button>
                  <Button onClick={() => endHandsFree(false)} disabled={!handsFreeActive}>
                    <Square className="mr-2 h-4 w-4" /> Stop
                  </Button>
                </div>
              )}

              {quizMode === "manual" && state === "feedback" && evaluation && (
                <div className="flex justify-end border-t border-[var(--border)] pt-4">
                  <Button variant="primary" disabled={saving} onClick={() => void submitManualAndNext()}>
                    {saving ? "Saving…" : "Next question"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
