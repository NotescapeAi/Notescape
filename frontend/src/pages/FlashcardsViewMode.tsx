// frontend/src/pages/FlashcardsViewMode.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import { listFlashcards, type Flashcard } from "../lib/api";


type LocationState = { cards?: Flashcard[]; className?: string };

function sanitizeText(value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("{") && text.includes("\"cards\"")) {
    return "This card needs regeneration.";
  }
  return text;
}

export default function FlashcardsViewMode() {
  const { classId } = useParams();
  const state = (useLocation().state || {}) as LocationState;

  const [cards, setCards] = useState<Flashcard[]>(Array.isArray(state.cards) ? state.cards : []);
  const [loading, setLoading] = useState<boolean>(!Array.isArray(state.cards));
  const [idx, setIdx] = useState<number>(0);
  const [revealed, setRevealed] = useState<boolean>(false);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (Array.isArray(state.cards)) return;
      setLoading(true);
      try {
        const n = Number(classId);
        const fetched = Number.isFinite(n) ? await listFlashcards(n) : [];
        if (!ignore) {
          setCards(Array.isArray(fetched) ? fetched : []);
          setIdx(0);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, [classId, state.cards]);

  const current = useMemo<Flashcard | undefined>(() => cards[idx], [cards, idx]);

  function next() {
    if (!cards.length) return;
    setIdx((i) => (i + 1) % cards.length);
    setRevealed(false);
  }

  function prev() {
    if (!cards.length) return;
    setIdx((i) => (i - 1 + cards.length) % cards.length);
    setRevealed(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
          <PageHeader
            title="Browse cards"
            subtitle={state.className ?? "Class"}
            backHref={`/classes/${classId}/flashcards`}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="text-sm text-slate-500">Loading cards...</div>
          ) : !current ? (
            <div className="text-sm text-slate-500">No cards available.</div>
          ) : (
            <div className="space-y-5">
              <div className="text-xs text-slate-500">
                Card {idx + 1} of {cards.length}
              </div>
              <div className="text-lg font-semibold text-slate-900">{sanitizeText(current.question)}</div>

              <Button variant="primary" onClick={() => setRevealed((v) => !v)}>
                {revealed ? "Hide answer" : "Show answer"}
              </Button>

              {revealed && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
                  {sanitizeText(current.answer)}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={prev}>Previous</Button>
                <Button onClick={next}>Next</Button>
              </div>
            </div>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}
