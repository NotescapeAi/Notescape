import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff, Play } from "lucide-react";
import KebabMenu from "../components/KebabMenu";
import useBookmarks from "../lib/bookmarks";

export type Flashcard = {
  class_id: number;
  id: string;
  question: string;
  answer: string;
  hint?: string | null;
  difficulty?: string | null;
  due_at?: string | null;
};

type LocationState = {
  cards?: Flashcard[];
  className?: string;
  startIndex?: number;
};

// Helper Functions to fetch cards
async function fetchDueCards(classId: number, limit = 9999) {
  const r = await fetch(`/api/sr/due/${classId}?limit=${limit}`, {
    headers: { "X-User-Id": "dev-user" },
  });
  if (!r.ok) throw new Error(`Failed to fetch due cards (${r.status})`);
  return await r.json();
}

async function fetchAllCardsForClass(classId: number) {
  const r = await fetch(`/api/flashcards/${classId}`, {
    headers: { "X-User-Id": "dev-user" },
  });
  if (!r.ok) throw new Error(`Failed to fetch all cards (${r.status})`);
  const j = await r.json();
  return Array.isArray(j) ? j : j.cards ?? [];
}

// Submit review function
async function submitReview(card_id: string, rating: 1 | 2 | 3 | 4 | 5) {
  const r = await fetch(`/api/sr/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": "dev-user",
    },
    body: JSON.stringify({ card_id, rating }),
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(`Review failed (${r.status}): ${msg}`);
  }
  return await r.json();
}

export default function FlashcardsStudyMode() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const state = (useLocation().state || {}) as LocationState;

  const bm = useBookmarks();

  // Declare the state only once
  const [cards, setCards] = useState<Flashcard[]>(Array.isArray(state.cards) ? state.cards : []);
  const [idx, setIdx] = useState<number>(typeof state.startIndex === "number" && state.startIndex >= 0 ? state.startIndex : 0);
  const [revealed, setRevealed] = useState(false);
  const [useSR, setUseSR] = useState(true);
  const [loading, setLoading] = useState(false);
  const [srEmpty, setSrEmpty] = useState(false);
  const [allTotal, setAllTotal] = useState<number>(0);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const hasPrev = idx > 0;
  const hasNext = idx < cards.length - 1;

  useEffect(() => {
    if (!classId) return;
    loadCards(true);
  }, [classId]);

  const progressPct = useMemo(
    () => (cards.length ? Math.round(((idx + 1) / cards.length) * 100) : 0),
    [idx, cards.length]
  );

  async function loadCards(isSR: boolean) {
    if (!classId) return;
    setLoading(true);
    try {
      const list: Flashcard[] = isSR
        ? await fetchDueCards(Number(classId), 9999)
        : await fetchAllCardsForClass(Number(classId));

      setCards(list ?? []);
      setIdx(0);
      setRevealed(false);
      setSrEmpty((list ?? []).length === 0);
      if (!isSR) setAllTotal((list ?? []).length);
    } catch (err) {
      console.error("Failed to load cards", err);
      setCards([]);
      setSrEmpty(true);
    } finally {
      setLoading(false);
    }
  }

  // Keyboard events for navigating through cards
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && hasPrev) { setIdx(i => Math.max(0, i - 1)); setRevealed(false); }
      if (e.key === "ArrowRight" && hasNext) { setIdx(i => Math.min(cards.length - 1, i + 1)); setRevealed(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, cards.length]);

  // Poll every 30s to catch due cards while waiting
  useEffect(() => {
    if (!useSR || !classId) return;
    const t = setInterval(() => loadCards(true), 30_000);
    return () => clearInterval(t);
  }, [useSR, classId]);

  async function handleReview(card: Flashcard, rating: 1 | 2 | 3 | 4 | 5) {
    if (!card?.id) return;
    if (posting) return;
    setPosting(true);
    setStatusMessage("");

    try {
      const res = await submitReview(card.id, rating);

      if (res?.next_due_at) {
        const nextDue = new Date(res.next_due_at);
        const mins = Math.round((nextDue.getTime() - Date.now()) / 60000);
        setStatusMessage(`✅ Scheduled again in ${mins <= 0 ? 1 : mins} minute(s).`);

        setCards((prev) =>
          prev.map((c) => (c.id === card.id ? { ...c, due_at: res.next_due_at } : c))
        );
      }

      setReviewedIds((prev) => new Set(prev).add(card.id));
      setIdx((prevIdx) => Math.min(prevIdx + 1, cards.length - 1));

      if (useSR) {
        if (res?.next_due_at) {
          const nextDueTime = new Date(res.next_due_at).getTime();
          const delay = Math.max(0, nextDueTime - Date.now());
          setTimeout(() => loadCards(true), delay + 2000);
        } else {
          setTimeout(() => loadCards(true), 500);
        }
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to record review");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-white">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="text-sm text-slate-500 mb-4">Progress: {progressPct}%</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="font-extrabold mb-2 text-slate-900">Q: {cards[idx]?.question}</div>
          <div className="mb-3">
            {revealed ? (
              <div className="text-slate-800 whitespace-pre-wrap">A: {cards[idx]?.answer}</div>
            ) : (
              <button
                className="font-bold text-violet-600 hover:text-violet-700"
                onClick={() => setRevealed(true)}
              >
                Show Answer
              </button>
            )}
          </div>

          {statusMessage && (
            <div className="mt-2 text-sm text-emerald-600 font-medium">{statusMessage}</div>
          )}

          <div className="mt-6">
            <div className="text-xs font-medium text-slate-500 mb-2">Rate your confidence</div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  disabled={posting}
                  onClick={() => handleReview(cards[idx], r as 1 | 2 | 3 | 4 | 5)}
                  className={`px-3 py-1 rounded-md border text-sm transition ${posting ? "opacity-50 cursor-not-allowed" : ""} ${
                    r <= 2
                      ? "border-rose-300 hover:bg-rose-50"
                      : r === 3
                      ? "border-amber-300 hover:bg-amber-50"
                      : "border-emerald-300 hover:bg-emerald-50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-between items-center">
            <button
              disabled={idx === 0 || posting}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              className="p-2 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              disabled={idx === cards.length - 1 || posting}
              onClick={() => setIdx((i) => Math.min(cards.length - 1, i + 1))}
              className="p-2 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
