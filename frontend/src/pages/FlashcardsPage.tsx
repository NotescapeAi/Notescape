// src/pages/FlashcardsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  listFlashcards,
  deleteFlashcard,
  listClasses,
  listFiles,
  getFlashcardProgress,
  getMasteryStats,
  createFlashcard,
  updateFlashcard,
  type Flashcard,
} from "../lib/api";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import KebabMenu from "../components/KebabMenu";

type Diff = "all" | "hard" | "medium" | "easy";

function formatNextReview(dueAt?: string | null) {
  if (!dueAt) return "Due now";
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) return "Due now";
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return "Tomorrow";
  if (diffDays <= 7) return `In ${diffDays} days`;
  return due.toLocaleDateString();
}

function dueStatus(card: Flashcard) {
  const dueAt = card.due_at ? new Date(card.due_at) : null;
  if (!dueAt) return "Due";
  if (dueAt <= new Date()) return "Due";
  if ((card.repetitions ?? 0) === 0) return "Learning";
  return "Scheduled";
}

function isDue(card: Flashcard) {
  if (!card.due_at) return true;
  return new Date(card.due_at) <= new Date();
}

function sanitizeText(value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("{") && text.includes("\"cards\"")) {
    return "This card needs regeneration.";
  }
  return text;
}

type FormState = {
  question: string;
  answer: string;
  hint: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string;
  file_id: string | "";
  reset_progress: boolean;
};

export default function FlashcardsPage() {
  const { classId } = useParams();
  const id = Number(classId);
  const navigate = useNavigate();

  const [cardsRaw, setCardsRaw] = useState<Flashcard[]>([]);
  const [className, setClassName] = useState<string>("");
  const [difficultyFilter, setDifficultyFilter] = useState<Diff>("all");
  const [viewFilter, setViewFilter] = useState<"all" | "due">("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);
  const [fileFilter, setFileFilter] = useState<string>("all");
  const [progress, setProgress] = useState<{ total: number; due_now: number; due_today: number; learning: number } | null>(null);
  const [masteryStats, setMasteryStats] = useState<{
    total_unique: number;
    mastered_count: number;
    mastery_percent: number;
    total_reviews: number;
    average_rating: number;
  } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [formState, setFormState] = useState<FormState>({
    question: "",
    answer: "",
    hint: "",
    difficulty: "medium",
    tags: "",
    file_id: "",
    reset_progress: false,
  });

  async function loadData(currentFileFilter: string) {
    if (!id) return;
    const [cards, classes, filesRes, prog, mastery] = await Promise.all([
      listFlashcards(id, currentFileFilter === "all" ? undefined : currentFileFilter),
      listClasses(),
      listFiles(id),
      getFlashcardProgress(id, currentFileFilter === "all" ? undefined : currentFileFilter),
      getMasteryStats(id, currentFileFilter === "all" ? undefined : currentFileFilter),
    ]);

    setCardsRaw(Array.isArray(cards) ? cards : []);
    const cls = classes.find((c) => c.id === id);
    setClassName(cls?.name || `Class #${id}`);
    setFiles((filesRes ?? []).map((f) => ({ id: f.id, filename: f.filename })));
    setProgress(prog ?? null);
    setMasteryStats(mastery ?? null);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        if (!id) {
          setCardsRaw([]);
          return;
        }
        await loadData(fileFilter);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to load flashcards");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, fileFilter]);

  useEffect(() => {
    if (!Number.isFinite(id) || !id) return;
    localStorage.setItem("last_class_id", String(id));
  }, [id]);

  const filtered = useMemo(() => {
    const byDifficulty =
      difficultyFilter === "all"
        ? cardsRaw
        : cardsRaw.filter((c) => (c.difficulty ?? "medium") === difficultyFilter);
    const byDue = viewFilter === "due" ? byDifficulty.filter((c) => isDue(c)) : byDifficulty;
    return byDue;
  }, [cardsRaw, difficultyFilter, viewFilter]);

  const dueCards = useMemo(() => cardsRaw.filter((c) => isDue(c)), [cardsRaw]);

  const handleView = (cardsList: Flashcard[], startIndex = 0) => {
    navigate(`/classes/${id}/flashcards/view`, {
      state: {
        cards: cardsList,
        className,
        startIndex: Math.max(0, startIndex),
      },
    });
  };

  const handleStudy = (cardsList: Flashcard[], startIndex = 0) => {
    navigate(`/classes/${id}/flashcards/study`, {
      state: {
        cards: cardsList,
        className,
        startIndex: Math.max(0, startIndex),
      },
    });
  };

  function openCreate() {
    setEditingCard(null);
    setFormState({
      question: "",
      answer: "",
      hint: "",
      difficulty: "medium",
      tags: "",
      file_id: "",
      reset_progress: false,
    });
    setFormOpen(true);
  }

  function openEdit(card: Flashcard) {
    setEditingCard(card);
    setFormState({
      question: card.question ?? "",
      answer: card.answer ?? "",
      hint: card.hint ?? "",
      difficulty: (card.difficulty ?? "medium") as "easy" | "medium" | "hard",
      tags: Array.isArray(card.tags) ? card.tags.join(", ") : "",
      file_id: card.file_id ?? "",
      reset_progress: false,
    });
    setFormOpen(true);
  }

  async function submitForm() {
    if (!id) return;
    if (!formState.question.trim() || !formState.answer.trim()) {
      alert("Question and answer are required.");
      return;
    }

    const tags = formState.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingCard) {
      await updateFlashcard(editingCard.id, {
        question: formState.question.trim(),
        answer: formState.answer.trim(),
        hint: formState.hint.trim() || null,
        tags,
        difficulty: formState.difficulty,
        file_id: formState.file_id || null,
        reset_progress: formState.reset_progress,
      });
    } else {
      await createFlashcard({
        class_id: id,
        question: formState.question.trim(),
        answer: formState.answer.trim(),
        hint: formState.hint.trim() || null,
        tags,
        difficulty: formState.difficulty,
        file_id: formState.file_id || null,
      });
    }

    setFormOpen(false);
    await loadData(fileFilter);
  }

  async function handleDelete(cardId: string) {
    if (!confirm("Delete this flashcard?")) return;
    await deleteFlashcard(cardId);
    await loadData(fileFilter);
  }

  return (
    <AppShell title="Flashcards" breadcrumbs={["Flashcards"]} subtitle={className || undefined}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--primary)]">Flashcards</div>
            <h1 className="mt-2 text-3xl font-semibold text-main">Practice with intent</h1>
            <div className="text-sm text-muted">{className}</div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={openCreate} className="rounded-full px-5">
              New flashcard
            </Button>
            <Button className="rounded-full" onClick={() => handleStudy(dueCards)}>
              Study due
            </Button>
          </div>
        </div>

        <div className="rounded-[28px] surface p-6 shadow-[0_16px_40px_rgba(15,16,32,0.08)]">
            <div className="flex flex-wrap items-center gap-2">
          {(["all", "due"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewFilter(v)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                viewFilter === v
                  ? "border-[var(--primary)] bg-[var(--primary)] text-inverse shadow-md"
                  : "border-token surface text-muted"
              }`}
            >
              {v === "all" ? "All cards" : "Due"}
            </button>
          ))}
          {(["all", "easy", "medium", "hard"] as Diff[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficultyFilter(d)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                difficultyFilter === d
                  ? "border-[var(--primary)] bg-[var(--primary)] text-inverse shadow-md"
                  : "border-token surface text-muted"
              }`}
            >
              {d === "all" ? "Any difficulty" : d}
            </button>
          ))}
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
            </div>
          </div>

        <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { label: "Mastery", value: `${masteryStats?.mastery_percent ?? 0}%` },
            { label: "Mastered cards", value: masteryStats?.mastered_count ?? 0 },
            { label: "Avg rating", value: masteryStats?.average_rating?.toFixed?.(2) ?? "0.00" },
            { label: "Reviews", value: masteryStats?.total_reviews ?? 0 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[22px] surface p-4 shadow-[0_12px_30px_rgba(15,16,32,0.08)]"
            >
              <div className="text-xs text-muted">{stat.label}</div>
              <div className="text-2xl font-semibold text-main">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { label: "Due now", value: progress?.due_now ?? 0 },
            { label: "Due today", value: progress?.due_today ?? 0 },
            { label: "Learning", value: progress?.learning ?? 0 },
            { label: "Total", value: progress?.total ?? 0 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[22px] surface p-4 shadow-[0_12px_30px_rgba(15,16,32,0.08)]"
            >
              <div className="text-xs text-muted">{stat.label}</div>
              <div className="text-2xl font-semibold text-main">{stat.value}</div>
            </div>
          ))}
        </div>

        {loading && <div className="mt-4 text-sm text-muted">Loading...</div>}
        {error && <div className="mt-4 text-sm text-[var(--accent-pink)]">{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div className="mt-6 rounded-[28px] border border-dashed border-token surface p-10 text-sm text-muted text-center">
            No flashcards found. Generate or create one to start studying.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const tags = Array.isArray(c.tags)
                ? c.tags.map((t) => String(t).trim()).filter(Boolean)
                : [];
              const status = dueStatus(c);
              const nextReview = formatNextReview(c.due_at);
              const startIndex = filtered.findIndex((fc) => String(fc.id) === String(c.id));

              return (
                <div key={c.id} className="rounded-[28px] surface p-5 shadow-[0_18px_40px_rgba(15,16,32,0.08)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-token surface-2 px-2 py-0.5 font-semibold text-[var(--primary)]">
                        {(c.difficulty || "medium").toUpperCase()}
                      </span>
                      <span className="rounded-full border border-token surface-2 px-2 py-0.5 text-muted">
                        {status}
                      </span>
                    </div>
                    <KebabMenu
                      items={[
                        { label: "Study", onClick: () => handleStudy(filtered, startIndex) },
                        { label: "View", onClick: () => handleView(filtered, startIndex) },
                        { label: "Edit", onClick: () => openEdit(c) },
                        { label: "Delete", onClick: () => handleDelete(String(c.id)) },
                      ]}
                    />
                  </div>

                  <div className="mt-3 text-base font-semibold text-main">{sanitizeText(c.question)}</div>
                  <div className="mt-2 text-xs text-muted">Next review: {nextReview}</div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-muted">Show answer</summary>
                    <div className="mt-2 text-sm text-muted whitespace-pre-wrap">
                      {sanitizeText(c.answer)}
                    </div>
                  </details>
                  {c.hint && (
                    <div className="mt-3 text-xs text-muted">
                      <span className="font-semibold">Hint:</span> {sanitizeText(c.hint)}
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div className="mt-3 text-xs text-muted">
                      <span className="font-semibold">Tags:</span> {tags.join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {formOpen && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
            onClick={() => setFormOpen(false)}
          >
            <div
              className="w-full max-w-2xl rounded-[28px] surface p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {editingCard ? "Edit flashcard" : "New flashcard"}
                </h2>
                <button
                  className="rounded-lg border border-token px-2 py-1 text-xs text-muted"
                  onClick={() => setFormOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted">Question</label>
                  <textarea
                    value={formState.question}
                    onChange={(e) => setFormState((s) => ({ ...s, question: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-token surface px-3 py-2 text-sm text-main placeholder:text-muted"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted">Answer</label>
                  <textarea
                    value={formState.answer}
                    onChange={(e) => setFormState((s) => ({ ...s, answer: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-token surface px-3 py-2 text-sm text-main placeholder:text-muted"
                    rows={4}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted">Hint (optional)</label>
                  <input
                    value={formState.hint}
                    onChange={(e) => setFormState((s) => ({ ...s, hint: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-token surface px-3 text-sm text-main placeholder:text-muted"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted">Difficulty</label>
                    <select
                      value={formState.difficulty}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, difficulty: e.target.value as FormState["difficulty"] }))
                      }
                      className="mt-1 h-10 w-full rounded-xl border border-token surface px-3 text-sm text-main placeholder:text-muted"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted">File (optional)</label>
                    <select
                      value={formState.file_id}
                      onChange={(e) => setFormState((s) => ({ ...s, file_id: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-xl border border-token surface px-3 text-sm text-main placeholder:text-muted"
                    >
                      <option value="">No file</option>
                      {files.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.filename}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted">Tags (comma separated)</label>
                  <input
                    value={formState.tags}
                    onChange={(e) => setFormState((s) => ({ ...s, tags: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-token surface px-3 text-sm text-main placeholder:text-muted"
                  />
                </div>
                {editingCard && (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={formState.reset_progress}
                      onChange={(e) => setFormState((s) => ({ ...s, reset_progress: e.target.checked }))}
                    />
                    Reset scheduling for this card
                  </label>
                )}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button onClick={() => setFormOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submitForm}>
                  Save
                </Button>
              </div>
            </div>
          </div>
      )}
    </AppShell>
  );
}
