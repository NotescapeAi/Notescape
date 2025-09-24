import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { listFlashcards, deleteFlashcard, type Flashcard } from "../lib/api";

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
  const [cardsRaw, setCardsRaw] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Diff>("all");
  const id = Number(classId);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        if (!id) { setCardsRaw([]); return; }
        const data = await listFlashcards(id);
        if (mounted) setCardsRaw(Array.isArray(data) ? data : []);
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
  const filtered = filter === "all" ? expanded : expanded.filter(c => c.difficulty === filter);

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Flashcards</h1>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            {filter === "all" ? `Total: ${expanded.length}` : `Showing ${filtered.length} of ${expanded.length} (${filter})`}
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 8 }}>
          {/* Back now returns to that class page */}
          <button
            onClick={() => navigate(`/classes/${id}`)}
            style={{ padding: "6px 12px", borderRadius: 12, border: "1px solid #cfd4dc", background: "#fff", cursor: "pointer" }}
            title="Back to this class"
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
        <div style={{ opacity: .7 }}>
          No flashcards yet.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16
        }}>
          {filtered.map((c) => {
            const isLegacy = c.id.startsWith("legacy-");
            return (
              <div
                key={c.id}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: 16,
                  padding: 14,
                  background: "#fff",
                  transition: "box-shadow .15s ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,.04)"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 8px 24px rgba(17,24,39,.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,.04)")}
              >
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "#4F46E5", background: "#EEF2FF", padding: "3px 10px", borderRadius: 999 }}>
                    {(c.difficulty || "medium").toUpperCase()}
                  </span>
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
                      borderRadius: 8,
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
                <div style={{ fontWeight: 700, marginBottom: 10 }}>{c.question}</div>
                <details>
                  <summary style={{ color: "#7B5FEF", cursor: "pointer" }}>Show answer</summary>
                  <div style={{ marginTop: 8, lineHeight: 1.5 }}>{c.answer}</div>
                </details>

                {/* Hint / Tags */}
                {c.hint && <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>Hint: {c.hint}</div>}
                {c.tags?.length ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {c.tags.map((t, i) => (
                      <span key={`${c.id}-tag-${i}`} style={{ fontSize: 11, color: "#374151", background: "#F3F4F6", padding: "2px 8px", borderRadius: 999 }}>
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
