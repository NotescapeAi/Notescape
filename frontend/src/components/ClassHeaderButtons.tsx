import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "./Button";


type Props = {
  classId: string | number;
  canGenerateFlashcards?: boolean;
  generateDisabledReason?: string;
  onGenerate?: (opts: {
    difficulty: "easy" | "medium" | "hard";
    n_cards: number;
    style: "mixed" | "definitions" | "conceptual" | "qa";
  }) => Promise<void> | void;
};

const LS_DIFF_KEY = "fc_pref_difficulty";
const LS_COUNT_KEY = "fc_pref_count";
const LS_STYLE_KEY = "fc_pref_style";

type Difficulty = "easy" | "medium" | "hard";
const COUNT_OPTIONS = [10, 20, 30, 40] as const;

type Style = "mixed" | "definitions" | "conceptual" | "qa";

function isDifficulty(x: unknown): x is Difficulty {
  return x === "easy" || x === "medium" || x === "hard";
}

function isStyle(x: unknown): x is Style {
  return x === "mixed" || x === "definitions" || x === "conceptual" || x === "qa";
}

export default function ClassHeaderButtons({
  classId,
  onGenerate,
  canGenerateFlashcards = true,
  generateDisabledReason,
}: Props) {
  const navigate = useNavigate();
  const toId = Number(classId);

  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    const raw = localStorage.getItem(LS_DIFF_KEY);
    return isDifficulty(raw) ? raw : "medium";
  });
  const [count, setCount] = useState<number>(() => {
    const raw = Number(localStorage.getItem(LS_COUNT_KEY));
    return COUNT_OPTIONS.includes(raw as any) ? raw : 20;
  });
  const [style, setStyle] = useState<Style>(() => {
    const raw = localStorage.getItem(LS_STYLE_KEY);
    return isStyle(raw) ? raw : "mixed";
  });

  useEffect(() => {
    localStorage.setItem(LS_DIFF_KEY, difficulty);
  }, [difficulty]);
  useEffect(() => {
    localStorage.setItem(LS_COUNT_KEY, String(count));
  }, [count]);
  useEffect(() => {
    localStorage.setItem(LS_STYLE_KEY, style);
  }, [style]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const handleGenerate = async () => {
    if (!toId || !canGenerateFlashcards) return;
    if (!onGenerate) {
      navigate(`/classes/${toId}/flashcards`);
      return;
    }
    try {
      setBusy(true);
      await onGenerate({ difficulty, n_cards: count, style });
      navigate(`/classes/${toId}/flashcards`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        onClick={handleGenerate}
        disabled={busy || !canGenerateFlashcards}
        title={generateDisabledReason || "Generate flashcards from selected documents"}
      >
        {busy ? "Generating flashcards..." : "Generate flashcards"}
      </Button>

      <Button
        onClick={() => navigate(`/classes/${toId}/flashcards`)}
        title="Open flashcards"
      >
        View flashcards
      </Button>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          className="h-9 rounded-lg border border-token surface px-3 text-xs font-semibold text-muted"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          Options
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-60 rounded-xl border border-token surface shadow-lg p-3 z-20"
          >
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-xs text-muted">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isDifficulty(val)) setDifficulty(val);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-token surface px-2 text-sm"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted">Cards</label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-lg border border-token surface px-2 text-sm"
                >
                  {COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted">Style</label>
                <select
                  value={style}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isStyle(val)) setStyle(val);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-token surface px-2 text-sm"
                >
                  <option value="mixed">Mixed</option>
                  <option value="definitions">Definitions</option>
                  <option value="conceptual">Conceptual</option>
                  <option value="qa">Q&A</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
