import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import {
  endMasterySession,
  getMasterySession,
  listFiles,
  startStudySession,
  heartbeatStudySession,
  endStudySession,
  resetMasteryProgress,
  reviewMasteryCard,
  startMasterySession,
  type MasteryCard,
  type MasterySession,
} from "../lib/api";

type SessionStats = {
  total_cards: number;
  total_unique: number;
  mastered_count: number;
  mastery_percent: number;
  total_reviews: number;
  average_rating: number;
  session_seconds: number;
  current_index: number;
  done: boolean;
  ended: boolean;
};

function normalizeStats(data: MasterySession): SessionStats {
  return {
    total_cards: data.total_cards ?? 0,
    total_unique: data.total_unique ?? 0,
    mastered_count: data.mastered_count ?? 0,
    mastery_percent: data.mastery_percent ?? 0,
    total_reviews: data.total_reviews ?? 0,
    average_rating: data.average_rating ?? 0,
    session_seconds: data.session_seconds ?? 0,
    current_index: data.current_index ?? 0,
    done: data.done ?? false,
    ended: data.ended ?? false,
  };
}

function sanitizeText(value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("{") && text.includes("\"cards\"")) {
    return "This card needs regeneration.";
  }
  return text;
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type SessionTimerHandle = {
  flush: () => void;
  reset: () => void;
};

const SessionTimer = forwardRef<
  SessionTimerHandle,
  { sessionId: string | null; baseSeconds: number; active: boolean; onSave?: (seconds: number) => void }
>(function SessionTimer({ sessionId, baseSeconds, active, onSave }, ref) {
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const accumulatedRef = useRef(0);
  const lastResumedRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const lastSaveRef = useRef<number>(0);
  const activeRef = useRef(active);
  const sessionIdRef = useRef<string | null>(sessionId);

  const storageKey = useMemo(
    () => (sessionId ? `mastery_session_time_${sessionId}` : "mastery_session_time_unknown"),
    [sessionId]
  );

  function computeSeconds(now = Date.now()) {
    if (lastResumedRef.current === null) return accumulatedRef.current;
    return accumulatedRef.current + Math.max(0, (now - lastResumedRef.current) / 1000);
  }

  function persist() {
    if (!sessionId) return;
    const seconds = Math.floor(computeSeconds());
    localStorage.setItem(
      storageKey,
      JSON.stringify({ accumulatedSeconds: seconds, lastUpdatedAt: Date.now() })
    );
    onSave?.(seconds);
    lastSaveRef.current = Date.now();
  }

  function pause() {
    if (lastResumedRef.current !== null) {
      accumulatedRef.current = computeSeconds();
      lastResumedRef.current = null;
    }
    setDisplaySeconds(Math.floor(accumulatedRef.current));
    persist();
  }

  function resume() {
    if (!sessionId) return;
    if (lastResumedRef.current === null) {
      lastResumedRef.current = Date.now();
    }
  }

  useImperativeHandle(ref, () => ({
    flush: () => persist(),
    reset: () => {
      accumulatedRef.current = 0;
      lastResumedRef.current = Date.now();
      setDisplaySeconds(0);
      persist();
    },
  }));

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const storedRaw = sessionId ? localStorage.getItem(storageKey) : null;
    const storedSeconds = storedRaw ? Number(JSON.parse(storedRaw)?.accumulatedSeconds ?? 0) : 0;
    const seedSeconds = Math.max(baseSeconds || 0, storedSeconds || 0);
    accumulatedRef.current = seedSeconds;
    lastResumedRef.current = null;
    setDisplaySeconds(Math.floor(seedSeconds));
    lastSaveRef.current = Date.now();
  }, [sessionId, storageKey, baseSeconds]);

  useEffect(() => {
    if (!sessionId) return;
    const storedRaw = localStorage.getItem(storageKey);
    const storedSeconds = storedRaw ? Number(JSON.parse(storedRaw)?.accumulatedSeconds ?? 0) : 0;
    const next = Math.max(accumulatedRef.current, baseSeconds || 0, storedSeconds || 0);
    if (next !== accumulatedRef.current) {
      accumulatedRef.current = next;
      setDisplaySeconds(Math.floor(next));
    }
  }, [baseSeconds, sessionId, storageKey]);

  useEffect(() => {
    if (intervalRef.current) return;
    intervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const isActive = activeRef.current && !!sessionIdRef.current && document.visibilityState === "visible";
      if (!isActive) {
        if (lastResumedRef.current !== null) {
          pause();
        }
        return;
      }
      resume();
      setDisplaySeconds(Math.floor(computeSeconds(now)));
      if (now - lastSaveRef.current >= 15000) {
        persist();
      }
    }, 1000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return <span>{formatDuration(displaySeconds)}</span>;
});

export default function FlashcardsStudyMode() {
  const { classId } = useParams();
  const classNum = Number(classId);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentCard, setCurrentCard] = useState<MasteryCard | null>(null);
  const [stats, setStats] = useState<SessionStats>({
    total_cards: 0,
    total_unique: 0,
    mastered_count: 0,
    mastery_percent: 0,
    total_reviews: 0,
    average_rating: 0,
    session_seconds: 0,
    current_index: 0,
    done: false,
    ended: false,
  });
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);
  const [fileFilter, setFileFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [reviewToast, setReviewToast] = useState<string | null>(null);
  const responseStart = useRef<number | null>(null);
  const scrollRestoreRef = useRef<number | null>(null);
  const timerRef = useRef<SessionTimerHandle | null>(null);
  const studySecondsRef = useRef(0);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [studyBaseSeconds, setStudyBaseSeconds] = useState(0);

  const sessionKey = classNum
    ? `mastery_session_${classNum}_${fileFilter}`
    : "mastery_session_unknown";

  useEffect(() => {
    if (!classNum) return;
    (async () => {
      const fs = await listFiles(classNum);
      setFiles((fs ?? []).map((f) => ({ id: f.id, filename: f.filename })));
    })();
  }, [classNum]);

  function applySession(data: MasterySession) {
    setSessionId(data.session_id);
    setCurrentCard(data.current_card ?? null);
    setStats(normalizeStats(data));
    setRevealed(false);
    if (data.current_card) {
      responseStart.current = Date.now();
    }
  }

  async function startSession() {
    if (!classNum) return;
    setLoading(true);
    setSubmitting(false);
    setError(null);
    try {
      const payload = {
        class_id: classNum,
        file_ids: fileFilter === "all" ? undefined : [fileFilter],
      };
      const data = await startMasterySession(payload);
      localStorage.setItem(sessionKey, data.session_id);
      applySession(data);
    } catch (err: any) {
      setError(err?.message || "Failed to start session");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrCreateSession() {
    if (!classNum) return;
    setLoading(true);
    setSubmitting(false);
    setError(null);
    try {
      const stored = localStorage.getItem(sessionKey);
      if (stored) {
        const data = await getMasterySession(stored);
        applySession(data);
        setLoading(false);
        return;
      }
      await startSession();
    } catch (err: any) {
      localStorage.removeItem(sessionKey);
      setSessionId(null);
      setCurrentCard(null);
      setError(err?.message || "Failed to load session");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!classNum) return;
    loadOrCreateSession();
  }, [classNum, fileFilter]);

  useEffect(() => {
    setStudySessionId(null);
    setStudyBaseSeconds(0);
    studySecondsRef.current = 0;
  }, [sessionId]);

  useEffect(() => {
    if (!classNum || !sessionId || stats.ended) return;
    let cancelled = false;
    (async () => {
      try {
        const sess = await startStudySession({ class_id: classNum, mode: "study" });
        if (cancelled) return;
        setStudySessionId(sess.id);
        const base = sess.active_seconds ?? sess.duration_seconds ?? 0;
        setStudyBaseSeconds(base);
        studySecondsRef.current = base;
      } catch {
        // keep timer local if session logging fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classNum, sessionId, stats.ended]);

  useEffect(() => {
    if (!classNum) return;
    localStorage.setItem("last_class_id", String(classNum));
  }, [classNum]);

  async function handleReview(confidence: 1 | 2 | 3 | 4 | 5) {
    if (!currentCard || !sessionId) return;
    const start = responseStart.current;
    const responseTime = start ? Date.now() - start : undefined;
    scrollRestoreRef.current = window.scrollY;
    setSubmitting(true);
    setError(null);
    try {
      const data = await reviewMasteryCard({
        session_id: sessionId,
        card_id: currentCard.id,
        rating: confidence,
        response_time_ms: responseTime,
      });
      applySession(data);
      timerRef.current?.flush();
      setReviewToast(
        confidence <= 2 ? "Saved: keep practicing this card." : confidence === 3 ? "Saved: getting better." : "Saved: great recall."
      );
      window.setTimeout(() => setReviewToast(null), 1400);
    } catch (err: any) {
      setError(err?.message || "Failed to save review");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEndSession() {
    if (!sessionId) return;
    try {
      if (studySessionId) {
        await endStudySession({
          session_id: studySessionId,
          accumulated_seconds: Math.floor(studySecondsRef.current || 0),
        });
      }
      await endMasterySession(sessionId);
    } finally {
      timerRef.current?.flush();
      localStorage.removeItem(sessionKey);
      setStats((prev) => ({ ...prev, ended: true }));
      setCurrentCard(null);
    }
  }

  async function handleResetProgress() {
    if (!classNum) return;
    setLoading(true);
    setSubmitting(false);
    try {
      await resetMasteryProgress(classNum);
      localStorage.removeItem(sessionKey);
      setSessionId(null);
      setCurrentCard(null);
      await startSession();
    } catch (err: any) {
      setError(err?.message || "Failed to reset mastery");
      setLoading(false);
    }
  }

  async function handleFileChange(next: string) {
    if (sessionId) {
      await endMasterySession(sessionId).catch(() => undefined);
    }
    timerRef.current?.flush();
    localStorage.removeItem(sessionKey);
    setSessionId(null);
    setCurrentCard(null);
    setFileFilter(next);
  }

  useLayoutEffect(() => {
    if (scrollRestoreRef.current === null) return;
    window.scrollTo({ top: scrollRestoreRef.current, behavior: "auto" });
    scrollRestoreRef.current = null;
  }, [currentCard?.id]);

  const masteryPct =
    stats.mastery_percent ||
    (stats.total_unique ? Math.round((stats.mastered_count / stats.total_unique) * 100) : 0);
  const timerActive = Boolean(sessionId) && !loading && !stats.ended;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!currentCard || loading || stats.ended || stats.done || submitting) return;
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setRevealed((prev) => !prev);
        return;
      }
      if (revealed && ["1", "2", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        handleReview(Number(e.key) as 1 | 2 | 3 | 4 | 5);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentCard?.id, loading, revealed, stats.ended, stats.done, submitting]);

  const handleSessionSave = (seconds: number) => {
    studySecondsRef.current = seconds;
    if (!studySessionId) return;
    heartbeatStudySession({
      session_id: studySessionId,
      accumulated_seconds: Math.floor(seconds),
      cards_seen: stats.total_reviews,
    }).catch(() => undefined);
  };

  return (
    <AppShell
      title="Flashcards"
      breadcrumbs={["Flashcards", "Study"]}
      subtitle="Study mode"
      backLabel="Back to Flashcards"
      backTo={classId ? `/classes/${classId}/flashcards` : "/classes"}
    >
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted-soft)]">
              {fileFilter === "all" ? "All files" : files.find((f) => f.id === fileFilter)?.filename || "Selected file"}
            </div>
            <h1 className="mt-1 text-3xl font-semibold text-main">Flashcards</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button className="rounded-full" onClick={startSession}>
              Study again
            </Button>
            <Button className="rounded-full" onClick={handleResetProgress}>
              Reset progress
            </Button>
            <Button className="rounded-full" onClick={handleEndSession}>
              End session
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm text-accent">
            {error}
          </div>
        )}

        {reviewToast && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            {reviewToast}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>
              Progress {stats.total_cards ? stats.current_index + 1 : 0} / {stats.total_cards || 0}
            </span>
            <span>
              Mastery {masteryPct}% · {stats.mastered_count}/{stats.total_unique} mastered
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
              style={{
                width: `${stats.total_cards ? Math.round(((stats.current_index + (revealed ? 1 : 0)) / Math.max(stats.total_cards, 1)) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-3">
            <div>
              Study time:{" "}
              <SessionTimer
                ref={timerRef}
                sessionId={studySessionId ?? sessionId}
                baseSeconds={studyBaseSeconds || stats.session_seconds}
                active={timerActive}
                onSave={handleSessionSave}
              />
            </div>
            <div>Avg rating: {stats.total_reviews ? stats.average_rating.toFixed(2) : "0.00"}</div>
            <div>Total reviews: {stats.total_reviews}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <select
              value={fileFilter}
              onChange={(e) => handleFileChange(e.target.value)}
              className="h-10 rounded-2xl border border-token surface px-3 text-sm text-muted"
            >
              <option value="all">All files</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.filename}
                </option>
              ))}
            </select>
            <div className="text-xs text-[var(--text-secondary)]">Space: flip · 1-5: rate</div>
          </div>

          {loading ? (
            <div className="text-sm text-muted">Loading session...</div>
          ) : stats.ended ? (
            <div className="text-sm text-muted">Session ended. Start a new session to continue.</div>
          ) : stats.done ? (
            <div className="text-sm text-muted">You cleared the queue. End the session or start again.</div>
          ) : !currentCard ? (
            <div className="text-sm text-muted">No cards available in this session.</div>
          ) : (
            <div className="space-y-6">
              <div className="mx-auto w-full max-w-[760px]">
                <div className="min-h-[340px] rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">
                    {revealed ? "Answer" : "Question"}
                  </div>
                  <div
                    className={`mt-5 text-lg font-semibold leading-relaxed text-[var(--text-main)] sm:text-2xl transition-all duration-300 ${
                      revealed ? "translate-y-0 opacity-100" : "translate-y-0 opacity-100"
                    }`}
                  >
                    {revealed ? sanitizeText(currentCard.answer) : sanitizeText(currentCard.question)}
                  </div>
                  <div className="mt-8 flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      className="rounded-full px-5"
                      onClick={() => setRevealed((v) => !v)}
                    >
                      {revealed ? "Show question" : "Show answer"}
                    </Button>
                    <span className="text-xs text-[var(--text-secondary)]">Press Space</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {[
                    { score: 1, label: "Again", color: "border-neutral-200 bg-white text-[var(--text-main)]" },
                    { score: 2, label: "Hard", color: "border-neutral-200 bg-white text-[var(--text-main)]" },
                    {
                      score: 3,
                      label: "Good",
                      color: "border-neutral-200 bg-white text-[var(--text-main)]",
                    },
                    {
                      score: 4,
                      label: "Easy",
                      color: "border-neutral-200 bg-white text-[var(--text-main)]",
                    },
                    {
                      score: 5,
                      label: "Mastered",
                      color: "border-neutral-200 bg-white text-[var(--text-main)]",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.score}
                      onClick={() => handleReview(opt.score as 1 | 2 | 3 | 4 | 5)}
                      disabled={submitting || !revealed}
                      className={`h-11 rounded-xl border px-3 text-sm font-semibold transition ${
                        submitting ? "cursor-not-allowed opacity-60" : ""
                      } ${!revealed ? "opacity-50" : ""} ${opt.color} hover:border-[var(--primary)] hover:text-[var(--primary)]`}
                    >
                      {opt.label}{" "}
                      <span className="ml-1 text-[11px] text-[var(--text-muted-soft)]">{opt.score}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>Reveal the answer, then rate recall quality.</span>
                  <span>1 = Again · 5 = Mastered</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
