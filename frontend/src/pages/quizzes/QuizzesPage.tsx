import { useEffect, useMemo, useState } from "react";
import AppShell from "../../layouts/AppShell";
import QuizPanel from "../../components/QuizPanel";
import {
  listClasses,
  listFiles,
  listQuizzes,
  deleteQuiz,
  getQuizHistory,
  type ClassRow,
  type FileRow,
  type QuizListItem,
  type QuizHistoryItem,
} from "../../lib/api";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Trash2, History } from "lucide-react";

export default function QuizzesPage() {
  const [searchParams] = useSearchParams();
  const topicFocus = (searchParams.get("topic") || "").trim();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  // Initialize from localStorage to prevent layout jump on mount
  const [classId, setClassId] = useState<number | null>(() => {
    try {
      const fromQuery = Number(new URLSearchParams(window.location.search).get("class_id"));
      if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
      const stored = localStorage.getItem("last_class_id");
      return stored ? Number(stored) : null;
    } catch {
      return null;
    }
  });
  const navigate = useNavigate();

  const [files, setFiles] = useState<FileRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingQuizId, setDeletingQuizId] = useState<string | null>(null);
  const [allHistory, setAllHistory] = useState<QuizHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [classesResolved, setClassesResolved] = useState(false);

  function friendlyQuizError(err: any, fallback: string) {
    const detail = err?.response?.data?.detail;
    const raw = typeof detail === "string" ? detail : err?.message || fallback;
    const lower = String(raw).toLowerCase();
    if (
      lower.includes("relation") ||
      lower.includes("sql") ||
      lower.includes("syntax") ||
      lower.includes("traceback")
    ) {
      return "Something went wrong while generating quiz. Please try again.";
    }
    return String(raw);
  }

  // Load classes once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        const cs = await listClasses();
        if (!mounted) return;
        setClasses(cs);

        // If we have a classId but it's not in the list, fallback to first
        // If we don't have a classId, default to first
        if (cs.length > 0) {
            // Check if current classId is valid
            const currentExists = classId && cs.some(c => c.id === classId);
            
            if (!classId || !currentExists) {
                const fallback = cs[0].id;
                setClassId(fallback);
                localStorage.setItem("last_class_id", String(fallback));
            }
        } else {
            // No classes available at all
            setClassId(null);
            localStorage.removeItem("last_class_id");
        }
      } catch (e: any) {
        if (!mounted) return;
        console.error("Error loading classes:", e);
        // Only set error if we really can't do anything (e.g. auth failure will be handled by interceptor ideally)
        // But for now, show it.
        setError(e?.message || "Failed to load classes. Please check your backend connection.");
      } finally {
        if (mounted) setClassesResolved(true);
      }
    })();
    return () => { mounted = false; };
  }, []); // Only run on mount

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingHistory(true);
      try {
        const rows = await getQuizHistory();
        if (!mounted) return;
        setAllHistory(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setAllHistory([]);
      } finally {
        if (mounted) setLoadingHistory(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Load files + quizzes when class changes
  useEffect(() => {
    if (!classId) return;

    localStorage.setItem("last_class_id", String(classId));

    // Load files
    (async () => {
      setLoadingFiles(true);
      try {
        const rows = await listFiles(classId);
        setFiles(rows ?? []);
      } catch (e: any) {
        console.error("Error loading files:", e);
        setFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    })();

    // Load quizzes
    loadQuizzes();
  }, [classId]);

  async function loadQuizzes() {
    if (!classId) return;
    setLoadingQuizzes(true);
    try {
      const qs = await listQuizzes(classId);
      setQuizzes(qs ?? []);
    } catch (e: any) {
      console.error("Error loading quizzes:", e);
      setQuizzes([]);
    } finally {
      setLoadingQuizzes(false);
    }
  }

  async function handleDeleteQuiz(quizId: string) {
    if (!confirm("Are you sure you want to delete this quiz?")) return;
    
    setDeletingQuizId(quizId);
    try {
      await deleteQuiz(quizId);
      // Reload quizzes after deletion
      await loadQuizzes();
    } catch (e: any) {
      console.error("Error deleting quiz:", e);
      alert(friendlyQuizError(e, "Failed to delete quiz"));
    } finally {
      setDeletingQuizId(null);
    }
  }

  const pdfCount = useMemo(
    () => (files ?? []).filter((f) => f.filename.toLowerCase().endsWith(".pdf")).length,
    [files]
  );

  // Map file_id -> filename for display in history
  const fileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) map.set(String(f.id), f.filename);
    return map;
  }, [files]);

  const attemptsThisClass = useMemo(() => {
    if (!classId || !quizzes.length) return [];
    const quizIds = new Set(quizzes.map((q) => String(q.id)));
    return [...allHistory]
      .filter((a) => quizIds.has(String(a.quiz_id)))
      .sort((a, b) => String(b.attempted_at).localeCompare(String(a.attempted_at)))
      .slice(0, 6);
  }, [allHistory, classId, quizzes]);

  function scrollToQuizBuilder() {
    document.getElementById("quiz-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formatDate(ts?: string) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  }

  return (
    <AppShell
      title="Quizzes"
      subtitle="Create quizzes from your study material and track recall."
      headerMaxWidthClassName="max-w-[1400px]"
      contentGapClassName="gap-4"
    >
      <div className="mx-auto w-full max-w-[1400px] px-2 py-1 sm:px-0 sm:py-0">
        <div className="flex flex-col gap-5">
          {error && (
            <div className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] shadow-[var(--shadow-sm)] dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100">
              <div className="mb-1 font-semibold text-[var(--text-main)]">Connection issue</div>
              <div className="text-[var(--text-secondary)]">{error}</div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Check that the backend is running, then refresh.</p>
            </div>
          )}

          <section className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-5">
            <div className="ns-card flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] p-0 shadow-[var(--shadow-sm)]">
              <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6 sm:py-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">Create</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-main)] sm:text-xl">New practice set</h2>
                <div className="mt-5 space-y-2">
                  <label htmlFor="quizzes-class-select" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">
                    Class
                  </label>
                  <div className="relative">
                    <select
                      id="quizzes-class-select"
                      className="h-11 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 pr-10 text-sm font-medium text-[var(--text-main)] shadow-sm outline-none transition hover:border-[var(--border-strong)] focus:border-[color-mix(in_srgb,var(--primary)_50%,var(--border))] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[color-mix(in_srgb,var(--surface-2)_88%,#000)]"
                      value={classId ?? ""}
                      onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
                      disabled={classes.length === 0}
                    >
                      <option value="">Select a class…</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
                        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-[var(--text-muted)]">
                      {pdfCount} indexed PDF{pdfCount !== 1 ? "s" : ""} in this class
                    </span>
                  </div>
                </div>
              </div>

              {!classId ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text-muted)]">
                    <ClipboardList className="h-7 w-7" aria-hidden />
                  </div>
                  <h3 className="text-base font-semibold text-[var(--text-main)] sm:text-lg">
                    {!classesResolved ? "Loading…" : classes.length === 0 ? "No classes yet" : "Select a class"}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
                    {!classesResolved
                      ? "Loading your workspace…"
                      : classes.length === 0
                        ? "Upload a document or create a class to start studying."
                        : "Choose a class to load documents and the builder."}
                  </p>
                  {classesResolved && classes.length === 0 && error === null ? (
                    <button
                      type="button"
                      onClick={() => navigate("/classes")}
                      className="mt-5 inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-xs)] transition hover:brightness-110"
                    >
                      Open Classes
                    </button>
                  ) : null}
                </div>
              ) : loadingFiles ? (
                <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-[var(--text-muted)]">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                  Loading documents…
                </div>
              ) : (
                <QuizPanel classId={classId} files={files} topicFocus={topicFocus} onQuizCreated={loadQuizzes} />
              )}
            </div>

            <aside className="ns-card flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-sm)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">This class</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-main)]">Practice sets</h3>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/quizzes/history")}
                  className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
                >
                  <History className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                  All attempts
                </button>
              </div>

              {classId ? (
                <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">
                    Recent attempts
                  </p>
                  {loadingHistory ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">Loading…</p>
                  ) : attemptsThisClass.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--text-muted)]">No attempts in this class yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {attemptsThisClass.map((a) => {
                        const pct =
                          a.total_possible > 0
                            ? Math.round((Number(a.score) / Number(a.total_possible)) * 100)
                            : null;
                        return (
                          <li
                            key={a.attempt_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]/50 px-3 py-2 text-[13px]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-[var(--text-main)]">{a.quiz_title}</div>
                              <div className="text-[11px] text-[var(--text-muted)]">{formatDate(a.attempted_at)}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="tabular-nums text-xs font-semibold text-[var(--text-secondary)]">
                                {a.score}/{a.total_possible}
                                {pct != null ? ` · ${pct}%` : ""}
                              </span>
                              <Link
                                to={`/quizzes/${a.quiz_id}`}
                                className="text-xs font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
                              >
                                Retry
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}

              <div className="max-h-[min(640px,70vh)] flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                {loadingQuizzes && (
                  <div className="flex flex-col items-center justify-center py-14 text-[var(--text-muted)]">
                    <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--primary)]" />
                    <span className="text-xs">Updating list…</span>
                  </div>
                )}

                {!loadingQuizzes && quizzes.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-12 text-center dark:bg-[color-mix(in_srgb,var(--surface-2)_60%,transparent)]">
                    <p className="text-sm font-semibold text-[var(--text-main)]">No practice sets yet</p>
                    <p className="mt-2 max-w-xs text-xs leading-relaxed text-[var(--text-muted)]">
                      Create a quiz from class material to test your recall.
                    </p>
                    {classId ? (
                      <button
                        type="button"
                        onClick={scrollToQuizBuilder}
                        className="mt-4 inline-flex h-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-4 text-xs font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-xs)] transition hover:brightness-110"
                      >
                        Create quiz
                      </button>
                    ) : null}
                  </div>
                )}

                {!loadingQuizzes &&
                  quizzes.map((q) => {
                    const fname = fileNameById.get(String(q.file_id)) ?? `File ${q.file_id}`;
                    const title = q.title?.trim() ? q.title : `Set #${q.id}`;
                    const created = formatDate(q.created_at);
                    const isDeleting = deletingQuizId === String(q.id);

                    return (
                      <div
                        key={String(q.id)}
                        className="flex items-stretch justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 transition hover:border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] hover:shadow-[var(--shadow-sm)] sm:p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-semibold text-[var(--text-main)]">{title}</h4>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                            <span
                              className="inline-block max-w-[200px] truncate rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 font-medium text-[var(--text-secondary)]"
                              title={fname}
                            >
                              {fname}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted-soft)]">{created}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end justify-center gap-2 sm:flex-row sm:items-center">
                          <Link
                            to={`/quizzes/${q.id}`}
                            className="inline-flex h-9 min-w-[5.5rem] items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-xs)] transition hover:brightness-110 active:scale-[0.98]"
                          >
                            Start
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuiz(String(q.id))}
                            disabled={isDeleting}
                            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-transparent text-[var(--text-muted)] transition hover:border-[var(--border)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:opacity-50"
                            title="Remove this set"
                          >
                            {isDeleting ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </aside>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
