import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AppShell from "../../layouts/AppShell";
import {
  getAttemptDetail,
  type QuizAttemptDetail,
} from "../../lib/api";
import { ArrowLeft, CheckCircle2, XCircle, FileText, Calendar } from "lucide-react";
import { getQuizCountPresentation } from "./quizCountUtils";

const KARACHI_TZ = "Asia/Karachi";

const KARACHI_TZ = "Asia/Karachi";

export default function QuizHistoryDetailsPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<QuizAttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attemptId) {
      fetchDetail(attemptId);
    }
  }, [attemptId]);

  const fetchDetail = async (id: string) => {
    try {
      setLoading(true);
      const data = await getAttemptDetail(id);
      setDetail(data);
    } catch (err: unknown) {
      console.error("Failed to load attempt detail", err);
      setError("Failed to load attempt details.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Quiz Attempt Details">
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
        </div>
      </AppShell>
    );
  }

  if (error || !detail) {
    return (
      <AppShell title="Quiz Attempt Details">
        <div className="p-8 text-center text-red-500">
          {error || "Attempt not found"}
          <div className="mt-4">
            <Link to="/quizzes/history" className="underline">Back to History</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const { attempt, questions } = detail;
  const mcqs = questions.filter(q => q.qtype === "mcq");
  const theory = questions.filter(q => q.qtype !== "mcq");
  const countPresentation = getQuizCountPresentation(attempt, questions);
  const attemptedAtKarachi = new Intl.DateTimeFormat(undefined, {
    timeZone: KARACHI_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(attempt.attempted_at));

  return (
    <AppShell title="Quiz Attempt Details" headerMaxWidthClassName="max-w-[1200px]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8">
        {/* Header / Back */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate("/quizzes/history")}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to History
          </button>
        </div>

        {/* Section 1: Summary Card */}
        <div className="mb-8 grid gap-6 md:grid-cols-[1fr_300px]">
          <div className="panel p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-[var(--text-main)] mb-1">{attempt.quiz_title}</h1>
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <FileText className="h-4 w-4" />
                  <span>{attempt.file_name}</span>
                  <span className="mx-1">•</span>
                  <Calendar className="h-4 w-4" />
                  <span>{attemptedAtKarachi}</span>
                </div>
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${
                attempt.passed 
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}>
                {attempt.passed ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Passed
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5" />
                    Failed
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[var(--border)]">
              <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-lg text-center">
                <div className="text-xs uppercase text-[var(--text-muted)] font-semibold mb-1">Total MCQs</div>
                <div className="text-lg font-bold text-[var(--text-main)]">{countPresentation.actualMcqCount}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-lg text-center">
                <div className="text-xs uppercase text-[var(--text-muted)] font-semibold mb-1">Written Qs</div>
                <div className="text-lg font-bold text-[var(--text-main)]">{countPresentation.actualTheoryCount}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-lg text-center">
                <div className="text-xs uppercase text-[var(--text-muted)] font-semibold mb-1">Correct MCQs</div>
                <div className="text-lg font-bold text-green-600 dark:text-green-400">{attempt.mcq_score}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-lg text-center">
                <div className="text-xs uppercase text-[var(--text-muted)] font-semibold mb-1">Theory Marks</div>
                <div className="text-lg font-bold text-[var(--text-main)]">{attempt.theory_score}</div>
              </div>
            </div>

            {countPresentation.countMismatch && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                This quiz has legacy count metadata that does not match the saved question mix.
                {countPresentation.requestedMcqCount !== null && countPresentation.requestedTheoryCount !== null && (
                  <span className="ml-1">
                    Requested {countPresentation.requestedMcqCount} MCQs and {countPresentation.requestedTheoryCount} theory questions, but saved as {countPresentation.actualMcqCount} MCQs and {countPresentation.actualTheoryCount} theory questions.
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="panel p-6 flex flex-col justify-center items-center text-center bg-gradient-to-br from-[var(--surface)] to-[var(--surface-hover)]">
            <div className="text-sm font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-2">Total Score</div>
            <div className="text-5xl font-bold text-[var(--primary)] mb-2">
              {attempt.score}
              <span className="text-lg text-[var(--text-muted)] font-normal ml-1">/ {attempt.total_possible}</span>
            </div>
            <div className={`text-sm font-medium ${
              attempt.passed ? "text-green-600" : "text-red-600"
            }`}>
              {Math.round((attempt.score / attempt.total_possible) * 100)}% Accuracy
            </div>
          </div>
        </div>

        {/* Section 2: MCQ Review */}
        {mcqs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-[var(--text-main)] mb-4 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs uppercase tracking-wider dark:bg-blue-900/30 dark:text-blue-400">Section 1</span>
              MCQ Review
            </h2>
            <div className="space-y-4">
              {mcqs.map((q, idx) => {
                const isCorrect = q.is_correct;
                const userSelected = q.selected_index;
                const correctOption = q.correct_index;

                return (
                  <div key={q.id} className="panel p-6 border-l-4" style={{
                    borderLeftColor: isCorrect ? "#22c55e" : "#ef4444"
                  }}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Question {idx + 1}</span>
                        <h3 className="text-lg font-medium text-[var(--text-main)]">{q.question}</h3>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        isCorrect 
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {q.marks_awarded} / 1 Mark
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      {q.options?.map((opt, optIdx) => {
                        const isUserChoice = userSelected === optIdx;
                        const isCorrectChoice = correctOption === optIdx;

                        let styleClass = "border-[var(--border)] bg-[var(--surface)]";
                        let icon = null;

                        if (isCorrectChoice) {
                           styleClass = "border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-500/50";
                           icon = <CheckCircle2 className="h-4 w-4 text-green-600" />;
                        } else if (isUserChoice && !isCorrect) {
                           styleClass = "border-red-500 bg-red-50 dark:bg-red-900/20 dark:border-red-500/50";
                           icon = <XCircle className="h-4 w-4 text-red-600" />;
                        } else if (isUserChoice && isCorrect) {
                           // Handled by first case, but just to be explicit logic-wise
                           styleClass = "border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-500/50";
                        }

                        return (
                          <div key={optIdx} className={`p-3 rounded-lg border flex items-center justify-between ${styleClass}`}>
                            <span className={`text-sm ${isCorrectChoice || isUserChoice ? "font-medium text-[var(--text-main)]" : "text-[var(--text-muted)]"}`}>
                              {opt}
                            </span>
                            {icon}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 3: Theory Review */}
        {theory.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-[var(--text-main)] mb-4 flex items-center gap-2">
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs uppercase tracking-wider dark:bg-purple-900/30 dark:text-purple-400">Section 2</span>
              Written Answers Review
            </h2>
            <div className="space-y-4">
              {theory.map((q, idx) => (
                <div key={q.id} className="panel p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Question {idx + 1}</span>
                      <h3 className="text-lg font-medium text-[var(--text-main)]">{q.question}</h3>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold uppercase tracking-wider dark:bg-gray-800 dark:text-gray-300">
                      {q.marks_awarded} / 2 Marks
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2">Your Answer</div>
                    <div className={`p-4 rounded-lg border ${
                      q.written_answer 
                        ? "border-[var(--border)] bg-gray-50 dark:bg-white/5 text-[var(--text-main)]" 
                        : "border-dashed border-gray-300 bg-gray-50/50 text-gray-400 italic"
                    }`}>
                      {q.written_answer || "No answer submitted."}
                    </div>
                    {q.answer_key && (
                        <div className="mt-4 pt-4 border-t border-[var(--border)]">
                            <div className="text-xs font-semibold text-green-600 uppercase mb-2">Expected Answer / Key</div>
                            <div className="text-sm text-[var(--text-muted)]">
                                {q.answer_key}
                            </div>
                        </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
