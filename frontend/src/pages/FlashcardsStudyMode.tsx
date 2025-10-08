import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import KebabMenu from "../components/KebabMenu";
import useBookmarks from "../lib/bookmarks";
import { deleteFlashcard, type Flashcard } from "../lib/api";

type LocationState = { cards?: Flashcard[]; className?: string; startIndex?: number };

export default function FlashcardsStudyMode() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const state = (useLocation().state || {}) as LocationState;

  const bm = useBookmarks();
  const [cards, setCards] = useState<Flashcard[]>(Array.isArray(state.cards) ? state.cards : []);
  const className = state.className || "";
  const [idx, setIdx] = useState<number>(
    typeof state.startIndex === "number" && state.startIndex >= 0 ? state.startIndex : 0
  );
  const [revealed, setRevealed] = useState(false);

  const hasPrev = idx > 0;
  const hasNext = idx < cards.length - 1;

  const progressPct = useMemo(
    () => (cards.length ? Math.round(((idx + 1) / cards.length) * 100) : 0),
    [idx, cards.length]
  );

  // keyboard arrows
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && hasPrev) { setIdx(i => Math.max(0, i - 1)); setRevealed(false); }
      if (e.key === "ArrowRight" && hasNext) { setIdx(i => Math.min(cards.length - 1, i + 1)); setRevealed(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, cards.length]);

  const card = cards[idx];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-white">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to={`/classes/${classId}/flashcards`}
              replace
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-slate-50"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <div className="text-sm text-slate-500">Study Mode · {className}</div>
          </div>

          <KebabMenu
            items={[
              {
                label: bm.isBookmarked(String(card?.id)) ? "Remove Bookmark" : "Bookmark",
                onClick: () => bm.toggle(String(card?.id)),
              },
              {
                label: "View Mode",
                onClick: () => navigate(`/classes/${classId}/flashcards/view`, { state: { cards, className } }),
              },
              { label: "Study Mode", onClick: () => {} },
              {
                label: "Delete",
                onClick: async () => {
                  if (!card) return;
                  if (!confirm("Delete this flashcard?")) return;
                  try {
                    await deleteFlashcard(card.id as any);
                    setCards(prev => {
                      const next = prev.filter(x => x.id !== card.id);
                      const newIdx = Math.min(next.length - 1, idx);
                      if (next.length === 0) {
                        // go back to list when nothing to study
                        requestAnimationFrame(() => navigate(`/classes/${classId}/flashcards`, { replace: true }));
                      } else {
                        setIdx(Math.max(0, newIdx));
                      }
                      return next;
                    });
                  } catch (err: any) {
                    alert(err?.message || "Failed to delete flashcard");
                  }
                },
              },
            ]}
          />
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="text-sm text-slate-500 mb-4">Progress: {progressPct}%</div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="font-extrabold mb-2 text-slate-900">Q: {card.question}</div>

          <div className="mb-3">
            {revealed ? (
              <div className="text-slate-800 whitespace-pre-wrap">A: {card.answer}</div>
            ) : (
              <button
                className="font-bold text-violet-600 hover:text-violet-700"
                onClick={() => setRevealed(true)}
              >
                Show Answer
              </button>
            )}
          </div>

          {card.hint && String(card.hint).trim() && (
            <div className="mt-3 text-xs text-slate-500">
              <span className="font-semibold">Hint:</span> {String(card.hint).trim()}
            </div>
          )}

          <div className="mt-4 flex justify-between items-center">
            <button
              disabled={!hasPrev}
              onClick={() => setIdx(i => Math.max(0, i - 1))}
              className="p-2 rounded-md bg-slate-100 hover:bg-slate-200"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              disabled={!hasNext}
              onClick={() => setIdx(i => Math.min(cards.length - 1, i + 1))}
              className="p-2 rounded-md bg-slate-100 hover:bg-slate-200"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
