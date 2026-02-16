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
import { Link } from "react-router-dom";
import { ClipboardList, Trash2 } from "lucide-react";

export default function QuizzesPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<number | null>(null);

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
    (async () => {
      try {
        setError(null);
        const cs = await listClasses();
        setClasses(cs);

        const lastRaw = localStorage.getItem("last_class_id");
        const last = Number(lastRaw);
        const fallback = cs[0]?.id;

        const selected = Number.isFinite(last) && last > 0 ? last : fallback;
        if (selected) {
          setClassId(selected);
          localStorage.setItem("last_class_id", String(selected));
        }
      } catch (e: any) {
        console.error("Error loading classes:", e);
        setError(e?.message || "Failed to load classes. Please check your backend connection.");
      }
    })();
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

  function formatDate(ts?: string) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  }

  return (
    <AppShell title="Quizzes" headerMaxWidthClassName="max-w-[1200px]">
      <div className="mx-auto w-full max-w-[1200px] px-2 sm:px-0">
        <div className="flex flex-col gap-8">
          {/* Error message */}
          {error && (
            <div className="rounded-[18px] border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              <div className="font-semibold">Error</div>
              <div className="mt-1">{error}</div>
              <div className="mt-2 text-xs">
                Make sure your backend is running on http://localhost:8000 and CORS is properly configured.
              </div>
            </div>
          )}

          {/* Top helper card */}
          <section className="card-neutral p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-[var(--primary)]" />
                  <h2 className="text-xl font-semibold text-[var(--text-main)]">Generate a Quiz</h2>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Select a class and PDF, choose difficulty + types, then generate and attempt the quiz.
                </p>
              </div>

              {/* Class selector */}
              <div className="w-full md:w-[320px]">
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Class
                </label>
                <select
                  className="mt-2 w-full rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  value={classId ?? ""}
                  onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
                  disabled={classes.length === 0}
                >
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <div className="mt-2 text-xs text-[var(--text-muted)]">
                  PDFs in class: <b>{pdfCount}</b>
                </div>
              </div>
            </div>
          </section>

          {/* Main content */}
          {!classId ? (
            <div className="panel text-sm text-[var(--text-muted)]">
              {classes.length === 0 && !error
                ? "Loading classes..."
                : "Please select a class to start generating quizzes."}
            </div>
          ) : (
            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              {/* Left: generator UI */}
              <div className="panel">
                {loadingFiles ? (
                  <div className="text-sm text-[var(--text-muted)]">Loading files…</div>
                ) : (
                  <QuizPanel classId={classId} files={files} onQuizCreated={loadQuizzes} />
                )}
              </div>

              {/* Right: History */}
              <aside className="panel">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-[var(--text-main)]">Quiz History</h3>
                  {loadingQuizzes && (
                    <span className="text-xs text-[var(--text-muted)]">Loading…</span>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {!loadingQuizzes && quizzes.length === 0 && (
                    <div className="text-sm text-[var(--text-muted)]">
                      No quizzes generated for this class yet.
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
                        className="card-muted p-4 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[var(--text-main)] truncate">
                            {title}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            {fname}
                            {created ? ` • ${created}` : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            to={`/quizzes/${q.id}`}
                            className="rounded-full bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] shadow-[var(--shadow-soft)] hover:opacity-90"
                          >
                            Open
                          </Link>
                          
                          <button
                            type="button"
                            onClick={() => handleDeleteQuiz(String(q.id))}
                            disabled={isDeleting}
                            className="rounded-full bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:opacity-50"
                            title="Delete quiz"
                          >
                            <Trash2 className="h-4 w-4" />
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
