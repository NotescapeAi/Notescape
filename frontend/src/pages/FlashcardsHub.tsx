import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Layers3 } from "lucide-react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import {
  getFlashcardProgress,
  listClasses,
  listFiles,
  listFlashcards,
  type ClassRow,
  type Flashcard,
} from "../lib/api";

const LS_LAST_CLASS = "last_class_id";

type DeckSummary = {
  classRow: ClassRow;
  cards: Flashcard[];
  fileCount: number;
  totalCards: number;
  dueNow: number;
  dueToday: number;
  learning: number;
};

function isDue(card: Flashcard) {
  if (!card.due_at) return true;
  return new Date(card.due_at) <= new Date();
}

function formatUpdatedLabel(value?: string | null) {
  if (!value) return "Recently updated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function FlashcardsHub() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listClasses();
        const summaries = await Promise.all(
          rows.map(async (classRow) => {
            const [progress, cards, files] = await Promise.all([
              getFlashcardProgress(classRow.id).catch(() => null),
              listFlashcards(classRow.id).catch(() => []),
              listFiles(classRow.id).catch(() => []),
            ]);

            return {
              classRow,
              cards,
              fileCount: files.length,
              totalCards: progress?.total ?? cards.length,
              dueNow: progress?.due_now ?? cards.filter((card) => isDue(card)).length,
              dueToday: progress?.due_today ?? 0,
              learning: progress?.learning ?? 0,
            } satisfies DeckSummary;
          })
        );

        if (ignore) return;

        const stored = Number(localStorage.getItem(LS_LAST_CLASS));
        const nextSelected =
          Number.isFinite(stored) && summaries.some((deck) => deck.classRow.id === stored)
            ? stored
            : summaries[0]?.classRow.id ?? null;

        setDecks(summaries);
        setSelectedId(nextSelected);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  const orderedDecks = useMemo(() => {
    return [...decks].sort((a, b) => {
      if (a.classRow.id === selectedId) return -1;
      if (b.classRow.id === selectedId) return 1;
      if (b.dueNow !== a.dueNow) return b.dueNow - a.dueNow;
      return b.totalCards - a.totalCards;
    });
  }, [decks, selectedId]);

  const featuredDeck = orderedDecks[0] ?? null;

  function openDeck(classId: number) {
    localStorage.setItem(LS_LAST_CLASS, String(classId));
    setSelectedId(classId);
    navigate(`/classes/${classId}/flashcards`);
  }

  function reviewDeck(deck: DeckSummary) {
    const dueCards = deck.cards.filter((card) => isDue(card));
    localStorage.setItem(LS_LAST_CLASS, String(deck.classRow.id));
    setSelectedId(deck.classRow.id);
    navigate(`/classes/${deck.classRow.id}/flashcards/study`, {
      state: {
        cards: dueCards.length ? dueCards : deck.cards,
        className: deck.classRow.name,
        startIndex: 0,
      },
    });
  }

  return (
    <AppShell
      title="Flashcards"
      subtitle="Generate cards from your documents and review with spaced repetition."
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        {featuredDeck ? (
          <section className="card-accent p-7 text-inverse lg:p-8">
            <div className="card-accent-content flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-4">
                <div className="inline-flex w-fit items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.24em] text-inverse/78">
                  Study hub
                </div>
                <div className="space-y-2">
                  <h2 className="max-w-xl text-3xl font-semibold leading-tight text-white">
                    {featuredDeck.classRow.name}
                  </h2>
                  <p className="max-w-xl text-sm leading-6 text-inverse/80">
                    {featuredDeck.dueNow > 0
                      ? `${featuredDeck.dueNow} cards are ready for review.`
                      : "Open this deck to browse cards or continue studying."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-inverse/80">
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                    {featuredDeck.totalCards} cards
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                    {featuredDeck.dueToday} due today
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                    {featuredDeck.fileCount} source files
                  </span>
                </div>
              </div>

              <div className="min-w-[280px] rounded-[24px] border border-white/10 bg-black/12 p-5 backdrop-blur-sm lg:min-w-[340px]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-inverse/60">Due now</div>
                    <div className="mt-2 text-3xl font-semibold text-white">{featuredDeck.dueNow}</div>
                    <div className="mt-1 text-xs text-inverse/68">
                      {featuredDeck.learning > 0 ? `${featuredDeck.learning} still learning` : "Ready to review"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-inverse/60">Deck status</div>
                    <div className="mt-2 text-3xl font-semibold text-white">{featuredDeck.totalCards}</div>
                    <div className="mt-1 text-xs text-inverse/68">cards available</div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => reviewDeck(featuredDeck)}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/12 bg-white px-4 text-sm font-semibold text-[#32266f] shadow-[0_18px_40px_rgba(23,11,71,0.24)] transition-all duration-200 hover:bg-white/92"
                  >
                    {featuredDeck.dueNow > 0 ? "Review due" : "Study deck"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeck(featuredDeck.classRow.id)}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/14 bg-white/10 px-4 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/16"
                  >
                    Open deck
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="card-neutral p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--surface-accent-soft)] text-[var(--primary)]">
              <Layers3 className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-[var(--text-main)]">No flashcards yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
              Create a class, then generate flashcards from a document to begin review.
            </p>
            <div className="mt-5">
              <Button variant="primary" className="rounded-full px-5" onClick={() => navigate("/classes")}>
                Go to classes
              </Button>
            </div>
          </section>
        )}

        <section className="card-neutral p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-main)]">Your decks</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Browse by class and jump straight into review.
              </p>
            </div>
            {loading && <div className="text-sm text-[var(--text-muted)]">Loading decks...</div>}
          </div>

          {orderedDecks.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orderedDecks.map((deck, index) => {
                const isFeatured = index === 0 && deck.classRow.id === featuredDeck?.classRow.id;
                return (
                  <article
                    key={deck.classRow.id}
                    className={`rounded-[24px] border p-5 transition-all duration-200 ${
                      isFeatured
                        ? "border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[color-mix(in_srgb,var(--surface)_82%,var(--surface-accent-soft)_18%)] shadow-[var(--shadow-soft)]"
                        : "border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface)_90%,var(--surface-elevated)_10%)] shadow-[var(--shadow-soft)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--surface-accent-soft)_68%,var(--surface)_32%)] text-sm font-semibold tracking-[0.08em] text-[var(--primary)]">
                          {deck.classRow.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-base font-semibold tracking-[-0.02em] text-[var(--text-main)]">
                            {deck.classRow.name}
                          </div>
                          <div className="mt-1 text-xs text-[var(--text-muted)]">
                            {deck.classRow.subject ?? "Flashcard deck"}
                          </div>
                        </div>
                      </div>
                      {isFeatured && (
                        <span className="rounded-full border border-[color-mix(in_srgb,var(--primary)_22%,transparent)] bg-[var(--surface-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]">
                          Current
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                          Cards
                        </div>
                        <div className="mt-1 text-xl font-semibold text-[var(--text-main)]">{deck.totalCards}</div>
                      </div>
                      <div className="rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                          Due now
                        </div>
                        <div className="mt-1 text-xl font-semibold text-[var(--text-main)]">{deck.dueNow}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span>{deck.dueToday} due today</span>
                      <span className="text-[var(--text-muted-soft)]">•</span>
                      <span>{deck.fileCount} files</span>
                      <span className="text-[var(--text-muted-soft)]">•</span>
                      <span>{formatUpdatedLabel(deck.classRow.updated_at ?? deck.classRow.created_at)}</span>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button variant="primary" className="rounded-full px-4" onClick={() => reviewDeck(deck)}>
                        {deck.dueNow > 0 ? "Review" : "Study"}
                      </Button>
                      <Button className="rounded-full px-4" onClick={() => openDeck(deck.classRow.id)}>
                        Open
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !loading ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-[var(--border-soft)] bg-[var(--surface-2)] px-5 py-8 text-center text-sm text-[var(--text-secondary)]">
              No classes are available yet.
            </div>
          ) : null}
        </section>

        {orderedDecks.length > 1 && (
          <section className="card-neutral p-6">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted-soft)]">
              Ready to review
            </div>
            <div className="mt-2 text-lg font-semibold text-[var(--text-main)]">
              Decks with cards due now
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {orderedDecks.filter((deck) => deck.dueNow > 0).slice(0, 4).map((deck) => (
                <button
                  key={`due-${deck.classRow.id}`}
                  type="button"
                  onClick={() => reviewDeck(deck)}
                  className="flex w-full items-center justify-between rounded-[20px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface)_90%,var(--surface-elevated)_10%)] px-4 py-3 text-left transition-all duration-200 hover:border-[color-mix(in_srgb,var(--primary)_18%,var(--border-soft))] hover:bg-[var(--surface-accent-soft)]"
                >
                  <div>
                    <div className="font-semibold text-[var(--text-main)]">{deck.classRow.name}</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{deck.dueNow} cards due</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--primary)]" />
                </button>
              ))}
              {orderedDecks.every((deck) => deck.dueNow === 0) && (
                <div className="rounded-[20px] border border-dashed border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                  No decks need review right now.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
