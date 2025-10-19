// frontend/src/pages/FlashcardsViewMode.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";

import { listFlashcards, deleteFlashcard, type Flashcard } from "../lib/api";

type LocationState = { cards?: Flashcard[]; className?: string };

const hasText = (v: unknown): v is string =>
  typeof v === "string" ? v.trim().length > 0 : !!(v as any) && String(v).trim().length > 0;

const normalizeText = (v: unknown) => (hasText(v) ? String(v).trim() : "");
const normalizeTags = (tags: unknown): string[] =>
  Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];

export default function FlashcardsViewMode() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const state = (useLocation().state || {}) as LocationState;

  const [cards, setCards] = useState<Flashcard[]>(Array.isArray(state.cards) ? state.cards : []);
  const [loading, setLoading] = useState<boolean>(!Array.isArray(state.cards));
  const [idx, setIdx] = useState<number>(0);
  const [revealed, setRevealed] = useState<boolean>(false);

  // the current card (fixes the undefined `current` usage)
  const current = useMemo<Flashcard | undefined>(() => cards[idx], [cards, idx]);

  // fetch on first load (when cards weren't passed through navigation state)
  useEffect(() => {
    let ignore = false;

    async function run() {
      if (Array.isArray(state.cards)) return; // already have cards
      setLoading(true);
      try {
        const n = Number(classId);
        const hasClass = Number.isFinite(n);
        const fetched = hasClass ? await listFlashcards(n) : [];
        if (!ignore) {
          setCards(Array.isArray(fetched) ? fetched : []);
          setIdx(0);
        }
      } catch {
        if (!ignore) toast.error("Failed to load flashcards.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    run();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // keyboard navigation: ←/→ to move, Space/Enter to flip
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!cards.length) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIdx((i) => Math.min(cards.length - 1, i + 1));
        setRevealed(false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
        setRevealed(false);
      } else if (e.key === " " || e.key === "Enter") {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON")) return;
        e.preventDefault();
        setRevealed((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  const progress = useMemo(() => (cards.length ? `${idx + 1} / ${cards.length}` : "0 / 0"), [idx, cards.length]);

  // delete current card 
  async function handleDelete(c?: Flashcard) {
    if (!c?.id) return;
    if (!confirm("Delete this flashcard?")) return;
    try {
      await deleteFlashcard(c.id);
      setCards((xs) => {
        const next = xs.filter((x) => x.id !== c.id);
        const newIdx = Math.min(Math.max(0, next.length - 1), idx);
        setIdx(newIdx);
        setRevealed(false);
        return next;
      });
      toast.success("Card deleted.");
    } catch {
      toast.error("Delete failed.");
    }
  }

  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-white">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              to="/classes"
              state={classId ? { selectId: Number(classId) } : undefined}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              title="Back to Classes"
              aria-label="Back to Classes"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="ml-1">
              <div className="text-lg font-extrabold leading-tight">{state.className || "Flashcards"}</div>
              <div className="text-[13px] text-slate-500">{progress}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={!cards.length || idx === 0}
              className="px-3 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setIdx((i) => Math.min(cards.length - 1, i + 1))}
              disabled={!cards.length || idx >= cards.length - 1}
              className="px-3 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              disabled={!cards.length}
              aria-pressed={revealed}
              className="px-3 h-9 rounded-xl border border-indigo-200 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {revealed ? "Hide answer" : "Show answer"}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(current)}
              disabled={!current?.id}
              className="px-3 h-9 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              title="Delete card"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} className="mx-auto max-w-4xl px-4 py-6">
        {loading ? (
          <SkeletonDeck />
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            No cards yet.
          </div>
        ) : (
          <FlashcardView card={current as Flashcard} revealed={revealed} />
        )}
      </div>
    </div>
  );
}

function FlashcardView({ card, revealed }: { card: Flashcard; revealed: boolean }) {
  const hint = normalizeText(card.hint);
  const tags = normalizeTags(card.tags);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(16,24,40,0.08)] p-5" aria-live="polite">
      {/* Question */}
      <h1 className="text-slate-900 font-semibold text-lg mb-2">Question</h1>
      <div className="text-slate-800 whitespace-pre-wrap break-words">{card.question}</div>

      {/* Answer */}
      <div className="mt-6">
        <div className="text-slate-900 font-semibold text-lg mb-2">Answer</div>
        <div id={`answer-${card.id ?? "x"}`} hidden={!revealed} className="text-slate-800 whitespace-pre-wrap break-words">
          {card.answer}
        </div>
        {!revealed && (
          <div
            aria-hidden="true"
            className="h-[86px] rounded-xl border border-dashed border-slate-300 bg-slate-50/60 grid place-items-center text-slate-500"
          >
            Press <kbd className="px-1 rounded bg-white border">Space</kbd> to reveal
          </div>
        )}
      </div>

      {/* Hint */}
      {hint && (
        <div className="mt-4 text-xs text-slate-600">
          <span className="font-semibold">Hint:</span> {hint}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-3 text-xs text-slate-600">
          <span className="font-semibold">Tags:</span>{" "}
          <span className="inline-flex flex-wrap gap-1 align-middle">
            {tags.slice(0, 6).map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                aria-label={`Tag ${t}`}
              >
                {t}
              </span>
            ))}
            {tags.length > 6 && (
              <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">+{tags.length - 6} more</span>
            )}
          </span>
        </div>
      )}
    </article>
  );
}

function SkeletonDeck() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="h-5 w-28 bg-slate-200 animate-pulse rounded mb-3" />
      <div className="space-y-2">
        <div className="h-4 bg-slate-200 animate-pulse rounded" />
        <div className="h-4 bg-slate-200 animate-pulse rounded" />
        <div className="h-4 bg-slate-200 animate-pulse rounded w-3/4" />
      </div>
      <div className="h-6" />
      <div className="h-5 w-24 bg-slate-200 animate-pulse rounded mb-3" />
      <div className="space-y-2">
        <div className="h-4 bg-slate-200 animate-pulse rounded" />
        <div className="h-4 bg-slate-200 animate-pulse rounded w-2/3" />
      </div>
    </div>
  );
}
