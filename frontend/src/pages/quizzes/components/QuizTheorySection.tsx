import type { CSSProperties } from "react";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Info, RotateCw } from "lucide-react";
import type { QuizQuestion } from "../../../lib/api";

type Props = {
  questions: QuizQuestion[];
  onComplete: (answers: Record<number, string>) => void;
  initialAnswers?: Record<number, string>;
};

export default function QuizTheorySection({ questions, onComplete, initialAnswers = {} }: Props) {
  const [questionQueue, setQuestionQueue] = useState<number[]>(questions.map((_, i) => i));
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>(initialAnswers);
  const [isAnimating, setIsAnimating] = useState(false);

  const actualQuestionIndex = questionQueue[currentQueueIndex];
  const currentQuestion = questions[actualQuestionIndex];

  const isLastInQueue = currentQueueIndex === questionQueue.length - 1;
  const answeredCount = Object.keys(answers).filter(
    (k) => answers[Number(k)]?.trim().length > 0
  ).length;
  const progress = (answeredCount / questions.length) * 100;
  const remaining = questionQueue.length - currentQueueIndex - 1;
  const charCount = answers[currentQuestion?.id]?.length ?? 0;

  function handleChange(val: string) {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: val }));
  }

  function handleNext() {
    if (isAnimating) return;
    if (isLastInQueue) {
      onComplete(answers);
      return;
    }
    setIsAnimating(true);
    window.setTimeout(() => {
      setCurrentQueueIndex((prev) => prev + 1);
      setIsAnimating(false);
    }, 280);
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
      {/* Progress */}
      <div className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-[var(--text-muted)]">
            <span className="font-semibold tabular-nums text-[var(--text-main)]">{answeredCount}</span>{" "}
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
          aria-label="Theory section progress"
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
              Theory {actualQuestionIndex + 1}
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

          <div className="relative mt-5">
            <textarea
              value={answers[currentQuestion.id] || ""}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Type your answer here…"
              rows={8}
              autoFocus
              className="ns-scroll w-full resize-y rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4 text-[14.5px] leading-[1.65] text-[var(--text-main)] outline-none placeholder:text-[var(--placeholder)] focus:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--ring)]"
            />
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-[var(--text-muted-soft)]">
              {charCount} chars
            </div>
          </div>

          <div className="mt-3 flex items-start gap-1.5 text-[12px] text-[var(--text-muted)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted-soft)]" aria-hidden />
            <span>Mark this pending to revisit later, or skip if you're not sure.</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-[var(--text-muted-soft)]">
          {remaining > 0
            ? `${remaining} ${remaining === 1 ? "question" : "questions"} remaining`
            : "Last question in this section"}
        </div>
        <button type="button" onClick={handleNext} className="btn-premium">
          <span>{isLastInQueue ? "Finish Part 2" : "Next question"}</span>
          {isLastInQueue ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
