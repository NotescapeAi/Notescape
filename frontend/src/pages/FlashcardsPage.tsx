import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { listFlashcards, type Flashcard } from "../lib/api";

export default function FlashcardsPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const id = Number(classId);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        if (!id) { setCards([]); return; }
        const data = await listFlashcards(id); // ← uses your existing API
        if (mounted) setCards(Array.isArray(data) ? data : []);
      } catch (e: unknown) { // FIX: avoid 'any'
        if (!mounted) return;
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Failed to load flashcards");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Flashcards</h1>
        <div style={{ display: "inline-flex", gap: 8 }}>
          <button
            onClick={() => navigate(`/classes`)}
            style={{ padding: "6px 12px", borderRadius: 12, border: "1px solid #cfd4dc", background: "#fff", cursor: "pointer" }}
            title="Back to classes"
          >
            ← Back
          </button>
          <button
            onClick={() => navigate(`/classes/${id}`)}
            style={{ padding: "6px 12px", borderRadius: 12, border: "1px solid #cfd4dc", background: "#fff", cursor: "pointer" }}
            title="Back to this class"
          >
            Open Class
          </button>
        </div>
      </div>

      {loading && <div style={{ opacity: .7 }}>Loading…</div>}
      {!loading && error && <div style={{ color: "#b91c1c" }}>{error}</div>}

      {!loading && !error && cards.length === 0 && (
        <div style={{ opacity: .7 }}>
          No flashcards yet. Use <strong>Generate Flashcards</strong> on the class page.
        </div>
      )}

      {!loading && !error && cards.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {cards.map((c) => (
            <div key={c.id} style={{ border: "1px solid #E4E7EC", borderRadius: 12, padding: 12, background: "#fff" }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                {(c.difficulty || "medium").toUpperCase()}
              </div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{c.question}</div>
              <details>
                <summary style={{ color: "#7B5FEF", cursor: "pointer" }}>Show answer</summary>
                <div style={{ marginTop: 6 }}>{c.answer}</div>
              </details>
              {c.hint && <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>Hint: {c.hint}</div>}
              {c.tags?.length ? (
                <div style={{ marginTop: 6, fontSize: 11, color: "#6B7280" }}>Tags: {c.tags.join(", ")}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
