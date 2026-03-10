import React, { useEffect, useState } from 'react';
import { Trophy, ArrowRight, Star, Frown, CheckCircle2 } from "lucide-react";
import Confetti from 'react-confetti';

type Props = {
  score: number;
  total: number;
  onGoBack: () => void;
};

export default function QuizCompletionScreen({ score, total, onGoBack }: Props) {
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
                <div className="relative rounded-full bg-gradient-to-br from-yellow-100 to-orange-100 p-8 shadow-lg dark:from-yellow-900/20 dark:to-orange-900/20 ring-4 ring-white dark:ring-[#1a1b1e]">
                    <Trophy className="h-20 w-20 text-yellow-600 dark:text-yellow-400 drop-shadow-sm" />
                </div>
                <div className="absolute -top-2 -right-2 rotate-12 bg-white dark:bg-[#1a1b1e] rounded-full p-2 shadow-md">
                    <Star className="h-8 w-8 text-yellow-500 fill-yellow-500" />
                </div>
             </>
          ) : (
             <div className="relative rounded-full bg-gray-100 p-8 dark:bg-gray-800 ring-4 ring-white dark:ring-[#1a1b1e]">
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
