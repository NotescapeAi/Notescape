import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, RotateCcw, Sparkles, Target, Trophy } from "lucide-react";
import Confetti from "react-confetti";
import type { QuizBreakdown } from "../../../lib/api";

type Props = {
  score: number;
  total: number;
  breakdown?: QuizBreakdown | null;
  onReviewFlashcards?: (topic?: string) => void;
  onPracticeQuiz?: (topic?: string) => void;
  onGoBack: () => void;
};

type Tier = "great" | "good" | "practice";

function tierFor(percentage: number): Tier {
  if (percentage >= 75) return "great";
  if (percentage >= 50) return "good";
  return "practice";
}

const tierContent: Record<
  Tier,
  { title: string; subtitle: string; ringColor: string; icon: React.ReactNode; chipClass: string }
> = {
  great: {
    title: "Outstanding",
    subtitle: "You've mastered this topic with excellent accuracy. Keep the streak going.",
    ringColor: "var(--success)",
    icon: <Trophy className="h-7 w-7" aria-hidden />,
    chipClass: "topic-chip topic-chip--strong",
  },
  good: {
    title: "Solid run",
    subtitle: "Strong foundation with a few weak spots — review the topics below.",
    ringColor: "var(--primary)",
    icon: <Sparkles className="h-7 w-7" aria-hidden />,
    chipClass: "topic-chip topic-chip--improving",
  },
  practice: {
    title: "Keep practicing",
    subtitle: "Reinforce the material with focused flashcards and try again.",
    ringColor: "var(--warning)",
    icon: <Target className="h-7 w-7" aria-hidden />,
    chipClass: "topic-chip topic-chip--weak",
  },
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
  const tier = tierFor(percentage);
  const content = tierContent[tier];

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const weakTopics = (breakdown?.by_tag ?? [])
    .filter((t) => t.accuracy < 0.7 || t.struggled_questions > 0)
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-12 pt-2 sm:px-6">
      {tier === "great" && (
        <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
          <Confetti
            width={windowSize.width}
            height={windowSize.height}
            recycle={false}
            numberOfPieces={320}
            gravity={0.18}
            colors={["#7c3aed", "#a855f7", "#10b981", "#f59e0b", "#ef5f8b"]}
          />
        </div>
      )}

      {/* Hero card with score ring */}
      <section className="ns-card flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:items-center sm:gap-8 sm:p-8 sm:text-left">
        <div
          className="score-ring shrink-0"
          style={{ ["--value" as any]: percentage, ["--value-color" as any]: content.ringColor } as CSSProperties}
          role="img"
          aria-label={`Score ${percentage}%`}
        >
          <div className="text-center">
            <div className="text-[34px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-[var(--text-main)] sm:text-[40px]">
              {percentage}%
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
              accuracy
            </div>
          </div>
        </div>

        <div className="flex-1">
          <span className="eyebrow">
            <span className="eyebrow-dot" aria-hidden />
            Quiz complete
          </span>
          <div className="mt-2 flex items-center justify-center gap-2.5 sm:justify-start">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)]"
              style={{
                background: `color-mix(in srgb, ${content.ringColor} 12%, transparent)`,
                color: content.ringColor,
              }}
              aria-hidden
            >
              {content.icon}
            </span>
            <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-[var(--text-main)] sm:text-[32px]">
              {content.title}
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[var(--text-secondary)]">
            {content.subtitle}
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[12.5px] font-medium text-[var(--text-main)]">
              <span className="text-[var(--text-muted-soft)]">Score</span>
              <span className="tabular-nums font-semibold">
                {score}
                <span className="text-[var(--text-muted-soft)]">/{total}</span>
              </span>
            </span>
            <span className={content.chipClass}>
              {tier === "great" ? "Mastery level" : tier === "good" ? "On track" : "Needs review"}
            </span>
          </div>
        </div>
      </section>

      {/* Weak topics */}
      {weakTopics.length > 0 ? (
        <section className="ns-card mt-6 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="eyebrow">
                <span className="eyebrow-dot" aria-hidden />
                Recommended next
              </span>
              <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.018em] text-[var(--text-main)]">
                Topics to revise
              </h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                Based on your accuracy across these tags.
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2.5">
            {weakTopics.map((topic) => {
              const acc = Math.round(topic.accuracy_pct);
              const chipClass =
                acc < 45
                  ? "topic-chip topic-chip--weak"
                  : acc < 70
                    ? "topic-chip topic-chip--improving"
                    : "topic-chip";
              return (
                <li
                  key={`${topic.tag_id}-${topic.tag}`}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-[var(--text-main)]">
                          {topic.tag}
                        </span>
                        <span className={chipClass}>
                          {acc}% accuracy
                        </span>
                      </div>
                      <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">
                        {topic.struggled_questions}{" "}
                        {topic.struggled_questions === 1 ? "question" : "questions"} need review
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onReviewFlashcards?.(topic.tag)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                      >
                        <BookOpen className="h-3.5 w-3.5" aria-hidden />
                        Review flashcards
                      </button>
                      <button
                        type="button"
                        onClick={() => onPracticeQuiz?.(topic.tag)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)] px-3 text-[12.5px] font-semibold text-[var(--primary)] transition hover:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Practice again
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Bottom action */}
      <div className="mt-7 flex justify-center">
        <button type="button" onClick={onGoBack} className="btn-premium">
          <span>Back to quizzes</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
