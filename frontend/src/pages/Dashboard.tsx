import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, FileText, Sparkles } from "lucide-react";
import AppShell from "../layouts/AppShell";
import {
  listClasses,
  listFiles,
  getFlashcardProgress,
  listFlashcards,
  getStudySessionOverview,
  listRecentStudySessions,
  getWeakTags,
  type StudySession,
  type ClassRow,
  type Flashcard,
  type WeakTag,
} from "../lib/api";

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  return `${mins}m`;
}

export default function Dashboard() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [fileCount, setFileCount] = useState<number>(0);
  const [dueNow, setDueNow] = useState<number>(0);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [resumeFile, setResumeFile] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<Array<{ filename: string; className: string }>>([]);
  const [studyOverview, setStudyOverview] = useState<{
    total_seconds_7d: number;
    sessions_7d: number;
    avg_seconds_7d: number;
  } | null>(null);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [weakTags, setWeakTags] = useState<WeakTag[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  function isDue(card: Flashcard) {
    if (!card.due_at) return true;
    return new Date(card.due_at) <= new Date();
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cs = await listClasses();
        setClasses(cs);
        const files = await Promise.all(cs.map(async (c) => ({ className: c.name, rows: await listFiles(c.id) })));
        const flatFiles = files.flatMap((group) =>
          (group.rows ?? []).map((row) => ({
            filename: row.filename,
            uploaded_at: row.uploaded_at ?? undefined,
            className: group.className,
          }))
        );
        setFileCount(flatFiles.length);
        const sortedFiles = [...flatFiles].sort((a, b) =>
          String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? ""))
        );
        setRecentFiles(sortedFiles.slice(0, 3));
        if (cs[0]) {
          const prog = await getFlashcardProgress(cs[0].id);
          setDueNow(prog?.due_now ?? 0);
          const classFiles = await listFiles(cs[0].id);
          setResumeFile(classFiles?.[0]?.filename ?? null);
          const cards = await listFlashcards(cs[0].id);
          setDueCards((cards ?? []).filter(isDue).slice(0, 5));
        }
        const [overview, sessions, weakTagRows] = await Promise.all([
          getStudySessionOverview(),
          listRecentStudySessions(10),
          getWeakTags({ limit: 12 }),
        ]);
        setStudyOverview({
          total_seconds_7d: overview.total_seconds_7d,
          sessions_7d: overview.sessions_7d,
          avg_seconds_7d: overview.avg_seconds_7d,
        });
        setRecentSessions(sessions);
        setWeakTags(weakTagRows);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const recentClasses = useMemo(() => classes.slice(0, 4), [classes]);
  const activityItems = useMemo(() => {
    const items: Array<{ id: string; label: string; detail?: string }> = [];
    if (recentFiles[0]) {
      items.push({
        id: `upload-${recentFiles[0].filename}`,
        label: "Uploaded document",
        detail: `${recentFiles[0].filename} in ${recentFiles[0].className}`,
      });
    }
    if (classes[0]) {
      items.push({
        id: `class-${classes[0].id}`,
        label: "Created class",
        detail: classes[0].name,
      });
    }
    if (dueCards[0]) {
      items.push({
        id: `study-${dueCards[0].id}`,
        label: "Study session ready",
        detail: "Flashcards due today",
      });
    }
    return items.slice(0, 3);
  }, [classes, dueCards, recentFiles]);
  const metrics = [
    { label: "Classes", value: loading ? "..." : classes.length, hint: "Active classes" },
    { label: "Documents", value: loading ? "..." : fileCount, hint: "Study materials" },
    { label: "Cards due today", value: loading ? "..." : dueNow, hint: "Ready to review" },
    {
      label: "Study time",
      value: loading
        ? "..."
        : studyOverview
          ? formatDuration(studyOverview.total_seconds_7d)
          : "0m",
      hint: studyOverview
        ? `Last 7 days · Avg ${formatDuration(Math.round(studyOverview.avg_seconds_7d))}`
        : "Start a study session",
    },
  ];
  const hasInsightData = weakTags.length > 0;
  const weakInsights = useMemo(
    () => [...weakTags].sort((a, b) => a.quiz_accuracy_pct - b.quiz_accuracy_pct).slice(0, 5),
    [weakTags]
  );
  const strongInsights = useMemo(
    () => [...weakTags].sort((a, b) => b.quiz_accuracy_pct - a.quiz_accuracy_pct).slice(0, 5),
    [weakTags]
  );
  const overallAccuracy = useMemo(() => {
    if (!weakTags.length) return null;
    const total = weakTags.reduce((sum, tag) => sum + (tag.quiz_accuracy_pct || 0), 0);
    return Math.round(total / weakTags.length);
  }, [weakTags]);

  return (
    <AppShell title="Dashboard" headerMaxWidthClassName="max-w-[1200px]">
      <div className="mx-auto w-full max-w-[1200px] px-2 sm:px-0">
        <div className="flex flex-col gap-10">
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="card-accent p-8 text-inverse">
              <div className="card-accent-content space-y-3">
                <div className="text-xs uppercase tracking-[0.35em] text-inverse/80">Continue</div>
                <h2 className="text-3xl font-semibold leading-tight">Pick up the next concept.</h2>
                <p className="text-sm text-inverse/80">
                  Resume your most recent class or jump into due cards to keep your streak alive.
                </p>
                <Link
                  to="/classes"
                  className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[var(--surface)] px-5 py-2 text-sm font-semibold text-[var(--text)] dark:text-white shadow-[var(--shadow-soft)]"
                >
                  <Sparkles className="h-4 w-4" />
                  Continue studying
                </Link>
              </div>
            </div>

            <div className="card-neutral p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted-soft)]">Resume</div>
                  <div className="mt-2 text-xl font-semibold text-[var(--text-main)]">
                    {classes[0]?.name ?? "No class yet"}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {resumeFile ? `Last document: ${resumeFile}` : "Upload a document to continue."}
                  </div>
                </div>
                {classes[0] && (
                  <button
                    className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] shadow-[var(--shadow-soft)]"
                    onClick={() => navigate("/classes", { state: { selectId: classes[0].id } })}
                  >
                    Open class
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            {metrics.map((metric) => (
              <div key={metric.label} className="card-muted p-5">
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted-soft)]">{metric.label}</div>
                <div className="mt-2 text-3xl font-semibold text-[var(--text-main)]">{metric.value}</div>
                <div className="mt-2 text-[0.85rem] text-[var(--text-secondary)]">{metric.hint}</div>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="card-neutral p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted-soft)]">Due Today</div>
                  <div className="mt-2 text-lg font-semibold text-[var(--text-main)]">Flashcards ready</div>
                </div>
                {classes[0] && (
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] shadow-[var(--shadow-soft)]"
                    onClick={() =>
                      navigate(`/classes/${classes[0].id}/flashcards/study`, {
                        state: { cards: dueCards, className: classes[0].name, startIndex: 0 },
                      })
                    }
                  >
                    Study now
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {dueCards.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-6 text-sm text-[var(--text-secondary)]">
                    No cards due yet. You are all caught up.
                  </div>
                ) : (
                  dueCards.map((card) => (
                    <div
                      key={card.id}
                      className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-secondary)]"
                    >
                      <div className="font-semibold text-[var(--text-main)]">{card.question}</div>
                      <div className="text-xs text-[var(--text-muted-soft)]">
                        {card.difficulty ?? "medium"} difficulty
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card-neutral p-6 space-y-4">
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted-soft)]">Recent classes</div>
              <div className="space-y-3">
                {recentClasses.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-5 text-center text-sm text-[var(--text-muted-soft)]">
                    No classes yet.
                  </div>
                ) : (
                  recentClasses.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-soft)]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-semibold text-inverse">
                          {c.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <div className="font-semibold text-[var(--text-main)]">{c.name}</div>
                          <div className="text-xs text-[var(--text-secondary)]">{c.subject ?? "General"}</div>
                        </div>
                      </div>
                      <button
                        className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--text-secondary)]"
                        onClick={() => navigate("/classes", { state: { selectId: c.id } })}
                      >
                        View
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="card-neutral p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted-soft)]">Learning insights</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-main)]">Weak and strong areas</div>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                {overallAccuracy == null ? "Not enough data yet" : `Accuracy ${overallAccuracy}%`}
              </span>
            </div>
            {hasInsightData ? (
              <>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">
                      Weak areas
                    </div>
                    <div className="space-y-2">
                      {weakInsights.map((tag) => (
                        <div key={`weak-${tag.tag_id}`} className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-[var(--text-main)]">{tag.tag}</span>
                          <span className="text-[var(--text-secondary)]">{Math.round(tag.quiz_accuracy_pct)}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      {weakInsights[0]?.class_id ? (
                        <button
                          className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--text-secondary)]"
                          onClick={() =>
                            navigate(
                              `/classes/${weakInsights[0].class_id}/flashcards?tag=${encodeURIComponent(
                                weakInsights[0].tag
                              )}`
                            )
                          }
                        >
                          Study weak areas
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--text-secondary)]">Study weak areas</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">
                      Strong areas
                    </div>
                    <div className="space-y-2">
                      {strongInsights.map((tag) => (
                        <div key={`strong-${tag.tag_id}`} className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-[var(--text-main)]">{tag.tag}</span>
                          <span className="text-[var(--text-secondary)]">{Math.round(tag.quiz_accuracy_pct)}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-[var(--text-secondary)]">
                      Doing well. Keep reviewing these to retain mastery.
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-[var(--text-secondary)]">
                  Overall rating: Accuracy {overallAccuracy}% in recent attempts.
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-6 text-sm text-[var(--text-secondary)]">
                Complete a quiz or review flashcards to see insights.
              </div>
            )}
          </section>

          <section className="card-neutral p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted-soft)]">Recent activity</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-main)]">Learning overview</div>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Last 7 days</span>
            </div>
            <div className="mt-5 space-y-4 text-sm text-[var(--text-secondary)]">
              {activityItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-6 text-center text-sm text-[var(--text-secondary)]">
                  No activity yet. Create a class to begin your learning flow.
                </div>
              ) : (
                activityItems.map((item, idx) => (
                  <div key={item.id} className="flex items-start gap-4">
                    <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--primary)]">
                      {idx === 0 ? <FileText className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-[var(--text-main)]">{item.label}</div>
                      {item.detail && (
                        <div className="text-xs text-[var(--text-secondary)]">{item.detail}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card-neutral p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted-soft)]">Study sessions</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-main)]">Recent study time</div>
              </div>
              {studyOverview && (
                <span className="text-xs text-[var(--text-secondary)]">{studyOverview.sessions_7d} sessions (7d)</span>
              )}
            </div>
            <div className="mt-5 space-y-3 text-sm">
              {recentSessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-6 text-center text-sm text-[var(--text-secondary)]">
                  No study sessions yet. Start a study session to see time tracked.
                </div>
              ) : (
                recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-soft)]"
                  >
                    <div>
                      <div className="font-semibold text-[var(--text-main)]">
                        {session.class_name || (session.class_id ? `Class #${session.class_id}` : "Study session")}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {session.started_at ? new Date(session.started_at).toLocaleString() : "Session"}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {formatDuration(Math.max(0, session.duration_seconds ?? session.active_seconds ?? 0))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

