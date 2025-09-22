import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  classId: string | number;                               // we accept either
  onGenerate?: (classId: number) => Promise<void> | void; // optional: use your existing generator
};

export default function ClassHeaderButtons({ classId, onGenerate }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const toId = Number(classId);

  const handleGenerate = async () => {
    if (!toId) return;
    if (!onGenerate) {
      // if you didn’t pass a generator, just open the flashcards screen
      navigate(`/classes/${toId}/flashcards`);
      return;
    }
    try {
      setBusy(true);
      await onGenerate(toId);                 // ← calls your current generator
      navigate(`/classes/${toId}/flashcards`); // then goes to the flashcards page
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8 }}>
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
          fontWeight: 600
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
          fontWeight: 600
        }}
        title="Open the flashcards screen for this class"
      >
        View Flashcards
      </button>
    </div>
  );
}
