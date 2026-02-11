import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AppShell from "../../layouts/AppShell";
import { ArrowLeft, CheckCircle2, XCircle, Send, Clock, BookOpen } from "lucide-react";
import {
  getQuiz,
  startQuizAttempt,
  submitQuizAttempt,
  type QuizDetail,
  type SubmitAttemptResponse,
} from "../../lib/api";

export default function QuizAttemptPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [quizData, setQuizData] = useState<QuizDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // answers user selects/types
  const [answers, setAnswers] = useState<Record<number, any>>({});

  // after submit
  const [submitting, setSubmitting] = useState(false);
  const [attemptResult, setAttemptResult] = useState<SubmitAttemptResponse | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  // Timer
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // helper to find attempt result for question
  const attemptResultByQ = useMemo(() => {
    const m = new Map<number, any>();
    (attemptResult?.results ?? []).forEach((r) => m.set(r.question_id, r));
    return m;
  }, [attemptResult]);

  // Count questions by type
  const questionCounts = useMemo(() => {
    if (!quizData) return { mcq: 0, subjective: 0, total: 0 };
    const mcq = quizData.items.filter(q => q.qtype === "mcq").length;
    const subjective = quizData.items.length - mcq;
    return { mcq, subjective, total: quizData.items.length };
  }, [quizData]);

  // Timer effect
  useEffect(() => {
    if (attemptResult) return; // Stop timer after submission
    
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, attemptResult]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // -------- fetch quiz ----------
  useEffect(() => {
    if (!quizId) {
      setLoadErr("Invalid quiz ID");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setLoadErr(null);
      try {
        const data = await getQuiz(quizId);
        setQuizData(data);

        // init answers blank
        const init: Record<number, any> = {};
        data.items.forEach((q) => {
          init[q.id] = q.qtype === "mcq" ? null : "";
        });
        setAnswers(init);
        setStartTime(Date.now());
      } catch (e: any) {
        console.error("Error loading quiz:", e);
        setLoadErr(e?.message ?? "Failed to load quiz. Check backend connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId]);

  // -------- submit attempt ----------
  async function handleSubmit() {
    if (!quizData || !quizId) return;

    // Check if all questions are answered
    const unanswered = quizData.items.filter(q => {
      const answer = answers[q.id];
      if (q.qtype === "mcq") {
        return answer === null || answer === undefined;
      } else {
        return !answer || (typeof answer === "string" && answer.trim() === "");
      }
    });

    if (unanswered.length > 0) {
      const proceed = confirm(
        `You have ${unanswered.length} unanswered question(s). Do you want to submit anyway?`
      );
      if (!proceed) return;
    }

    setSubmitting(true);
    try {
      // First, start an attempt if we haven't already
      let currentAttemptId = attemptId;
      if (!currentAttemptId) {
        const attemptData = await startQuizAttempt(quizId);
        currentAttemptId = attemptData.attempt_id;
        setAttemptId(currentAttemptId);
      }

      // Build payload matching backend format
      const payload = quizData.items.map((q) => {
        const answer = answers[q.id];
        if (q.qtype === "mcq") {
          return {
            question_id: q.id,
            selected_index: answer !== null ? answer : undefined,
          };
        } else {
          return {
            question_id: q.id,
            written_answer: typeof answer === "string" ? answer : "",
          };
        }
      });

      const result = await submitQuizAttempt(currentAttemptId, payload, true);
      setAttemptResult(result);
      
      // Scroll to top to show score
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      console.error("Error submitting attempt:", e);
      alert(e?.message ?? "Failed to submit attempt. Please check your backend connection.");
    } finally {
      setSubmitting(false);
    }
  }

  function setMcqAnswer(qid: number, optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [qid]: optionIndex }));
  }

  function setTextAnswer(qid: number, text: string) {
    setAnswers((prev) => ({ ...prev, [qid]: text }));
  }

  // Early return if no quizId
  if (!quizId) {
    return (
      <AppShell title="Quizzes">
        <div className="mx-auto w-full max-w-[1200px] px-2 sm:px-0">
          <div className="panel">
            <div className="text-sm font-semibold text-[var(--text-main)]">Invalid quiz link</div>
            <div className="mt-3 text-sm">
              <Link className="underline" to="/quizzes">
                Go back to quizzes
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Quizzes" headerMaxWidthClassName="max-w-[1200px]">
      <div className="mx-auto w-full max-w-[1200px] px-2 sm:px-0">
        {/* top bar */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate("/quizzes")}
            className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] shadow-[var(--shadow-soft)] hover:opacity-90"
            style={{ border: "none" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            {!attemptResult && (
              <div className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-semibold shadow-[var(--shadow-soft)]">
                <Clock className="h-4 w-4 text-[var(--primary)]" />
                <span className="text-[var(--text-main)]">{formatTime(elapsedSeconds)}</span>
              </div>
            )}
            
            {attemptResult && (
              <div className="rounded-full bg-gradient-to-r from-[var(--primary)] to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-md">
                Score: {attemptResult.score ?? 0} / {attemptResult.total ?? 0}
              </div>
            )}
          </div>
        </div>

        {/* Loading / error */}
        {loading && <div className="panel text-sm text-[var(--text-muted)]">Loading quiz…</div>}

        {loadErr && (
          <div className="panel">
            <div className="text-sm font-semibold text-[var(--text-main)]">Could not load quiz</div>
            <div className="mt-2 text-sm text-[var(--text-muted)]">{loadErr}</div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              Make sure your backend is running and the quiz ID is valid.
            </div>
            <div className="mt-3 text-sm">
              <Link className="underline" to="/quizzes">
                Go back to quizzes
              </Link>
            </div>
          </div>
        )}

        {/* Quiz content */}
        {!loading && quizData && (
          <div className="grid gap-6 lg:grid-cols-[1fr_0.42fr]">
            {/* questions */}
            <div className="panel">
              <div className="mb-6">
                <div className="text-xl font-semibold text-[var(--text-main)]">
                  {quizData.quiz.title?.trim() ? quizData.quiz.title : `Quiz #${quizData.quiz.id}`}
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-4 w-4" />
                    {questionCounts.total} Questions
                  </span>
                  <span>•</span>
                  <span>{questionCounts.mcq} MCQs</span>
                  <span>•</span>
                  <span>{questionCounts.subjective} Subjective</span>
                </div>
              </div>

              <div className="space-y-5">
                {quizData.items.map((q, idx) => {
                  const isMcq = q.qtype === "mcq";
                  const picked = answers[q.id];

                  const result = attemptResultByQ.get(q.id);
                  const isCorrect = result?.is_correct;
                  const correctIndex = result?.correct_index;
                  const answerKey = result?.answer_key;

                  return (
                    <div key={q.id} className="card-muted p-6 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
                              Q{idx + 1} • {isMcq ? "MCQ" : q.qtype}
                            </span>
                            {q.difficulty && (
                              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                                q.difficulty === "easy" 
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : q.difficulty === "hard"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              }`}>
                                {q.difficulty}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 text-base font-medium leading-relaxed text-[var(--text-main)]">
                            {q.question}
                          </div>
                        </div>

                        {/* Result icon after submit */}
                        {attemptResult && (
                          <div className="mt-1">
                            {isCorrect === true && (
                              <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="h-6 w-6" />
                              </div>
                            )}
                            {isCorrect === false && (
                              <div className="flex items-center gap-1 text-red-600">
                                <XCircle className="h-6 w-6" />
                              </div>
                            )}
                            {isCorrect === null && (
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                Review
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* MCQ */}
                      {isMcq && Array.isArray(q.options) && (
                        <div className="space-y-2.5">
                          {q.options.map((opt, i) => {
                            const checked = picked === i;
                            const isThisCorrect = attemptResult && correctIndex !== undefined && i === correctIndex;
                            const isThisWrong = attemptResult && checked && correctIndex !== undefined && i !== correctIndex;
                            
                            return (
                              <label
                                key={i}
                                className={`flex cursor-pointer items-center gap-3 rounded-[14px] border-2 px-4 py-3.5 text-sm transition-all ${
                                  isThisCorrect
                                    ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                                    : isThisWrong
                                    ? "border-red-400 bg-red-50 dark:bg-red-900/20"
                                    : checked
                                    ? "border-[var(--primary)] bg-[var(--primary)]/5"
                                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/50"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`q_${q.id}`}
                                  checked={checked}
                                  disabled={!!attemptResult}
                                  onChange={() => setMcqAnswer(q.id, i)}
                                  className="h-5 w-5 accent-[var(--primary)]"
                                />
                                <span className="flex-1 text-[var(--text-main)]">{opt}</span>
                                {isThisCorrect && (
                                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                                    ✓ Correct
                                  </span>
                                )}
                                {isThisWrong && (
                                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                                    ✗ Wrong
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* Non-MCQ */}
                      {!isMcq && (
                        <div>
                          <textarea
                            value={typeof picked === "string" ? picked : ""}
                            disabled={!!attemptResult}
                            onChange={(e) => setTextAnswer(q.id, e.target.value)}
                            className="w-full rounded-[16px] border-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 disabled:opacity-60"
                            rows={4}
                            placeholder="Write your answer here..."
                          />
                        </div>
                      )}

                      {/* Show answer key if available */}
                      {attemptResult && answerKey && (
                        <div className="rounded-[14px] border-2 border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700 px-4 py-3.5">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-green-800 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            Answer Key
                          </div>
                          <div className="mt-2 text-sm leading-relaxed text-green-900 dark:text-green-300">
                            {answerKey}
                          </div>
                        </div>
                      )}

                      {/* Show explanation if available */}
                      {attemptResult && q.explanation && (
                        <div className="rounded-[14px] border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 px-4 py-3.5">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-400">
                            <BookOpen className="h-4 w-4" />
                            Explanation
                          </div>
                          <div className="mt-2 text-sm leading-relaxed text-blue-900 dark:text-blue-300">
                            {q.explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* submit button */}
              <div className="mt-8 flex justify-end">
                {!attemptResult ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-purple-600 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(123,95,239,0.35)] hover:opacity-95 disabled:opacity-60 transition-all"
                    style={{ border: "none" }}
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? "Submitting..." : "Submit Attempt"}
                  </button>
                ) : (
                  <div className="rounded-[16px] border border-green-300 bg-green-50 dark:bg-green-900/20 px-6 py-3 text-sm text-green-700 dark:text-green-300">
                    ✓ Attempt submitted successfully. You can go back to quizzes.
                  </div>
                )}
              </div>
            </div>

            {/* right sidebar summary */}
            <aside className="panel space-y-4">
              <div className="text-base font-semibold text-[var(--text-main)]">Summary</div>
              <div className="text-sm leading-relaxed text-[var(--text-muted)]">
                Answer MCQs by selecting one option. For subjective questions, write a detailed response.
              </div>

              <div className="space-y-3">
                <div className="card-neutral p-4">
                  <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    Questions
                  </div>
                  <div className="mt-2 text-3xl font-bold text-[var(--text-main)]">
                    {quizData.items.length}
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    {questionCounts.mcq} MCQs • {questionCounts.subjective} Subjective
                  </div>
                </div>

                {attemptResult && (
                  <>
                    <div className="card-neutral p-4">
                      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                        Score
                      </div>
                      <div className="mt-2 text-3xl font-bold text-[var(--primary)]">
                        {attemptResult.score ?? 0} / {attemptResult.total ?? 0}
                      </div>
                      <div className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                        {Math.round(((attemptResult.score ?? 0) / (attemptResult.total || 1)) * 100)}% correct
                      </div>
                    </div>

                    <div className="rounded-[14px] bg-amber-50 dark:bg-amber-900/20 p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                      <strong>Note:</strong> Only MCQs are auto-scored. Subjective answers require manual review.
                    </div>
                  </>
                )}

                {!attemptResult && (
                  <div className="rounded-[14px] bg-blue-50 dark:bg-blue-900/20 p-4 text-xs leading-relaxed text-blue-800 dark:text-blue-300">
                    <strong>Tip:</strong> Review your answers before submitting. You can only submit once.
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}