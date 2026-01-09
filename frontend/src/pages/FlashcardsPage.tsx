// src/pages/FlashcardsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  listFlashcards,
  deleteFlashcard,
  listClasses,
  listFiles,
  getFlashcardProgress,
  createFlashcard,
  updateFlashcard,
  type Flashcard,
} from "../lib/api";
import AppSidebar from "../components/AppSidebar";
import PageHeader from "../components/PageHeader";
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
    const [cards, classes, filesRes, prog] = await Promise.all([
      listFlashcards(id, currentFileFilter === "all" ? undefined : currentFileFilter),
      listClasses(),
      listFiles(id),
      getFlashcardProgress(id, currentFileFilter === "all" ? undefined : currentFileFilter),
    ]);

    setCardsRaw(Array.isArray(cards) ? cards : []);
    const cls = classes.find((c) => c.id === id);
    setClassName(cls?.name || `Class #${id}`);
    setFiles((filesRes ?? []).map((f) => ({ id: f.id, filename: f.filename })));
    setProgress(prog ?? null);
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
    <div className="min-h-screen flex bg-slate-50">
      <AppSidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
          <PageHeader
            title="Flashcards"
            subtitle={className}
            backHref="/classes"
            backState={classId ? { selectId: Number(classId) } : undefined}
            actions={
              <Button variant="primary" onClick={openCreate}>
                New flashcard
              </Button>
            }
          />

          <div className="flex flex-wrap items-center gap-2">
          {(["all", "due"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewFilter(v)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                viewFilter === v
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {v === "all" ? "All cards" : "Due"}
            </button>
          ))}
          {(["all", "easy", "medium", "hard"] as Diff[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficultyFilter(d)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                difficultyFilter === d
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {d === "all" ? "Any difficulty" : d}
            </button>
          ))}
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
          <Button className="ml-auto" onClick={() => handleStudy(dueCards)}>
            Study due
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Due now</div>
            <div className="text-2xl font-semibold">{progress?.due_now ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Due today</div>
            <div className="text-2xl font-semibold">{progress?.due_today ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Learning</div>
            <div className="text-2xl font-semibold">{progress?.learning ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-2xl font-semibold">{progress?.total ?? 0}</div>
          </div>
        </div>

        {loading && <div className="mt-4 text-sm text-slate-500">Loading...</div>}
        {error && <div className="mt-4 text-sm text-rose-600">{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-sm text-slate-500">
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
                <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700">
                        {(c.difficulty || "medium").toUpperCase()}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                        {status}
                      </span>
                      {c.file_id && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                          File scoped
                        </span>
                      )}
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

                  <div className="mt-3 text-base font-semibold text-slate-900">{sanitizeText(c.question)}</div>
                  <div className="mt-2 text-xs text-slate-500">Next review: {nextReview}</div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">Show answer</summary>
                    <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                      {sanitizeText(c.answer)}
                    </div>
                  </details>
                  {c.hint && (
                    <div className="mt-3 text-xs text-slate-500">
                      <span className="font-semibold">Hint:</span> {sanitizeText(c.hint)}
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div className="mt-3 text-xs text-slate-500">
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => setFormOpen(false)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {editingCard ? "Edit flashcard" : "New flashcard"}
                </h2>
                <button
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  onClick={() => setFormOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Question</label>
                  <textarea
                    value={formState.question}
                    onChange={(e) => setFormState((s) => ({ ...s, question: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Answer</label>
                  <textarea
                    value={formState.answer}
                    onChange={(e) => setFormState((s) => ({ ...s, answer: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    rows={4}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Hint (optional)</label>
                  <input
                    value={formState.hint}
                    onChange={(e) => setFormState((s) => ({ ...s, hint: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Difficulty</label>
                    <select
                      value={formState.difficulty}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, difficulty: e.target.value as FormState["difficulty"] }))
                      }
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">File (optional)</label>
                    <select
                      value={formState.file_id}
                      onChange={(e) => setFormState((s) => ({ ...s, file_id: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
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
                  <label className="text-xs font-semibold text-slate-600">Tags (comma separated)</label>
                  <input
                    value={formState.tags}
                    onChange={(e) => setFormState((s) => ({ ...s, tags: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </div>
                {editingCard && (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
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
      </main>
    </div>
  );
}
