import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import { SessionManager } from "../components/SessionManager";
import {
  endReviewSession,
  getReviewSession,
  listFiles,
  resetReviewProgress,
  reviewSessionCard,
  startReviewSession,
  type ReviewCard,
  type ReviewSession,
} from "../lib/api";
import { useActivity } from "../contexts/ActivityContext";
import { formatDuration } from "../lib/utils";

type SessionStats = {
  total_cards: number;
  total_unique: number;
  reviewed_count: number;
  reviewed_percent: number;
  total_reviews: number;
  average_rating: number;
  session_seconds: number;
  current_index: number;
  done: boolean;
  ended: boolean;
};

function normalizeStats(data: ReviewSession): SessionStats {
  return {
    total_cards: data.total_cards ?? 0,
    total_unique: data.total_unique ?? 0,
    reviewed_count: data.reviewed_count ?? 0,
    reviewed_percent: data.reviewed_percent ?? 0,
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

type CardStudyEvent = {
  opened_at: string;
  viewed_ms: number;
  completed: boolean;
  completed_at?: string;
};

type CardStudyHistory = {
  first_opened_at: string;
  last_opened_at: string;
  question_preview: string;
  total_view_ms: number;
  last_view_ms: number;
  completed: boolean;
  completed_at?: string;
  events: CardStudyEvent[];
};

export default function FlashcardsStudyMode() {
  const { classId } = useParams();
  const classNum = classId ? Number(classId) : undefined;
  const { currentSessionDuration, registerStreakActivity } = useActivity();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentCard, setCurrentCard] = useState<ReviewCard | null>(null);
  const [stats, setStats] = useState<SessionStats>({
    total_cards: 0,
    total_unique: 0,
    reviewed_count: 0,
    reviewed_percent: 0,
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
  const activeViewRef = useRef<{ card_id: string; started_at_ms: number } | null>(null);
  const [studyHistory, setStudyHistory] = useState<Record<string, CardStudyHistory>>({});

  const interactionsKey = useMemo(
    () => (classNum ? `notescape.flashcards.session.${classNum}` : null),
    [classNum]
  );

  const recordInteraction = useCallback(
    (cardId: string) => {
      if (!interactionsKey) return;
      try {
        const raw = sessionStorage.getItem(interactionsKey);
        const parsed = raw ? (JSON.parse(raw) as any) : null;
        const ids = Array.isArray(parsed?.card_ids) ? parsed.card_ids.map(String) : [];
        const set = new Set(ids);
        set.add(String(cardId));
        sessionStorage.setItem(
          interactionsKey,
          JSON.stringify({
            started_at: typeof parsed?.started_at === "number" ? parsed.started_at : Date.now(),
            card_ids: Array.from(set),
          })
        );
      } catch {
        void 0;
      }
    },
    [interactionsKey]
  );

  const sessionKey = useMemo(
    () => (classNum ? `review_session_${classNum}_${fileFilter}` : "review_session_unknown"),
    [classNum, fileFilter]
  );

  const historyKey = useMemo(
    () => (sessionId ? `notescape.flashcards.study_history.${sessionId}` : null),
    [sessionId]
  );

  const persistHistory = useCallback(
    (next: Record<string, CardStudyHistory>) => {
      if (!historyKey) return;
      try {
        localStorage.setItem(historyKey, JSON.stringify(next));
      } catch {
        void 0;
      }
    },
    [historyKey]
  );

  const finalizeActiveView = useCallback(
    (endAtMs: number) => {
      const active = activeViewRef.current;
      if (!active) return;
      activeViewRef.current = null;
      const durationMs = Math.max(0, endAtMs - active.started_at_ms);
      setStudyHistory((prev) => {
        const existing = prev[active.card_id];
        if (!existing) return prev;
        const events = Array.isArray(existing.events) ? [...existing.events] : [];
        if (events.length > 0) {
          const last = events[events.length - 1];
          events[events.length - 1] = {
            ...last,
            viewed_ms: (last.viewed_ms ?? 0) + durationMs,
          };
        }
        const next = {
          ...prev,
          [active.card_id]: {
            ...existing,
            total_view_ms: existing.total_view_ms + durationMs,
            last_view_ms: durationMs,
            events,
          },
        };
        persistHistory(next);
        return next;
      });
    },
    [persistHistory]
  );

  const applySession = (data: ReviewSession) => {
    setSessionId(data.session_id ?? null);
    setStats(normalizeStats(data));
    setCurrentCard(data.current_card ?? null);
    setRevealed(false);
    responseStart.current = Date.now();
    if (data.session_id) localStorage.setItem(sessionKey, data.session_id);
  };

  const startNewSession = async () => {
    if (!classNum) return;
    const payload = {
      class_id: classNum,
      file_ids: fileFilter === "all" ? undefined : [fileFilter],
    };
    const data = await startReviewSession(payload);
    applySession(data);
  };

  const loadSession = async () => {
    if (!classNum) return;
    setLoading(true);
    setError(null);
    try {
      const filesRes = await listFiles(classNum);
      setFiles((filesRes ?? []).map((f) => ({ id: f.id, filename: f.filename })));

      const stored = localStorage.getItem(sessionKey);
      if (stored) {
        try {
          const data = await getReviewSession(stored);
          applySession(data);
          return;
        } catch {
          localStorage.removeItem(sessionKey);
        }
      }
      await startNewSession();
    } catch (e: any) {
      setError(e?.message || "Failed to load study session");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [classNum, fileFilter]);

  useEffect(() => {
    activeViewRef.current = null;
    if (!historyKey) {
      setStudyHistory({});
      return;
    }
    try {
      const raw = localStorage.getItem(historyKey);
      if (!raw) {
        setStudyHistory({});
        return;
      }
      const parsed = JSON.parse(raw) as any;
      const entries = parsed && typeof parsed === "object" ? Object.entries(parsed) : [];
      const migrated: Record<string, CardStudyHistory> = {};
      for (const [cardId, value] of entries) {
        if (!value || typeof value !== "object") continue;
        const v: any = value;
        const events: CardStudyEvent[] = Array.isArray(v.events)
          ? v.events
              .filter((e: any) => e && typeof e === "object")
              .map((e: any) => ({
                opened_at: String(e.opened_at ?? ""),
                viewed_ms: Number(e.viewed_ms ?? 0) || 0,
                completed: Boolean(e.completed),
                completed_at: typeof e.completed_at === "string" ? e.completed_at : undefined,
              }))
              .filter((e) => Boolean(e.opened_at))
          : [];

        if (events.length === 0 && (v.first_opened_at || v.last_opened_at)) {
          events.push({
            opened_at: String(v.last_opened_at ?? v.first_opened_at),
            viewed_ms: Number(v.last_view_ms ?? 0) || 0,
            completed: Boolean(v.completed),
            completed_at: typeof v.completed_at === "string" ? v.completed_at : undefined,
          });
        }

        const firstOpenedAt = String(v.first_opened_at ?? events[0]?.opened_at ?? "");
        const lastOpenedAt = String(v.last_opened_at ?? events[events.length - 1]?.opened_at ?? firstOpenedAt);

        migrated[String(cardId)] = {
          first_opened_at: firstOpenedAt,
          last_opened_at: lastOpenedAt,
          question_preview: String(v.question_preview ?? ""),
          total_view_ms: Number(v.total_view_ms ?? 0) || 0,
          last_view_ms: Number(v.last_view_ms ?? 0) || 0,
          completed: Boolean(v.completed),
          completed_at: typeof v.completed_at === "string" ? v.completed_at : undefined,
          events,
        };
      }

      setStudyHistory(migrated);
    } catch {
      setStudyHistory({});
    }
  }, [historyKey]);

  useEffect(() => {
    const now = Date.now();
    finalizeActiveView(now);

    if (!sessionId || !currentCard) return;

    const cardId = currentCard.id;
    activeViewRef.current = { card_id: cardId, started_at_ms: now };
    setStudyHistory((prev) => {
      const iso = new Date(now).toISOString();
      const existing = prev[cardId];
      const existingEvents = existing && Array.isArray(existing.events) ? existing.events : [];
      const nextEntry: CardStudyHistory = existing
        ? {
            ...existing,
            last_opened_at: iso,
            question_preview: existing.question_preview || sanitizeText(currentCard.question).slice(0, 110),
            events: [...existingEvents, { opened_at: iso, viewed_ms: 0, completed: false }],
          }
        : {
            first_opened_at: iso,
            last_opened_at: iso,
            question_preview: sanitizeText(currentCard.question).slice(0, 110),
            total_view_ms: 0,
            last_view_ms: 0,
            completed: false,
            events: [{ opened_at: iso, viewed_ms: 0, completed: false }],
          };
      const next = { ...prev, [cardId]: nextEntry };
      persistHistory(next);
      return next;
    });
    recordInteraction(cardId);
    registerStreakActivity();
  }, [currentCard, finalizeActiveView, persistHistory, recordInteraction, registerStreakActivity, sessionId]);


  const handleFileChange = (value: string) => {
    finalizeActiveView(Date.now());
    setReviewToast(null);
    setError(null);
    setSessionId(null);
    setCurrentCard(null);
    setStats({
      total_cards: 0,
      total_unique: 0,
      reviewed_count: 0,
      reviewed_percent: 0,
      total_reviews: 0,
      average_rating: 0,
      session_seconds: 0,
      current_index: 0,
      done: false,
      ended: false,
    });
    setRevealed(false);
    setFileFilter(value);
  };

  const handleReview = async (rating: 1 | 2 | 3 | 4 | 5) => {
    if (!sessionId || !currentCard) return;
    if (!revealed) {
      setReviewToast("Reveal the answer before rating.");
      return;
    }
    registerStreakActivity();
    setSubmitting(true);
    setReviewToast(null);
    setError(null);
    try {
      const startedAt = responseStart.current;
      const responseTimeMs = startedAt ? Math.max(0, Date.now() - startedAt) : undefined;
      const data = await reviewSessionCard({
        session_id: sessionId,
        card_id: currentCard.id,
        rating,
        response_time_ms: responseTimeMs,
      });
      setStudyHistory((prev) => {
        const iso = new Date().toISOString();
        const existing = prev[currentCard.id];
        if (!existing) return prev;
        const events = Array.isArray(existing.events) ? [...existing.events] : [];
        if (events.length > 0) {
          const last = events[events.length - 1];
          events[events.length - 1] = {
            ...last,
            completed: true,
            completed_at: last.completed_at ?? iso,
          };
        }
        const next = {
          ...prev,
          [currentCard.id]: {
            ...existing,
            completed: true,
            completed_at: existing.completed_at ?? iso,
            events,
          },
        };
        persistHistory(next);
        return next;
      });
      applySession(data);
    } catch (e: any) {
      setError(e?.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      finalizeActiveView(Date.now());
      await endReviewSession(sessionId);
      localStorage.removeItem(sessionKey);
      setStats((s) => ({ ...s, ended: true }));
    } catch (e: any) {
      setError(e?.message || "Failed to end session");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetProgress = async () => {
    if (!classNum) return;
    setSubmitting(true);
    setError(null);
    try {
      finalizeActiveView(Date.now());
      await resetReviewProgress(classNum);
      localStorage.removeItem(sessionKey);
      await startNewSession();
    } catch (e: any) {
      setError(e?.message || "Failed to reset progress");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!loading && !stats.ended && !stats.done && currentCard) {
          setRevealed((v) => !v);
        }
        return;
      }
      const digit = e.key;
      if (digit >= "1" && digit <= "5") {
        if (!submitting && revealed) {
          handleReview(Number(digit) as 1 | 2 | 3 | 4 | 5);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, stats.ended, stats.done, currentCard, submitting, revealed, sessionId]);

  const studiedCount = useMemo(() => Object.keys(studyHistory).length, [studyHistory]);
  const completedCount = useMemo(
    () => Object.values(studyHistory).filter((h) => h.completed).length,
    [studyHistory]
  );
  const recentHistory = useMemo(() => {
    return Object.entries(studyHistory)
      .sort((a, b) => new Date(b[1].last_opened_at).getTime() - new Date(a[1].last_opened_at).getTime())
      .slice(0, 6);
  }, [studyHistory]);

  return (
    <AppShell title="Flashcards Study Mode" backTo={`/classes/${classNum}/flashcards`}>
      {classNum && <SessionManager mode="Flashcards" classId={classNum} endOnUnmount={false} />}
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted-soft)]">
              {fileFilter === "all" ? "All files" : files.find((f) => f.id === fileFilter)?.filename || "Selected file"}
            </div>
            <h1 className="mt-1 text-3xl font-semibold text-main">Flashcards</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button className="rounded-full" onClick={startNewSession}>
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
              Opened {studiedCount}
            </span>
            <span>
              Completed {completedCount}
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
              Session time: {formatDuration(currentSessionDuration)}
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

              {recentHistory.length > 0 && (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
                    Study history (this session)
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
                    {recentHistory.map(([cardId, h]) => {
                      const lastEvent = h.events?.[h.events.length - 1];
                      const lastViewMs =
                        typeof lastEvent?.viewed_ms === "number" ? lastEvent.viewed_ms : h.last_view_ms;
                      return (
                        <div key={cardId} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[var(--text-main)]">{h.question_preview || "Flashcard"}</div>
                            <div className="mt-0.5 text-[11px] text-[var(--text-muted-soft)]">
                              Last view {Math.round(lastViewMs / 1000)}s · Total {Math.round(h.total_view_ms / 1000)}s
                            </div>
                          </div>
                          <div className="shrink-0 rounded-full border border-token px-2 py-0.5 text-[11px]">
                            {h.completed ? "Completed" : "Opened"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
