import type { CSSProperties } from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Clock,
  Eye,
  EyeOff,
  Layers,
  RefreshCw,
  RotateCcw,
  Square,
  Target,
} from "lucide-react";
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

/** Returns true for 404 / "no cards" scenarios that are expected empty states, not real failures. */
function isEmptyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, any>;
  const status = e?.response?.status as number | undefined;
  if (status === 404) return true;
  const detail = String(e?.response?.data?.detail ?? e?.response?.data?.message ?? "").toLowerCase();
  const msg = String(e?.message ?? "").toLowerCase();
  return (
    detail.includes("no card") ||
    detail.includes("not found") ||
    msg.includes("request failed with status code 404") ||
    msg.includes("no card")
  );
}

// ─── SessionTimer ─────────────────────────────────────────────────────────────
// Hidden component: drives heartbeat / localStorage persistence only.
// The *visible* timer is a simple elapsedSeconds counter in the parent.

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

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

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
        if (lastResumedRef.current !== null) pause();
        return;
      }
      resume();
      setDisplaySeconds(Math.floor(computeSeconds(now)));
      if (now - lastSaveRef.current >= 15000) persist();
    }, 1000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // This span is screen-reader only; the visible timer lives in the parent.
  return <span aria-hidden="true">{formatDuration(displaySeconds)}</span>;
});

// ─── Main Component ────────────────────────────────────────────────────────────

export default function FlashcardsStudyMode() {
  const { classId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const classNum = Number(classId);
  const topicFilter = (searchParams.get("topic") || "").trim();

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
  // error = user-facing friendly message for *real* failures only (not empty-state)
  const [error, setError] = useState<string | null>(null);
  // emptyState = no flashcards for this selection (expected 404 / empty session)
  const [emptyState, setEmptyState] = useState(false);

  const responseStart = useRef<number | null>(null);
  /** Snapshot of queue length when session starts — stable denominator for Card X / Y (backend current_index stays ~0 due to queue reorder). */
  const initialQueueTotalRef = useRef<number | null>(null);
  const scrollRestoreRef = useRef<number | null>(null);
  const reviewInFlightRef = useRef(false);
  const timerRef = useRef<SessionTimerHandle | null>(null);
  const studySecondsRef = useRef(0);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [studyBaseSeconds, setStudyBaseSeconds] = useState(0);

  // ── Visible display timer ────────────────────────────────────────────────
  // Simple, self-contained: ticks every second when timerActive is true.
  // Independent of the heartbeat SessionTimer so it always shows live time.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedBaseRef = useRef(0);   // accumulated seconds before current run
  const elapsedStartRef = useRef<number | null>(null); // Date.now() when current run started

  const sessionKey = classNum
    ? `mastery_session_${classNum}_${fileFilter}_${topicFilter || "all-topics"}`
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
    if (data.current_card) responseStart.current = Date.now();
    const tc = Number(data.total_cards ?? 0);
    if (tc > 0 && initialQueueTotalRef.current === null) {
      initialQueueTotalRef.current = tc;
    }
  }

  async function startSession() {
    if (!classNum) return;
    initialQueueTotalRef.current = null;
    setLoading(true);
    setSubmitting(false);
    setError(null);
    setEmptyState(false);
    try {
      const data = await startMasterySession({
        class_id: classNum,
        file_ids: fileFilter === "all" ? undefined : [fileFilter],
        topic: topicFilter || undefined,
      });
      localStorage.setItem(sessionKey, data.session_id);
      applySession(data);
    } catch (err: unknown) {
      if (isEmptyError(err)) {
        setEmptyState(true);
      } else {
        setError("Something went wrong while loading your flashcards. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadOrCreateSession() {
    if (!classNum) return;
    initialQueueTotalRef.current = null;
    setLoading(true);
    setSubmitting(false);
    setError(null);
    setEmptyState(false);
    try {
      const stored = localStorage.getItem(sessionKey);
      if (stored) {
        try {
          const data = await getMasterySession(stored);
          applySession(data);
          setLoading(false);
          return;
        } catch (innerErr: unknown) {
          // Stale / expired session — remove and fall through to start fresh.
          // Only re-throw genuine unexpected errors (not 404).
          localStorage.removeItem(sessionKey);
          if (!isEmptyError(innerErr)) throw innerErr;
        }
      }
      await startSession();
    } catch (err: unknown) {
      setSessionId(null);
      setCurrentCard(null);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!classNum) return;
    loadOrCreateSession();
  }, [classNum, fileFilter, topicFilter]);

  // Reset display timer when mastery session changes
  useEffect(() => {
    setStudySessionId(null);
    setStudyBaseSeconds(0);
    studySecondsRef.current = 0;
    elapsedBaseRef.current = 0;
    elapsedStartRef.current = null;
    setElapsedSeconds(0);
  }, [sessionId]);

  // Sync base when study session loads from server
  useEffect(() => {
    if (studyBaseSeconds > elapsedBaseRef.current) {
      elapsedBaseRef.current = studyBaseSeconds;
      setElapsedSeconds((prev) => Math.max(prev, studyBaseSeconds));
    }
  }, [studyBaseSeconds]);

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
    return () => { cancelled = true; };
  }, [classNum, sessionId, stats.ended]);

  useEffect(() => {
    if (!classNum) return;
    localStorage.setItem("last_class_id", String(classNum));
  }, [classNum]);

  // ── 1-second tick for the visible timer ────────────────────────────────────
  const timerActive = Boolean(sessionId) && !loading && !stats.ended && !stats.done && !emptyState;

  useEffect(() => {
    if (!timerActive) {
      // Pause: save accumulated seconds so far
      if (elapsedStartRef.current !== null) {
        elapsedBaseRef.current += Math.floor((Date.now() - elapsedStartRef.current) / 1000);
        elapsedStartRef.current = null;
      }
      return;
    }
    // Resume / start
    elapsedStartRef.current = Date.now();
    const id = window.setInterval(() => {
      const start = elapsedStartRef.current;
      if (start !== null) {
        setElapsedSeconds(elapsedBaseRef.current + Math.floor((Date.now() - start) / 1000));
      }
    }, 1000);
    return () => {
      window.clearInterval(id);
      if (elapsedStartRef.current !== null) {
        elapsedBaseRef.current += Math.floor((Date.now() - elapsedStartRef.current) / 1000);
        elapsedStartRef.current = null;
      }
    };
  }, [timerActive]);

  // ── Actions ──────────────────────────────────────────────────────────────

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
    } catch (err: unknown) {
      setError("Failed to save your rating. Please try again.");
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
          accumulated_seconds: Math.floor(elapsedSeconds),
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
    } catch (err: unknown) {
      setError("Failed to reset mastery. Please try again.");
      setLoading(false);
    }
  }

  async function handleFileChange(next: string) {
    if (sessionId) await endMasterySession(sessionId).catch(() => undefined);
    timerRef.current?.flush();
    localStorage.removeItem(sessionKey);
    setSessionId(null);
    setCurrentCard(null);
    setEmptyState(false);
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

  /** Stable deck size for this session (queue shrinks as cards are mastered). */
  const displayTotal = Math.max(initialQueueTotalRef.current ?? stats.total_cards ?? 1, 1);
  /** Ordinal card in session — backend queue index stays ~0 after reorder; total_reviews advances correctly. */
  const displayCurrent =
    stats.done || stats.ended
      ? displayTotal
      : currentCard
        ? stats.total_reviews + 1
        : 0;
  const sessionProgressPct =
    stats.done || stats.ended
      ? 100
      : Math.min(100, Math.round(((stats.total_reviews + 1) / displayTotal) * 100));

  // Keyboard shortcuts
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

  // Rating options — SRS labels map to confidence 1–5 on the API.
  const ratingOptions = [
    { score: 1 as const, label: "Again",   tone: "var(--danger)"   },
    { score: 2 as const, label: "Hard",    tone: "var(--warning)"  },
    { score: 3 as const, label: "Good",    tone: "#2563eb"         },
    { score: 4 as const, label: "Easy",    tone: "var(--success)"  },
    { score: 5 as const, label: "Mastered",tone: "var(--primary)"  },
  ] as const;

  const activeFileName =
    fileFilter === "all"
      ? "All files"
      : files.find((f) => f.id === fileFilter)?.filename || "Selected file";

  const studyTime = formatDuration(elapsedSeconds);

  return (
    <AppShell
      title="Study session"
      backLabel="Flashcards"
      backTo={classId ? `/classes/${classId}/flashcards` : "/classes"}
      contentGapClassName="gap-3"
      contentOverflowClassName="overflow-hidden"
      contentHeightClassName="h-full"
      mainClassName="min-h-0 overflow-hidden"
    >
      {/* Hidden SessionTimer — drives heartbeat / localStorage only */}
      <span className="sr-only" aria-hidden="true">
        <SessionTimer
          ref={timerRef}
          sessionId={studySessionId ?? sessionId}
          baseSeconds={studyBaseSeconds || stats.session_seconds}
          active={timerActive}
          onSave={handleSessionSave}
        />
      </span>

      {/* Outer column — fills the main flex-1 area exactly */}
      <div className="flex h-full min-h-0 w-full flex-col gap-3">

        {/* Friendly error banner (real failures only, not empty-state) */}
        {error && (
          <div className="shrink-0 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-4 py-2.5 text-sm font-medium text-[var(--danger)]">
            {error}
          </div>
        )}

        {/* ── Session header ── compact single-row control bar ── */}
        <div className="ns-card shrink-0 px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Left: progress info */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-soft)] text-[var(--primary)]">
                <Target className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-semibold tabular-nums text-[var(--text-main)]">
                  {stats.done || stats.ended ? (
                    <>{stats.done ? "Queue complete" : "Session ended"}</>
                  ) : (
                    <>
                      Card {displayCurrent}
                      <span className="mx-1 text-[var(--text-muted-soft)]">/</span>
                      <span className="text-[var(--text-muted)]">{displayTotal}</span>
                    </>
                  )}
                </span>
                <span className="text-[11px] font-medium text-[var(--text-muted-soft)]">
                  {masteryPct}% mastered
                </span>
                {topicFilter ? (
                  <span className="text-[11px] font-semibold text-[var(--primary)]">
                    · {topicFilter}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Right: file select + action buttons + live timer */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <select
                  value={fileFilter}
                  onChange={(e) => handleFileChange(e.target.value)}
                  aria-label="Filter by file"
                  className="h-8 min-w-[160px] appearance-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] pl-2.5 pr-8 text-[12px] font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="all">All files</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>{f.filename}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <Button size="sm" onClick={startSession} title="Restart study queue" aria-label="Study again" className="gap-1">
                <RefreshCw className="h-3 w-3" />
                <span className="hidden sm:inline">Study again</span>
              </Button>
              <Button size="sm" onClick={handleResetProgress} title="Reset mastery progress" aria-label="Reset progress" className="gap-1">
                <RotateCcw className="h-3 w-3" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
              <Button size="sm" variant="danger" onClick={handleEndSession} title="End this session" aria-label="End session" className="gap-1">
                <Square className="h-3 w-3" />
                <span className="hidden sm:inline">End</span>
              </Button>
              {/* Live timer — updates every second */}
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
                <Clock className="h-3 w-3" />
                {studyTime}
              </span>
            </div>
          </div>

          {/* Session progress through deck (ordinal position); mastery % stays in label row */}
          <div
            className="flash-progress-track mt-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={sessionProgressPct}
            aria-label="Study progress through session queue"
          >
            <div
              className="flash-progress-fill"
              style={{ ["--value" as any]: `${sessionProgressPct}%` } as CSSProperties}
            />
          </div>
        </div>

        {/* ── Main study canvas ── fills all remaining vertical space ── */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface-2)]">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              Loading session…
            </div>

          ) : stats.ended || stats.done ? (
            /* ── Session summary screen ── */
            <div className="ns-scroll flex h-full min-h-0 items-start justify-center overflow-y-auto p-4 sm:p-6">
              <div className="w-full max-w-[720px] rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-elevated)] sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="eyebrow">
                      <span className="eyebrow-dot" aria-hidden />
                      Session summary
                    </span>
                    <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-[var(--text-main)] sm:text-[30px]">
                      {stats.done ? "Study queue complete" : "Session ended"}
                    </h2>
                    <p className="mt-2 max-w-[520px] text-sm leading-6 text-[var(--text-secondary)]">
                      Your review progress has been saved. Start a new round when you're ready to continue.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[var(--primary-soft)] px-3.5 py-1.5 text-sm font-semibold text-[var(--primary)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                    {masteryPct}% mastery
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Study time",  value: studyTime },
                    { label: "Mastered",    value: `${stats.mastered_count}/${stats.total_unique}` },
                    { label: "Avg rating",  value: stats.total_reviews ? stats.average_rating.toFixed(2) : "0.00" },
                    { label: "Reviews",     value: stats.total_reviews },
                  ].map((cell) => (
                    <div key={cell.label} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">{cell.label}</div>
                      <div className="mt-1.5 text-xl font-semibold tabular-nums text-[var(--text-main)]">{cell.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="primary" onClick={startSession} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />Study again
                  </Button>
                  <Button onClick={handleResetProgress} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />Reset progress
                  </Button>
                </div>
              </div>
            </div>

          ) : emptyState ? (
            /* ── Empty state: no flashcards for this selection ── */
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted-soft)] shadow-[var(--shadow-xs)]">
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[15px] font-semibold text-[var(--text-main)]">No flashcards found</div>
                <p className="mt-1.5 max-w-[340px] text-[13px] leading-[1.65] text-[var(--text-muted)]">
                  {fileFilter !== "all"
                    ? `"${activeFileName}" doesn't have any flashcards yet. Try a different file or generate cards first.`
                    : "This class doesn't have any flashcards yet. Generate some from the Flashcards page."}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {fileFilter !== "all" && (
                  <Button size="sm" onClick={() => handleFileChange("all")} className="gap-1.5">
                    Show all files
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate(classId ? `/classes/${classId}/flashcards` : "/classes")}
                  className="gap-1.5"
                >
                  Go to Flashcards
                </Button>
              </div>
            </div>

          ) : !currentCard ? (
            /* ── No card in session (empty queue, not an error) ── */
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="text-[15px] font-semibold text-[var(--text-main)]">No cards available</div>
              <p className="max-w-[300px] text-[13px] text-[var(--text-muted)]">
                There are no cards to review in this session.
              </p>
              <Button size="sm" onClick={startSession} className="gap-1.5 mt-1">
                <RefreshCw className="h-3.5 w-3.5" />Try again
              </Button>
            </div>

          ) : (
            /*
             * ── Active study layout ──
             * Sticky-footer flex:
             *   • Card area  → flex-1, min-h-0, scrolls only if card is extremely long
             *   • Rating row → shrink-0, always pinned at the bottom
             */
            <div className="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4">

              {/* Card area — scrollable only when content overflows */}
              <div className="ns-scroll min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-[680px] py-1">
                  <div className={`flash-hero px-5 py-5 sm:px-7 sm:py-6 ${revealed ? "flash-hero--revealed" : ""}`}>
                    {/* Header row: label + counter */}
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary-soft)] bg-[var(--primary-soft)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                        Question
                      </span>
                      <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted-soft)]">
                        {displayCurrent} / {displayTotal}
                      </span>
                    </div>

                    {/* Question text */}
                    <div className="mt-4 text-[20px] font-semibold leading-[1.4] tracking-tight text-[var(--text-main)] sm:text-[23px]">
                      {sanitizeText(currentCard.question)}
                    </div>

                    {/* Answer — revealed with max-height so the card never grows past the viewport */}
                    {revealed && (
                      <div className="flash-reveal mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]">
                        <div className="px-4 pt-3 pb-1">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--success)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                            Answer
                          </span>
                        </div>
                        <div className="ns-scroll max-h-[clamp(120px,26vh,260px)] overflow-y-auto px-4 pb-3">
                          <p className="text-[14px] font-medium leading-[1.7] text-[var(--text-main)]">
                            {sanitizeText(currentCard.answer)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Show Answer / Hide Answer CTA */}
                    <div className="mt-5 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setRevealed((v) => !v)}
                        className={revealed ? "flash-cta flash-cta--secondary" : "flash-cta"}
                        aria-pressed={revealed}
                      >
                        {revealed ? (
                          <>
                            <EyeOff className="h-4 w-4" />
                            <span>Hide answer</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4" />
                            <span>Show answer</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Rating row — always pinned at the bottom, never scrolls away ── */}
              <div className="shrink-0 mx-auto w-full max-w-[680px]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[11.5px] font-medium tracking-[-0.005em] text-[var(--text-muted)]">
                    How well did you know it?
                  </span>
                  <span className="hidden items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted-soft)] sm:inline-flex">
                    <kbd className="kbd">Space</kbd>
                    <span>reveal</span>
                    <span aria-hidden>·</span>
                    <kbd className="kbd">1</kbd>
                    <span>–</span>
                    <kbd className="kbd">5</kbd>
                    <span>rate</span>
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {ratingOptions.map((opt, idx) => (
                    <button
                      key={opt.score}
                      type="button"
                      onClick={() => handleReview(opt.score)}
                      disabled={submitting || !revealed}
                      aria-label={`Rate: ${opt.label} (key ${idx + 1})`}
                      title={revealed ? `${opt.label} (press ${idx + 1})` : "Reveal the answer first"}
                      className={`rating-btn ${revealed ? "rating-btn--ready" : ""}`}
                      style={{ ["--tone" as any]: opt.tone } as CSSProperties}
                    >
                      <span className="rating-btn__label">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
