import React, { useState } from 'react';
import { QuizQuestion } from '../../../lib/api';
import { ArrowRight, Clock, CheckCircle2, RotateCw } from "lucide-react";

type Props = {
  questions: QuizQuestion[];
  onComplete: (answers: Record<number, number>) => void;
  initialAnswers?: Record<number, number>;
};

export default function QuizMCQSection({ questions, onComplete, initialAnswers = {} }: Props) {
  // We use a queue-based approach for pending questions
  // Initially, the queue is just the indices [0, 1, 2, ... n-1]
  // Pending questions get pushed to the end of this queue
  const [questionQueue, setQuestionQueue] = useState<number[]>(questions.map((_, i) => i));
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  
  const [answers, setAnswers] = useState<Record<number, number>>(initialAnswers);
  const [isAnimating, setIsAnimating] = useState(false);

  // Get the actual question index from the queue
  const actualQuestionIndex = questionQueue[currentQueueIndex];
  const currentQuestion = questions[actualQuestionIndex];
  
  const isLastInQueue = currentQueueIndex === questionQueue.length - 1;
  // Progress is based on unique questions answered vs total questions
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / questions.length) * 100;

  const handleSelect = (optionIndex: number) => {
    if (isAnimating) return;
    
    // Save answer
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: optionIndex }));

    // Auto advance after short delay
    if (!isLastInQueue) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentQueueIndex(prev => prev + 1);
        setIsAnimating(false);
      }, 400); 
    }
  };

  const handlePending = () => {
    if (isAnimating) return;

    // Remove current index from its current spot and push to end
    // But we need to be careful not to mess up the array while rendering
    // Easier approach: just construct new queue
    
    const nextQueue = [...questionQueue];
    // Remove current item
    const [currentItem] = nextQueue.splice(currentQueueIndex, 1);
    // Add to end
    nextQueue.push(currentItem);
    
    setIsAnimating(true);
    setTimeout(() => {
        setQuestionQueue(nextQueue);
        // Current index stays same (it now points to the next item that shifted down), 
        // unless we were at the end, but pushing to end means we are effectively looping if size=1
        // Actually, if we remove and push to end, the "next" item slides into currentQueueIndex.
        // So we don't increment currentQueueIndex.
        setIsAnimating(false);
    }, 300);
  };

  const handleFinish = () => {
    onComplete(answers);
  };

  // Helper to check if current question was marked pending before (is it a revisit?)
  // A simple heuristic: if we have seen this question index before or if it's at the end
  // For now, simple UI is enough.

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
            className="h-full bg-[var(--primary)] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className={`transform transition-all duration-300 ${isAnimating ? 'opacity-0 translate-x-[-20px]' : 'opacity-100 translate-x-0'}`}>
        <div className="mb-6 flex justify-between items-start">
          <div>
            <span className="inline-block rounded-full bg-[var(--primary)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--primary)] mb-4">
                MCQ {actualQuestionIndex + 1}
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

        <div className="space-y-3">
          {currentQuestion.options?.map((opt, idx) => {
            const isSelected = answers[currentQuestion.id] === idx;
            return (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 group ${
                  isSelected 
                    ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm" 
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/50 hover:bg-gray-50 dark:hover:bg-white/5"
                }`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  isSelected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-gray-300 group-hover:border-[var(--primary)]"
                }`}>
                  {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                </div>
                <span className={`text-base font-medium ${isSelected ? "text-[var(--primary)]" : "text-[var(--text-main)]"}`}>
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation / Submit */}
      <div className="mt-10 flex justify-between items-center pt-6 border-t border-[var(--border)]">
        {/* Previous button is tricky with dynamic queue, simpler to just allow forward motion or pending */}
        <div className="text-xs text-[var(--text-muted)] italic">
            {questionQueue.length - currentQueueIndex - 1} questions remaining in queue
        </div>

        {isLastInQueue ? (
          <button
            onClick={handleFinish}
            className="flex items-center gap-2 rounded-full bg-[var(--primary)] px-8 py-3 text-sm font-bold text-white shadow-lg hover:bg-[var(--primary)]/90 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            Finish Part 1
            <CheckCircle2 className="h-4 w-4" />
          </button>
        ) : (
          <div className="w-8" /> /* Spacer to keep layout balanced if needed, or just empty */
        )}
      </div>
    </div>
  );
}
