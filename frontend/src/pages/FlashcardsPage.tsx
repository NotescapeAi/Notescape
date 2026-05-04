// src/pages/FlashcardsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BookOpen, Mic, Plus, Sparkles, Target, TrendingUp, Zap } from "lucide-react";
import {
  listFlashcards,
  deleteFlashcard,
  listClasses,
  listFiles,
  getFlashcardProgress,
  getMasteryStats,
  getWeakTags,
  createFlashcard,
  updateFlashcard,
  type Flashcard,
  type WeakTag,
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [cardsRaw, setCardsRaw] = useState<Flashcard[]>([]);
  const [className, setClassName] = useState<string>("");
  const [difficultyFilter, setDifficultyFilter] = useState<Diff>("all");
  const [viewFilter, setViewFilter] = useState<"all" | "due">("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);
  const [fileFilter, setFileFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>(() => (searchParams.get("tag") || "all").toLowerCase());
  const [weakTags, setWeakTags] = useState<WeakTag[]>([]);
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
    (async () => {
      try {
        const rows = await getWeakTags({ limit: 10 });
        setWeakTags(rows.filter((row) => row.class_id === id || row.class_id == null));
      } catch {
        setWeakTags([]);
      }
    })();
  }, [id]);

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

  useEffect(() => {
    const fromQuery = (searchParams.get("tag") || "all").toLowerCase();
    setTagFilter(fromQuery);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const byDifficulty =
      difficultyFilter === "all"
        ? cardsRaw
        : cardsRaw.filter((c) => (c.difficulty ?? "medium") === difficultyFilter);
    const byDue = viewFilter === "due" ? byDifficulty.filter((c) => isDue(c)) : byDifficulty;
    if (tagFilter === "all") return byDue;
    return byDue.filter((c) => (c.tags ?? []).map((t) => String(t).toLowerCase()).includes(tagFilter));
  }, [cardsRaw, difficultyFilter, viewFilter, tagFilter]);

  const dueCards = useMemo(() => cardsRaw.filter((c) => isDue(c)), [cardsRaw]);
  const availableTags = useMemo(() => {
    const values = new Set<string>();
    cardsRaw.forEach((card) => {
      (card.tags ?? []).forEach((tag) => {
        const value = String(tag).trim().toLowerCase();
        if (value) values.add(value);
      });
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [cardsRaw]);

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

  const handleVoiceFlashcards = (cardsList: Flashcard[], startIndex = 0) => {
    navigate(`/classes/${id}/flashcards/voice`, {
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

  function setTagAndQuery(tag: string) {
    setTagFilter(tag);
    const next = new URLSearchParams(searchParams);
    if (tag === "all") {
      next.delete("tag");
      setSearchParams(next, { replace: true });
      return;
    }
    next.set("tag", tag);
    setSearchParams(next, { replace: true });
  }

  const masteryPct = masteryStats?.mastery_percent ?? 0;
  const dueNowCount = progress?.due_now ?? 0;
  const totalCount = progress?.total ?? cardsRaw.length;

  return (
    <AppShell title="Flashcards" breadcrumbs={["Flashcards"]} subtitle={className || undefined}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        {/* Hero header */}
        <div className="rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                <Sparkles className="h-3 w-3" />
                Flashcards
              </div>
              <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-[var(--text-main)] sm:text-[30px]">
                Practice with intent
              </h1>
              <p className="mt-1 text-[13.5px] text-[var(--text-muted)]">
                {className ? (
                  <>Class: <span className="font-medium text-[var(--text-main)]">{className}</span></>
                ) : (
                  "Browse, study, or add new cards"
                )}
                {totalCount > 0 ? (
                  <> &middot; {totalCount} total {totalCount === 1 ? "card" : "cards"}</>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => handleStudy(dueCards)} className="gap-1.5">
                <BookOpen className="h-4 w-4" />
                Study due{dueNowCount ? ` (${dueNowCount})` : ""}
              </Button>
              <Button onClick={() => handleVoiceFlashcards(dueCards.length ? dueCards : filtered)} className="gap-1.5">
                <Mic className="h-4 w-4" />
                Voice flashcards
              </Button>
              <Button onClick={openCreate} className="gap-1.5">
                <Plus className="h-4 w-4" />
                New flashcard
              </Button>
            </div>
          </div>

          {/* Mastery ribbon */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--primary)]" />
              <span className="text-[13px] font-semibold text-[var(--text-main)]">Mastery</span>
              <span className="text-[13px] font-semibold tabular-nums text-[var(--primary)]">{masteryPct}%</span>
            </div>
            <div
              className="flash-progress-track flex-1 min-w-[180px]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={masteryPct}
              aria-label="Mastery progress"
            >
              <div
                className="flash-progress-fill"
                style={{ ["--value" as any]: `${masteryPct}%` } as React.CSSProperties}
              />
            </div>
          </div>
        </div>

        {/* Stat tiles — combined mastery + progress */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: "Due now",
              value: progress?.due_now ?? 0,
              icon: <Zap className="h-4 w-4" />,
              tone: "var(--danger)",
              bg: "var(--danger-soft)",
            },
            {
              label: "Due today",
              value: progress?.due_today ?? 0,
              icon: <Target className="h-4 w-4" />,
              tone: "var(--warning)",
              bg: "var(--warning-soft)",
            },
            {
              label: "Learning",
              value: progress?.learning ?? 0,
              icon: <TrendingUp className="h-4 w-4" />,
              tone: "var(--primary)",
              bg: "var(--primary-soft)",
            },
            {
              label: "Mastered",
              value: masteryStats?.mastered_count ?? 0,
              icon: <Sparkles className="h-4 w-4" />,
              tone: "var(--success)",
              bg: "var(--success-soft)",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] transition hover:-translate-y-[1px] hover:shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
                  {stat.label}
                </div>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)]"
                  style={{ background: stat.bg, color: stat.tone }}
                >
                  {stat.icon}
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-main)]">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
            Filter deck
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(["all", "due"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewFilter(v)}
                className={`tab-pill ${viewFilter === v ? "tab-pill-active" : "tab-pill-muted"}`}
              >
                {v === "all" ? "All cards" : "Due"}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
            {(["all", "easy", "medium", "hard"] as Diff[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficultyFilter(d)}
                className={`tab-pill ${difficultyFilter === d ? "tab-pill-active" : "tab-pill-muted"}`}
              >
                {d === "all" ? "Any difficulty" : d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                aria-label="Filter by file"
                className="h-9 min-w-[180px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text-main)]"
              >
                <option value="all">All files</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
              </select>
              <select
                value={tagFilter}
                onChange={(e) => setTagAndQuery(e.target.value)}
                aria-label="Filter by tag"
                className="h-9 min-w-[140px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text-main)]"
              >
                <option value="all">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {weakTags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted-soft)]">
                Weak topics:
              </span>
              {weakTags.map((tag) => {
                const active = tagFilter === tag.tag.toLowerCase();
                return (
                  <button
                    key={tag.tag_id}
                    onClick={() => setTagAndQuery(tag.tag.toLowerCase())}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                      active
                        ? "border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    {tag.tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {loading && <div className="text-sm text-[var(--text-muted)]">Loading...</div>}
        {error && (
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-[var(--radius-2xl)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="mt-3 text-[15px] font-semibold text-[var(--text-main)]">No flashcards yet</div>
            <div className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
              Generate flashcards from a document to begin review, or add a card manually.
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={openCreate} className="gap-1.5">
                <Plus className="h-4 w-4" />
                New flashcard
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => {
              const tags = Array.isArray(c.tags)
                ? c.tags.map((t) => String(t).trim()).filter(Boolean)
                : [];
              const status = dueStatus(c);
              const nextReview = formatNextReview(c.due_at);
              const startIndex = filtered.findIndex((fc) => String(fc.id) === String(c.id));
              const rawDiff: string = (c as unknown as { difficulty?: string }).difficulty ?? "medium";
              const diff = rawDiff.toLowerCase();
              const difficultyTone =
                diff === "easy" ? "pill-success" : diff === "hard" ? "pill-danger" : "pill-info";
              const statusTone =
                status === "Due" ? "pill-warning" : status === "Learning" ? "pill-info" : "pill-neutral";

              return (
                <div
                  key={c.id}
                  className="group flex flex-col rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition hover:-translate-y-[1px] hover:border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] hover:shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={`pill ${difficultyTone}`}>
                        {diff.toUpperCase()}
                      </span>
                      <span className={`pill ${statusTone}`}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
                        {status}
                      </span>
                    </div>
                    <KebabMenu
                      items={[
                        { label: "Study", onClick: () => handleStudy(filtered, startIndex) },
                        { label: "Voice flashcards", onClick: () => handleVoiceFlashcards(filtered, startIndex) },
                        { label: "View", onClick: () => handleView(filtered, startIndex) },
                        { label: "Edit", onClick: () => openEdit(c) },
                        { label: "Delete", onClick: () => handleDelete(String(c.id)) },
                      ]}
                    />
                  </div>

                  <div className="mt-3 text-[15px] font-semibold leading-6 text-[var(--text-main)] line-clamp-3">
                    {sanitizeText(c.question)}
                  </div>
                  <div className="mt-2 text-[11.5px] font-medium text-[var(--text-muted-soft)]">
                    Next review: <span className="text-[var(--text-muted)]">{nextReview}</span>
                  </div>

                  <details className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm open:py-3">
                    <summary className="cursor-pointer list-none text-[12.5px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--primary)]">
                      Show answer
                    </summary>
                    <div className="mt-2 text-[13px] leading-6 text-[var(--text-main)] whitespace-pre-wrap">
                      {sanitizeText(c.answer)}
                    </div>
                  </details>

                  {c.hint && (
                    <div className="mt-3 text-[11.5px] text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-muted-soft)]">Hint:</span>{" "}
                      {sanitizeText(c.hint)}
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-muted)]"
                        >
                          {t}
                        </span>
                      ))}
                      {tags.length > 4 && (
                        <span className="inline-flex items-center text-[10.5px] font-medium text-[var(--text-muted-soft)]">
                          +{tags.length - 4} more
                        </span>
                      )}
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
