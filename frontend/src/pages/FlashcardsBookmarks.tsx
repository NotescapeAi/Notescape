import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { listClasses, listFlashcards, deleteFlashcard, type Flashcard } from "../lib/api";
import useBookmarks from "../lib/bookmarks";
import KebabMenu from "../components/KebabMenu";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";

function expandLegacy(c: Flashcard): Flashcard[] {
  try {
    if (typeof c.answer === "string" && c.answer.includes("\"cards\"")) {
      const data = JSON.parse(c.answer);
      if (Array.isArray(data?.cards)) {
        return data.cards.map((x: { [key: string]: any }, i: number) => ({
          id: `legacy-${c.id}-${i}`,
          class_id: c.class_id,
          source_chunk_id: c.source_chunk_id ?? null,
          question: String(x?.question ?? c.question ?? "").trim(),
          answer: String(x?.answer ?? "").trim(),
          hint: x?.hint ?? null,
          difficulty: (x?.difficulty ?? c.difficulty ?? "medium") as string,
          tags: Array.isArray(x?.tags) ? x.tags : Array.isArray(c.tags) ? c.tags : [],
        }));
      }
    }
  } catch (error) {
    console.error(error);
  }
  const tags = Array.isArray(c.tags) ? c.tags : [];
  return [{ ...c, tags }];
}

export default function FlashcardsBookmarks() {
  const { classId } = useParams();
  const id = Number(classId);
  const navigate = useNavigate();
  const goBack = () => navigate(`/classes/${classId}/flashcards`);

  const [cardsRaw, setCardsRaw] = useState<Flashcard[]>([]);
  const [className, setClassName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const bm = useBookmarks();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        if (!id) {
          setCardsRaw([]);
          return;
        }

        const [cards, classes] = await Promise.all([listFlashcards(id), listClasses()]);
        if (!mounted) return;

        setCardsRaw(Array.isArray(cards) ? cards : []);
        const cls = classes.find((c) => c.id === id);
        setClassName(cls?.name || `Class #${id}`);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to load flashcards");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id) || !id) return;
    localStorage.setItem("last_class_id", String(id));
  }, [id]);

  const expanded = useMemo(() => cardsRaw.flatMap(expandLegacy), [cardsRaw]);
  const bookmarkedCards = expanded.filter((c) => bm.isBookmarked(String(c.id)));

  return (
    <AppShell
      title="Bookmarks"
      breadcrumbs={["Flashcards", "Bookmarks"]}
      subtitle={className}
      backLabel="Back to Flashcards"
      backTo={classId ? `/classes/${classId}/flashcards` : "/classes"}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--primary)]">Bookmarks</div>
            <h1 className="mt-2 text-2xl font-semibold text-main">{className}</h1>
            <div className="text-sm text-muted">Showing {bookmarkedCards.length} bookmarked</div>
          </div>
          <Button onClick={goBack} className="rounded-full">
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </span>
          </Button>
        </div>

        {loading && <div className="text-sm text-muted">Loading...</div>}
        {error && <div className="text-sm text-[var(--accent-pink)]">{error}</div>}

        {!loading && !error && bookmarkedCards.length === 0 && (
          <div className="text-sm text-muted">No bookmarks yet.</div>
        )}

        {!loading && !error && bookmarkedCards.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {bookmarkedCards.map((c) => {
              const tags = Array.isArray(c.tags)
                ? c.tags.map((t) => String(t).trim()).filter(Boolean)
                : [];
              const startIndex = bookmarkedCards.findIndex((fc) => String(fc.id) === String(c.id));

              return (
                <div
                  key={c.id}
                  className="rounded-[24px] surface p-4 shadow-[0_12px_30px_rgba(15,16,32,0.08)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-token surface-2 px-2 py-0.5 font-semibold text-[var(--primary)]">
                        {(c as any).difficulty ? String((c as any).difficulty).toUpperCase() : "MEDIUM"}
                      </span>
                      <span className="rounded-full border border-token surface-2 px-2 py-0.5 text-muted">
                        {className}
                      </span>
                    </div>
                    <KebabMenu
                      items={[
                        {
                          label: bm.isBookmarked(String(c.id)) ? "Remove Bookmark" : "Bookmark",
                          onClick: () => bm.toggle(String(c.id)),
                        },
                        {
                          label: "View Mode",
                          onClick: () =>
                            navigate(`/classes/${id}/flashcards/view`, {
                              state: { cards: bookmarkedCards, className },
                            }),
                        },
                        {
                          label: "Study Mode",
                          onClick: () =>
                            navigate(`/classes/${id}/flashcards/study`, {
                              state: { cards: bookmarkedCards, className, startIndex },
                            }),
                        },
                        {
                          label: "Delete",
                          onClick: async () => {
                            if (!confirm("Delete this flashcard?")) return;
                            try {
                              await deleteFlashcard(String(c.id));
                              setCardsRaw((prev) => prev.filter((x) => x.id !== c.id));
                            } catch (err: any) {
                              alert(err?.message || "Failed to delete flashcard");
                            }
                          },
                        },
                      ]}
                    />
                  </div>

                  <div className="mt-3 text-base font-semibold text-main">Q: {c.question}</div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--primary)]">
                      Show answer
                    </summary>
                    <div className="mt-2 text-sm text-muted whitespace-pre-wrap">
                      {c.answer}
                    </div>
                  </details>

                  {c.hint && String(c.hint).trim() && (
                    <div className="mt-3 text-xs text-muted">
                      <span className="font-semibold">Hint:</span> {String(c.hint).trim()}
                    </div>
                  )}

                  {tags.length > 0 && (
                    <div className="mt-3 text-xs text-muted">
                      <span className="font-semibold">Tags:</span> {tags.join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
