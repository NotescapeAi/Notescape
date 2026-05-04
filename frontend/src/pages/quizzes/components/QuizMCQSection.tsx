import type { CSSProperties } from "react";
import { useState } from "react";
import { CheckCircle2, RotateCw } from "lucide-react";
import type { QuizQuestion } from "../../../lib/api";

type Props = {
  questions: QuizQuestion[];
  onComplete: (answers: Record<number, number>) => void;
  initialAnswers?: Record<number, number>;
};

export default function QuizMCQSection({ questions, onComplete, initialAnswers = {} }: Props) {
  const [questionQueue, setQuestionQueue] = useState<number[]>(questions.map((_, i) => i));
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>(initialAnswers);
  const [isAnimating, setIsAnimating] = useState(false);

  const actualQuestionIndex = questionQueue[currentQueueIndex];
  const currentQuestion = questions[actualQuestionIndex];

  const isLastInQueue = currentQueueIndex === questionQueue.length - 1;
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / questions.length) * 100;
  const remaining = questionQueue.length - currentQueueIndex - 1;

  function handleSelect(optionIndex: number) {
    if (isAnimating) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionIndex }));
    if (!isLastInQueue) {
      setIsAnimating(true);
      window.setTimeout(() => {
        setCurrentQueueIndex((prev) => prev + 1);
        setIsAnimating(false);
      }, 320);
    }
  }

  function handlePending() {
    if (isAnimating) return;
    const nextQueue = [...questionQueue];
    const [item] = nextQueue.splice(currentQueueIndex, 1);
    nextQueue.push(item);
    setIsAnimating(true);
    window.setTimeout(() => {
      setQuestionQueue(nextQueue);
      setIsAnimating(false);
    }, 280);
  }

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 pb-12 pt-2 sm:px-6">
      {/* Progress header */}
      <div className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-[var(--text-muted)]">
            <span className="font-semibold tabular-nums text-[var(--text-main)]">
              {answeredCount}
            </span>{" "}
            of <span className="tabular-nums">{questions.length}</span> answered
          </span>
          <span className="text-[12px] font-semibold tabular-nums text-[var(--text-muted-soft)]">
            {Math.round(progress)}%
          </span>
        </div>
        <div
          className="flash-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Quiz progress"
        >
          <div
            className="flash-progress-fill"
            style={{ ["--value" as any]: `${progress}%` } as CSSProperties}
          />
        </div>
      </div>

      {/* Question card */}
      <div
        className={`transition-all duration-300 ${
          isAnimating ? "translate-x-[-12px] opacity-0" : "translate-x-0 opacity-100"
        }`}
      >
        <div className="rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-7">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_28%,transparent)] bg-[var(--primary-soft)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              MCQ {actualQuestionIndex + 1}
            </span>
            <button
              type="button"
              onClick={handlePending}
              className="quiz-pending-btn"
              title="Move to end of section"
              aria-label="Mark question pending"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Pending
            </button>
          </div>

          <h2 className="text-[19px] font-semibold leading-[1.4] tracking-[-0.018em] text-[var(--text-main)] sm:text-[22px]">
            {currentQuestion.question}
          </h2>

          <div className="mt-5 space-y-2.5">
            {currentQuestion.options?.map((opt, idx) => {
              const isSelected = answers[currentQuestion.id] === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(idx)}
                  disabled={isAnimating}
                  className={`quiz-option ${isSelected ? "quiz-option--selected" : ""}`}
                  aria-pressed={isSelected}
                >
                  <span className="quiz-option__bullet" aria-hidden />
                  <span className="quiz-option__label">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer / submit */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-[var(--text-muted-soft)]">
          {remaining > 0
            ? `${remaining} ${remaining === 1 ? "question" : "questions"} remaining`
            : "Last question in this section"}
        </div>
        {isLastInQueue ? (
          <button
            type="button"
            onClick={() => onComplete(answers)}
            className="btn-premium"
          >
            <span>Finish Part 1</span>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
