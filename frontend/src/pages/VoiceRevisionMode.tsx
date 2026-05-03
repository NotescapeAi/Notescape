import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Volume2, Pause, RefreshCw, Radio } from "lucide-react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import SectionHeader from "../components/ui/SectionHeader";
import {
  listClasses,
  getClassAnalytics,
  startVoiceRevisionSession,
  nextVoiceRevisionQuestion,
  evaluateVoiceRevisionAnswer,
  endVoiceRevisionSession,
  type ClassRow,
  type ClassAnalytics,
} from "../lib/api";

type ListeningState = "idle" | "listening" | "thinking" | "speaking";

const stateLabels: Record<ListeningState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

export default function VoiceRevisionMode() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<ClassAnalytics | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<{ question: string; expected_answer: string; topic: string } | null>(null);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [status, setStatus] = useState<ListeningState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSpeakingSupported, setIsSpeakingSupported] = useState(false);
  const [isRecognitionSupported, setIsRecognitionSupported] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    setIsSpeakingSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    setIsRecognitionSupported(
      typeof window !== "undefined" &&
        !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cs = await listClasses();
        setClasses(cs);
        if (cs[0]) {
          setSelectedClassId(cs[0].id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load classes.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    (async () => {
      try {
        const a = await getClassAnalytics(selectedClassId);
        setAnalytics(a);
      } catch {
        /* ignore */
      }
    })();
  }, [selectedClassId]);

  const SpeechRecognitionCtor = useMemo(
    () =>
      typeof window !== "undefined"
        ? (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition
        : null,
    []
  );

  function stopRecognition() {
    if (recognitionRef.current) {
      const rec = recognitionRef.current as {
        onend?: (() => void) | null;
        onerror?: (() => void) | null;
        onresult?: ((e: unknown) => void) | null;
        stop?: () => void;
        abort?: () => void;
      };
      rec.onend = null;
      rec.onerror = null;
      rec.onresult = null;
      rec.stop?.();
      rec.abort?.();
      recognitionRef.current = null;
    }
    setRecognizing(false);
  }

  function speak(text: string, onDone?: () => void) {
    if (!isSpeakingSupported) {
      onDone?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => {
      setStatus("idle");
      onDone?.();
    };
    u.onerror = () => {
      setStatus("idle");
      onDone?.();
    };
    setStatus("speaking");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  async function startSession() {
    if (!selectedClassId) return;
    try {
      setError(null);
      setFeedback(null);
      setTranscript("");
      setQuestion(null);
      const session = await startVoiceRevisionSession({
        class_id: selectedClassId,
        mode: "mixed",
        duration_minutes: 10,
      });
      setSessionId(session.id);
      await loadNextQuestion(session.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to start voice revision.");
    }
  }

  async function loadNextQuestion(id?: string) {
    const sid = id || sessionId;
    if (!sid) return;
    try {
      setFeedback(null);
      setTranscript("");
      setStatus("idle");
      const q = await nextVoiceRevisionQuestion(sid);
      setQuestion(q);
      if (isSpeakingSupported) {
        speak(q.question, () => {
          if (isRecognitionSupported) startListening();
        });
      } else if (isRecognitionSupported) {
        startListening();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No question available.");
    }
  }

  function startListening() {
    if (!SpeechRecognitionCtor) return;
    stopRecognition();
    const rec = new (SpeechRecognitionCtor as new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onstart: () => void;
      onresult: (event: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
      abort: () => void;
    })();
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onstart = () => {
      setRecognizing(true);
      setStatus("listening");
      setTranscript("");
    };
    rec.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r: { 0: { transcript: string } }) => r[0].transcript)
        .join(" ");
      setTranscript(text);
      if (event.results[0]?.isFinal) {
        setRecognizing(false);
        setStatus("thinking");
        rec.stop();
        rec.abort();
        void handleEvaluate(text);
      }
    };
    rec.onerror = () => {
      setRecognizing(false);
      setStatus("idle");
    };
    rec.onend = () => {
      setRecognizing(false);
      setStatus((s) => (s === "listening" ? "idle" : s));
    };
    rec.start();
  }

  async function handleEvaluate(manualTranscript?: string) {
    if (!sessionId || !question) return;
    const userTranscript = (manualTranscript ?? transcript ?? "").trim();
    if (!userTranscript) {
      setError("No answer captured.");
      return;
    }
    try {
      setError(null);
      setStatus("thinking");
      const res = await evaluateVoiceRevisionAnswer({
        session_id: sessionId,
        question: question.question,
        expected_answer: question.expected_answer,
        transcript: userTranscript,
        topic: question.topic,
      });
      setFeedback(res.evaluation?.feedback || "Answer recorded.");
      setStatus("idle");
      if (isSpeakingSupported && res.evaluation?.feedback) {
        speak(res.evaluation.feedback, () => loadNextQuestion());
      } else {
        await loadNextQuestion();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Evaluation failed.");
      setStatus("idle");
    }
  }

  async function handleStop() {
    if (!sessionId) return;
    stopRecognition();
    try {
      await endVoiceRevisionSession(sessionId);
    } catch {
      /* ignore */
    } finally {
      setSessionId(null);
      setQuestion(null);
      setStatus("idle");
    }
  }

  const readinessScore = analytics?.exam_readiness?.score ?? null;
  const statusRing =
    status === "listening"
      ? "bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.2)]"
      : status === "speaking"
        ? "bg-[var(--primary)] shadow-[0_0_0_6px_rgba(124,58,237,0.25)]"
        : status === "thinking"
          ? "bg-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.25)]"
          : "bg-[var(--text-muted-soft)]";

  return (
    <AppShell
      title="Voice Revision"
      subtitle="Hands-free practice for commutes and deep-focus blocks."
      headerMaxWidthClassName="max-w-3xl"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
        <div className="ns-card p-5 sm:p-6">
          <SectionHeader
            eyebrow="Session"
            title="Voice study mode"
            description={
              readinessScore != null
                ? `Exam readiness for the selected class is about ${readinessScore}%.`
                : "Pick a class, then start when you are in a quiet space."
            }
          />
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
            <Volume2 className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
            <span>{isSpeakingSupported ? "Text-to-speech ready" : "Text-to-speech not supported in this browser"}</span>
            <span className="hidden h-4 w-px bg-[var(--border)] sm:inline" aria-hidden />
            <span>
              {isRecognitionSupported ? "Speech recognition available" : "Use typing if speech recognition is unavailable"}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="min-w-[200px] flex-1 text-sm font-semibold text-[var(--text-main)]">
              Class
              <select
                value={selectedClassId ?? ""}
                onChange={(e) => setSelectedClassId(Number(e.target.value))}
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-main)]"
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
              <Button type="button" variant="primary" size="md" onClick={startSession} disabled={!selectedClassId || !!sessionId}>
                <Mic className="h-4 w-4" aria-hidden />
                {sessionId ? "Session running" : "Start session"}
              </Button>
              {sessionId ? (
                <Button type="button" variant="danger" size="md" onClick={handleStop}>
                  <Pause className="h-4 w-4" aria-hidden />
                  Stop
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="ns-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 shrink-0 rounded-full transition-all ${statusRing}`} aria-hidden />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Status</div>
                  <div className="text-lg font-semibold text-[var(--text-main)]">{stateLabels[status]}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <Radio className="h-3.5 w-3.5" aria-hidden />
                {sessionId ? "Session active" : "Idle"}
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {error ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-100">
                {error}
              </div>
            ) : null}

            <div className="mx-auto w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/40 px-5 py-8 text-center sm:px-8 sm:py-10">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted-soft)]">Current question</div>
              <p className="mt-3 text-lg font-semibold leading-relaxed text-[var(--text-main)] sm:text-xl">
                {question?.question ?? "Start a session to hear your first question."}
              </p>
              {question?.topic ? (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Topic: {question.topic}</p>
              ) : null}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button type="button" variant="secondary" onClick={() => speak(question?.question || "")} disabled={!question}>
                  <Volume2 className="h-4 w-4" aria-hidden />
                  Read aloud
                </Button>
                <Button type="button" variant="ghost" onClick={() => loadNextQuestion()} disabled={!sessionId}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Next question
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/80 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Your answer</div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {isRecognitionSupported
                      ? recognizing
                        ? "Listening for your voice…"
                        : "Speak naturally, or type if you prefer."
                      : "Type your answer below."}
                  </p>
                </div>
                {isRecognitionSupported ? (
                  <Button type="button" variant="secondary" onClick={startListening} disabled={!sessionId}>
                    <Mic className="h-4 w-4" aria-hidden />
                    {recognizing ? "Listening…" : "Listen"}
                  </Button>
                ) : null}
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Speak or type your answer…"
                className="mt-4 min-h-[100px] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text-main)] placeholder:text-[var(--placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                rows={4}
              />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button type="button" variant="primary" onClick={() => handleEvaluate()} disabled={!sessionId || !question}>
                  Submit answer
                </Button>
                {feedback ? (
                  <p className="max-w-md text-sm font-medium leading-relaxed text-[var(--text-main)]">{feedback}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
