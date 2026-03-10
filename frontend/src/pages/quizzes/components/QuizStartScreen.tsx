import React from 'react';
import { ArrowLeft, BookOpen, CheckCircle2 } from "lucide-react";

type Props = {
  quizTitle: string;
  totalQuestions: number;
  mcqCount: number;
  theoryCount: number;
  mcqCompleted: boolean;
  theoryCompleted: boolean;
  onStartMcq: () => void;
  onStartTheory: () => void;
  onBack: () => void;
};

export default function QuizStartScreen({
  quizTitle,
  totalQuestions,
  mcqCount,
  theoryCount,
  mcqCompleted,
  theoryCompleted,
  onStartMcq,
  onStartTheory,
  onBack,
}: Props) {
  const isMcqDisabled = mcqCompleted || mcqCount === 0;
  const isTheoryDisabled = theoryCompleted || theoryCount === 0;

  return (
    <div className="mx-auto w-full max-w-[800px] px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[var(--text-main)] mb-2">{quizTitle}</h1>
        <div className="flex items-center justify-center gap-3 text-[var(--text-muted)]">
          <BookOpen className="h-5 w-5" />
          <span>{totalQuestions} Questions Total</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* MCQs Card */}
        <div className={`relative overflow-hidden rounded-2xl border-2 p-6 transition-all ${
          mcqCompleted 
            ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10" 
            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)] hover:shadow-lg"
        }`}>
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <span className="rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-bold uppercase tracking-wider dark:bg-blue-900/30 dark:text-blue-400">
                MCQ Section
              </span>
              {mcqCompleted && <CheckCircle2 className="h-6 w-6 text-green-600" />}
            </div>
            
            <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">Multiple Choice</h3>
            <p className="text-sm text-[var(--text-muted)] mb-6 flex-1">
              {mcqCount} questions. rapid fire. auto-advance.
            </p>

            <button
              onClick={onStartMcq}
              disabled={isMcqDisabled}
              className={`w-full rounded-xl py-3 font-semibold transition-all ${
                mcqCompleted
                  ? "bg-green-600 text-white cursor-default"
                  : mcqCount === 0
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-[var(--primary)] text-white hover:opacity-90 shadow-md hover:shadow-lg"
              }`}
            >
              {mcqCompleted ? "Completed" : "Start MCQs"}
            </button>
          </div>
        </div>

        {/* Theory Card */}
        <div className={`relative overflow-hidden rounded-2xl border-2 p-6 transition-all ${
          theoryCompleted
            ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10"
            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)] hover:shadow-lg"
        }`}>
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <span className="rounded-full bg-purple-100 text-purple-700 px-3 py-1 text-xs font-bold uppercase tracking-wider dark:bg-purple-900/30 dark:text-purple-400">
                Theory Section
              </span>
              {theoryCompleted && <CheckCircle2 className="h-6 w-6 text-green-600" />}
            </div>

            <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">Personal Answers</h3>
            <p className="text-sm text-[var(--text-muted)] mb-6 flex-1">
              {theoryCount} written questions. take your time.
            </p>

            <button
              onClick={onStartTheory}
              disabled={isTheoryDisabled}
              className={`w-full rounded-xl py-3 font-semibold transition-all ${
                theoryCompleted
                  ? "bg-green-600 text-white cursor-default"
                  : theoryCount === 0
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-[var(--primary)] text-white hover:opacity-90 shadow-md hover:shadow-lg"
              }`}
            >
              {theoryCompleted ? "Completed" : "Start Theory"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-12 text-center">
        <button 
          onClick={onBack}
          className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center justify-center gap-2 mx-auto"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
