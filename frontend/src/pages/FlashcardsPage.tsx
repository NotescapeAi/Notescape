// src/pages/FlashcardsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  listFlashcards,
  deleteFlashcard,
  listClasses,
  listFiles,
  getFlashcardProgress,
  type Flashcard,
} from "../lib/api";
import AppSidebar from "../components/AppSidebar";
import useBookmarks from "../lib/bookmarks";
import KebabMenu from "../components/KebabMenu";
import { ArrowLeft } from "lucide-react";

/** exactly what your UI already uses */
type Diff = "all" | "hard" | "medium" | "easy";

/** UI-only extension so TS stops complaining (no backend change) */
type UIFlashcard = Flashcard & {
  id: string | number;              // legacy ids like "legacy-123-0"
  source_chunk_id?: string | null;  // page references this
  difficulty?: Diff;                // page filters by this
};

function dueStatus(card: UIFlashcard) {
  const dueAt = card.due_at ? new Date(card.due_at) : null;
  if (!dueAt) return "Due";
  if (dueAt <= new Date()) return "Due";
  if ((card.repetitions ?? 0) === 0) return "Learning";
  return "Scheduled";
}

function expandLegacy(c: UIFlashcard): UIFlashcard[] {
  try {
    if (typeof c.answer === "string" && c.answer.includes('"cards"')) {
      const data = JSON.parse(c.answer);
      if (Array.isArray(data?.cards)) {
        return data.cards.map((x: any, i: number) => ({
          id: `legacy-${c.id}-${i}`,
          class_id: (c as any).class_id,
          source_chunk_id: c.source_chunk_id ?? null,
          question: String(x?.question ?? c.question ?? "").trim(),
          answer: String(x?.answer ?? "").trim(),
          hint: x?.hint ?? null,
          difficulty: (x?.difficulty ?? c.difficulty ?? "medium") as Diff,
          tags: Array.isArray(x?.tags)
            ? x.tags
            : Array.isArray(c.tags)
            ? c.tags
            : [],
        }));
      }
    }
  } catch {
    /* ignore legacy parse errors */
  }

  const tags = Array.isArray(c.tags) ? c.tags : [];
  const difficulty = (c.difficulty ?? "medium") as Diff;
  return [{ ...c, tags, difficulty }];
}

export default function FlashcardsPage() {
  const { classId } = useParams();
  const id = Number(classId);
  const navigate = useNavigate();

  const [cardsRaw, setCardsRaw] = useState<UIFlashcard[]>([]);
  const [className, setClassName] = useState<string>("");
  const [filter, setFilter] = useState<Diff>("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);
  const [fileFilter, setFileFilter] = useState<string>("all");
  const [progress, setProgress] = useState<{ total: number; due_now: number; due_today: number; learning: number } | null>(null);

  // "Bookmark folder" visibility
  const [isBookmarkOpen, setBookmarkOpen] = useState(false);
  const bm = useBookmarks();

  const toggleBookmarkFolder = () => setBookmarkOpen((v) => !v);

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

        const [cards, classes, filesRes, prog] = await Promise.all([
          listFlashcards(id, fileFilter === "all" ? undefined : fileFilter),
          listClasses(),
          listFiles(id),
          getFlashcardProgress(id, fileFilter === "all" ? undefined : fileFilter),
        ]);
        if (!mounted) return;

        setCardsRaw(Array.isArray(cards) ? (cards as UIFlashcard[]) : []);
        const cls = classes.find((c) => c.id === id);
        setClassName(cls?.name || `Class #${id}`);
        setFiles((filesRes ?? []).map((f) => ({ id: f.id, filename: f.filename })));
        setProgress(prog ?? null);
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
  }, [id, fileFilter]);

  const expanded = useMemo(() => cardsRaw.flatMap(expandLegacy), [cardsRaw]);
  const filtered =
    filter === "all"
      ? expanded
      : expanded.filter((c) => (c.difficulty ?? "medium") === filter);

  // main list hides bookmarked
  const visible = filtered.filter((c) => !bm.isBookmarked(String(c.id)));
  const bookmarkedCards = filtered.filter((c) => bm.isBookmarked(String(c.id)));
  const bookmarkedCnt = bookmarkedCards.length;

  // Fixed navigation functions - use the exact card list that's being displayed
  const handleView = (cardsList: UIFlashcard[], startIndex: number = 0) => {
    navigate(`/classes/${id}/flashcards/view`, {
      state: { 
        cards: cardsList, 
        className, 
        startIndex: Math.max(0, startIndex) 
      },
    });
  };

  const handleStudy = (cardsList: UIFlashcard[], startIndex: number = 0) => {
    navigate(`/classes/${id}/flashcards/study`, {
      state: { 
        cards: cardsList, 
        className, 
        startIndex: Math.max(0, startIndex) 
      },
    });
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <AppSidebar />
      <main className="flex-1 p-6">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>
            Flashcards · <span style={{ color: "#4F46E5" }}>{className}</span>
          </h1>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
            {filter === "all"
              ? `Total: ${visible.length}`
              : `Showing ${visible.length} of ${expanded.length} (${filter})`}
          </div>
        </div>

        <div style={{ display: "inline-flex", gap: 8 }}>
          {/* Bookmark folder (top-right) */}
          <button
            onClick={toggleBookmarkFolder}
            style={{
              padding: "6px 12px",
              borderRadius: 12,
              border: "1px solid #cfd4dc",
              background: "#fff",
              cursor: "pointer",
            }}
            title="View bookmarked cards"
          >
            ★ Bookmarks ({bookmarkedCnt})
          </button>

          {/* Back to classes page */}
          <Link
            to="/classes"
            state={classId ? { selectId: Number(classId) } : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#475569",
              textDecoration: "none",
              cursor: "pointer",
            }}
            title="Back to Classes"
            aria-label="Back to Classes"
          >
            <ArrowLeft style={{ width: "20px", height: "20px" }} />
          </Link>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {(["all", "easy", "medium", "hard"] as Diff[]).map((d) => (
          <button
            key={d}
            onClick={() => setFilter(d)}
            style={{
              padding: "6px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: filter === d ? "#EEF2FF" : "#fff",
              color: filter === d ? "#4F46E5" : "#111827",
              cursor: "pointer",
            }}
          >
            {d.toUpperCase()}
          </button>
        ))}
        <select
          value={fileFilter}
          onChange={(e) => setFileFilter(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <option value="all">All files</option>
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.filename}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Due now</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{progress?.due_now ?? 0}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Due today</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{progress?.due_today ?? 0}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Learning</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{progress?.learning ?? 0}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{progress?.total ?? 0}</div>
        </div>
      </div>

      {/* Bookmark folder drawer */}
      {isBookmarkOpen && (
        <div
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            background: "#fff",
            marginBottom: 16,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 700 }}>
              Bookmarked ({bookmarkedCards.length})
            </div>
            <button
              onClick={() => setBookmarkOpen(false)}
              style={{
                padding: "4px 8px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          {bookmarkedCards.length === 0 ? (
            <div style={{ color: "#6B7280" }}>No bookmarks yet.</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
              {bookmarkedCards.map((c) => {
                const tags = Array.isArray(c.tags)
                  ? c.tags.map((t) => String(t).trim()).filter(Boolean)
                  : [];
                const startIndex = bookmarkedCards.findIndex(
                  (fc) => String(fc.id) === String(c.id)
                );
                const status = dueStatus(c);
                const nextReview = c.due_at ? new Date(c.due_at).toLocaleString() : "Due now";

                return (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: 16,
                      padding: 14,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "#4F46E5",
                            fontWeight: 700,
                            background: "#EEF2FF",
                            padding: "3px 10px",
                            borderRadius: 999,
                          }}
                        >
                          {(c.difficulty || "medium").toUpperCase()}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#065F46",
                            fontWeight: 700,
                            background: "#ECFDF5",
                            padding: "3px 10px",
                            borderRadius: 999,
                          }}
                        >
                          {className}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: status === "Due" ? "#B42318" : "#344054",
                            fontWeight: 700,
                            background: status === "Due" ? "#FEF3F2" : "#F2F4F7",
                            padding: "3px 10px",
                            borderRadius: 999,
                          }}
                        >
                          {status}
                        </span>
                      </div>

                      {/* kebab menu (same 4 actions) */}
                      <KebabMenu
                        items={[
                          {
                            label: bm.isBookmarked(String(c.id))
                              ? "Remove Bookmark"
                              : "Bookmark",
                            onClick: () => bm.toggle(String(c.id)),
                          },
                          {
                            label: "View Mode",
                            onClick: () => handleView(bookmarkedCards, startIndex),
                          },
                          {
                            label: "Study Mode",
                            onClick: () =>
                              handleStudy(bookmarkedCards, startIndex),
                          },
                          {
                            label: "Delete",
                            onClick: async () => {
                              if (!confirm("Delete this flashcard?")) return;
                              try {
                                await deleteFlashcard(String(c.id));
                                setCardsRaw((prev) =>
                                  prev.filter((x) => x.id !== c.id)
                                );
                              } catch (err: any) {
                                alert(
                                  err?.message || "Failed to delete flashcard"
                                );
                              }
                            },
                          },
                        ]}
                      />
                    </div>

                    <div
                      style={{
                        fontWeight: 800,
                        marginBottom: 10,
                        color: "#111827",
                      }}
                    >
                      Q: {c.question}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                      Next review: {nextReview}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                      Reps: {c.repetitions ?? 0} • Ease: {(c.ease_factor ?? 2.5).toFixed(2)}
                    </div>
                    <details>
                      <summary
                        style={{
                          color: "#7B5FEF",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        ► Show answer
                      </summary>
                      <div
                        style={{
                          marginTop: 8,
                          lineHeight: 1.55,
                          color: "#111827",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {c.answer}
                      </div>
                    </details>

                    {c.hint && String(c.hint).trim() && (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          color: "#6B7280",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Hint:</span>{" "}
                        {String(c.hint).trim()}
                      </div>
                    )}

                    {tags.length > 0 && (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          color: "#6B7280",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Tags:</span>{" "}
                        {tags.join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main list (not bookmarked) */}
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: "#ef4444" }}>{error}</div>}

      {!loading && !error && visible.length === 0 && (
        <div style={{ color: "#6B7280", marginTop: 4 }}>
          No un-bookmarked flashcards. Click <strong>Bookmarks</strong> to see
          saved ones.
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {visible.map((c) => {
            const isLegacy = String(c.id).startsWith("legacy-");
            const tags = Array.isArray(c.tags)
              ? c.tags.map((t) => String(t).trim()).filter(Boolean)
              : [];
            const startIndex = visible.findIndex(
              (fc) => String(fc.id) === String(c.id)
            );
            const status = dueStatus(c);
            const nextReview = c.due_at ? new Date(c.due_at).toLocaleString() : "Due now";

            return (
              <div
                key={c.id}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: 16,
                  padding: 14,
                  background: "#fff",
                  transition: "box-shadow .15s ease, transform .05s ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#4F46E5",
                        fontWeight: 700,
                        background: "#EEF2FF",
                        padding: "3px 10px",
                        borderRadius: 999,
                      }}
                    >
                      {(c.difficulty || "medium").toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#065F46",
                        fontWeight: 700,
                        background: "#ECFDF5",
                        padding: "3px 10px",
                        borderRadius: 999,
                      }}
                    >
                      {className}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: status === "Due" ? "#B42318" : "#344054",
                        fontWeight: 700,
                        background: status === "Due" ? "#FEF3F2" : "#F2F4F7",
                        padding: "3px 10px",
                        borderRadius: 999,
                      }}
                    >
                      {status}
                    </span>
                  </div>

                  {/* kebab menu with 4 actions */}
                  <KebabMenu
                    items={[
                      {
                        label: bm.isBookmarked(String(c.id))
                          ? "Remove Bookmark"
                          : "Bookmark",
                        onClick: () => bm.toggle(String(c.id)),
                      },
                      {
                        label: "View Mode",
                        onClick: () => handleView(visible, startIndex),
                      },
                      {
                        label: "Study Mode",
                        onClick: () => handleStudy(visible, startIndex),
                      },
                      {
                        label: "Delete",
                        onClick: async () => {
                          if (isLegacy) return; // legacy rows: delete original source row instead
                          if (!confirm("Delete this flashcard?")) return;
                          try {
                            await deleteFlashcard(String(c.id));
                            setCardsRaw((prev) =>
                              prev.filter((x) => x.id !== c.id)
                            );
                          } catch (err: any) {
                            alert(err?.message || "Failed to delete flashcard");
                          }
                        },
                      },
                    ]}
                  />
                </div>

                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: 10,
                    color: "#111827",
                  }}
                >
                  Q: {c.question}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                  Next review: {nextReview}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                  Reps: {c.repetitions ?? 0} • Ease: {(c.ease_factor ?? 2.5).toFixed(2)}
                </div>
                <details>
                  <summary
                    style={{
                      color: "#7B5FEF",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    ► Show answer
                  </summary>
                  <div
                    style={{
                      marginTop: 8,
                      lineHeight: 1.55,
                      color: "#111827",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {c.answer}
                  </div>
                </details>

                {c.hint && String(c.hint).trim() && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
                    <span style={{ fontWeight: 600 }}>Hint:</span>{" "}
                    {String(c.hint).trim()}
                  </div>
                )}

                {tags.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
                    <span style={{ fontWeight: 600 }}>Tags:</span>{" "}
                    {tags.join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </main>
    </div>
  );
}
