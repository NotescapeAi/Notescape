import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import { getFlashcardProgress, listDueCards, postReview } from "../lib/api";

type DueCard = {
  id: string;
  question: string;
  answer: string;
  due_at?: string | null;
  state?: string | null;
  repetitions?: number;
  ease_factor?: number;
};

export default function FlashcardsStudyMode() {
  const { classId } = useParams();
  const classNum = Number(classId);
  const [cards, setCards] = useState<DueCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ total: number; due_now: number; due_today: number; learning: number } | null>(null);

  useEffect(() => {
    if (!classNum) return;
    (async () => {
      setLoading(true);
      try {
        const data = await listDueCards(classNum);
        setCards(Array.isArray(data) ? data : []);
        const prog = await getFlashcardProgress(classNum);
        setProgress(prog);
      } finally {
        setLoading(false);
      }
    })();
  }, [classNum]);

  const current = cards[idx];
  const dueCount = cards.length;

  const nextCard = useMemo(() => {
    if (cards.length === 0) return null;
    return cards[(idx + 1) % cards.length];
  }, [cards, idx]);

  async function handleReview(rating: "again" | "hard" | "good" | "easy") {
    if (!current) return;
    await postReview(current.id, rating);
    const nextCards = cards.filter((c) => c.id !== current.id);
    setCards(nextCards);
    setIdx(0);
    setRevealed(false);
    if (classNum) {
      const prog = await getFlashcardProgress(classNum);
      setProgress(prog);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Study Mode</h1>
            <p className="text-sm text-slate-500">Review due cards with a stable SM-2 scheduler.</p>
          </div>
          <Link
            to={`/classes/${classId}/flashcards`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm"
          >
            Back to flashcards
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Due now</div>
            <div className="text-2xl font-semibold">{progress?.due_now ?? dueCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Due today</div>
            <div className="text-2xl font-semibold">{progress?.due_today ?? dueCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Learning</div>
            <div className="text-2xl font-semibold">{progress?.learning ?? 0}</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="text-sm text-slate-500">Loading cards...</div>
          ) : !current ? (
            <div className="text-sm text-slate-500">No due cards right now. Check back later.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div>
                  Card {idx + 1} of {cards.length}
                </div>
                <div>{current.state ? current.state.toUpperCase() : "DUE"}</div>
              </div>

              <div className="text-xl font-medium text-slate-800">{current.question}</div>

              <div className="space-y-3">
                <button
                  onClick={() => setRevealed((v) => !v)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  {revealed ? "Hide answer" : "Show answer"}
                </button>
                {revealed && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    {current.answer}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={() => handleReview("again")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  Again
                </button>
                <button
                  onClick={() => handleReview("hard")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  Hard
                </button>
                <button
                  onClick={() => handleReview("good")}
                  className="rounded-xl border border-slate-200 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  Good
                </button>
                <button
                  onClick={() => handleReview("easy")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  Easy
                </button>
              </div>

              {nextCard && (
                <div className="text-xs text-slate-400">Next: {nextCard.question.slice(0, 60)}...</div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
