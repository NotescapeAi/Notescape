import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import Button from "./Button";

type Difficulty = "easy" | "medium" | "hard";
type Style = "mixed" | "definitions" | "conceptual" | "qa";
type CardCountMode = "auto" | "fixed" | "custom";

export type FlashcardGenerationOptions = {
  difficulty: Difficulty;
  style: Style;
  cardCountMode: CardCountMode;
  requestedCount?: number;
};

type Props = {
  classId: string | number;
  canGenerateFlashcards?: boolean;
  generateDisabledReason?: string;
  onGenerate?: (opts: FlashcardGenerationOptions) => Promise<void> | void;
};

const LS_DIFF_KEY = "fc_pref_difficulty";
const LS_COUNT_MODE_KEY = "fc_pref_count_mode";
const LS_COUNT_KEY = "fc_pref_count";
const LS_STYLE_KEY = "fc_pref_style";
const FIXED_COUNTS = [10, 20, 30, 40] as const;
const OPTIONS_PANEL_WIDTH = 304;
const VIEWPORT_GUTTER = 12;

function isDifficulty(x: unknown): x is Difficulty {
  return x === "easy" || x === "medium" || x === "hard";
}

function isStyle(x: unknown): x is Style {
  return x === "mixed" || x === "definitions" || x === "conceptual" || x === "qa";
}

function isCardCountMode(x: unknown): x is CardCountMode {
  return x === "auto" || x === "fixed" || x === "custom";
}

function countSelectValue(mode: CardCountMode, count: number) {
  if (mode === "auto") return "auto";
  if (mode === "custom") return "custom";
  return String(count);
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
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const [panelPosition, setPanelPosition] = useState<CSSProperties>({
    position: "fixed",
    left: VIEWPORT_GUTTER,
    top: VIEWPORT_GUTTER,
    width: OPTIONS_PANEL_WIDTH,
  });
  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    const raw = localStorage.getItem(LS_DIFF_KEY);
    return isDifficulty(raw) ? raw : "medium";
  });
  const [cardCountMode, setCardCountMode] = useState<CardCountMode>(() => {
    const raw = localStorage.getItem(LS_COUNT_MODE_KEY);
    return isCardCountMode(raw) ? raw : "auto";
  });
  const [count, setCount] = useState<number>(() => {
    const raw = Number(localStorage.getItem(LS_COUNT_KEY));
    return Number.isFinite(raw) && raw >= 1 ? raw : 20;
  });
  const [style, setStyle] = useState<Style>(() => {
    const raw = localStorage.getItem(LS_STYLE_KEY);
    return isStyle(raw) ? raw : "mixed";
  });

  useEffect(() => localStorage.setItem(LS_DIFF_KEY, difficulty), [difficulty]);
  useEffect(() => localStorage.setItem(LS_COUNT_MODE_KEY, cardCountMode), [cardCountMode]);
  useEffect(() => localStorage.setItem(LS_COUNT_KEY, String(count)), [count]);
  useEffect(() => localStorage.setItem(LS_STYLE_KEY, style), [style]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current || menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const updatePanelPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isNarrow = viewportWidth < 640;

    if (isNarrow) {
      setPanelPosition({
        position: "fixed",
        left: VIEWPORT_GUTTER,
        right: VIEWPORT_GUTTER,
        bottom: VIEWPORT_GUTTER,
        width: "auto",
        maxHeight: `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`,
      });
      return;
    }

    const width = Math.min(OPTIONS_PANEL_WIDTH, viewportWidth - VIEWPORT_GUTTER * 2);
    const left = Math.min(
      Math.max(VIEWPORT_GUTTER, rect.right - width),
      viewportWidth - width - VIEWPORT_GUTTER,
    );
    const panelHeight = panelRef.current?.offsetHeight ?? 360;
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_GUTTER;
    const top =
      spaceBelow >= Math.min(panelHeight, 360)
        ? rect.bottom + 8
        : Math.max(VIEWPORT_GUTTER, rect.top - panelHeight - 8);

    setPanelPosition({
      position: "fixed",
      left,
      top,
      width,
      maxHeight: `calc(100vh - ${top + VIEWPORT_GUTTER}px)`,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onLayoutChange = () => updatePanelPosition();
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [open, updatePanelPosition]);

  const handleGenerate = async () => {
    if (!toId || !canGenerateFlashcards || busy) return;
    if (!onGenerate) {
      navigate(`/classes/${toId}/flashcards`);
      return;
    }
    try {
      setBusy(true);
      await onGenerate({
        difficulty,
        style,
        cardCountMode,
        requestedCount: cardCountMode === "auto" ? undefined : count,
      });
      navigate(`/classes/${toId}/flashcards`);
    } finally {
      setBusy(false);
    }
  };

  const countWarning = cardCountMode === "custom" && count > 50
    ? "Large custom sets can take longer and may generate fewer useful cards."
    : null;

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <Button
        variant="primary"
        onClick={handleGenerate}
        disabled={busy || !canGenerateFlashcards}
        title={generateDisabledReason || "Generate flashcards from selected documents"}
      >
        {busy ? "Generating flashcards..." : "Generate"}
      </Button>

      <Button onClick={() => navigate(`/classes/${toId}/flashcards`)} title="Open flashcards">
        View flashcards
      </Button>

      <div ref={menuRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-token surface px-3 text-sm font-semibold text-main shadow-sm transition hover:bg-[var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Options
        </button>
        {open && (
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Generation options"
            style={panelPosition}
            className="z-50 max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-token surface p-4 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
          >
            <div className="mb-4 border-b border-token pb-3">
              <div className="text-sm font-semibold text-main">Generation options</div>
              <div className="mt-1 text-xs text-muted">Auto chooses a useful card count from the selected content.</div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-muted">Difficulty</span>
                <select
                  value={difficulty}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isDifficulty(val)) setDifficulty(val);
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-token surface px-3 text-sm text-main outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted">Number of cards</span>
                <select
                  value={countSelectValue(cardCountMode, count)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "auto") setCardCountMode("auto");
                    else if (val === "custom") setCardCountMode("custom");
                    else {
                      setCardCountMode("fixed");
                      setCount(Number(val));
                    }
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-token surface px-3 text-sm text-main outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                >
                  <option value="auto">Auto</option>
                  {FIXED_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              </label>

              {cardCountMode === "custom" && (
                <label className="block">
                  <span className="text-xs font-medium text-muted">Custom count</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="mt-1 h-10 w-full rounded-xl border border-token surface px-3 text-sm text-main outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                  />
                  {countWarning && <span className="mt-1 block text-xs text-muted">{countWarning}</span>}
                </label>
              )}

              <label className="block">
                <span className="text-xs font-medium text-muted">Style</span>
                <select
                  value={style}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isStyle(val)) setStyle(val);
                  }}
                  className="mt-1 h-10 w-full rounded-xl border border-token surface px-3 text-sm text-main outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                >
                  <option value="mixed">Mixed</option>
                  <option value="definitions">Definitions</option>
                  <option value="conceptual">Conceptual</option>
                  <option value="qa">Q&amp;A</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
