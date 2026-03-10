import { useEffect, useMemo, useState } from "react";
import AppShell from "../../layouts/AppShell";
import QuizPanel from "../../components/QuizPanel";
import {
  listClasses,
  listFiles,
  listQuizzes,
  deleteQuiz,
  type ClassRow,
  type FileRow,
  type QuizListItem,
} from "../../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Trash2, History } from "lucide-react";

export default function QuizzesPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  // Initialize from localStorage to prevent layout jump on mount
  const [classId, setClassId] = useState<number | null>(() => {
    try {
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
      }
    })();
    return () => { mounted = false; };
  }, []); // Only run on mount

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

  function formatDate(ts?: string) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  }

  return (
    <AppShell title="Quizzes" headerMaxWidthClassName="max-w-[1400px]">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
        <div className="flex flex-col gap-8">
          {/* Error message */}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
              <div className="font-semibold mb-1">Connection Error</div>
              <div>{error}</div>
              <div className="mt-2 text-xs opacity-80">
                Please ensure the backend server is running and accessible.
              </div>
            </div>
          )}

          {/* Top helper card */}
          <section className="card-neutral p-8 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <h2 className="text-2xl font-bold text-[var(--text-main)]">Generate a Quiz</h2>
                </div>
                <p className="text-base text-[var(--text-muted)] pl-[52px]">
                  Create custom quizzes from your class materials. Choose difficulty, question types, and get instant AI-generated assessments.
                </p>
              </div>

              {/* Class selector */}
              <div className="w-full lg:w-[320px]">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Select Class
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 pr-10 text-sm font-medium shadow-sm transition-all hover:border-[var(--primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10"
                    value={classId ?? ""}
                    onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
                    disabled={classes.length === 0}
                  >
                    <option value="">Choose a class...</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between px-1">
                  <span className="text-xs text-[var(--text-muted)]">
                    {pdfCount} PDF{pdfCount !== 1 ? 's' : ''} available
                  </span>
                  {classId && (
                    <span className="text-xs font-medium text-[var(--primary)]">
                      Active
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Main content */}
          {!classId ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 py-24 text-center min-h-[400px]">
              <div className="mb-4 rounded-full bg-[var(--surface)] p-4 shadow-sm">
                <ClipboardList className="h-8 w-8 text-[var(--text-muted)]" />
              </div>
              <h3 className="text-lg font-medium text-[var(--text-main)]">No Class Selected</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {classes.length === 0 && !error
                  ? "Loading your classes..."
                  : "Please select a class from the dropdown above to start."}
              </p>
            </div>
          ) : (
            <section className="grid gap-8 lg:grid-cols-[1.4fr_1fr] items-start min-h-[600px]">
              {/* Left: generator UI */}
              <div className="panel p-0 overflow-hidden border-[var(--border)] shadow-sm h-full">
                {loadingFiles ? (
                  <div className="flex items-center justify-center h-full min-h-[400px] text-sm text-[var(--text-muted)]">
                    <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"></div>
                    Loading class files...
                  </div>
                ) : (
                  <QuizPanel classId={classId} files={files} onQuizCreated={loadQuizzes} />
                )}
              </div>

              {/* Right: Available Quizzes */}
              <aside className="panel p-6 border-[var(--border)] shadow-sm h-full">
                <div className="mb-6 flex items-center justify-between border-b border-[var(--border)] pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-main)]">Available Quizzes</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Ready to attempt</p>
                  </div>
                  
                  <button
                    onClick={() => navigate("/quizzes/history")}
                    className="group flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-600 transition-all hover:bg-blue-100 hover:shadow-sm dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    <History className="h-4 w-4 transition-transform group-hover:-rotate-12" />
                    History
                  </button>
                </div>

                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {loadingQuizzes && (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                      <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent"></div>
                      <span className="text-xs">Refreshing list...</span>
                    </div>
                  )}

                  {!loadingQuizzes && quizzes.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 py-12 text-center">
                      <p className="text-sm font-medium text-[var(--text-main)]">No quizzes yet</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Generate your first quiz using the form.
                      </p>
                    </div>
                  )}

                  {quizzes.map((q) => {
                    const fname = fileNameById.get(String(q.file_id)) ?? `File ${q.file_id}`;
                    const title = q.title?.trim() ? q.title : `Quiz #${q.id}`;
                    const created = formatDate(q.created_at);
                    const isDeleting = deletingQuizId === String(q.id);

                    return (
                      <div
                        key={String(q.id)}
                        className="group relative flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--primary)]/30 hover:shadow-md hover:-translate-y-0.5"
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-bold text-[var(--text-main)] mb-1">
                            {title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                            <span className="truncate max-w-[120px] rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                              {fname}
                            </span>
                            <span className="text-[10px] opacity-60">• {created}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            to={`/quizzes/${q.id}`}
                            className="flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md active:scale-95"
                          >
                            Start
                          </Link>
                          
                          <button
                            type="button"
                            onClick={() => handleDeleteQuiz(String(q.id))}
                            disabled={isDeleting}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                            title="Delete quiz"
                          >
                            {isDeleting ? (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
          )}
        </div>
      </div>
    </AppShell>
  );
}
