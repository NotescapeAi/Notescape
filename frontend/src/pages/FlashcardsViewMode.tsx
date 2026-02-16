// frontend/src/pages/FlashcardsViewMode.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import { listClasses, listFlashcards, type Flashcard } from "../lib/api";


type LocationState = { cards?: Flashcard[]; className?: string; startIndex?: number };

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
  const [className, setClassName] = useState<string>(state.className ?? "");
  const [idx, setIdx] = useState<number>(() => Math.max(0, state.startIndex ?? 0));
  const [revealed, setRevealed] = useState<boolean>(false);
  const scrollRestoreRef = useRef<number | null>(null);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (Array.isArray(state.cards)) return;
      setLoading(true);
      try {
        const n = Number(classId);
        const [fetched, classes] = await Promise.all([
          Number.isFinite(n) ? listFlashcards(n) : Promise.resolve([]),
          Number.isFinite(n) ? listClasses() : Promise.resolve([]),
        ]);
        if (!ignore) {
          setCards(Array.isArray(fetched) ? fetched : []);
          setIdx(0);
          if (!className) {
            const cls = classes.find((c) => c.id === n);
            setClassName(cls?.name ?? "");
          }
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, [classId, state.cards, className]);

  useEffect(() => {
    const n = Number(classId);
    if (!Number.isFinite(n) || !n) return;
    localStorage.setItem("last_class_id", String(n));
  }, [classId]);

  useLayoutEffect(() => {
    if (scrollRestoreRef.current === null) return;
    window.scrollTo({ top: scrollRestoreRef.current, behavior: "auto" });
    scrollRestoreRef.current = null;
  }, [idx]);

  const current = useMemo<Flashcard | undefined>(() => cards[idx], [cards, idx]);

  function next() {
    if (!cards.length) return;
    scrollRestoreRef.current = window.scrollY;
    setIdx((i) => (i + 1) % cards.length);
    setRevealed(false);
  }

  function prev() {
    if (!cards.length) return;
    scrollRestoreRef.current = window.scrollY;
    setIdx((i) => (i - 1 + cards.length) % cards.length);
    setRevealed(false);
  }

  return (
    <AppShell
      title="Browse cards"
      breadcrumbs={["Flashcards", "Browse"]}
      subtitle={className || "Class"}
      backLabel="Back to Flashcards"
      backTo={classId ? `/classes/${classId}/flashcards` : "/classes"}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="rounded-[24px] surface p-6 shadow-[0_12px_30px_rgba(15,16,32,0.08)] min-h-[360px]">
          {loading ? (
            <div className="text-sm text-muted">Loading cards...</div>
          ) : !current ? (
            <div className="text-sm text-muted">No cards available.</div>
          ) : (
            <div className="space-y-5">
              <div className="text-xs text-muted">
                Card {idx + 1} of {cards.length}
              </div>
              <div className="text-lg font-semibold text-main">{sanitizeText(current.question)}</div>

              <Button variant="primary" onClick={() => setRevealed((v) => !v)}>
                {revealed ? "Hide answer" : "Show answer"}
              </Button>

              {revealed && (
                <div className="rounded-xl border border-token surface-2 p-4 text-sm text-muted whitespace-pre-wrap">
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
