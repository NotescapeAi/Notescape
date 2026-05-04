import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AppShell from "../../layouts/AppShell";
import { Clock } from "lucide-react";
import {
  getQuiz,
  getQuizBreakdown,
  startQuizAttempt,
  submitQuizAttempt,
  type QuizBreakdown,
  type QuizDetail,
  type SubmitAttemptResponse,
} from "../../lib/api";

import QuizStartScreen from "./components/QuizStartScreen";
import QuizMCQSection from "./components/QuizMCQSection";
import QuizTheorySection from "./components/QuizTheorySection";
import QuizCompletionScreen from "./components/QuizCompletionScreen";
import { getQuizCountPresentation } from "./quizCountUtils";

export default function QuizAttemptPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [quizData, setQuizData] = useState<QuizDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Attempt State
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [mcqCompleted, setMcqCompleted] = useState(false);
  const [theoryCompleted, setTheoryCompleted] = useState(false);
  const [currentSection, setCurrentSection] = useState<string>("start"); // "start" | "mcq" | "theory" | "completed"
  
  // Answers
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, number>>({});
  const [theoryAnswers, setTheoryAnswers] = useState<Record<number, string>>({});

  // Result
  const [attemptResult, setAttemptResult] = useState<SubmitAttemptResponse | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [breakdown, setBreakdown] = useState<QuizBreakdown | null>(null);

  // Timer
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [initialMcqTime, setInitialMcqTime] = useState(0);
  const [initialTheoryTime, setInitialTheoryTime] = useState(0);

  // Fetch Quiz & Start/Resume Attempt
  useEffect(() => {
    if (!quizId) return;

    (async () => {
      setLoading(true);
      try {
        // 1. Get Quiz Details
        const data = await getQuiz(quizId);
        setQuizData(data);

        // 2. Start or Resume Attempt
        const attempt = await startQuizAttempt(quizId);
        setAttemptId(attempt.attempt_id);
        setMcqCompleted(attempt.mcq_completed);
        setTheoryCompleted(attempt.theory_completed);
        setInitialMcqTime(attempt.mcq_attempt_time || 0);
        setInitialTheoryTime(attempt.theory_attempt_time || 0);
        
        // If resuming, respect backend's state
        if (attempt.mcq_completed && attempt.theory_completed) {
            setCurrentSection("completed");
            setFinalScore(attempt.score || 0);
        } else {
            setCurrentSection("start");
        }
      } catch (e: any) {
        console.error("Error loading quiz:", e);
        setLoadErr(e?.message || "Failed to load quiz.");
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId]);

  useEffect(() => {
    if (currentSection !== "completed" || !attemptId) return;
    let cancelled = false;
    getQuizBreakdown(attemptId)
      .then((data) => {
        if (!cancelled) setBreakdown(data);
      })
      .catch(() => {
        if (!cancelled) setBreakdown(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSection, attemptId]);

  // Timer Effect
  useEffect(() => {
    // Only run timer if we are in an active section
    if (currentSection !== "mcq" && currentSection !== "theory") {
        return;
    }
    
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, currentSection]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Derived counts
  const { mcqQuestions, theoryQuestions } = useMemo(() => {
    if (!quizData) return { mcqQuestions: [], theoryQuestions: [] };
    const mcq = quizData.items.filter(q => q.qtype === "mcq");
    const theory = quizData.items.filter(q => q.qtype !== "mcq");
    return { mcqQuestions: mcq, theoryQuestions: theory };
  }, [quizData]);
  const countPresentation = useMemo(
    () => getQuizCountPresentation(quizData?.quiz ?? {}, quizData?.items ?? []),
    [quizData]
  );

  // Handlers
  const handleStartMcq = () => {
    if (mcqCompleted) return;
    setCurrentSection("mcq");
    window.scrollTo({ top: 0, behavior: "smooth" });
    
    // Resume timer if previous time exists
    const start = Date.now() - (initialMcqTime * 1000);
    setStartTime(start);
    setElapsedSeconds(initialMcqTime);
  };

  const handleStartTheory = () => {
    if (theoryCompleted) return;
    setCurrentSection("theory");
    window.scrollTo({ top: 0, behavior: "smooth" });
    
    // Resume timer if previous time exists
    const start = Date.now() - (initialTheoryTime * 1000);
    setStartTime(start);
    setElapsedSeconds(initialTheoryTime);
  };

  const handleCompleteMcq = async (answers: Record<number, number>) => {
    if (!attemptId) return;
    setMcqAnswers(answers);
    
    // Calculate exact time spent on this section
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);

    try {
        const payload = Object.entries(answers).map(([qid, idx]) => ({
            question_id: Number(qid),
            selected_index: idx
        }));

        const res = await submitQuizAttempt(attemptId, payload, true, "mcq", timeTaken);
        
        setMcqCompleted(true);
        setAttemptResult(res); 
        
        // If theory also done, go to completed
        if (theoryCompleted || theoryQuestions.length === 0) {
            setCurrentSection("completed");
        } else {
            // Otherwise go back to selection
            setCurrentSection("start");
        }
    } catch (err) {
        console.error(err);
        alert("Failed to submit MCQ section");
    }
  };

  const handleCompleteTheory = async (answers: Record<number, string>) => {
    if (!attemptId) return;
    setTheoryAnswers(answers);

    // Calculate exact time spent on this section
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);

    try {
        const payload = Object.entries(answers).map(([qid, txt]) => ({
            question_id: Number(qid),
            written_answer: txt
        }));

        const res = await submitQuizAttempt(attemptId, payload, true, "theory", timeTaken);
        
        setTheoryCompleted(true);
        setAttemptResult(res);
        
        if (mcqCompleted || mcqQuestions.length === 0) {
             setCurrentSection("completed");
        } else {
             setCurrentSection("start");
        }
    } catch (err) {
        console.error(err);
        alert("Failed to submit Theory section");
    }
  };

  if (loading) {
    return (
      <AppShell title="Quiz" backLabel="Quizzes" backTo="/quizzes">
        <div className="flex justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--surface-2)] border-t-[var(--primary)]" />
        </div>
      </AppShell>
    );
  }

  if (loadErr || !quizData) {
    return (
      <AppShell title="Quiz" backLabel="Quizzes" backTo="/quizzes">
        <div className="mx-auto max-w-md rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[var(--danger-soft)] p-6 text-center">
          <div className="text-sm font-semibold text-[var(--danger)]">
            {loadErr || "Quiz not found"}
          </div>
          <div className="mt-4">
            <Link
              to="/quizzes"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Back to quizzes
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const headerActions =
    currentSection !== "completed" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold tabular-nums text-[var(--text-main)] shadow-[var(--shadow-xs)]">
        <Clock className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
        {formatTime(elapsedSeconds)}
      </span>
    ) : null;

  return (
    <AppShell
      title={quizData.quiz.title}
      backLabel={currentSection === "completed" ? "Back to quizzes" : "Exit quiz"}
      backTo="/quizzes"
      headerMaxWidthClassName="max-w-[1200px]"
      headerActions={headerActions}
    >

        {currentSection === "start" && (
            <QuizStartScreen 
                quizTitle={quizData.quiz.title}
                totalQuestions={quizData.items.length}
                mcqCount={countPresentation.actualMcqCount}
                theoryCount={countPresentation.actualTheoryCount}
                mcqCompleted={mcqCompleted}
                theoryCompleted={theoryCompleted}
                onStartMcq={handleStartMcq}
                onStartTheory={handleStartTheory}
                onBack={() => navigate("/quizzes")}
            />
        )}

        {currentSection === "mcq" && (
            <QuizMCQSection 
                questions={mcqQuestions}
                onComplete={handleCompleteMcq}
                initialAnswers={mcqAnswers}
            />
        )}

        {currentSection === "theory" && (
            <QuizTheorySection 
                questions={theoryQuestions}
                onComplete={handleCompleteTheory}
                initialAnswers={theoryAnswers}
            />
        )}

        {currentSection === "completed" && (
            <QuizCompletionScreen 
                score={attemptResult ? attemptResult.score : finalScore}
                total={attemptResult ? attemptResult.total : (mcqQuestions.length + (theoryQuestions.length * 2))}
                breakdown={breakdown}
                onReviewFlashcards={(topic) =>
                  navigate(
                    quizData.quiz.class_id
                      ? `/classes/${quizData.quiz.class_id}/flashcards/study${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`
                      : "/flashcards"
                  )
                }
                onPracticeQuiz={(topic) =>
                  navigate(
                    quizData.quiz.class_id
                      ? `/quizzes?class_id=${quizData.quiz.class_id}${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`
                      : "/quizzes"
                  )
                }
                onGoBack={() => navigate("/quizzes/history")}
            />
        )}
    </AppShell>
  );
}
