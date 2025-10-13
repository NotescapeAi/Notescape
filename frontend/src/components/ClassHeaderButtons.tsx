import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  classId: string | number;
  onGenerate?: (classId: number) => Promise<void> | void;
};

const LS_DIFF_KEY = "fc_pref_difficulty";
type Difficulty = "easy" | "medium" | "hard";

function isDifficulty(x: unknown): x is Difficulty {
  return x === "easy" || x === "medium" || x === "hard";
}

export default function ClassHeaderButtons({ classId, onGenerate }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const toId = Number(classId);

  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    const raw = localStorage.getItem(LS_DIFF_KEY);
    return isDifficulty(raw) ? raw : "medium";
  });

  useEffect(() => {
    localStorage.setItem(LS_DIFF_KEY, difficulty);
  }, [difficulty]);

  const handleGenerate = async () => {
    if (!toId) return;
    if (!onGenerate) {
      navigate(`/classes/${toId}/flashcards`);
      return;
    }
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
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            const val = e.target.value;
            if (isDifficulty(val)) setDifficulty(val);
          }}
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
