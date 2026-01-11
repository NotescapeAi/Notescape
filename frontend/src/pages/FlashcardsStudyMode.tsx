import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import {
  endMasterySession,
  getMasterySession,
  listFiles,
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
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);
  const [fileFilter, setFileFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const responseStart = useRef<number | null>(null);

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
    if (!classNum) return;
    localStorage.setItem("last_class_id", String(classNum));
  }, [classNum]);

  async function handleReview(confidence: 1 | 2 | 3 | 4 | 5) {
    if (!currentCard || !sessionId) return;
    const start = responseStart.current;
    const responseTime = start ? Date.now() - start : undefined;
    setLoading(true);
    setError(null);
    try {
      const data = await reviewMasteryCard({
        session_id: sessionId,
        card_id: currentCard.id,
        rating: confidence,
        response_time_ms: responseTime,
      });
      applySession(data);
    } catch (err: any) {
      setError(err?.message || "Failed to save review");
    } finally {
      setLoading(false);
    }
  }

  async function handleEndSession() {
    if (!sessionId) return;
    try {
      await endMasterySession(sessionId);
    } finally {
      localStorage.removeItem(sessionKey);
      setStats((prev) => ({ ...prev, ended: true }));
      setCurrentCard(null);
    }
  }

  async function handleResetProgress() {
    if (!classNum) return;
    setLoading(true);
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
    localStorage.removeItem(sessionKey);
    setSessionId(null);
    setCurrentCard(null);
    setFileFilter(next);
  }

  const masteryPct =
    stats.mastery_percent ||
    (stats.total_unique ? Math.round((stats.mastered_count / stats.total_unique) * 100) : 0);

  return (
    <AppShell
      title="Study Session"
      breadcrumbs={["Flashcards", "Study"]}
      subtitle="Build mastery, one card at a time."
      backLabel="Back to Flashcards"
      backTo={classId ? `/classes/${classId}/flashcards` : "/classes"}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--primary)]">Study session</div>
            <h1 className="mt-2 text-3xl font-semibold text-main">Mastery mode</h1>
            <div className="text-sm text-muted">Reinforce weak cards until they stick.</div>
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

        <div className="rounded-[22px] surface p-4 shadow-token">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Mastery {masteryPct}%</span>
            <span>
              {stats.mastered_count}/{stats.total_unique} mastered
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full surface-tint">
            <div className="h-full rounded-full bg-[var(--accent-mint)]" style={{ width: `${masteryPct}%` }} />
          </div>
          <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
            <div>Session time: {formatDuration(stats.session_seconds)}</div>
            <div>Avg rating: {stats.total_reviews ? stats.average_rating.toFixed(2) : "0.00"}</div>
            <div>Total reviews: {stats.total_reviews}</div>
          </div>
        </div>

        <div className="rounded-[28px] surface p-6 shadow-token">
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
            <div className="text-xs text-muted">
              {stats.total_cards ? stats.current_index + 1 : 0} / {stats.total_cards}
            </div>
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
              <div className="rounded-[28px] border border-token bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] p-8 shadow-token">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--primary)]">Mastery</div>
                <div className="mt-3 text-2xl font-semibold text-main">
                  {sanitizeText(currentCard.question)}
                </div>
                <div
                  className={`mt-6 rounded-2xl border border-token surface p-4 text-sm text-muted transition ${
                    revealed ? "opacity-100" : "opacity-0 h-0 overflow-hidden"
                  }`}
                >
                  {sanitizeText(currentCard.answer)}
                </div>
                <div className="mt-6">
                  <Button variant="primary" className="rounded-full" onClick={() => setRevealed((v) => !v)}>
                    {revealed ? "Hide answer" : "Show answer"}
                  </Button>
                </div>
              </div>

              <div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  {[
                    { score: 1, label: "No clue", color: "border-accent bg-accent-soft text-accent" },
                    { score: 2, label: "Hard", color: "border-accent bg-accent-weak text-accent" },
                    {
                      score: 3,
                      label: "Okay",
                      color:
                        "border-[var(--accent-lime)] bg-[var(--accent-lime)]/20 text-[var(--accent-lime)]",
                    },
                    {
                      score: 4,
                      label: "Easy",
                      color:
                        "border-[var(--accent-mint)] bg-[var(--accent-mint)]/20 text-[var(--accent-mint)]",
                    },
                    {
                      score: 5,
                      label: "Mastered",
                      color:
                        "border-[var(--accent-mint)] bg-[var(--accent-mint)]/30 text-[var(--accent-mint)]",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.score}
                      onClick={() => handleReview(opt.score as 1 | 2 | 3 | 4 | 5)}
                      className={`rounded-2xl border px-3 py-3 text-xs font-semibold ${opt.color}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>Not confident</span>
                  <span>Mastered</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
