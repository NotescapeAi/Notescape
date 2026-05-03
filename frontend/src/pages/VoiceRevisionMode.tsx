/**
 * Voice Flashcards — hands-free revision companion (not Voice Quiz).
 * Voice-first: speak → listen for commands → respond. Optional voice ratings for SRS.
 * Route stays /voice-revision; sidebar label is "Voice Flashcards".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  BookOpen,
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
import { chatAsk, listClasses, listFlashcards, postReview, type ClassRow, type Flashcard } from "../lib/api";
import { parseVoiceFlashcardsCommand, type VoiceFlashcardsCommand } from "../lib/voiceCommands";
import { speakText, stopSpeaking } from "../lib/voiceSpeech";

export type FlashcardVoicePhase =
  | "idle"
  | "speakingQuestion"
  | "waitingForCommand"
  | "listeningCommand"
  | "speakingAnswer"
  | "explaining"
  | "paused"
  | "complete"
  | "error";

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sanitize(value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("{") && text.includes("\"cards\"")) return "This card needs regeneration.";
  return text;
}

function friendlyLoad(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && !err.response) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (err instanceof Error && err.message === "Network Error") {
    return "Network problem. Check your connection and try again.";
  }
  return fallback;
}

function fallbackExplanation(card: Flashcard): string {
  const q = sanitize(card.question);
  const a = sanitize(card.answer);
  if (!a) return "Here is the idea in one line: focus on the key terms from the question.";
  const short = a.length > 220 ? `${a.slice(0, 220).trim()}…` : a;
  return `Here is a simpler way to think about it: ${short}`;
}

export default function VoiceRevisionMode() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [phase, setPhase] = useState<FlashcardVoicePhase>("idle");
  const [answerShown, setAnswerShown] = useState(false);
  const [awaitingEndConfirm, setAwaitingEndConfirm] = useState(false);
  const [lastCommandText, setLastCommandText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [cardCount, setCardCount] = useState<number | null>(null);

  const [ttsOk, setTtsOk] = useState(false);
  const [sttOk, setSttOk] = useState(false);

  const phaseRef = useRef(phase);
  const sessionActiveRef = useRef(sessionActive);
  const listenTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<{
    stop: () => void;
    abort: () => void;
    onend: (() => void) | null;
    onerror: ((e: { error?: string }) => void) | null;
    onresult: ((e: unknown) => void) | null;
  } | null>(null);

  const SpeechRecognitionCtor = useMemo(() => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    setTtsOk(typeof window !== "undefined" && "speechSynthesis" in window);
    setSttOk(!!SpeechRecognitionCtor);
  }, [SpeechRecognitionCtor]);

  useEffect(() => {
    (async () => {
      try {
        const cs = await listClasses();
        setClasses(cs);
        if (cs[0]) setSelectedClassId(cs[0].id);
      } catch (err: unknown) {
        setLoadError(friendlyLoad(err, "Could not load classes."));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedClassId) {
      setCardCount(null);
      return;
    }
    let c = false;
    setDeckLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const cards = await listFlashcards(selectedClassId);
        if (c) return;
        setCardCount(Array.isArray(cards) ? cards.length : 0);
      } catch (err: unknown) {
        if (!c) setLoadError(friendlyLoad(err, "Could not load flashcards."));
      } finally {
        if (!c) setDeckLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [selectedClassId]);

  const stopListen = useCallback(() => {
    if (listenTimerRef.current) {
      window.clearTimeout(listenTimerRef.current);
      listenTimerRef.current = null;
    }
    const r = recognitionRef.current;
    if (r) {
      r.onend = null;
      r.onerror = null;
      r.onresult = null;
      try {
        r.stop();
      } catch {
        /* */
      }
      try {
        r.abort();
      } catch {
        /* */
      }
      recognitionRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopListen();
    stopSpeaking();
  }, [stopListen]);

  useEffect(() => () => cleanup(), [cleanup]);

  const currentCard = sessionActive && deck.length ? deck[Math.min(cardIndex, deck.length - 1)] : null;

  const speak = useCallback((text: string, then: () => void) => {
    stopListen();
    speakText(text, {
      rate: 0.9,
      onEnd: then,
      onError: then,
    });
  }, [stopListen]);

  /** One-shot command listen; resolves with parsed command (unknown if silence/error). */
  const listenOnce = useCallback(
    (maxMs: number): Promise<VoiceFlashcardsCommand> => {
      return new Promise((resolve) => {
        if (!SpeechRecognitionCtor || !sessionActiveRef.current) {
          resolve("unknown");
          return;
        }
        let heard = "";
        let settled = false;
        const finish = (cmd: VoiceFlashcardsCommand) => {
          if (settled) return;
          settled = true;
          if (listenTimerRef.current) {
            window.clearTimeout(listenTimerRef.current);
            listenTimerRef.current = null;
          }
          recognitionRef.current = null;
          resolve(cmd);
        };
        const rec = new SpeechRecognitionCtor();
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
          setLastCommandText(heard);
        };
        rec.onerror = (e: any) => {
          if (e?.error === "aborted") return;
          finish("unknown");
        };
        rec.onend = () => {
          finish(parseVoiceFlashcardsCommand(heard));
        };
        recognitionRef.current = rec;
        try {
          rec.start();
        } catch {
          finish("unknown");
          return;
        }
        listenTimerRef.current = window.setTimeout(() => {
          try {
            rec.stop();
          } catch {
            /* */
          }
        }, maxMs);
      });
    },
    [SpeechRecognitionCtor]
  );

  const queueListen = useCallback(async () => {
    if (!sessionActiveRef.current || phaseRef.current === "paused") return;
    if (!sttOk) return;
    setPhase("listeningCommand");
    const cmd = await listenOnce(14000);
    if (!sessionActiveRef.current || phaseRef.current === "paused") return;
    await handleCommandRef.current?.(cmd);
  }, [listenOnce, sttOk]);

  const handleCommandRef = useRef<(cmd: VoiceFlashcardsCommand) => Promise<void>>(async () => undefined);

  const readQuestion = useCallback(
    (index: number, cards: Flashcard[]) => {
      const card = cards[index];
      if (!card) return;
      setAnswerShown(false);
      setPhase("speakingQuestion");
      const q = sanitize(card.question);
      const line = `Card ${index + 1} of ${cards.length}. ${q}`;
      speak(line, () => {
        if (!sessionActiveRef.current) return;
        setPhase("waitingForCommand");
        void queueListen();
      });
    },
    [queueListen, speak]
  );

  const readAnswer = useCallback(
    (card: Flashcard) => {
      setPhase("speakingAnswer");
      setAnswerShown(true);
      const a = sanitize(card.answer);
      speak(`The answer is: ${a}`, () => {
        setPhase("waitingForCommand");
        void queueListen();
      });
    },
    [queueListen, speak]
  );

  const readExplanation = useCallback(
    async (card: Flashcard) => {
      setPhase("explaining");
      let text: string;
      try {
        const res = await chatAsk({
          class_id: selectedClassId ?? undefined,
          mode: "general",
          question: `You are a patient tutor. In under 90 words for spoken audio, explain this flashcard simply, add one short analogy or memory hint, stay concise. Question: ${sanitize(card.question)}. Answer: ${sanitize(card.answer)}.`,
        });
        text = (res.answer || "").trim().slice(0, 500) || fallbackExplanation(card);
      } catch {
        text = fallbackExplanation(card);
      }
      speak(text, () => {
        if (!sessionActiveRef.current) return;
        setPhase("waitingForCommand");
        void queueListen();
      });
    },
    [queueListen, selectedClassId, speak]
  );

  const applyMark = useCallback(
    async (score: 1 | 2 | 3 | 4 | 5, label: string) => {
      const card = currentCard;
      if (!card) return;
      try {
        await postReview(card.id, score);
        speak(`Marked as ${label}.`, () => {
          if (!sessionActiveRef.current) return;
          setPhase("waitingForCommand");
          void queueListen();
        });
      } catch {
        setHint("Could not save that mark. You can try again or say next card.");
        setPhase("waitingForCommand");
        void queueListen();
      }
    },
    [currentCard, speak, queueListen]
  );

  const handleCommand = useCallback(
    async (cmd: VoiceFlashcardsCommand) => {
      const card = deck[Math.min(cardIndex, deck.length - 1)];
      if (!sessionActiveRef.current || !card) return;
      if (phaseRef.current === "paused" && cmd !== "resume") return;

      if (cmd === "pause") {
        phaseRef.current = "paused";
        cleanup();
        setPhase("paused");
        return;
      }
      if (cmd === "resume") {
        phaseRef.current = "waitingForCommand";
        setPhase("waitingForCommand");
        window.setTimeout(() => void queueListen(), 0);
        return;
      }

      if (cmd === "end_session") {
        setAwaitingEndConfirm(true);
        speak('Say "confirm end" to end this session.', () => {
          if (!sessionActiveRef.current) return;
          setPhase("waitingForCommand");
          void queueListen();
        });
        return;
      }
      if (cmd === "confirm_end") {
        if (awaitingEndConfirm) {
          setAwaitingEndConfirm(false);
          cleanup();
          setSessionActive(false);
          sessionActiveRef.current = false;
          setPhase("complete");
          speak("Session ended. Nice studying.", () => stopSpeaking());
          return;
        }
        speak('Say "end session" first if you want to stop.', () => {
          if (!sessionActiveRef.current) return;
          setPhase("waitingForCommand");
          void queueListen();
        });
        return;
      }
      setAwaitingEndConfirm(false);

      switch (cmd) {
        case "next_card": {
          const next = cardIndex + 1;
          if (next >= deck.length) {
            speak("That was the last card. Session complete.", () => {
              cleanup();
              setSessionActive(false);
              sessionActiveRef.current = false;
              setPhase("complete");
            });
            return;
          }
          setCardIndex(next);
          readQuestion(next, deck);
          return;
        }
        case "previous_card": {
          if (cardIndex <= 0) {
            speak("You are on the first card.", () => {
              setPhase("waitingForCommand");
              void queueListen();
            });
            return;
          }
          const prev = cardIndex - 1;
          setCardIndex(prev);
          readQuestion(prev, deck);
          return;
        }
        case "repeat_question":
          readQuestion(cardIndex, deck);
          return;
        case "show_answer":
        case "repeat_answer":
          readAnswer(card);
          return;
        case "hide_answer":
          if (!answerShown) {
            speak('The answer is already hidden. Say "show answer" when you want it.', () => {
              if (!sessionActiveRef.current) return;
              setPhase("waitingForCommand");
              void queueListen();
            });
            return;
          }
          setAnswerShown(false);
          speak("Hiding the answer.", () => {
            if (!sessionActiveRef.current) return;
            setPhase("waitingForCommand");
            void queueListen();
          });
          return;
        case "i_dont_know":
          speak("No problem. Let me read the answer.", () => readAnswer(card));
          return;
        case "explain_more":
          await readExplanation(card);
          return;
        case "mark_hard":
          await applyMark(2, "hard");
          return;
        case "mark_again":
          await applyMark(1, "again");
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
          speak('I did not catch that. Try saying "show answer", "next card", or "explain more".', () => {
            if (!sessionActiveRef.current) return;
            setPhase("waitingForCommand");
            void queueListen();
          });
      }
    },
    [
      answerShown,
      awaitingEndConfirm,
      applyMark,
      cardIndex,
      cleanup,
      deck,
      readAnswer,
      readExplanation,
      readQuestion,
      queueListen,
      speak,
    ]
  );

  useEffect(() => {
    handleCommandRef.current = handleCommand;
  }, [handleCommand]);

  const startSession = async () => {
    if (!selectedClassId) return;
    cleanup();
    setHint(null);
    setAwaitingEndConfirm(false);
    setPhase("idle");
    try {
      const cards = await listFlashcards(selectedClassId);
      const list = Array.isArray(cards) ? cards.filter((c) => sanitize(c.question)) : [];
      if (!list.length) {
        setHint("No flashcards are available for this class. Generate flashcards first.");
        return;
      }
      const shuffled = shuffle(list);
      setDeck(shuffled);
      setCardIndex(0);
      setSessionActive(true);
      sessionActiveRef.current = true;
      readQuestion(0, shuffled);
    } catch (err: unknown) {
      setHint(friendlyLoad(err, "Could not start. Try again."));
      setPhase("error");
    }
  };

  const endSession = () => {
    cleanup();
    setSessionActive(false);
    sessionActiveRef.current = false;
    setAwaitingEndConfirm(false);
    setDeck([]);
    setCardIndex(0);
    setPhase("idle");
    setAnswerShown(false);
    setLastCommandText("");
  };

  const onClassChange = (id: number | null) => {
    if (sessionActive) endSession();
    setSelectedClassId(id);
    setLoadError(null);
    setHint(null);
  };

  const phaseLabel: Record<FlashcardVoicePhase, string> = {
    idle: "Ready",
    speakingQuestion: "Reading question",
    waitingForCommand: "Listening for command",
    listeningCommand: "Listening for command",
    speakingAnswer: "Reading answer",
    explaining: "Explaining",
    paused: "Paused",
    complete: "Session complete",
    error: "Needs attention",
  };

  const hasCards = (cardCount ?? 0) > 0;
  const canStart = !!selectedClassId && hasCards && !deckLoading && !sessionActive;

  return (
    <AppShell
      title="Voice Flashcards"
      subtitle="Hands-free revision without screen fatigue. Listen, ask for the answer, get brief explanations, and move on — all by voice."
      headerMaxWidthClassName="max-w-3xl"
      contentGapClassName="gap-4"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-10">
        <div className="grid gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--primary-soft)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Voice Flashcards</div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Study hands-free. No grading — optional voice marks for scheduling.</p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted-soft)]">Voice Quiz</div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Test yourself aloud from a class → Flashcards → Voice. Answers are scored automatically.
            </p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => navigate("/flashcards")}>
              Open flashcards hub
            </Button>
          </div>
        </div>

        <div className="ns-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <Headphones className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-[var(--text-main)] sm:text-xl">Start a voice session</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Pick a class, then start. The app reads each card; you say commands like &quot;show answer&quot; or &quot;next card&quot;. Buttons below are optional.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[12px] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
              <Volume2 className="h-3.5 w-3.5" />
              {ttsOk ? "Speech ready" : "Speech unavailable"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
              {sttOk ? <Mic className="h-3.5 w-3.5 text-[var(--success)]" /> : <MicOff className="h-3.5 w-3.5" />}
              {sttOk ? "Voice commands" : "Use buttons only"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1">
              <Layers className="h-3.5 w-3.5" />
              {deckLoading ? "…" : `${cardCount ?? 0} cards`}
            </span>
          </div>

          {loadError ? (
            <div className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {loadError}
            </div>
          ) : null}
          {hint ? (
            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-secondary)]">{hint}</div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="min-w-[200px] flex-1 text-sm font-semibold text-[var(--text-main)]">
              Class
              <select
                value={selectedClassId ?? ""}
                onChange={(e) => onClassChange(e.target.value ? Number(e.target.value) : null)}
                disabled={sessionActive}
                className="mt-2 h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
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
              <Button type="button" variant="primary" disabled={!canStart} onClick={() => void startSession()} className="gap-1.5">
                <Sparkles className="h-4 w-4" />
                Start voice session
              </Button>
              {sessionActive ? (
                <Button type="button" variant="secondary" onClick={() => endSession()} className="gap-1.5">
                  <Square className="h-4 w-4" />
                  End session
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {sessionActive || phase === "complete" ? (
          <div className="ns-card overflow-hidden">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/70 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">Status</div>
              <div className="text-lg font-semibold text-[var(--text-main)]">{phaseLabel[phase]}</div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Try: &quot;show answer&quot;, &quot;next card&quot;, or &quot;explain more&quot;.
              </p>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              {currentCard ? (
                <>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Question</div>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-main)]">{sanitize(currentCard.question)}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Card {cardIndex + 1} of {deck.length}
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">Answer</div>
                    <p className="mt-2 min-h-[3rem] text-sm text-[var(--text-main)]">
                      {answerShown ? sanitize(currentCard.answer) : "Hidden until you ask (voice or button)."}
                    </p>
                  </div>
                  {lastCommandText ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      Heard: <span className="font-medium text-[var(--text-main)]">{lastCommandText}</span>
                    </p>
                  ) : null}
                </>
              ) : phase === "complete" ? (
                <p className="text-sm text-[var(--text-secondary)]">Session complete. Start again anytime.</p>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!sessionActive || phase === "speakingQuestion" || phase === "speakingAnswer" || phase === "explaining"}
                  onClick={() => void handleCommand("repeat_question")}
                >
                  Repeat question
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!sessionActive || !currentCard || phase === "speakingQuestion" || phase === "speakingAnswer" || phase === "explaining"}
                  onClick={() => void handleCommand("show_answer")}
                >
                  Show answer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!sessionActive || !currentCard || !answerShown || phase === "speakingQuestion" || phase === "speakingAnswer" || phase === "explaining"}
                  onClick={() => void handleCommand("hide_answer")}
                >
                  Hide answer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!sessionActive || !currentCard || !answerShown || phase === "speakingQuestion" || phase === "explaining"}
                  onClick={() => void handleCommand("repeat_answer")}
                >
                  Repeat answer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!sessionActive || !currentCard || phase === "speakingQuestion" || phase === "speakingAnswer" || phase === "explaining"}
                  onClick={() => void handleCommand("explain_more")}
                >
                  Explain more
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={!sessionActive || phase === "speakingQuestion" || phase === "speakingAnswer" || phase === "explaining"}
                  onClick={() => void handleCommand("next_card")}
                >
                  Next card
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={!sessionActive} onClick={() => void handleCommand("pause")}>
                  Pause
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={phase !== "paused"} onClick={() => void handleCommand("resume")}>
                  Resume
                </Button>
                <Button type="button" size="sm" variant="danger" disabled={!sessionActive} onClick={() => void handleCommand("end_session")}>
                  End session
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="w-full text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">Optional marks (SRS)</span>
                <Button type="button" size="sm" variant="ghost" disabled={!sessionActive || !currentCard} onClick={() => void handleCommand("mark_hard")}>
                  Mark hard
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={!sessionActive || !currentCard} onClick={() => void handleCommand("mark_easy")}>
                  Mark easy
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={!sessionActive || !currentCard} onClick={() => void handleCommand("mark_mastered")}>
                  Mark mastered
                </Button>
              </div>
              <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => selectedClassId && navigate(`/classes/${selectedClassId}/flashcards`)}>
                <BookOpen className="h-4 w-4" />
                Generate flashcards
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
