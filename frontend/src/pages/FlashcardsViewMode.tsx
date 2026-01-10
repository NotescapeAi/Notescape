// frontend/src/pages/FlashcardsViewMode.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
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
    <AppShell
      title="Browse cards"
      breadcrumbs={["Flashcards", "Browse"]}
      subtitle={state.className ?? "Class"}
      backLabel="Back to Flashcards"
      backTo="/classes"
      backState={{ tab: "flashcards" }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="rounded-[24px] bg-white p-6 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
          {loading ? (
            <div className="text-sm text-[#6B5CA5]">Loading cards...</div>
          ) : !current ? (
            <div className="text-sm text-[#6B5CA5]">No cards available.</div>
          ) : (
            <div className="space-y-5">
              <div className="text-xs text-[#6B5CA5]">
                Card {idx + 1} of {cards.length}
              </div>
              <div className="text-lg font-semibold text-[#0F1020]">{sanitizeText(current.question)}</div>

              <Button variant="primary" onClick={() => setRevealed((v) => !v)}>
                {revealed ? "Hide answer" : "Show answer"}
              </Button>

              {revealed && (
                <div className="rounded-xl border border-[#EFE7FF] bg-[#F8F5FF] p-4 text-sm text-[#5A4B92] whitespace-pre-wrap">
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
    </AppShell>
  );
}
