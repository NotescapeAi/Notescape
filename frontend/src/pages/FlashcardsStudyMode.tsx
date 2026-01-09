import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import { getFlashcardProgress, listDueCards, listFiles, postReview } from "../lib/api";

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
  const [progress, setProgress] = useState<{ total: number; due_now: number; due_today: number; learning: number } | null>(null);
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);
  const [fileFilter, setFileFilter] = useState<string>("all");

  useEffect(() => {
    if (!classNum) return;
    (async () => {
      setLoading(true);
      try {
        const fileId = fileFilter === "all" ? undefined : fileFilter;
        const data = await listDueCards(classNum, fileId);
        setCards(Array.isArray(data) ? data : []);
        const prog = await getFlashcardProgress(classNum, fileId);
        setProgress(prog);
      } finally {
        setLoading(false);
      }
    })();
  }, [classNum, fileFilter]);

  useEffect(() => {
    if (!classNum) return;
    (async () => {
      const fs = await listFiles(classNum);
      setFiles((fs ?? []).map((f) => ({ id: f.id, filename: f.filename })));
    })();
  }, [classNum]);

  const current = cards[idx];
  const dueCount = cards.length;

  async function handleReview(confidence: 1 | 2 | 3 | 4 | 5) {
    if (!current) return;
    await postReview(current.id, confidence);
    const nextCards = cards.filter((c) => c.id !== current.id);
    setCards(nextCards);
    setIdx(0);
    setRevealed(false);
    if (classNum) {
      const prog = await getFlashcardProgress(classNum);
      setProgress(prog);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
          <PageHeader
            title="Study mode"
            subtitle="Review due cards and rate your confidence."
            backHref={`/classes/${classId}/flashcards`}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Due now</div>
            <div className="text-2xl font-semibold">{progress?.due_now ?? dueCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Due today</div>
            <div className="text-2xl font-semibold">{progress?.due_today ?? dueCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Learning</div>
            <div className="text-2xl font-semibold">{progress?.learning ?? 0}</div>
          </div>
        </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <select
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="all">All files</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.filename}
                </option>
              ))}
            </select>
          </div>
            {loading ? (
            <div className="text-sm text-slate-500">Loading cards...</div>
          ) : !current ? (
            <div className="text-sm text-slate-500">No due cards right now. Check back later.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div>
                  Card {idx + 1} of {cards.length}
                </div>
                <div>{current.state ? current.state.toUpperCase() : "DUE"}</div>
              </div>

              <div className="text-xl font-medium text-slate-800">{sanitizeText(current.question)}</div>

              <div className="space-y-3">
                <Button variant="primary" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? "Hide answer" : "Show answer"}
                </Button>
                {revealed && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    {sanitizeText(current.answer)}
                  </div>
                )}
              </div>

                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => handleReview(n as 1 | 2 | 3 | 4 | 5)}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      n === 3 ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Not confident</span>
                  <span>Very confident</span>
                </div>
            </div>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}
