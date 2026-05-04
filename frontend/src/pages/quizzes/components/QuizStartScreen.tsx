import { ArrowRight, BookOpen, CheckCircle2, ListChecks, PenLine } from "lucide-react";

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

type SectionCardProps = {
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  count: number;
  completed: boolean;
  onStart: () => void;
  ctaLabel: string;
};

function SectionCard({
  eyebrow,
  icon,
  title,
  description,
  count,
  completed,
  onStart,
  ctaLabel,
}: SectionCardProps) {
  const disabled = completed || count === 0;
  return (
    <div
      className={`relative flex flex-col rounded-[var(--radius-2xl)] border bg-[var(--surface)] p-5 transition sm:p-6 ${
        completed
          ? "border-[color-mix(in_srgb,var(--success)_28%,var(--border))] bg-[color-mix(in_srgb,var(--success)_5%,var(--surface))]"
          : "border-[var(--border)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] hover:shadow-[var(--shadow-soft)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow">
          <span className="eyebrow-dot" aria-hidden />
          {eyebrow}
        </span>
        {completed ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--success)]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Completed
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[18px] font-semibold tracking-[-0.018em] text-[var(--text-main)]">
            {title}
          </h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="text-[12.5px] text-[var(--text-muted-soft)]">
          <span className="text-[20px] font-semibold tabular-nums text-[var(--text-main)]">
            {count}
          </span>{" "}
          {count === 1 ? "question" : "questions"}
        </div>
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          className={
            completed
              ? "inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] px-4 text-sm font-semibold text-[var(--success)]"
              : count === 0
                ? "inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--text-muted-soft)] cursor-not-allowed"
                : "btn-premium h-10"
          }
        >
          {ctaLabel}
          {!completed && count > 0 ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      </div>
    </div>
  );
}

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
  return (
    <div className="mx-auto w-full max-w-[840px] px-4 pb-10 pt-2 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <span className="eyebrow">
          <span className="eyebrow-dot" aria-hidden />
          Quiz session
        </span>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.028em] text-[var(--text-main)] sm:text-[32px]">
          {quizTitle}
        </h1>
        <div className="mt-2 inline-flex items-center gap-2 text-[13.5px] text-[var(--text-muted)]">
          <BookOpen className="h-4 w-4 text-[var(--text-muted-soft)]" aria-hidden />
          <span className="tabular-nums">{totalQuestions}</span>
          <span>{totalQuestions === 1 ? "question" : "questions"} in total</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard
          eyebrow="Part 1"
          icon={<ListChecks className="h-5 w-5" />}
          title="Multiple choice"
          description="Quick recall. Auto-advance after each answer keeps your momentum."
          count={mcqCount}
          completed={mcqCompleted}
          onStart={onStartMcq}
          ctaLabel={mcqCompleted ? "Completed" : mcqCount === 0 ? "Unavailable" : "Start MCQs"}
        />
        <SectionCard
          eyebrow="Part 2"
          icon={<PenLine className="h-5 w-5" />}
          title="Written answers"
          description="Take your time and explain in your own words. Mark questions as pending to revisit."
          count={theoryCount}
          completed={theoryCompleted}
          onStart={onStartTheory}
          ctaLabel={theoryCompleted ? "Completed" : theoryCount === 0 ? "Unavailable" : "Start theory"}
        />
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-medium text-[var(--text-muted)] underline-offset-4 transition hover:text-[var(--text-main)] hover:underline"
        >
          Back to quizzes
        </button>
      </div>
    </div>
  );
}
