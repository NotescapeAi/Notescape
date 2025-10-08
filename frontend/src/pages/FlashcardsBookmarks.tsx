// src/pages/FlashcardsBookmarks.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { listClasses, listFlashcards, deleteFlashcard, type Flashcard } from "../lib/api";
import useBookmarks from "../lib/bookmarks";
import KebabMenu from "../components/KebabMenu";

function expandLegacy(c: Flashcard): Flashcard[] {
  try {
    if (typeof c.answer === "string" && c.answer.includes('"cards"')) {
      const data = JSON.parse(c.answer);
      if (Array.isArray(data?.cards)) {
        return data.cards.map((x: any, i: number) => ({
          id: `legacy-${c.id}-${i}`,
          class_id: c.class_id,
          source_chunk_id: c.source_chunk_id ?? null,
          question: String(x?.question ?? c.question ?? "").trim(),
          answer: String(x?.answer ?? "").trim(),
          hint: x?.hint ?? null,
          difficulty: (x?.difficulty ?? c.difficulty ?? "medium") as any,
          tags: Array.isArray(x?.tags) ? x.tags : Array.isArray(c.tags) ? c.tags : [],
        })) as any;
      }
    }
  } catch {}
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
        if (!id) { setCardsRaw([]); return; }

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
    return () => { mounted = false; };
  }, [id]);

  const expanded = useMemo(() => cardsRaw.flatMap(expandLegacy), [cardsRaw]);

  // show only bookmarked in this page
  const bookmarkedCards = expanded.filter(c => bm.isBookmarked(String(c.id)));

  return (
    <div style={{ background: "linear-gradient(180deg,#fafafa,#fff)", minHeight: "100vh", padding: "20px 20px 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>
            Bookmarks · <span style={{ color: "#4F46E5" }}>{className}</span>
          </h1>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
            {`Showing ${bookmarkedCards.length} bookmarked`}
          </div>
        </div>

        <div style={{ display: "inline-flex", gap: 8 }}>
          {/* Back to Flashcards page */}
          <button
            onClick={goBack}
            style={{ padding: "6px 12px", borderRadius: 12, border: "1px solid #cfd4dc", background: "#fff", cursor: "pointer" }}
            title={`Back to ${className} flashcards`}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ArrowLeft style={{ width: 16, height: 16 }} /> Back
            </span>
          </button>
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: "#ef4444" }}>{error}</div>}

      {!loading && !error && bookmarkedCards.length === 0 && (
        <div style={{ color: "#6B7280", marginTop: 4 }}>
          No bookmarks yet.
        </div>
      )}

      {!loading && !error && bookmarkedCards.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {bookmarkedCards.map((c) => {
            const tags = Array.isArray(c.tags)
              ? c.tags.map((t) => String(t).trim()).filter(Boolean)
              : [];
            const startIndex = bookmarkedCards.findIndex(fc => String(fc.id) === String(c.id));

            return (
              <div
                key={c.id}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: 16,
                  padding: 14,
                  background: "#fff",
                  transition: "box-shadow .15s ease, transform .05s ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,.04)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#4F46E5", fontWeight: 700, background: "#EEF2FF", padding: "3px 10px", borderRadius: 999 }}>
                      {(c as any).difficulty ? String((c as any).difficulty).toUpperCase() : "MEDIUM"}
                    </span>
                    <span style={{ fontSize: 11, color: "#065F46", fontWeight: 700, background: "#ECFDF5", padding: "3px 10px", borderRadius: 999 }}>
                      {className}
                    </span>
                  </div>

                  {/* Same 4-item kebab menu */}
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
                            await deleteFlashcard(c.id as any);
                            // also drop from local list so UI updates
                            setCardsRaw(prev => prev.filter(x => x.id !== c.id));
                          } catch (err: any) {
                            alert(err?.message || "Failed to delete flashcard");
                          }
                        },
                      },
                    ]}
                  />
                </div>

                <div style={{ fontWeight: 800, marginBottom: 10, color: "#111827" }}>
                  Q: {c.question}
                </div>

                <details>
                  <summary style={{ color: "#7B5FEF", cursor: "pointer", userSelect: "none" }}>► Show answer</summary>
                  <div style={{ marginTop: 8, lineHeight: 1.55, color: "#111827", whiteSpace: "pre-wrap" }}>
                    {c.answer}
                  </div>
                </details>

                {c.hint && String(c.hint).trim() && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
                    <span style={{ fontWeight: 600 }}>Hint:</span> {String(c.hint).trim()}
                  </div>
                )}

                {tags.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
                    <span style={{ fontWeight: 600 }}>Tags:</span> {tags.join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
