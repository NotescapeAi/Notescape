// src/pages/FlashcardsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// CHANGED: import listClasses to get the class name
import { listFlashcards, deleteFlashcard, listClasses, type Flashcard } from "../lib/api";

type Diff = "all" | "hard" | "medium" | "easy";

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
          tags: Array.isArray(x?.tags) ? x.tags : [],
        }));
      }
    }
  } catch {}
  return [c];
}

export default function FlashcardsPage() {
  const { classId } = useParams();
  const navigate = useNavigate();

  const id = Number(classId);

  const [cardsRaw, setCardsRaw] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Diff>("all");

  // NEW: store current class name (for header + per-card badge)
  const [className, setClassName] = useState<string>("");

  // Load flashcards
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        if (!id) { setCardsRaw([]); return; }
        // CHANGED: also load class name
        const [cards, classes] = await Promise.all([
          listFlashcards(id),
          listClasses(),
        ]);
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

  // Expand any legacy blob rows
  const expanded = useMemo(() => cardsRaw.flatMap(expandLegacy), [cardsRaw]);
  const filtered = filter === "all" ? expanded : expanded.filter(c => c.difficulty === filter);

  return (
    <div
      style={{
        // NEW: subtle board feel
        background: "linear-gradient(180deg,#fafafa, #fff)",
        minHeight: "100vh",
        padding: "20px 20px 40px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          {/* NEW: show class name inline */}
          <h1 style={{ margin: 0, fontSize: 22 }}>Flashcards · <span style={{ color: "#4F46E5" }}>{className}</span></h1>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
            {filter === "all" ? `Total: ${expanded.length}` : `Showing ${filtered.length} of ${expanded.length} (${filter})`}
          </div>
        </div>

        <div style={{ display: "inline-flex", gap: 8 }}>
          {/* CHANGED: Back now goes to class screen WITH selected id */}
          <button
            onClick={() => navigate("/classes", { state: { selectId: id } })} // NEW
            style={{ padding: "6px 12px", borderRadius: 12, border: "1px solid #cfd4dc", background: "#fff", cursor: "pointer" }}
            title={`Back to ${className}`}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#6B7280" }}>Filter:</span>
        {([
          { key: "all", label: "All" },
          { key: "hard", label: "Hard" },
          { key: "medium", label: "Medium" },
          { key: "easy", label: "Easy" },
        ] as { key: Diff; label: string }[]).map(btn => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #D6D3FF",
              background: filter === btn.key ? "#EEF2FF" : "#FFFFFF",
              color: filter === btn.key ? "#4F46E5" : "#111827",
              fontSize: 12,
              cursor: "pointer",
              boxShadow: filter === btn.key ? "0 1px 2px rgba(79,70,229,.2)" : "none"
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ opacity: .7 }}>Loading…</div>}
      {!loading && error && <div style={{ color: "#b91c1c" }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ opacity: .7 }}>No flashcards yet.</div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", // CHANGED: a hair wider
          gap: 16
        }}>
          {filtered.map((c) => {
            const isLegacy = c.id.startsWith("legacy-");
            const tags = Array.isArray(c.tags)
              ? c.tags.map(t => String(t).trim()).filter(Boolean)
              : []; // NEW: normalize tags for display (trim + remove empties)
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
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 10px 30px rgba(17,24,39,.10)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,.04)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#4F46E5", background: "#EEF2FF", padding: "3px 10px", borderRadius: 999 }}>
                      {(c.difficulty || "medium").toUpperCase()}
                    </span>
                    {/* NEW: show class name on the card */}
                    <span style={{ fontSize: 11, color: "#065F46", background: "#ECFDF5", padding: "3px 10px", borderRadius: 999 }}>
                      {className}
                    </span>
                  </div>

                  <button
                    onClick={async () => {
                      if (isLegacy) return;
                      if (!confirm("Delete this flashcard?")) return;
                      try {
                        await deleteFlashcard(c.id);
                        // remove from raw; expanded recomputes automatically
                        setCardsRaw(prev => prev.filter(x => x.id !== c.id));
                      } catch (err: any) {
                        alert(err?.message || "Failed to delete flashcard");
                      }
                    }}
                    title={isLegacy ? "Legacy expanded card (delete the original row)" : "Delete flashcard"}
                    style={{
                      padding: "4px 8px",
                      fontSize: 12,
                      borderRadius: 10,
                      border: isLegacy ? "1px solid #E5E7EB" : "1px solid #FCA5A5",
                      background: isLegacy ? "#F9FAFB" : "#FEF2F2",
                      color: isLegacy ? "#6B7280" : "#B91C1C",
                      cursor: isLegacy ? "not-allowed" : "pointer"
                    }}
                    disabled={isLegacy}
                  >
                    Delete
                  </button>
                </div>

                {/* Question / Answer */}
                <div style={{ fontWeight: 800, marginBottom: 10, color: "#111827" }}>{c.question}</div>
                <details>
                  <summary style={{ color: "#7B5FEF", cursor: "pointer", userSelect: "none" }}>► Show answer</summary>
                  <div style={{ marginTop: 8, lineHeight: 1.55, color: "#111827" }}>{c.answer}</div>
                </details>

                {/* CHANGED: Only show Hint when non-empty, as plain text (no dash) */}
                {c.hint && String(c.hint).trim() && ( // CHANGED
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}> {/* CHANGED */}
                    <span style={{ fontWeight: 600 }}>Hint:</span> {String(c.hint).trim()} {/* CHANGED */}
                  </div>
                )}

                {/* CHANGED: Show Tags as comma-separated text when present; no hashes, no chips */}
                {tags.length > 0 && ( // CHANGED
                  <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}> {/* CHANGED */}
                    <span style={{ fontWeight: 600 }}>Tags:</span> {tags.join(", ")} {/* CHANGED */}
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
