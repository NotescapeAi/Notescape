import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import { listFlashcards, listFiles } from "../lib/api";

type DueCard = {
  id: string;
  question: string;
  answer: string;
  due_at?: string | null;
  state?: string | null;
};

function sanitizeText(value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("{") && text.includes("\"cards\"")) {
    return "This card needs regeneration.";
  }
  return text;
}

export default function FlashcardsStudyMode() {
  const { classId } = useParams();
  const classNum = Number(classId);
  const [cards, setCards] = useState<DueCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);
  const [fileFilter, setFileFilter] = useState<string>("all");
  const [masteryMap, setMasteryMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!classNum) return;
    const stored = localStorage.getItem(`fc_mastery_${classNum}`);
    if (stored) {
      try {
        setMasteryMap(JSON.parse(stored));
      } catch {
        setMasteryMap({});
      }
    }
  }, [classNum]);

  useEffect(() => {
    if (!classNum) return;
    localStorage.setItem(`fc_mastery_${classNum}`, JSON.stringify(masteryMap));
  }, [classNum, masteryMap]);

  async function reloadCards() {
    if (!classNum) return;
    setLoading(true);
    try {
      const fileId = fileFilter === "all" ? undefined : fileFilter;
      const data = await listFlashcards(classNum, fileId);
      const filtered = Array.isArray(data) ? data : [];
      const active = filtered.filter((c) => (masteryMap[c.id] ?? 0) < 5);
      setCards(active);
      setIdx(0);
      setRevealed(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadCards();
  }, [classNum, fileFilter, masteryMap]);

  useEffect(() => {
    if (!classNum) return;
    (async () => {
      const fs = await listFiles(classNum);
      setFiles((fs ?? []).map((f) => ({ id: f.id, filename: f.filename })));
    })();
  }, [classNum]);

  const current = cards[idx];
  const totalCount = cards.length + Object.values(masteryMap).filter((v) => v >= 5).length;
  const masteredCount = Object.values(masteryMap).filter((v) => v >= 5).length;
  const masteryPct = totalCount === 0 ? 0 : Math.round((masteredCount / totalCount) * 100);

  function handleReview(confidence: 1 | 2 | 3 | 4 | 5) {
    if (!current) return;
    setMasteryMap((prev) => ({ ...prev, [current.id]: confidence }));
    if (confidence === 5) {
      const nextCards = cards.filter((c) => c.id !== current.id);
      setCards(nextCards);
      setIdx(0);
      setRevealed(false);
      return;
    }
    const nextCards = [...cards.slice(idx + 1), ...cards.slice(0, idx + 1)];
    setCards(nextCards);
    setIdx(0);
    setRevealed(false);
  }

  function resetProgress() {
    setMasteryMap({});
  }

  function studyAgain() {
    reloadCards();
  }

  return (
    <AppShell
      title="Study Session"
      breadcrumbs={["Flashcards", "Study"]}
      subtitle="Build mastery, one card at a time."
      backLabel="Back to Flashcards"
      backTo="/classes"
      backState={{ tab: "flashcards" }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--primary)]">Study session</div>
            <h1 className="mt-2 text-3xl font-semibold text-main">Focus mode</h1>
            <div className="text-sm text-muted">Stay consistent and build recall.</div>
          </div>
          <div className="flex items-center gap-2">
            <Button className="rounded-full" onClick={studyAgain}>
              Study again
            </Button>
            <Button className="rounded-full" onClick={resetProgress}>
              Reset progress
            </Button>
            <Button className="rounded-full" onClick={() => window.history.back()}>
              Back to flashcards
            </Button>
          </div>
        </div>

        <div className="rounded-[22px] surface p-4 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Mastery {masteryPct}%</span>
            <span>
              {masteredCount}/{totalCount} mastered
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full surface-tint">
            <div
              className="h-full rounded-full bg-[var(--accent-mint)]"
              style={{ width: `${masteryPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-[28px] surface p-6 shadow-[0_18px_40px_rgba(15,16,32,0.08)]">
            <div className="mb-4 flex items-center justify-between gap-2">
              <select
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                className="h-10 rounded-2xl border border-token surface px-3 text-sm text-muted"
              >
                <option value="all">All files</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
              </select>
              <div className="text-xs text-muted">
                {idx + 1} / {cards.length || 0}
              </div>
            </div>
            {loading ? (
              <div className="text-sm text-muted">Loading cards...</div>
            ) : !current ? (
              <div className="text-sm text-muted">You are fully mastered for today.</div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-[28px] border border-token bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] p-8 shadow-[0_18px_40px_rgba(15,16,32,0.08)]">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--primary)]">
                    {current.state ? current.state.toUpperCase() : "Due"}
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-main">
                    {sanitizeText(current.question)}
                  </div>
                  <div
                    className={`mt-6 rounded-2xl border border-token surface p-4 text-sm text-muted transition ${
                      revealed ? "opacity-100" : "opacity-0 h-0 overflow-hidden"
                    }`}
                  >
                    {sanitizeText(current.answer)}
                  </div>
                  <div className="mt-6">
                    <Button variant="primary" className="rounded-full" onClick={() => setRevealed((v) => !v)}>
                      {revealed ? "Hide answer" : "Show answer"}
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                    {[
                      { score: 1, label: "Didn't know", color: "border-accent bg-accent-soft text-accent" },
                      { score: 2, label: "Hard", color: "border-accent bg-accent-weak text-accent" },
                      {
                        score: 3,
                        label: "Moderate",
                        color:
                          "border-[var(--accent-lime)] bg-[var(--accent-lime)]/20 text-[var(--accent-lime)]",
                      },
                      {
                        score: 4,
                        label: "Almost",
                        color:
                          "border-[var(--accent-mint)] bg-[var(--accent-mint)]/20 text-[var(--accent-mint)]",
                      },
                      {
                        score: 5,
                        label: "Mastered",
                        color:
                          "border-[var(--accent-mint)] bg-[var(--accent-mint)]/30 text-[var(--accent-mint)]",
                      },
                    ].map((opt) => (
                      <button
                        key={opt.score}
                        onClick={() => handleReview(opt.score as 1 | 2 | 3 | 4 | 5)}
                        className={`rounded-2xl border px-3 py-3 text-xs font-semibold ${opt.color}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted">
                    <span>Not confident</span>
                    <span>Mastered</span>
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>
    </AppShell>
  );
}
