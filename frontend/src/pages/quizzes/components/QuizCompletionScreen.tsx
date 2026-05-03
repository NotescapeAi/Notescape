import React, { useEffect, useState } from 'react';
import { Trophy, ArrowRight, Star, Frown, CheckCircle2 } from "lucide-react";
import type { QuizBreakdown } from "../../../lib/api";
import Confetti from 'react-confetti';

type Props = {
  score: number;
  total: number;
  breakdown?: QuizBreakdown | null;
  onReviewFlashcards?: (topic?: string) => void;
  onPracticeQuiz?: (topic?: string) => void;
  onGoBack: () => void;
};

export default function QuizCompletionScreen({
  score,
  total,
  breakdown,
  onReviewFlashcards,
  onPracticeQuiz,
  onGoBack,
}: Props) {
  const percentage = Math.round((score / (total || 1)) * 100);
  const isSuccess = percentage >= 70;
  
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-16 text-center relative">
      {isSuccess && (
        <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
            <Confetti
                width={windowSize.width}
                height={windowSize.height}
                recycle={false}
                numberOfPieces={500}
                gravity={0.2}
            />
        </div>
      )}

      <div className="mb-8 flex justify-center">
        <div className="relative">
          {isSuccess ? (
             <>
                <div className="absolute inset-0 animate-ping rounded-full bg-yellow-200 opacity-50 dark:bg-yellow-900/30"></div>
                <div className="relative rounded-full bg-gradient-to-br from-yellow-100 to-orange-100 p-8 shadow-lg ring-4 ring-[var(--surface)] dark:from-yellow-900/25 dark:to-orange-900/20 dark:ring-[var(--surface-elevated)]">
                    <Trophy className="h-20 w-20 text-yellow-600 dark:text-yellow-400 drop-shadow-sm" />
                </div>
                <div className="absolute -top-2 -right-2 rotate-12 rounded-full bg-[var(--surface)] p-2 shadow-md dark:bg-[var(--surface-elevated)]">
                    <Star className="h-8 w-8 text-yellow-500 fill-yellow-500" />
                </div>
             </>
          ) : (
             <div className="relative rounded-full bg-[var(--surface-2)] p-8 ring-4 ring-[var(--surface)] dark:ring-[var(--surface-elevated)]">
                {percentage >= 50 ? (
                    <CheckCircle2 className="h-20 w-20 text-blue-500 dark:text-blue-400" />
                ) : (
                    <Frown className="h-20 w-20 text-gray-400" />
                )}
             </div>
          )}
        </div>
      </div>

      <h1 className="mb-3 text-4xl font-bold text-[var(--text-main)] tracking-tight">
        {isSuccess ? "Outstanding!" : percentage >= 50 ? "Good Job!" : "Keep Practicing"}
      </h1>
      <p className="mb-10 text-lg text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
        {isSuccess 
            ? "You've mastered this topic with excellent accuracy. Great work!" 
            : percentage >= 50 
            ? "You have a solid understanding, but there's room for improvement." 
            : "Review the material and try again to improve your score."}
      </p>

      <div className="mb-12 grid grid-cols-2 gap-6">
        <div className="group relative overflow-hidden rounded-2xl bg-[var(--surface)] p-6 shadow-sm border border-[var(--border)] hover:border-[var(--primary)]/30 transition-all">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Total Score
          </div>
          <div className="text-4xl font-black text-[var(--primary)] tabular-nums">
            {score}<span className="text-xl text-[var(--text-muted)] font-medium">/{total}</span>
          </div>
        </div>
        
        <div className={`group relative overflow-hidden rounded-2xl bg-[var(--surface)] p-6 shadow-sm border border-[var(--border)] transition-all ${
            isSuccess ? "border-green-200 bg-green-50/30" : ""
        }`}>
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Accuracy
          </div>
          <div className={`text-4xl font-black tabular-nums ${
            isSuccess ? 'text-green-600' : percentage >= 50 ? 'text-blue-600' : 'text-gray-500'
          }`}>
            {percentage}%
          </div>
        </div>
      </div>

      {breakdown?.by_tag?.length ? (
        <div className="mb-10 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            Weak topics
          </div>
          <div className="mt-2 text-lg font-bold text-[var(--text-main)]">Recommended revision</div>
          <div className="mt-4 space-y-3">
            {breakdown.by_tag
              .filter((topic) => topic.accuracy < 0.7 || topic.struggled_questions > 0)
              .slice(0, 4)
              .map((topic) => (
                <div key={`${topic.tag_id}-${topic.tag}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[var(--text-main)]">{topic.tag}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        {topic.struggled_questions} question{topic.struggled_questions === 1 ? "" : "s"} need review · {Math.round(topic.accuracy_pct)}% accuracy
                      </div>
                    </div>
                    <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text-main)]">
                      {topic.accuracy_pct < 45 ? "Weak" : "Improving"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onReviewFlashcards?.(topic.tag)}
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)] hover:border-[var(--primary)]"
                    >
                      Review flashcards
                    </button>
                    <button
                      type="button"
                      onClick={() => onPracticeQuiz?.(topic.tag)}
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-main)] hover:border-[var(--primary)]"
                    >
                      Generate more practice
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      <div className="flex justify-center gap-4">
        <button
          onClick={onGoBack}
          className="group flex items-center gap-2 rounded-full bg-[var(--primary)] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-[var(--primary)]/25 transition-all hover:scale-105 hover:shadow-xl hover:opacity-95 active:scale-95"
        >
          <span>Back to Quizzes</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}
