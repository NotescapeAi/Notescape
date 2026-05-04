/**
 * Voice Flashcards — single, unified hands-free study experience.
 *
 * One screen, three modes:
 *   • Teach me  — app reads each card; user steers with voice ("show answer", "next card", …).
 *   • Ask me    — app reads each card, listens to the spoken answer, evaluates it via the
 *                 backend (`/api/flashcards/voice/...`) and reads back short feedback.
 *   • Mixed     — Teach Me by default; the user switches anytime by saying "ask me" / "teach me".
 *
 * Routing:
 *   - /classes/:classId/flashcards/voice  → starts directly inside the chosen class.
 *   - /voice-revision                     → class picker, then identical experience.
 *
 * This file replaces the previous Voice Quiz feature (`VoiceQuizMode`,
 * `FlashcardsVoiceQuizPage`) and the old hands-free `VoiceRevisionMode`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Mic,
  MicOff,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import VoiceSettingsPanel from "../components/VoiceSettingsPanel";
import {
  chatAsk,
  endStudySession,
  evaluateVoiceFlashcardAnswer,
  heartbeatStudySession,
  listClasses,
  listFlashcards,
  postReview,
  saveVoiceFlashcardAttempt,
  startStudySession,
  transcribeVoiceFlashcardAnswer,
  type ClassRow,
  type Flashcard,
  type VoiceEvaluationResult,
} from "../lib/api";
import {
  parseVoiceCommand,
  type VoiceCommand,
} from "../lib/voiceCommands";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  loadVoicePrefs,
  sanitizeFlashcardText,
  speak as ttsSpeak,
  stopSpeaking,
  type VoicePrefs,
} from "../lib/voiceService";
import {
  localEvaluateVoiceAnswer,
  quizResultFromEvaluation,
  sm2RatingFromEvaluationScore,
  type QuizVerdict,
} from "../lib/voiceQuizUtils";
import { useAudioRecorder } from "../hooks/useAudioRecorder";

/* ────────────────────────── Types ────────────────────────── */

type Mode = "teach" | "ask" | "mixed";

type Phase =
  | "idle"
  | "speakingQuestion"
  | "speakingAnswer"
  | "speakingFeedback"
  | "explaining"
  | "listeningCommand"
  | "recordingAnswer"
  | "transcribing"
  | "evaluating"
  | "paused"
  | "complete"
  | "error";

type LocationState = {
  cards?: Flashcard[];
  className?: string;
  startIndex?: number;
};

type Verdicts = Record<QuizVerdict, number>;

/* ────────────────────────── Helpers ────────────────────────── */

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fallbackExplanation(card: Flashcard): string {
  const a = sanitizeFlashcardText(card.answer);
  if (!a) return "Focus on the key terms from the question.";
  const short = a.length > 200 ? `${a.slice(0, 200).trim()}…` : a;
  return `Here is a simpler way to think about it: ${short}`;
}

function shortenForSpeech(text: string, max = 220): string {
  const s = text.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  speakingQuestion: "Reading question",
  speakingAnswer: "Reading answer",
  speakingFeedback: "Reading feedback",
  explaining: "Explaining",
  listeningCommand: "Listening",
  recordingAnswer: "Listening for answer",
  transcribing: "Transcribing",
  evaluating: "Evaluating",
  paused: "Paused",
  complete: "Session complete",
  error: "Needs attention",
};

const COMMAND_TIPS: Record<Mode, string[]> = {
  teach: ["show answer", "next card", "explain more", "ask me"],
  ask: ["next card", "show answer", "try again", "teach me"],
  mixed: ["next card", "show answer", "ask me", "teach me"],
};

const MODE_LABEL: Record<Mode, string> = {
  teach: "Teach me",
  ask: "Ask me",
  mixed: "Mixed",
};

/* ────────────────────────── Component ────────────────────────── */

export default function VoiceFlashcardsPage() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const routeClassId = params.classId ? Number(params.classId) : null;
  const initialState = (location.state || {}) as LocationState;

  /* ─── Capabilities ─── */
  const ttsOk = isSpeechSynthesisSupported();
  const sttOk = isSpeechRecognitionSupported();
  const RecognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);

  /* ─── Class & deck state ─── */
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classLoading, setClassLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(routeClassId);
  const [className, setClassName] = useState<string>(initialState.className ?? "");
  const [deck, setDeck] = useState<Flashcard[]>(
    Array.isArray(initialState.cards) ? initialState.cards : [],
  );
  const [cardIndex, setCardIndex] = useState<number>(Math.max(0, initialState.startIndex ?? 0));
  const [deckLoading, setDeckLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* ─── Session state ─── */
  const [mode, setMode] = useState<Mode>("teach");
  const [sessionActive, setSessionActive] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [answerShown, setAnswerShown] = useState(false);
  const [evaluation, setEvaluation] = useState<VoiceEvaluationResult | null>(null);
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Verdicts>({ correct: 0, partial: 0, incorrect: 0 });
  const [answersAttempted, setAnswersAttempted] = useState(0);
  const [normalizedScores, setNormalizedScores] = useState<number[]>([]);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);

  /* ─── Voice prefs ─── */
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(() => loadVoicePrefs());
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ─── Refs (avoid stale closures inside async TTS / STT callbacks) ─── */
  const phaseRef = useRef(phase);
  const modeRef = useRef(mode);
  const sessionActiveRef = useRef(sessionActive);
  const deckRef = useRef(deck);
  const cardIndexRef = useRef(cardIndex);
  const answerShownRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const listenTimerRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const studySessionIdRef = useRef<string | null>(null);
  const cardForAnswerRef = useRef<Flashcard | null>(null);
  const answerStartRef = useRef<number>(Date.now());
  const voicePrefsRef = useRef(voicePrefs);
  const lastSpokenKindRef = useRef<"question" | "answer" | "feedback" | "explanation" | null>(null);

  const recorder = useAudioRecorder();

  /* ─── Sync refs ─── */
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sessionActiveRef.current = sessionActive; }, [sessionActive]);
  useEffect(() => { deckRef.current = deck; }, [deck]);
  useEffect(() => { cardIndexRef.current = cardIndex; }, [cardIndex]);
  useEffect(() => { answerShownRef.current = answerShown; }, [answerShown]);
  useEffect(() => { studySessionIdRef.current = studySessionId; }, [studySessionId]);
  useEffect(() => { voicePrefsRef.current = voicePrefs; }, [voicePrefs]);

  /* ─── Cleanup on unmount ─── */
  const stopRecognition = useCallback(() => {
    if (listenTimerRef.current) {
      window.clearTimeout(listenTimerRef.current);
      listenTimerRef.current = null;
    }
    const r = recognitionRef.current;
    if (r) {
      try {
        r.onend = null;
        r.onerror = null;
        r.onresult = null;
      } catch { /* ignore */ }
      try { r.stop(); } catch { /* ignore */ }
      try { r.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  }, []);

  const fullStop = useCallback(() => {
    stopRecognition();
    stopSpeaking();
  }, [stopRecognition]);

  useEffect(() => () => fullStop(), [fullStop]);

  /* ─── Class list ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cs = await listClasses();
        if (cancelled) return;
        setClasses(cs);
        if (!selectedClassId && cs[0]) setSelectedClassId(cs[0].id);
      } catch {
        if (!cancelled) setLoadError("Could not load your classes.");
      } finally {
        if (!cancelled) setClassLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Resolve class name when selection changes / classes arrive. */
  useEffect(() => {
    if (!selectedClassId) return;
    const found = classes.find((c) => c.id === selectedClassId);
    if (found?.name) setClassName(found.name);
  }, [classes, selectedClassId]);

  /* Fetch flashcards when class changes (unless we were given them via location.state). */
  useEffect(() => {
    if (!selectedClassId) {
      setDeck([]);
      return;
    }
    if (initialState.cards && initialState.cards.length && selectedClassId === routeClassId) {
      // Already seeded from location.state; nothing to fetch.
      return;
    }
    let cancelled = false;
    setDeckLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const cards = await listFlashcards(selectedClassId);
        if (cancelled) return;
        setDeck(Array.isArray(cards) ? cards : []);
      } catch {
        if (!cancelled) setLoadError("Could not load flashcards for this class.");
      } finally {
        if (!cancelled) setDeckLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedClassId, routeClassId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Persist voice prefs whenever they change (also done in the panel). */
  useEffect(() => {
    voicePrefsRef.current = voicePrefs;
  }, [voicePrefs]);

  const currentCard = sessionActive && deck.length ? deck[Math.min(cardIndex, deck.length - 1)] : null;
  const canStart = !!selectedClassId && deck.length > 0 && !deckLoading && !sessionActive;

  /* ─── Speech helper ─── */
  const speak = useCallback((text: string, then?: () => void) => {
    stopRecognition();
    ttsSpeak(text, {
      prefs: voicePrefsRef.current,
      onEnd: () => then?.(),
      onError: () => then?.(),
    });
  }, [stopRecognition]);

  /* ─── Forward refs for handlers (so we can cross-reference inside callbacks) ─── */
  const handleCommandRef = useRef<(cmd: VoiceCommand) => Promise<void> | void>(async () => undefined);
  const startListenForCommandRef = useRef<() => void>(() => {});
  const startListenForAnswerRef = useRef<() => Promise<void> | void>(async () => undefined);
  const readAnswerRef = useRef<(card: Flashcard) => void>(() => {});
  const advanceToNextRef = useRef<() => void>(() => {});

  /* ─── Heartbeat helper ─── */
  const heartbeat = useCallback((cardsCompleted?: number) => {
    const sid = studySessionIdRef.current;
    if (!sid) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000));
    heartbeatStudySession({
      session_id: sid,
      accumulated_seconds: elapsed,
      cards_seen: cardIndexRef.current + 1,
      cards_completed: cardsCompleted,
    }).catch(() => undefined);
  }, []);

  /* ─── One-shot listen for a command (Teach Me + post-feedback in Ask Me) ─── */
  const startListenForCommand = useCallback(() => {
    if (!sessionActiveRef.current) return;
    if (phaseRef.current === "paused") return;
    if (!RecognitionCtor) {
      // No STT available — stay idle; user must use buttons.
      setPhase("idle");
      return;
    }
    stopRecognition();
    setPhase("listeningCommand");
    setLiveTranscript("");
    let heard = "";

    const rec = new RecognitionCtor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) => {
      let line = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        line += event.results[i][0]?.transcript || "";
      }
      heard = line.trim();
      setLiveTranscript(heard);
    };
    rec.onerror = (e: any) => {
      const code = e?.error || "";
      if (code === "aborted") return;
      if (code === "not-allowed") {
        setHint("Microphone permission was denied. Use the buttons below.");
      }
      // Don't loop on errors — let user act.
      if (sessionActiveRef.current && phaseRef.current === "listeningCommand") {
        setPhase("idle");
      }
    };
    rec.onend = () => {
      if (listenTimerRef.current) {
        window.clearTimeout(listenTimerRef.current);
        listenTimerRef.current = null;
      }
      recognitionRef.current = null;
      if (!sessionActiveRef.current || phaseRef.current === "paused") return;
      const cmd = parseVoiceCommand(heard);
      if (heard) setLastCommand(heard);
      if (cmd === "unknown") {
        // Quiet fail — re-listen so the user can speak again.
        if (phaseRef.current === "listeningCommand") {
          window.setTimeout(() => startListenForCommandRef.current(), 200);
        }
        return;
      }
      void handleCommandRef.current(cmd);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setPhase("idle");
      return;
    }
    listenTimerRef.current = window.setTimeout(() => {
      try { rec.stop(); } catch { /* ignore */ }
    }, 14000);
  }, [RecognitionCtor, stopRecognition]);

  useEffect(() => { startListenForCommandRef.current = startListenForCommand; }, [startListenForCommand]);

  /* ─── Read the question ─── */
  const readQuestion = useCallback((card: Flashcard, index: number, total: number) => {
    setAnswerShown(false);
    setEvaluation(null);
    setTranscript("");
    setLiveTranscript("");
    setPhase("speakingQuestion");
    lastSpokenKindRef.current = "question";
    const q = sanitizeFlashcardText(card.question);
    const intro = `Card ${index + 1} of ${total}.`;
    speak(`${intro} ${q}`, () => {
      if (!sessionActiveRef.current) return;
      const m = modeRef.current;
      if (m === "ask") {
        void startListenForAnswerRef.current();
      } else {
        startListenForCommand();
      }
    });
  }, [speak, startListenForCommand]);

  /* ─── Read the answer ─── */
  const readAnswer = useCallback((card: Flashcard) => {
    setPhase("speakingAnswer");
    setAnswerShown(true);
    lastSpokenKindRef.current = "answer";
    const a = sanitizeFlashcardText(card.answer);
    speak(`The answer is: ${a}`, () => {
      if (!sessionActiveRef.current) return;
      startListenForCommand();
    });
  }, [speak, startListenForCommand]);

  useEffect(() => { readAnswerRef.current = readAnswer; }, [readAnswer]);

  /* ─── Read an explanation (LLM, with graceful fallback) ─── */
  const readExplanation = useCallback(async (card: Flashcard) => {
    setPhase("explaining");
    lastSpokenKindRef.current = "explanation";
    let text: string;
    try {
      const res = await chatAsk({
        class_id: selectedClassId ?? undefined,
        mode: "general",
        question: `You are a friendly tutor. In under 90 words for spoken audio, explain this flashcard simply, add one short analogy or memory hint, stay concise. Question: ${sanitizeFlashcardText(card.question)}. Answer: ${sanitizeFlashcardText(card.answer)}.`,
      });
      text = (res.answer || "").trim().slice(0, 480) || fallbackExplanation(card);
    } catch {
      text = fallbackExplanation(card);
    }
    setAnswerShown(true);
    speak(text, () => {
      if (!sessionActiveRef.current) return;
      startListenForCommand();
    });
  }, [selectedClassId, speak, startListenForCommand]);

  /* ─── Advance to the next card (or end the session) ─── */
  const advanceToNext = useCallback(() => {
    const nextIdx = cardIndexRef.current + 1;
    const total = deckRef.current.length;
    if (nextIdx >= total) {
      setPhase("complete");
      setSessionActive(false);
      sessionActiveRef.current = false;
      stopRecognition();
      speak("That was the last card. Session complete.", () => stopSpeaking());
      heartbeat(answersAttempted);
      return;
    }
    setCardIndex(nextIdx);
    cardIndexRef.current = nextIdx;
    const card = deckRef.current[nextIdx];
    if (card) readQuestion(card, nextIdx, total);
  }, [answersAttempted, heartbeat, readQuestion, speak, stopRecognition]);

  useEffect(() => { advanceToNextRef.current = advanceToNext; }, [advanceToNext]);

  /* ─── Apply an SRS mark (Teach Me) ─── */
  const applyMark = useCallback(async (score: 1 | 2 | 3 | 4 | 5, label: string) => {
    const card = currentCard;
    if (!card) return;
    try {
      await postReview(card.id, score);
      speak(`Marked as ${label}.`, () => {
        if (!sessionActiveRef.current) return;
        startListenForCommand();
      });
    } catch {
      setHint("Could not save that mark, but the session continues.");
      startListenForCommand();
    }
  }, [currentCard, speak, startListenForCommand]);

  /* ─── Ask Me: record the spoken answer ─── */
  const startListenForAnswer = useCallback(async () => {
    const card = deckRef.current[cardIndexRef.current];
    if (!card) return;
    cardForAnswerRef.current = card;
    setHint(null);
    setEvaluation(null);
    setTranscript("");
    answerStartRef.current = Date.now();
    setPhase("recordingAnswer");
    const started = await recorder.startRecording({
      maxDurationMs: 42000,
      silenceDurationMs: 3200,
      minDurationMs: 800,
    });
    if (!started) {
      const denied = recorder.permission === "denied";
      setHint(
        denied
          ? "Microphone permission was denied. Use the buttons below or switch to Teach me."
          : "Could not access the microphone. Use the buttons below or switch to Teach me.",
      );
      setPhase("idle");
      // In Mixed mode the user can still drive with commands.
      startListenForCommand();
    }
  }, [recorder, startListenForCommand]);

  useEffect(() => { startListenForAnswerRef.current = startListenForAnswer; }, [startListenForAnswer]);

  /* ─── Evaluate a transcript and announce feedback ─── */
  const evaluateTranscript = useCallback(async (card: Flashcard, transcriptText: string) => {
    setPhase("evaluating");
    let ev: VoiceEvaluationResult;
    const expected = sanitizeFlashcardText(card.answer);
    if (!transcriptText.trim()) {
      ev = localEvaluateVoiceAnswer(expected, "");
    } else {
      try {
        ev = await evaluateVoiceFlashcardAnswer({
          flashcard_id: card.id,
          question: sanitizeFlashcardText(card.question),
          expected_answer: expected,
          user_answer_transcript: transcriptText.trim(),
        });
      } catch {
        ev = localEvaluateVoiceAnswer(expected, transcriptText.trim());
      }
    }
    setEvaluation(ev);
    const qr = quizResultFromEvaluation(ev);
    setVerdicts((prev) => ({ ...prev, [qr.verdict]: prev[qr.verdict] + 1 }));
    setNormalizedScores((prev) => [...prev, qr.normalized]);
    setAnswersAttempted((n) => n + 1);

    // Persist the attempt — failures don't block the flow.
    try {
      await saveVoiceFlashcardAttempt({
        card_id: card.id,
        transcript: transcriptText.trim(),
        user_rating: sm2RatingFromEvaluationScore(ev.score),
        response_time_seconds: Math.max(1, Math.round((Date.now() - answerStartRef.current) / 1000)),
        audio_url: null,
        score: ev.score,
        feedback: ev.feedback,
        missing_points: ev.missingPoints,
        session_id: studySessionIdRef.current,
      });
    } catch {
      /* ignore save errors */
    }
    heartbeat(answersAttempted + 1);

    // Speak short feedback, then ask what to do next.
    setPhase("speakingFeedback");
    lastSpokenKindRef.current = "feedback";
    const intro =
      qr.verdict === "correct"
        ? "Great answer."
        : qr.verdict === "partial"
          ? "Partly there."
          : "Not quite.";
    const followup =
      qr.verdict === "correct"
        ? "Say next card to continue."
        : "Say show answer to hear it, or next card to move on.";
    const spoken = shortenForSpeech(`${intro} ${ev.feedback} ${followup}`);
    speak(spoken, () => {
      if (!sessionActiveRef.current) return;
      startListenForCommand();
    });
  }, [answersAttempted, heartbeat, speak, startListenForCommand]);

  /* When a recording completes, transcribe + evaluate. */
  useEffect(() => {
    if (!recorder.audioBlob || recorder.status !== "stopped") return;
    if (phaseRef.current !== "recordingAnswer" && phaseRef.current !== "transcribing") return;
    const card = cardForAnswerRef.current;
    if (!card) return;
    const blob = recorder.audioBlob;
    setPhase("transcribing");
    (async () => {
      let text = "";
      try {
        const result = await transcribeVoiceFlashcardAnswer(blob);
        text = (result.transcript || "").trim();
        setTranscript(text);
      } catch {
        setHint("Voice transcription is unavailable. Try again or switch to Teach me.");
        setPhase("idle");
        startListenForCommand();
        return;
      }
      await evaluateTranscript(card, text);
    })();
  }, [recorder.audioBlob, recorder.status, evaluateTranscript, startListenForCommand]);

  /* ─── Command dispatcher ─── */
  const handleCommand = useCallback(async (cmd: VoiceCommand) => {
    const card = deckRef.current[cardIndexRef.current];
    if (!card || !sessionActiveRef.current) return;
    if (phaseRef.current === "paused" && cmd !== "resume" && cmd !== "end_session") return;

    switch (cmd) {
      case "pause":
        fullStop();
        setPhase("paused");
        return;

      case "resume":
        if (phaseRef.current === "paused") {
          // Resume by re-reading the current card.
          const total = deckRef.current.length;
          readQuestion(card, cardIndexRef.current, total);
        }
        return;

      case "end_session":
        fullStop();
        setSessionActive(false);
        sessionActiveRef.current = false;
        setPhase("complete");
        speak("Session ended. Nice work.", () => stopSpeaking());
        return;

      case "open_settings":
        setSettingsOpen(true);
        return;

      case "mode_teach":
        setMode("teach");
        modeRef.current = "teach";
        speak("Teach me mode. Say show answer or next card.", () => startListenForCommand());
        return;

      case "mode_ask":
        setMode("ask");
        modeRef.current = "ask";
        speak("Ask me mode. I'll listen for your answer after each question.", () => {
          void startListenForAnswerRef.current();
        });
        return;

      case "mode_mixed":
        setMode("mixed");
        modeRef.current = "mixed";
        speak("Mixed mode. Say teach me or ask me anytime.", () => startListenForCommand());
        return;

      case "next_card":
      case "skip_question":
        advanceToNext();
        return;

      case "previous_card":
        if (cardIndexRef.current <= 0) {
          speak("You are on the first card.", () => startListenForCommand());
          return;
        }
        const prevIdx = cardIndexRef.current - 1;
        setCardIndex(prevIdx);
        cardIndexRef.current = prevIdx;
        readQuestion(deckRef.current[prevIdx], prevIdx, deckRef.current.length);
        return;

      case "repeat_question":
        readQuestion(card, cardIndexRef.current, deckRef.current.length);
        return;

      case "show_answer":
      case "repeat_answer":
        readAnswer(card);
        return;

      case "repeat":
        // Repeat last spoken kind.
        if (lastSpokenKindRef.current === "answer" || answerShownRef.current) {
          readAnswer(card);
        } else {
          readQuestion(card, cardIndexRef.current, deckRef.current.length);
        }
        return;

      case "hide_answer":
        setAnswerShown(false);
        startListenForCommand();
        return;

      case "explain_more":
        await readExplanation(card);
        return;

      case "i_dont_know":
        speak("No problem. Here is the answer.", () => readAnswer(card));
        return;

      case "try_again":
        if (modeRef.current === "ask" || modeRef.current === "mixed") {
          void startListenForAnswerRef.current();
        } else {
          readQuestion(card, cardIndexRef.current, deckRef.current.length);
        }
        return;

      case "mark_again":
        await applyMark(1, "again");
        return;
      case "mark_hard":
        await applyMark(2, "hard");
        return;
      case "mark_good":
        await applyMark(3, "good");
        return;
      case "mark_easy":
        await applyMark(4, "easy");
        return;
      case "mark_mastered":
        await applyMark(5, "mastered");
        return;

      default:
        // unknown — re-listen
        startListenForCommand();
    }
  }, [advanceToNext, applyMark, fullStop, readAnswer, readExplanation, readQuestion, speak, startListenForCommand]);

  useEffect(() => { handleCommandRef.current = handleCommand; }, [handleCommand]);

  /* ─── Start / end session ─── */
  const startSession = useCallback(async (initialMode: Mode = mode) => {
    if (!selectedClassId) return;
    fullStop();
    setHint(null);
    setLoadError(null);
    setVerdicts({ correct: 0, partial: 0, incorrect: 0 });
    setAnswersAttempted(0);
    setNormalizedScores([]);
    setEvaluation(null);
    setTranscript("");
    setLiveTranscript("");
    setLastCommand("");

    let cards = deck;
    if (!cards.length) {
      try {
        const fresh = await listFlashcards(selectedClassId);
        cards = Array.isArray(fresh) ? fresh : [];
        setDeck(cards);
      } catch {
        setLoadError("Could not load flashcards for this class.");
        return;
      }
    }
    cards = cards.filter((c) => sanitizeFlashcardText(c.question));
    if (!cards.length) {
      setHint("No flashcards available. Generate some from the class first.");
      return;
    }
    const ordered = initialState.cards && initialState.cards.length ? cards : shuffle(cards);
    deckRef.current = ordered;
    setDeck(ordered);
    const startIdx = Math.max(0, Math.min(initialState.startIndex ?? 0, ordered.length - 1));
    setCardIndex(startIdx);
    cardIndexRef.current = startIdx;
    setMode(initialMode);
    modeRef.current = initialMode;
    setSessionActive(true);
    sessionActiveRef.current = true;
    sessionStartRef.current = Date.now();

    // Best-effort study session record (mode includes "voice" so dashboard resume works).
    if (selectedClassId && Number.isFinite(selectedClassId)) {
      try {
        const sess = await startStudySession({ class_id: selectedClassId, mode: "voice" });
        setStudySessionId(sess.id);
        studySessionIdRef.current = sess.id;
      } catch {
        /* ignore — local-only is fine */
      }
    }

    readQuestion(ordered[startIdx], startIdx, ordered.length);
  }, [deck, fullStop, initialState.cards, initialState.startIndex, mode, readQuestion, selectedClassId]);

  const endSession = useCallback(() => {
    fullStop();
    setSessionActive(false);
    sessionActiveRef.current = false;
    setPhase("complete");
    if (studySessionIdRef.current) {
      const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000));
      endStudySession({ session_id: studySessionIdRef.current, accumulated_seconds: elapsed }).catch(() => undefined);
      studySessionIdRef.current = null;
      setStudySessionId(null);
    }
  }, [fullStop]);

  /* ─── Mode switch button (in-session) ─── */
  const switchMode = useCallback((next: Mode) => {
    if (next === mode) return;
    setMode(next);
    modeRef.current = next;
    fullStop();
    if (!sessionActive) return;
    const card = deckRef.current[cardIndexRef.current];
    if (!card) return;
    if (next === "ask") {
      void startListenForAnswerRef.current();
    } else if (next === "teach") {
      readAnswerRef.current(card);
    } else {
      startListenForCommand();
    }
  }, [fullStop, mode, sessionActive, startListenForCommand]);

  /* ─── Derived UI values ─── */
  const total = deck.length || 1;
  const progressPct = sessionActive
    ? Math.min(100, Math.round(((cardIndex + 1) / total) * 100))
    : phase === "complete"
      ? 100
      : 0;

  const finalScorePct = normalizedScores.length
    ? Math.round((normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length) * 100)
    : 0;

  const isListening = phase === "listeningCommand" || phase === "recordingAnswer";
  const isSpeaking = phase === "speakingQuestion" || phase === "speakingAnswer" || phase === "speakingFeedback" || phase === "explaining";

  const orbState: "idle" | "listening" | "speaking" | "thinking" =
    phase === "evaluating" || phase === "transcribing"
      ? "thinking"
      : isListening
        ? "listening"
        : isSpeaking
          ? "speaking"
          : "idle";

  /* ────────────────────────── Render ────────────────────────── */

  // No flashcards loaded yet — show a clean empty state.
  const showEmpty = !sessionActive && !deckLoading && !classLoading && selectedClassId !== null && deck.length === 0;

  return (
    <AppShell
      title="Voice Flashcards"
      backLabel={routeClassId ? "Flashcards" : "Dashboard"}
      backTo={routeClassId ? `/classes/${routeClassId}/flashcards` : "/dashboard"}
      headerMaxWidthClassName="max-w-[960px]"
      contentGapClassName="gap-4"
      headerActions={
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
          aria-label="Open voice settings"
        >
          <Settings2 className="h-4 w-4" aria-hidden />
          Voice
        </button>
      }
    >
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 pb-10">
        {/* Capability strip */}
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
            <Volume2 className="h-3.5 w-3.5" />
            {ttsOk ? "Speech ready" : "Speech unavailable"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
            {sttOk ? <Mic className="h-3.5 w-3.5 text-[var(--success)]" /> : <MicOff className="h-3.5 w-3.5" />}
            {sttOk ? "Voice commands ready" : "Use buttons (no voice input)"}
          </span>
          {sessionActive && className ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
              <BookOpen className="h-3.5 w-3.5" />
              {className}
            </span>
          ) : null}
          {sessionActive && mode === "ask" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_28%,transparent)] bg-[var(--primary-soft)] px-2.5 py-1 text-[var(--primary)]">
              Score {finalScorePct}%
            </span>
          ) : null}
        </div>

        {loadError ? (
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[var(--danger-soft)] px-4 py-2.5 text-sm font-medium text-[var(--danger)]">
            {loadError}
          </div>
        ) : null}
        {hint ? (
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)] bg-[var(--warning-soft)] px-4 py-2.5 text-sm font-medium text-[var(--warning)]">
            {hint}
          </div>
        ) : null}

        {/* Setup card (before a session has started) */}
        {!sessionActive && phase !== "complete" ? (
          <section className="premium-cta p-5 sm:p-6">
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <span className="eyebrow">
                  <span className="eyebrow-dot" aria-hidden />
                  Voice Flashcards
                </span>
                <h2 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.025em] text-[var(--text-main)] sm:text-[26px]">
                  Study hands-free with your voice
                </h2>
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--text-secondary)]">
                  Pick a mode and let the app drive: it reads each card and listens for natural commands like
                  <span className="px-1 font-medium text-[var(--text-main)]">"show answer"</span>,
                  <span className="px-1 font-medium text-[var(--text-main)]">"next card"</span>, or
                  <span className="px-1 font-medium text-[var(--text-main)]">"explain more"</span>.
                </p>

                <div className="mt-5 flex flex-wrap items-end gap-3">
                  {!routeClassId ? (
                    <label className="min-w-[200px] flex-1 text-[12.5px] font-semibold text-[var(--text-main)]">
                      Class
                      <select
                        value={selectedClassId ?? ""}
                        onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
                        disabled={classLoading || classes.length === 0}
                        className="mt-1.5 h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text-main)]"
                      >
                        {classLoading ? (
                          <option>Loading…</option>
                        ) : (
                          <>
                            <option value="">Select class</option>
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </>
                        )}
                      </select>
                    </label>
                  ) : null}

                  <ModeSelector value={mode} onChange={setMode} />
                </div>
              </div>

              <div className="flex shrink-0 items-end">
                <button
                  type="button"
                  className="btn-premium"
                  onClick={() => void startSession(mode)}
                  disabled={!canStart}
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Start session
                </button>
              </div>
            </div>

            {/* Sub-info row */}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <ModeCard
                title="Teach me"
                description="Hands-free reading. The app asks, you say show answer, next card, or explain more."
                active={mode === "teach"}
                onClick={() => setMode("teach")}
              />
              <ModeCard
                title="Ask me"
                description="The app reads the question, listens to your spoken answer, then evaluates it."
                active={mode === "ask"}
                onClick={() => setMode("ask")}
              />
              <ModeCard
                title="Mixed"
                description="Switch anytime by saying teach me or ask me. Best for varied practice."
                active={mode === "mixed"}
                onClick={() => setMode("mixed")}
              />
            </div>
          </section>
        ) : null}

        {/* Empty state */}
        {showEmpty ? (
          <section className="ns-card flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted-soft)]">
              <BookOpen className="h-6 w-6" />
            </span>
            <h2 className="text-[18px] font-semibold tracking-[-0.018em] text-[var(--text-main)]">
              No flashcards yet
            </h2>
            <p className="max-w-[420px] text-[13.5px] leading-relaxed text-[var(--text-muted)]">
              {className ? `${className} doesn't have any flashcards yet.` : "This class doesn't have any flashcards yet."}{" "}
              Generate or add some, then come back here.
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => selectedClassId && navigate(`/classes/${selectedClassId}/flashcards`)}
              >
                Open flashcards
              </Button>
              <Button size="sm" onClick={() => navigate("/classes")}>
                Upload material
              </Button>
            </div>
          </section>
        ) : null}

        {/* Active session canvas */}
        {sessionActive || phase === "complete" ? (
          <section className="ns-card flex flex-col gap-4 p-5 sm:p-6">
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="eyebrow">
                  <span className="eyebrow-dot" aria-hidden />
                  {sessionActive
                    ? `Card ${Math.min(cardIndex + 1, total)} of ${total}`
                    : "Session complete"}
                </span>
                <div className="mt-1 text-[13.5px] font-medium text-[var(--text-muted)]">
                  Mode:{" "}
                  <span className="font-semibold text-[var(--text-main)]">{MODE_LABEL[mode]}</span>
                  {" · "}
                  <span className="text-[var(--text-muted-soft)]">{PHASE_LABEL[phase]}</span>
                </div>
              </div>
              {sessionActive ? (
                <div className="voice-mode-segment">
                  {(["teach", "ask", "mixed"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => switchMode(m)}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Progress bar */}
            <div
              className="flash-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              aria-label="Session progress"
            >
              <div
                className="flash-progress-fill"
                style={{ ["--value" as any]: `${progressPct}%` } as CSSProperties}
              />
            </div>

            {/* Voice orb + status */}
            <div className="flex flex-col items-center gap-3 py-3">
              <div
                className={`voice-orb ${orbState !== "idle" ? "voice-orb--active" : ""} ${orbState === "listening" ? "voice-orb--listening" : ""} ${orbState === "speaking" ? "voice-orb--speaking" : ""}`}
                style={
                  orbState === "thinking"
                    ? ({ ["--orb-color" as any]: "var(--warning)" } as CSSProperties)
                    : orbState === "listening"
                      ? ({ ["--orb-color" as any]: "var(--success)" } as CSSProperties)
                      : undefined
                }
                aria-hidden
              >
                {orbState === "listening" ? (
                  <Mic className="h-8 w-8" />
                ) : orbState === "speaking" ? (
                  <span className="voice-wave">
                    <span /><span /><span /><span /><span />
                  </span>
                ) : orbState === "thinking" ? (
                  <RefreshCw className="h-7 w-7 animate-spin" />
                ) : (
                  <Volume2 className="h-7 w-7" />
                )}
              </div>
              <div className="text-center">
                <div className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--text-main)]">
                  {orbState === "thinking"
                    ? "Evaluating…"
                    : orbState === "listening"
                      ? phase === "recordingAnswer"
                        ? "Speak your answer"
                        : "Listening for a command"
                      : orbState === "speaking"
                        ? "Speaking"
                        : phase === "complete"
                          ? "All done — start again whenever"
                          : "Ready"}
                </div>
                {sessionActive ? (
                  <div className="mt-0.5 text-[12px] text-[var(--text-muted-soft)]">
                    Try: {COMMAND_TIPS[mode].join(" · ")}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Card content */}
            {currentCard ? (
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                  Question
                </div>
                <p className="mt-2 text-[18px] font-semibold leading-snug tracking-[-0.018em] text-[var(--text-main)] sm:text-[20px]">
                  {sanitizeFlashcardText(currentCard.question)}
                </p>

                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                    Answer
                  </div>
                  <p className="mt-2 min-h-[2.4rem] text-[14px] leading-relaxed text-[var(--text-main)]">
                    {answerShown
                      ? sanitizeFlashcardText(currentCard.answer)
                      : (
                        <span className="text-[var(--text-muted-soft)]">
                          Hidden — say "show answer" or use the button.
                        </span>
                      )}
                  </p>
                </div>

                {(transcript || liveTranscript) ? (
                  <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                      Your spoken answer
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--text-main)]">
                      {transcript || liveTranscript}
                    </p>
                  </div>
                ) : null}

                {evaluation ? (
                  <FeedbackBlock evaluation={evaluation} />
                ) : null}
              </div>
            ) : phase === "complete" ? (
              <SessionSummary
                verdicts={verdicts}
                attempted={answersAttempted}
                finalScorePct={finalScorePct}
                cardsSeen={Math.min(cardIndex + 1, total)}
                total={deck.length}
                mode={mode}
                onRestart={() => void startSession(mode)}
                onBack={() =>
                  routeClassId ? navigate(`/classes/${routeClassId}/flashcards`) : navigate("/flashcards")
                }
              />
            ) : null}

            {/* Last heard command */}
            {sessionActive && lastCommand ? (
              <div className="text-[11.5px] text-[var(--text-muted-soft)]">
                Heard: <span className="font-medium text-[var(--text-muted)]">{lastCommand}</span>
              </div>
            ) : null}

            {/* Controls */}
            {sessionActive ? (
              <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCommand("repeat_question")}
                  disabled={!currentCard || isSpeaking}
                >
                  Repeat
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCommand("show_answer")}
                  disabled={!currentCard || isSpeaking}
                >
                  Show answer
                </Button>
                {(mode === "ask" || mode === "mixed") && phase !== "recordingAnswer" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void startListenForAnswer()}
                    disabled={!currentCard || isSpeaking}
                  >
                    <Mic className="h-3.5 w-3.5" />
                    Ask me
                  </Button>
                ) : null}
                {phase === "recordingAnswer" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => recorder.stopRecording()}
                  >
                    <Square className="h-3.5 w-3.5" />
                    Done answering
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCommand("explain_more")}
                  disabled={!currentCard || isSpeaking}
                >
                  Explain
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void handleCommand("next_card")}
                  disabled={!currentCard || isSpeaking}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Next card
                </Button>
                {phase === "paused" ? (
                  <Button size="sm" variant="ghost" onClick={() => void handleCommand("resume")}>
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleCommand("pause")}
                    disabled={!sessionActive}
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={endSession}>
                  <Square className="h-3.5 w-3.5" />
                  End session
                </Button>
              </div>
            ) : null}

            {/* SRS marks */}
            {sessionActive ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted-soft)]">
                  SRS marks
                </span>
                <Button size="sm" variant="ghost" onClick={() => void applyMark(2, "hard")}>Hard</Button>
                <Button size="sm" variant="ghost" onClick={() => void applyMark(4, "easy")}>Easy</Button>
                <Button size="sm" variant="ghost" onClick={() => void applyMark(5, "mastered")}>Mastered</Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <VoiceSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={voicePrefs}
        onChange={setVoicePrefs}
      />
    </AppShell>
  );
}

/* ────────────────────────── Sub-components ────────────────────────── */

function ModeSelector({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="voice-mode-segment" role="radiogroup" aria-label="Choose mode">
      {(["teach", "ask", "mixed"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          aria-pressed={value === m}
          onClick={() => onChange(m)}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

function ModeCard({
  title,
  description,
  active,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col rounded-[var(--radius-lg)] border p-3.5 text-left transition ${
        active
          ? "border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))] shadow-[var(--shadow-xs)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <span className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-main)]">{title}</span>
      <span className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{description}</span>
    </button>
  );
}

function FeedbackBlock({ evaluation }: { evaluation: VoiceEvaluationResult }) {
  const qr = quizResultFromEvaluation(evaluation);
  const chip =
    qr.verdict === "correct"
      ? "topic-chip topic-chip--strong"
      : qr.verdict === "partial"
        ? "topic-chip topic-chip--improving"
        : "topic-chip topic-chip--weak";
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-2">
        <span className={chip}>{qr.label}</span>
        <span className="text-[11px] text-[var(--text-muted-soft)]">Score {Math.round(qr.normalized * 100)}%</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-main)]">{evaluation.feedback}</p>
      {evaluation.missingPoints?.length ? (
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-main)]">Missed key points: </span>
          {evaluation.missingPoints.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function SessionSummary({
  verdicts,
  attempted,
  finalScorePct,
  cardsSeen,
  total,
  mode,
  onRestart,
  onBack,
}: {
  verdicts: Verdicts;
  attempted: number;
  finalScorePct: number;
  cardsSeen: number;
  total: number;
  mode: Mode;
  onRestart: () => void;
  onBack: () => void;
}) {
  const askMode = mode === "ask" || attempted > 0;
  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Cards seen" value={`${cardsSeen}/${total}`} />
          {askMode ? (
            <>
              <Stat label="Correct" value={String(verdicts.correct)} tone="success" />
              <Stat label="Partial" value={String(verdicts.partial)} tone="warning" />
              <Stat label="Score" value={`${finalScorePct}%`} tone="primary" />
            </>
          ) : (
            <Stat label="Mode" value={MODE_LABEL[mode]} />
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRestart} className="btn-premium h-10">
          <RefreshCw className="h-4 w-4" /> Study again
        </button>
        <Button onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to flashcards
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "primary";
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "primary"
          ? "var(--primary)"
          : "var(--text-main)";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted-soft)]">
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/* unused import shim to keep CheckCircle2 in the bundle if reused later */
void CheckCircle2;
