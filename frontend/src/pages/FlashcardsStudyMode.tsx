// frontend/src/pages/FlashcardsStudyMode.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff, Play } from "lucide-react";
import useBookmarks from "../lib/bookmarks";
import KebabMenu from "../components/KebabMenu";

/* --------- Types (match backend) --------- */
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

/* --------- API helpers (SR + flashcards) --------- */
async function fetchDueCards(classId: number, limit = 9999) {
  const r = await fetch(`/api/sr/due/${classId}?limit=${limit}`, {
    headers: { "X-User-Id": "dev-user" },
  });
  if (!r.ok) throw new Error(`Failed to fetch due cards (${r.status})`);
  return (await r.json()) as Flashcard[];
}

async function fetchAllCardsForClass(classId: number) {
  const r = await fetch(`/api/flashcards/${classId}`, {
    headers: { "X-User-Id": "dev-user" },
  });
  if (!r.ok) throw new Error(`Failed to fetch all cards (${r.status})`);
  const j = await r.json();
  return (Array.isArray(j) ? j : j.cards ?? []) as Flashcard[];
}

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
  return await r.json(); // { next_due_at?: string, ... }
}

async function deleteCard(cardId: string) {
  const r = await fetch(`/api/flashcards/${cardId}`, {
    method: "DELETE",
    headers: { "X-User-Id": "dev-user" },
  });
  if (!r.ok) throw new Error(`Delete failed (${r.status})`);
}

export default function FlashcardsStudyMode() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const state = (useLocation().state || {}) as LocationState;
  const className = state.className || "Untitled";

  const bm = useBookmarks();

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState<number>(Math.max(0, state.startIndex ?? 0));
  const [revealed, setRevealed] = useState(false);

  const [useSR, setUseSR] = useState(true);
  const [loading, setLoading] = useState(false);
  const [srEmpty, setSrEmpty] = useState(false);
  const [allTotal, setAllTotal] = useState<number>(0);

  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const current = cards[idx];

  useEffect(() => {
    if (!classId) return;
    loadCards(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function loadCards(sr: boolean) {
    if (!classId) return;
    setLoading(true);
    try {
      const list: Flashcard[] = sr
        ? await fetchDueCards(Number(classId), 9999)
        : await fetchAllCardsForClass(Number(classId));

      setCards(list ?? []);
      setIdx(0);
      setRevealed(false);
      setSrEmpty((list ?? []).length === 0);
      if (!sr) setAllTotal((list ?? []).length);
    } catch (err) {
      console.error("Failed to load cards", err);
      setCards([]);
      setSrEmpty(true);
    } finally {
      setLoading(false);
    }
  }

  const progressPct = useMemo(
    () => (cards.length ? Math.round((reviewedIds.size / cards.length) * 100) : 0),
    [cards.length, reviewedIds]
  );

  useEffect(() => {
    if (!cards[idx]) return;
    setVisitedIds((s) => {
      if (s.has(cards[idx].id)) return s;
      const n = new Set(s);
      n.add(cards[idx].id);
      return n;
    });
  }, [idx, cards]);

  // Poll every 30s for new due cards when SR is ON
  useEffect(() => {
    if (!useSR || !classId) return;
    const t = setInterval(() => loadCards(true), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSR, classId]);

  async function handleReview(card: Flashcard | undefined, rating: 1 | 2 | 3 | 4 | 5) {
    if (!card?.id || posting) return;
    setPosting(true);
    setStatusMessage("");
    try {
      const res = await submitReview(card.id, rating);

      if (res?.next_due_at) {
        const nextDue = new Date(res.next_due_at);
        const mins = Math.max(1, Math.round((nextDue.getTime() - Date.now()) / 60000));
        setStatusMessage(`✅ Scheduled again in ${mins} minute(s).`);
        setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, due_at: res.next_due_at } : c)));
      }

      setReviewedIds((prev) => new Set(prev).add(card.id));
      setIdx((i) => Math.min(i + 1, cards.length - 1));

      if (useSR) {
        if (res?.next_due_at) {
          const delay = Math.max(0, new Date(res.next_due_at).getTime() - Date.now());
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
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to={`/classes/${classId}/flashcards`}
              replace
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>

            <div className="text-sm text-slate-500">
              Study Mode · {className}
              <span className="ml-2 text-xs text-slate-500">
                {useSR ? `Due: ${cards.length} · Total: ${allTotal}` : `All Cards: ${cards.length}`}
              </span>
            </div>

            <button
              onClick={() => {
                const next = !useSR;
                setUseSR(next);
                loadCards(next);
              }}
              className={`ml-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                useSR ? "bg-emerald-50 border-emerald-300" : "bg-slate-100 hover:bg-slate-200"
              }`}
            >
              <Play className="w-4 h-4" /> {useSR ? "SR: ON" : "SR: OFF"}
            </button>
          </div>

          <KebabMenu
            items={[
              {
                label: bm.isBookmarked(String(current?.id)) ? "Remove Bookmark" : "Bookmark",
                onClick: () => current?.id && bm.toggle(String(current.id)),
              },
              {
                label: "View Mode",
                onClick: () =>
                  navigate(`/classes/${classId}/flashcards/view`, {
                    state: { cards, className },
                  }),
              },
              { label: "Study Mode", onClick: () => {} },
              {
                label: "Delete",
                onClick: async () => {
                  if (!current) return;
                  if (!confirm("Delete this flashcard?")) return;
                  try {
                    await deleteCard(String(current.id));
                    setCards((prev) => {
                      const next = prev.filter((x) => x.id !== current.id);
                      const newIdx = Math.min(next.length - 1, idx);
                      if (next.length === 0) {
                        requestAnimationFrame(() =>
                          navigate(`/classes/${classId}/flashcards`, { replace: true })
                        );
                      } else {
                        setIdx(Math.max(0, newIdx));
                      }
                      return next;
                    });
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    alert(message || "Failed to delete flashcard");
                  }
                },
              },
            ]}
          />
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div>Progress: {progressPct}%</div>
            <div>{cards.length > 0 ? `${idx + 1} / ${cards.length}` : "0 / 0"}</div>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-2 bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="text-center py-14 text-slate-500">Loading…</div>
          ) : cards.length === 0 ? (
            <div className="text-center py-14">
              <div className="text-lg font-semibold text-slate-800">No cards to study right now</div>
              <p className="text-sm text-slate-500 mt-1">
                {useSR
                  ? srEmpty
                    ? "Nothing is due in spaced repetition for this class."
                    : "Loading…"
                  : "Load or generate flashcards to start studying."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-slate-500">CARD #{idx + 1}</div>
                <button
                  onClick={() => setRevealed((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-slate-50"
                >
                  {revealed ? (
                    <>
                      <EyeOff className="w-4 h-4" /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" /> Reveal
                    </>
                  )}
                </button>
              </div>

              <div className="font-extrabold mb-2 text-slate-900">Q: {current?.question}</div>

              <div className="mb-3">
                {revealed ? (
                  <div className="text-slate-800 whitespace-pre-wrap">A: {current?.answer}</div>
                ) : (
                  <button
                    className="font-bold text-violet-600 hover:text-violet-700"
                    onClick={() => setRevealed(true)}
                  >
                    Show Answer
                  </button>
                )}
              </div>

              {/* schedule message */}
              {statusMessage && (
                <div className="mt-2 text-sm text-emerald-600 font-medium">{statusMessage}</div>
              )}

              {/* Rating */}
              <div className="mt-6">
                <div className="text-xs font-medium text-slate-500 mb-2">Rate your confidence</div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      disabled={posting || !current}
                      onClick={() => handleReview(current, r as 1 | 2 | 3 | 4 | 5)}
                      className={`px-3 py-1 rounded-md border text-sm transition ${
                        posting ? "opacity-50 cursor-not-allowed" : ""
                      } ${
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

              {/* Nav */}
              <div className="mt-6 flex justify-between items-center">
                <button
                  disabled={idx === 0 || posting}
                  onClick={() => {
                    setIdx((i) => Math.max(0, i - 1));
                    setRevealed(false);
                  }}
                  className="p-2 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  disabled={idx === cards.length - 1 || posting}
                  onClick={() => {
                    setIdx((i) => Math.min(cards.length - 1, i + 1));
                    setRevealed(false);
                  }}
                  className="p-2 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
