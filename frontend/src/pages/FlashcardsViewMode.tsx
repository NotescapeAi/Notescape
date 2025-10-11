import React, { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import KebabMenu from "../components/KebabMenu";
import useBookmarks from "../lib/bookmarks";
import { deleteFlashcard, type Flashcard } from "../lib/api";
type FlashcardWithMeta = Flashcard & { difficulty?: string | null };
type LocationState = { cards?: Flashcard[]; className?: string };

export default function FlashcardsViewMode() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const state = (useLocation().state || {}) as LocationState;

  const bm = useBookmarks();
  const [cards, setCards] = useState<Flashcard[]>(Array.isArray(state.cards) ? state.cards : []);
  const className = state.className || "";

  const tagsOf = (c: Flashcard) =>
    Array.isArray(c.tags) ? c.tags.map(t => String(t).trim()).filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-white">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to={`/classes/${classId}/flashcards`}
              replace
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-slate-50"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <div className="text-sm text-slate-500">View Mode · {className}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {cards.length === 0 ? (
          <div className="text-slate-500">No cards to show.</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            {cards.map((c) => {
              const tags = tagsOf(c);
              return (
                <div key={c.id} className="border border-slate-200 rounded-2xl bg-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="inline-flex gap-2 items-center">
                      <span className="text-[11px] font-bold text-violet-600 bg-violet-100 rounded-full px-3 py-1">
                        {c.difficulty ? String(c.difficulty).toUpperCase() : "MEDIUM"}
                      </span>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-3 py-1">
                        {className}
                      </span>
                    </div>

                    <KebabMenu
                      items={[
                        {
                          label: bm.isBookmarked(String(c.id)) ? "Remove Bookmark": "Bookmark",
                          onClick: () => bm.toggle(String(c.id)),
                        },
                        {
                          label: "View Mode",
                          onClick: () => {}, // already here
                        },
                        {
                          label: "Study Mode",
                          onClick: () =>
                            navigate(`/classes/${classId}/flashcards/study`, {
                              state: {
                                cards,
                                className,
                                startIndex: cards.findIndex(x => String(x.id) === String(c.id)),
                              },
                            }),
                        },
                        {
                          label: "Delete",
                          onClick: async () => {
                            if (!confirm("Delete this flashcard?")) return;
                            try {
                              await deleteFlashcard(String(c.id));
                              setCards(prev => prev.filter(x => x.id !== c.id));
                            } catch (err: unknown) {
                                  const message = err instanceof Error ? err.message : String(err);
                                  alert(message || "Failed to delete flashcard");
                            }
                          },
                        },
                      ]}
                    />
                  </div>

                  <div className="font-extrabold mb-2 text-slate-900">Q: {c.question}</div>
                  <div className="text-slate-800 whitespace-pre-wrap">A: {c.answer}</div>

                  {c.hint && String(c.hint).trim() && (
                    <div className="mt-3 text-xs text-slate-500">
                      <span className="font-semibold">Hint:</span> {String(c.hint).trim()}
                    </div>
                  )}

                  {tags.length > 0 && (
                    <div className="mt-3 text-xs text-slate-500">
                      <span className="font-semibold">Tags:</span> {tags.join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
