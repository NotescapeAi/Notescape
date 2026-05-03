import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AppShell from "../../layouts/AppShell";
import { ArrowLeft, Clock } from "lucide-react";
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
        <AppShell title="Quiz">
            <div className="flex justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
            </div>
        </AppShell>
    );
  }

  if (loadErr || !quizData) {
     return (
        <AppShell title="Quiz">
            <div className="p-8 text-center text-red-500">
                {loadErr || "Quiz not found"}
                <div className="mt-4">
                    <Link to="/quizzes" className="underline">Back to Quizzes</Link>
                </div>
            </div>
        </AppShell>
     );
  }

  return (
    <AppShell title={quizData.quiz.title} headerMaxWidthClassName="max-w-[1200px]">
        {/* Top Bar (only if not completed) */}
        {currentSection !== "completed" && (
            <div className="mx-auto w-full max-w-[1200px] px-4 py-4 flex justify-between items-center">
                 <button onClick={() => navigate("/quizzes")} className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Exit
                 </button>
                 <div className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-semibold shadow-sm border border-[var(--border)]">
                    <Clock className="h-4 w-4 text-[var(--primary)]" />
                    <span className="tabular-nums">{formatTime(elapsedSeconds)}</span>
                 </div>
            </div>
        )}

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
