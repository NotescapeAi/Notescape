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
  const responseStart = useRef<number | null>(null);
  const scrollRestoreRef = useRef<number | null>(null);
  const reviewInFlightRef = useRef(false);
  const timerRef = useRef<SessionTimerHandle | null>(null);
  const studySecondsRef = useRef(0);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [studyBaseSeconds, setStudyBaseSeconds] = useState(0);
  const [displayStudySeconds, setDisplayStudySeconds] = useState(0);

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
    setDisplayStudySeconds(0);
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
        setDisplayStudySeconds(base);
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
    if (reviewInFlightRef.current) return;
    reviewInFlightRef.current = true;
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
    } catch (err: any) {
      setError(err?.message || "Failed to save review");
    } finally {
      reviewInFlightRef.current = false;
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
  const timerActive = Boolean(sessionId) && !loading && !stats.ended && !stats.done;
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
    setDisplayStudySeconds(seconds);
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
      subtitle="Study mode"
      backLabel="Back to Flashcards"
      backTo={classId ? `/classes/${classId}/flashcards` : "/classes"}
      contentGapClassName="gap-2"
      contentOverflowClassName="overflow-hidden"
      contentHeightClassName="h-full"
      mainClassName="min-h-0 overflow-hidden"
    >
      <div className="mx-auto -mt-3 flex h-full min-h-0 w-full max-w-[980px] flex-col gap-3 overflow-hidden">
        {error && (
          <div className="rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm text-accent">
            {error}
          </div>
        )}

        <span className="sr-only" aria-hidden="true">
          <SessionTimer
            ref={timerRef}
            sessionId={studySessionId ?? sessionId}
            baseSeconds={studyBaseSeconds || stats.session_seconds}
            active={timerActive}
            onSave={handleSessionSave}
          />
        </span>

        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 shadow-[0_12px_28px_rgba(15,16,32,0.06)] dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-main">
              Progress {stats.total_cards ? stats.current_index + 1 : 0} / {stats.total_cards || 0}
            </span>
            <span className="truncate">
              {fileFilter === "all" ? "All files" : files.find((f) => f.id === fileFilter)?.filename || "Selected file"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button className="rounded-full px-4 py-2 text-xs" onClick={startSession}>
              Study again
            </Button>
            <Button className="rounded-full px-4 py-2 text-xs" onClick={handleResetProgress}>
              Reset progress
            </Button>
            <Button className="rounded-full px-4 py-2 text-xs" onClick={handleEndSession}>
              End session
            </Button>
            <div className="relative min-w-[220px]">
              <select
                value={fileFilter}
                onChange={(e) => handleFileChange(e.target.value)}
                className="h-10 w-full appearance-none rounded-full border border-token bg-[var(--surface)] px-4 pr-12 text-sm font-semibold text-main shadow-sm transition hover:border-[var(--primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/15"
              >
                <option value="all">All files</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-muted">
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-[0_16px_38px_rgba(15,16,32,0.08)] dark:shadow-none">
          {!stats.ended && !stats.done && (
            <div className="mb-3 flex items-center justify-end gap-2">
              <div className="text-xs text-[var(--text-secondary)]">Space: flip / 1-5: rate</div>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted">Loading session...</div>
          ) : stats.ended || stats.done ? (
            <div className="flex h-full min-h-0 items-center justify-center">
              <div className="w-full max-w-[760px] rounded-[26px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_20px_48px_rgba(15,16,32,0.10)] dark:shadow-none sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">
                      Session summary
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold text-main sm:text-3xl">
                      {stats.done ? "Study queue complete" : "Session ended"}
                    </h2>
                    <p className="mt-2 max-w-[520px] text-sm leading-6 text-[var(--text-secondary)]">
                      Your review progress has been saved. Start a new round when you are ready to continue.
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-main">
                    {masteryPct}% mastery
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                      Study time
                    </div>
                    <div className="mt-2 text-xl font-semibold text-main">
                      {formatDuration(Math.floor(displayStudySeconds || studySecondsRef.current || studyBaseSeconds || stats.session_seconds || 0))}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                      Mastered
                    </div>
                    <div className="mt-2 text-xl font-semibold text-main">
                      {stats.mastered_count}/{stats.total_unique}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                      Avg rating
                    </div>
                    <div className="mt-2 text-xl font-semibold text-main">
                      {stats.total_reviews ? stats.average_rating.toFixed(2) : "0.00"}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                      Reviews
                    </div>
                    <div className="mt-2 text-xl font-semibold text-main">{stats.total_reviews}</div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Button className="rounded-full px-5" onClick={startSession}>
                    Study again
                  </Button>
                  <Button className="rounded-full px-5" onClick={handleResetProgress}>
                    Reset progress
                  </Button>
                </div>
              </div>
            </div>
          ) : !currentCard ? (
            <div className="text-sm text-muted">No cards available in this session.</div>
          ) : (
            <div className={`flex h-full min-h-0 flex-col gap-3 ${revealed ? "overflow-y-auto pr-1" : "overflow-hidden"}`}>
              <div className="mx-auto w-full max-w-[760px]">
                <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_18px_42px_rgba(15,16,32,0.08)] transition-shadow duration-200 dark:shadow-none sm:p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">
                    Question
                  </div>
                  <div className="mt-3 text-lg font-semibold leading-relaxed text-[var(--text-main)] sm:text-2xl">
                    {sanitizeText(currentCard.question)}
                  </div>
                  {revealed && (
                    <div className="mt-4 max-h-[210px] overflow-y-auto rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
                        Answer
                      </div>
                      <div className="mt-2 text-sm font-medium leading-6 text-neutral-700 dark:text-neutral-300">
                        {sanitizeText(currentCard.answer)}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
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
                    { score: 1, label: "Again" },
                    { score: 2, label: "Hard" },
                    { score: 3, label: "Good" },
                    { score: 4, label: "Easy" },
                    { score: 5, label: "Mastered" },
                  ].map((opt) => (
                    <button
                      key={opt.score}
                      onClick={() => handleReview(opt.score as 1 | 2 | 3 | 4 | 5)}
                      disabled={submitting || !revealed}
                      className={`h-11 rounded-[14px] border px-3 text-sm font-semibold transition-all ${
                        submitting ? "cursor-not-allowed opacity-60" : ""
                      } ${
                        revealed
                          ? "border-neutral-950 bg-neutral-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.16)] hover:-translate-y-0.5 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/35 dark:border-white dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                          : "border-token bg-[var(--surface)] text-[var(--text-main)] opacity-45"
                      }`}
                    >
                      {opt.label}{" "}
                      <span className={`ml-1 text-[11px] ${revealed ? "opacity-70" : "text-[var(--text-muted-soft)]"}`}>
                        {opt.score}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-end text-xs text-[var(--text-secondary)]">
                  <span>1 = Again / 5 = Mastered</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
