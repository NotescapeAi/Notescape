import React, { useState } from 'react';
import { QuizQuestion } from '../../../lib/api';
import { ArrowRight, CheckCircle2, RotateCw } from "lucide-react";

type Props = {
  questions: QuizQuestion[];
  onComplete: (answers: Record<number, string>) => void;
  initialAnswers?: Record<number, string>;
};

export default function QuizTheorySection({ questions, onComplete, initialAnswers = {} }: Props) {
  // Queue logic for pending items
  const [questionQueue, setQuestionQueue] = useState<number[]>(questions.map((_, i) => i));
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  
  const [answers, setAnswers] = useState<Record<number, string>>(initialAnswers);
  const [isAnimating, setIsAnimating] = useState(false);

  // Derived state
  const actualQuestionIndex = questionQueue[currentQueueIndex];
  const currentQuestion = questions[actualQuestionIndex];
  
  const isLastInQueue = currentQueueIndex === questionQueue.length - 1;
  const answeredCount = Object.keys(answers).filter(k => answers[Number(k)]?.trim().length > 0).length;
  const progress = (answeredCount / questions.length) * 100;

  const handleChange = (val: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: val }));
  };

  const handleNext = () => {
    if (isAnimating) return;
    
    if (isLastInQueue) {
      onComplete(answers);
    } else {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentQueueIndex(prev => prev + 1);
        setIsAnimating(false);
      }, 300);
    }
  };

  const handlePending = () => {
    if (isAnimating) return;

    const nextQueue = [...questionQueue];
    const [currentItem] = nextQueue.splice(currentQueueIndex, 1);
    nextQueue.push(currentItem);
    
    setIsAnimating(true);
    setTimeout(() => {
        setQuestionQueue(nextQueue);
        setIsAnimating(false);
    }, 300);
  };

  return (
    <div className="max-w-[800px] mx-auto px-4 py-8">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs font-medium text-[var(--text-muted)] mb-2">
          <span>Question {answeredCount} of {questions.length} Answered</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div 
            className="h-full bg-purple-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className={`transform transition-all duration-300 ${isAnimating ? 'opacity-0 translate-x-[-20px]' : 'opacity-100 translate-x-0'}`}>
        <div className="mb-6 flex justify-between items-start">
          <div>
            <span className="inline-block rounded-full bg-purple-100 text-purple-700 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-4 dark:bg-purple-900/30 dark:text-purple-400">
                Theory {actualQuestionIndex + 1}
            </span>
            <h2 className="text-2xl font-bold text-[var(--text-main)] leading-relaxed">
                {currentQuestion.question}
            </h2>
          </div>
          <button
            onClick={handlePending}
            className="flex items-center gap-1.5 text-xs font-medium text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
            title="Move to end of section"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Pending
          </button>
        </div>
        
        <div className="relative group">
            <textarea
              value={answers[currentQuestion.id] || ''}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Type your answer here..."
              rows={8}
              autoFocus
              className="w-full rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-5 text-base leading-relaxed shadow-sm transition-all focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-500/10 placeholder:text-[var(--text-muted)]/50 resize-none"
            />
            <div className="absolute bottom-4 right-4 text-xs text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                {answers[currentQuestion.id]?.length || 0} chars
            </div>
        </div>
        
        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 font-bold">i</span>
            <span>You can mark this pending to answer later, or skip it entirely.</span>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="mt-10 flex justify-between items-center pt-6 border-t border-[var(--border)]">
        <div className="text-xs text-[var(--text-muted)] italic">
            {questionQueue.length - currentQueueIndex - 1} questions remaining in queue
        </div>

        <button
          onClick={handleNext}
          className={`flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${
            isLastInQueue 
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90" 
                : "bg-[var(--primary)] hover:opacity-90"
          }`}
        >
          {isLastInQueue ? "Finish Part 2" : "Next Question"}
          {isLastInQueue ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
