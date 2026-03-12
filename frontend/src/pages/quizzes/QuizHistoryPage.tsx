import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../../layouts/AppShell";
import {
  getQuizHistory,
  deleteAttempt,
  type QuizHistoryItem,
} from "../../lib/api";
import { Trash2, Eye, Calendar, BookOpen, CheckCircle2, XCircle, FileText } from "lucide-react";

const KARACHI_TZ = "Asia/Karachi";

export default function QuizHistoryPage() {
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await getQuizHistory();
      setHistory(data);
      setError(null);
    } catch (err: unknown) {
      console.error("Failed to load history", err);
      setError("Failed to load quiz history.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (attemptId: string) => {
    if (!confirm("Are you sure you want to delete this attempt record? This cannot be undone.")) return;
    try {
      await deleteAttempt(attemptId);
      setHistory(prev => prev.filter(h => h.attempt_id !== attemptId));
    } catch {
      alert("Failed to delete attempt");
    }
  };

  if (loading) {
    return (
      <AppShell title="Quiz History">
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
        </div>
      </AppShell>
    );
  }

  if (error && error.includes("401")) {
     return (
        <AppShell title="Quiz History">
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <h3 className="text-lg font-semibold text-red-600 mb-2">Authentication Required</h3>
                <p className="text-[var(--text-muted)] mb-4">Please log in to view your quiz history.</p>
                <Link to="/login" className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg">Log In</Link>
            </div>
        </AppShell>
     );
  }

  const formatTime = (seconds: number) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatKarachiDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: KARACHI_TZ,
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));

  return (
    <AppShell title="Quiz History" headerMaxWidthClassName="max-w-full">
      <div className="w-full px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Attempt History</h1>
            <p className="text-[var(--text-muted)] mt-1 text-sm">Review your past performance and track your progress</p>
          </div>
          <Link
            to="/quizzes"
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-[var(--text-main)] border border-[var(--border)] shadow-sm hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all active:scale-95"
          >
            <span>← Back to Quizzes</span>
          </Link>
        </div>

        {error && (
          <div className="p-4 mb-6 rounded-xl bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 font-semibold">
              <XCircle className="h-4 w-4" />
              <span>Error Loading History</span>
            </div>
            <div className="mt-1 text-sm opacity-90">{error}</div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 py-24 text-center">
            <div className="mb-6 rounded-full bg-[var(--surface)] p-6 shadow-sm border border-[var(--border)]">
              <BookOpen className="h-10 w-10 text-[var(--text-muted)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--text-main)]">No attempts recorded</h3>
            <p className="mt-2 text-[var(--text-muted)] max-w-sm mx-auto">
              You haven't taken any quizzes yet. Generate a new quiz to start tracking your progress.
            </p>
            <Link 
              to="/quizzes" 
              className="mt-8 inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-8 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--primary)]/20 transition-all hover:scale-105 hover:shadow-xl hover:opacity-95"
            >
              Start Your First Quiz
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[1200px] lg:min-w-full">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-[var(--border)]">
                    <th className="px-6 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] w-[25%]">Quiz Details</th>
                    <th className="px-2 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[8%]">Theory Qs</th>
                    <th className="px-2 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[8%]">Theory Score</th>
                    <th className="px-2 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[8%]">MCQ Count</th>
                    <th className="px-2 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[8%]">MCQ Score</th>
                    <th className="px-2 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[8%]">Total Score</th>
                    <th className="px-2 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[10%]">MCQ Time</th>
                    <th className="px-2 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[10%]">Theory Time</th>
                    <th className="px-2 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[8%]">Status</th>
                    <th className="px-6 py-4 font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] text-center w-[7%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {history.map((item) => (
                    <tr key={item.attempt_id} className="group hover:bg-gray-50/80 dark:hover:bg-white/5 transition-colors">
                      {/* Quiz Info */}
                      <td className="px-6 py-4 max-w-[280px]">
                        <div className="flex flex-col gap-1">
                          <div className="font-bold text-[var(--text-main)] text-sm truncate" title={item.quiz_title}>
                            {item.quiz_title}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 max-w-[140px]">
                              <FileText className="h-3 w-3 flex-shrink-0 opacity-70" />
                              <span className="truncate" title={item.file_name}>{item.file_name}</span>
                            </span>
                            <span className="opacity-40">•</span>
                            <span className="inline-flex items-center gap-1">
                               <Calendar className="h-3 w-3 opacity-70" />
                               <span>{formatKarachiDate(item.attempted_at)}</span>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Questions (Theory Count) */}
                      <td className="px-2 py-4 text-center">
                        <span className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-medium text-[var(--text-main)] text-xs">
                          {item.theory_count}
                        </span>
                      </td>

                      {/* Obtained Marks (Q&A) */}
                      <td className="px-2 py-4 text-center">
                         <div className="flex items-center justify-center gap-1">
                           <span className="font-bold text-[var(--text-main)] text-sm">{item.theory_score}</span>
                           <span className="text-[var(--text-muted)] text-[10px] font-medium opacity-70">/ {item.theory_count * 2}</span>
                         </div>
                      </td>

                      {/* MCQs Count */}
                      <td className="px-2 py-4 text-center">
                        <span className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-medium text-[var(--text-main)] text-xs">
                          {item.mcq_count}
                        </span>
                      </td>

                      {/* Correct MCQs */}
                      <td className="px-2 py-4 text-center">
                        <span className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 font-bold text-xs">
                            {item.mcq_score}
                        </span>
                      </td>

                      {/* Earned Marks (Total) */}
                      <td className="px-2 py-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="flex items-baseline gap-1">
                            <span className="text-base font-black text-[var(--primary)]">{item.score}</span>
                            <span className="text-[10px] text-[var(--text-muted)] font-medium">/ {item.total_possible}</span>
                          </div>
                        </div>
                      </td>

                      {/* MCQ Time */}
                      <td className="px-2 py-4 text-center">
                        <span className={`text-xs font-medium ${item.mcq_attempt_time > 0 ? "text-[var(--text-main)]" : "text-[var(--text-muted)] opacity-50"}`}>
                            {item.mcq_attempt_time > 0 ? formatTime(item.mcq_attempt_time) : "--"}
                        </span>
                      </td>

                      {/* Theory Time */}
                      <td className="px-2 py-4 text-center">
                        <span className={`text-xs font-medium ${item.theory_attempt_time > 0 ? "text-[var(--text-main)]" : "text-[var(--text-muted)] opacity-50"}`}>
                            {item.theory_attempt_time > 0 ? formatTime(item.theory_attempt_time) : "--"}
                        </span>
                      </td>

                      {/* Result */}
                      <td className="px-2 py-4 text-center">
                        {item.passed ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-green-700 dark:bg-green-900/30 dark:text-green-400 shadow-sm">
                            <CheckCircle2 className="h-3 w-3" />
                            Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-900/30 dark:text-red-400 shadow-sm">
                            <XCircle className="h-3 w-3" />
                            Fail
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                          <Link
                            to={`/quizzes/history/${item.attempt_id}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 active:scale-95 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 transition-all shadow-sm"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(item.attempt_id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 hover:scale-105 active:scale-95 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all"
                            title="Delete Attempt"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
