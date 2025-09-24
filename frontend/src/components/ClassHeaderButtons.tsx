import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  classId: string | number;
  onGenerate?: (classId: number) => Promise<void> | void; // keep your existing signature
};

const LS_DIFF_KEY = "fc_pref_difficulty";

export default function ClassHeaderButtons({ classId, onGenerate }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const toId = Number(classId);

  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    (localStorage.getItem(LS_DIFF_KEY) as any) || "medium"
  );
  useEffect(() => { localStorage.setItem(LS_DIFF_KEY, difficulty); }, [difficulty]);

  const handleGenerate = async () => {
    if (!toId) return;
    if (!onGenerate) { navigate(`/classes/${toId}/flashcards`); return; }
    try {
      setBusy(true);
      // parent reads localStorage("fc_pref_difficulty") and passes to API
      await onGenerate(toId);
      navigate(`/classes/${toId}/flashcards`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#6B7280" }}>Difficulty:</span>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as any)}
          style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #cfd4dc" }}
          aria-label="Difficulty"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy}
        style={{
          padding: "6px 12px",
          borderRadius: 12,
          border: "1px solid #cfd4dc",
          background: busy ? "#f3f4f6" : "#fff",
          cursor: busy ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}
        title="Generate flashcards from this class"
      >
        {busy ? "Generating…" : "Generate Flashcards"}
      </button>

      <button
        type="button"
        onClick={() => navigate(`/classes/${toId}/flashcards`)}
        style={{
          padding: "6px 12px",
          borderRadius: 12,
          border: "1px solid #cfd4dc",
          background: "#fff",
          cursor: "pointer",
          fontWeight: 600,
        }}
        title="Open the flashcards screen for this class"
      >
        View Flashcards
      </button>
    </div>
  );
}
