import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  FileText,
  FolderPlus,
  GraduationCap,
  Layers,
  MessageCircle,
  Mic,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import StatCard from "../components/ui/StatCard";
import EmptyState from "../components/ui/EmptyState";
import SectionHeader from "../components/ui/SectionHeader";
import { useUser } from "../hooks/useUser";
import {
  listClasses,
  listFiles,
  getFlashcardProgress,
  listFlashcards,
  getStudySessionOverview,
  getWeakTags,
  getQuizHistory,
  listRecentStudySessions,
  type ClassRow,
  type Flashcard,
  type WeakTag,
  type QuizHistoryItem,
  type StudySession,
} from "../lib/api";

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  return `${mins}m`;
}

function formatShortDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function isDue(card: Flashcard) {
  if (!card.due_at) return true;
  return new Date(card.due_at) <= new Date();
}

/** Weighted accuracy across recent attempts (meaningful totals only). */
function quizAttemptsAccuracyPct(attempts: QuizHistoryItem[]): number | null {
  if (!attempts.length) return null;
  let earned = 0;
  let possible = 0;
  for (const a of attempts) {
    const tp = Number(a.total_possible);
    if (!Number.isFinite(tp) || tp <= 0) continue;
    earned += Number(a.score) || 0;
    possible += tp;
  }
  if (possible <= 0) return null;
  return Math.round((earned / possible) * 100);
}

export default function Dashboard() {
  const { profile } = useUser();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [docCountByClassId, setDocCountByClassId] = useState<Record<number, number>>({});
  const [fileCount, setFileCount] = useState<number>(0);
  const [dueNow, setDueNow] = useState<number>(0);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [resumeFile, setResumeFile] = useState<string | null>(null);
  const [studyClassId, setStudyClassId] = useState<number | null>(null);
  const [recentFiles, setRecentFiles] = useState<Array<{ filename: string; className: string }>>([]);
  const [studyOverview, setStudyOverview] = useState<{
    total_seconds_7d: number;
    sessions_7d: number;
    avg_seconds_7d: number;
  } | null>(null);
  const [weakTags, setWeakTags] = useState<WeakTag[]>([]);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const firstName =
    profile?.display_name?.trim().split(/\s+/)[0] ||
    profile?.full_name?.trim().split(/\s+/)[0] ||
    "";

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cs = await listClasses();
        setClasses(cs);

        const fileGroups = await Promise.all(
          cs.map(async (c) => ({ classId: c.id, className: c.name, rows: await listFiles(c.id) }))
        );
        const counts: Record<number, number> = {};
        fileGroups.forEach((g) => {
          counts[g.classId] = g.rows?.length ?? 0;
        });
        setDocCountByClassId(counts);

        const flatFiles = fileGroups.flatMap((group) =>
          (group.rows ?? []).map((row) => ({
            filename: row.filename,
            uploaded_at: row.uploaded_at ?? undefined,
            className: group.className,
          }))
        );
        setFileCount(flatFiles.length);
        const sortedFiles = [...flatFiles].sort((a, b) =>
          String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? ""))
        );
        setRecentFiles(sortedFiles.slice(0, 4));

        const progRows = await Promise.all(cs.map((c) => getFlashcardProgress(c.id).catch(() => null)));
        const totalDue = progRows.reduce((sum, p) => sum + Number(p?.due_now ?? 0), 0);
        setDueNow(totalDue);

        let bestIdx = -1;
        let bestDue = -1;
        progRows.forEach((p, i) => {
          const d = Number(p?.due_now ?? 0);
          if (d > bestDue) {
            bestDue = d;
            bestIdx = i;
          }
        });
        const cardClassId = bestIdx >= 0 && bestDue > 0 ? cs[bestIdx]?.id : cs[0]?.id;
        setStudyClassId(cardClassId ?? null);
        if (cardClassId != null) {
          const classFiles = await listFiles(cardClassId);
          setResumeFile(classFiles?.[0]?.filename ?? null);
          const cards = await listFlashcards(cardClassId);
          setDueCards((cards ?? []).filter(isDue).slice(0, 5));
        } else {
          setResumeFile(null);
          setDueCards([]);
        }

        const [overview, weakTagRows, historyRows, sessionsRows] = await Promise.all([
          getStudySessionOverview(),
          getWeakTags({ limit: 12 }),
          getQuizHistory().catch(() => [] as QuizHistoryItem[]),
          listRecentStudySessions(8).catch(() => [] as StudySession[]),
        ]);
        setStudyOverview({
          total_seconds_7d: overview.total_seconds_7d,
          sessions_7d: overview.sessions_7d,
          avg_seconds_7d: overview.avg_seconds_7d,
        });
        setWeakTags(weakTagRows);
        setQuizHistory(
          [...historyRows].sort((a, b) => String(b.attempted_at).localeCompare(String(a.attempted_at))).slice(0, 8)
        );
        setRecentSessions(sessionsRows);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const recentClasses = useMemo(() => classes.slice(0, 6), [classes]);

  const quizAccuracyFromAttempts = useMemo(() => quizAttemptsAccuracyPct(quizHistory), [quizHistory]);

  const weakQuizTags = useMemo(() => {
    const rows = weakTags.filter((t) => t.has_quiz_data === true);
    return [...rows].sort((a, b) => a.quiz_accuracy_pct - b.quiz_accuracy_pct);
  }, [weakTags]);

  const weakFlashTags = useMemo(() => {
    const rows = weakTags.filter((t) => t.has_flash_data === true && t.has_quiz_data !== true);
    return [...rows].sort((a, b) => b.flashcard_difficulty_pct - a.flashcard_difficulty_pct);
  }, [weakTags]);

  const weakestQuiz = weakQuizTags[0];
  const weakestFlash = weakFlashTags[0];
  const weakestQuizClassName = weakestQuiz?.class_id
    ? classes.find((c) => c.id === weakestQuiz.class_id)?.name
    : null;
  const weakestFlashClassName = weakestFlash?.class_id
    ? classes.find((c) => c.id === weakestFlash.class_id)?.name
    : null;

  const studyClass = studyClassId ? classes.find((c) => c.id === studyClassId) : null;
  const primaryClass = classes[0];

  const lastSession = recentSessions[0];
  const lastQuiz = quizHistory[0];

  const activityRows = useMemo(() => {
    const rows: Array<{ id: string; icon: ReactNode; label: string; detail?: string }> = [];
    recentFiles.slice(0, 2).forEach((f) => {
      rows.push({
        id: `f-${f.filename}`,
        icon: <FileText className="h-4 w-4" />,
        label: "Document uploaded",
        detail: `${f.filename} · ${f.className}`,
      });
    });
    quizHistory.slice(0, 2).forEach((q) => {
      rows.push({
        id: `q-${q.attempt_id}`,
        icon: <ClipboardList className="h-4 w-4" />,
        label: "Quiz attempt",
        detail: `${q.quiz_title} · ${q.score}/${q.total_possible}`,
      });
    });
    recentSessions.slice(0, 3).forEach((s) => {
      rows.push({
        id: `s-${s.id}`,
        icon: <BookOpen className="h-4 w-4" />,
        label: s.mode?.includes("voice") ? "Voice flashcards session" : "Study session",
        detail: [s.class_name, s.started_at ? formatShortDate(s.started_at) : ""].filter(Boolean).join(" · "),
      });
    });
    return rows.slice(0, 6);
  }, [recentFiles, quizHistory, recentSessions]);

  const isNewUser = !loading && classes.length === 0;

  const primaryCta = useMemo(() => {
    if (loading || isNewUser) return null;
    if (dueNow > 0 && studyClassId) {
      return {
        title: "Review due flashcards",
        body: `You have ${dueNow} card${dueNow === 1 ? "" : "s"} due for review across your classes (spaced repetition).`,
        primaryLabel: dueCards.length ? "Start review" : "Open flashcards hub",
        onPrimary: () =>
          dueCards.length
            ? navigate(`/classes/${studyClassId}/flashcards/study`, {
                state: { cards: dueCards, className: studyClass?.name ?? "", startIndex: 0 },
              })
            : navigate("/flashcards"),
      };
    }
    if (lastSession?.class_id) {
      const cid = lastSession.class_id;
      const cname = lastSession.class_name || classes.find((c) => c.id === cid)?.name || "Your class";
      const voice = lastSession.mode?.includes("voice");
      return {
        title: "Continue where you left off",
        body: `${voice ? "Voice flashcards" : "Study session"} in ${cname}${lastSession.started_at ? ` · ${formatShortDate(lastSession.started_at)}` : ""}.`,
        primaryLabel: voice ? "Open voice flashcards" : "Open flashcards",
        onPrimary: () =>
          voice
            ? navigate(`/classes/${cid}/flashcards/voice`)
            : navigate(`/classes/${cid}/flashcards`),
      };
    }
    if (lastQuiz) {
      return {
        title: "Pick up a quiz",
        body: `Last attempt: ${lastQuiz.quiz_title} (${lastQuiz.score}/${lastQuiz.total_possible}).`,
        primaryLabel: "Open this quiz",
        onPrimary: () => navigate(`/quizzes/${lastQuiz.quiz_id}`),
      };
    }
    if (fileCount === 0 && classes.length > 0) {
      return {
        title: "Add study material",
        body: "Upload a document so you can generate flashcards and quizzes.",
        primaryLabel: "Upload document",
        onPrimary: () => navigate("/classes"),
      };
    }
    return {
      title: "Browse flashcards",
      body: "Review or study cards from any of your classes.",
      primaryLabel: "Open flashcards hub",
      onPrimary: () => navigate("/flashcards"),
    };
  }, [
    loading,
    isNewUser,
    dueNow,
    studyClassId,
    dueCards,
    studyClass?.name,
    lastSession,
    lastQuiz,
    fileCount,
    classes,
    navigate,
    dueCards.length,
  ]);

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/classes"
        className="inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 text-sm font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Upload className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Upload document</span>
        <span className="sm:hidden">Upload</span>
      </Link>
      <Link
        to="/classes"
        className="inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:px-3.5"
      >
        <FolderPlus className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">New class</span>
        <span className="sm:hidden">Class</span>
      </Link>
    </div>
  );

  return (
    <AppShell
      title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
      subtitle="Continue studying from your classes, documents, flashcards, and quizzes."
      headerMaxWidthClassName="max-w-[1180px]"
      headerActions={headerActions}
    >
      <div className="mx-auto w-full max-w-[1180px] space-y-6 pb-10">
        {!isNewUser && primaryCta ? (
          <section className="premium-cta p-5 sm:p-7">
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <span className="eyebrow">
                  <span className="eyebrow-dot" aria-hidden />
                  Next step
                </span>
                <h2 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.025em] text-[var(--text-main)] sm:text-[26px]">
                  {primaryCta.title}
                </h2>
                <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[var(--text-secondary)] sm:text-[15px]">
                  {primaryCta.body}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
                  <Link
                    to="/chatbot"
                    className="inline-flex items-center gap-1.5 font-semibold text-[var(--primary)] underline-offset-4 hover:underline"
                  >
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Ask from your materials
                  </Link>
                  <Link
                    to="/voice-revision"
                    className="inline-flex items-center gap-1.5 font-medium text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-main)] hover:underline"
                  >
                    <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Voice flashcards
                  </Link>
                </div>
              </div>
              <div className="flex shrink-0 items-end">
                <button
                  type="button"
                  className="btn-premium"
                  onClick={primaryCta.onPrimary}
                >
                  {primaryCta.primaryLabel}
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isNewUser ? (
          <>
            <EmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title="Welcome to Notescape"
              description="Start by creating a class or uploading a study document."
              action={
                <>
                  <Button type="button" variant="primary" onClick={() => navigate("/classes")}>
                    Open Classes
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => navigate("/flashcards")}>
                    Flashcards hub
                  </Button>
                </>
              }
            />
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                { step: "1", title: "Create a class", body: "Group materials the way you think about the course." },
                { step: "2", title: "Upload study material", body: "PDFs, slides, or notes — we index them for recall." },
                { step: "3", title: "Generate flashcards or a quiz", body: "Turn files into active practice in one click." },
              ].map((s) => (
                <li key={s.step} className="ns-card list-none p-4 sm:p-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-accent-soft)] text-xs font-bold text-[var(--primary)]">
                    {s.step}
                  </div>
                  <div className="mt-3 font-semibold text-[var(--text-main)]">{s.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{s.body}</p>
                </li>
              ))}
            </ol>
          </>
        ) : null}

        {!isNewUser ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active classes"
              value={classes.length}
              hint="Classes you created."
              icon={<GraduationCap className="h-4 w-4" />}
              tone="primary"
              loading={loading}
            />
            <StatCard
              label="Documents"
              value={fileCount}
              hint={
                fileCount === 0
                  ? "No documents uploaded.\nUpload PDFs, notes, or slides to start studying with context."
                  : "Files uploaded to your classes."
              }
              icon={<FileText className="h-4 w-4" />}
              tone="neutral"
              loading={loading}
            />
            <StatCard
              label="Due for review"
              value={dueNow}
              hint="Flashcards due now (spaced repetition), all classes."
              icon={<Layers className="h-4 w-4" />}
              tone={dueNow > 0 ? "warning" : "neutral"}
              loading={loading}
            />
            <StatCard
              label="Quiz accuracy"
              value={loading ? "—" : quizAccuracyFromAttempts != null ? `${quizAccuracyFromAttempts}%` : "—"}
              hint={
                quizAccuracyFromAttempts != null
                  ? "Across your recent quiz attempts."
                  : "No quiz attempts yet.\nTake a quiz to start tracking accuracy."
              }
              icon={<Target className="h-4 w-4" />}
              tone={
                quizAccuracyFromAttempts != null
                  ? quizAccuracyFromAttempts >= 75
                    ? "success"
                    : quizAccuracyFromAttempts >= 50
                      ? "warning"
                      : "danger"
                  : "neutral"
              }
              loading={loading}
            />
          </section>
        ) : null}

        {!isNewUser ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="What to study next"
              title={weakestQuiz ? "Topic from your quizzes" : weakestFlash ? "Topic from flashcard reviews" : "Build your queue"}
              description={
                weakestQuiz || weakestFlash
                  ? "Based on your recent practice data."
                  : "Add materials, review flashcards, or take a quiz to get targeted suggestions."
              }
            />
            {weakestQuiz ? (
              <div className="mt-4 flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Target className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--text-main)]">
                        {weakestQuiz.tag}
                      </span>
                      <span
                        className={
                          Math.round(weakestQuiz.quiz_accuracy_pct) < 50
                            ? "topic-chip topic-chip--weak"
                            : "topic-chip topic-chip--improving"
                        }
                      >
                        {Math.round(weakestQuiz.quiz_accuracy_pct)}% accuracy
                      </span>
                    </div>
                    <div className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                      {weakestQuizClassName ? `${weakestQuizClassName} · ` : ""}
                      Recent quiz accuracy is below your average. Reinforce with targeted review.
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {weakestQuiz.class_id ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        navigate(`/classes/${weakestQuiz.class_id}/flashcards?tag=${encodeURIComponent(weakestQuiz.tag)}`)
                      }
                    >
                      Review flashcards
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/quizzes")}>
                    Quizzes
                  </Button>
                </div>
              </div>
            ) : weakestFlash ? (
              <div className="mt-4 flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--warning-soft)] text-[var(--warning)]">
                    <Layers className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--text-main)]">
                        {weakestFlash.tag}
                      </span>
                      <span className="topic-chip topic-chip--improving">
                        {Math.round(weakestFlash.flashcard_difficulty_pct)}% hard
                      </span>
                    </div>
                    <div className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                      {weakestFlashClassName ? `${weakestFlashClassName} · ` : ""}
                      Recent flashcard ratings show extra friction here.
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {weakestFlash.class_id ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        navigate(`/classes/${weakestFlash.class_id}/flashcards?tag=${encodeURIComponent(weakestFlash.tag)}`)
                      }
                    >
                      Review flashcards
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                No topic signals yet. Upload a document, review flashcards, or complete a quiz.
              </p>
            )}
          </section>
        ) : null}

        {!isNewUser ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="ns-card flex flex-col p-5">
              <SectionHeader
                eyebrow="Review queue"
                title={studyClass ? `Due cards · ${studyClass.name}` : "Flashcards"}
                description={
                  dueNow > 0 && studyClass
                    ? `${dueNow} due across all classes. Showing the next few from ${studyClass.name}.`
                    : undefined
                }
                action={
                  studyClassId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        dueCards.length
                          ? navigate(`/classes/${studyClassId}/flashcards/study`, {
                              state: { cards: dueCards, className: studyClass?.name ?? "", startIndex: 0 },
                            })
                          : navigate("/flashcards")
                      }
                    >
                      {dueCards.length ? "Study now" : "Flashcards hub"}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  ) : null
                }
              />
              <div className="mt-4 min-h-[110px] space-y-2">
                {dueCards.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-center text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                    <span className="font-medium text-[var(--text-secondary)]">No flashcards ready for review.</span>
                    <br />
                    <span className="mt-2 inline-block text-[13px]">
                      Generate flashcards from a document to begin review, or open the flashcards hub for every class.
                    </span>
                  </div>
                ) : (
                  dueCards.map((card) => (
                    <div
                      key={card.id}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                    >
                      <div className="line-clamp-2 font-medium text-[var(--text-main)]">{card.question}</div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted-soft)]">{card.difficulty ?? "medium"}</div>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => navigate("/flashcards")}
                  className="w-full pt-1 text-left text-[13px] font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                >
                  View all classes in Flashcards hub
                </button>
              </div>
            </section>

            <section className="ns-card flex flex-col p-5">
              <SectionHeader eyebrow="Continue" title="Resume" />
              <div className="mt-2 space-y-3 text-[13.5px] text-[var(--text-muted)]">
                {lastSession?.class_id ? (
                  <p>
                    <span className="font-medium text-[var(--text-main)]">Last session: </span>
                    {lastSession.mode?.includes("voice") ? "Voice flashcards" : "Flashcards study"}
                    {lastSession.class_name ? ` · ${lastSession.class_name}` : ""}
                    {lastSession.started_at ? ` · ${formatShortDate(lastSession.started_at)}` : ""}
                  </p>
                ) : recentFiles[0] ? (
                  <p>
                    <span className="font-medium text-[var(--text-main)]">Recent file: </span>
                    {recentFiles[0].filename} ({recentFiles[0].className})
                  </p>
                ) : (
                  <p>Upload a document in a class to anchor your next session.</p>
                )}
              </div>
              {lastSession?.class_id ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      lastSession.mode?.includes("voice")
                        ? navigate(`/classes/${lastSession.class_id}/flashcards/voice`)
                        : navigate(`/classes/${lastSession.class_id}/flashcards`)
                    }
                  >
                    Continue
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/quizzes")}>
                    Quizzes
                  </Button>
                </div>
              ) : primaryClass ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => navigate("/classes", { state: { selectId: primaryClass.id } })}
                  >
                    Open class
                  </Button>
                  {resumeFile ? (
                    <span className="self-center text-xs text-[var(--text-muted)]">Latest file: {resumeFile}</span>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {!isNewUser && quizHistory.length > 0 ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Quizzes"
              title="Recent attempts"
              action={
                <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/quizzes/history")}>
                  Full history
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              }
            />
            <ul className="mt-4 divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
              {quizHistory.slice(0, 5).map((q) => {
                const pct =
                  q.total_possible > 0 ? Math.round((Number(q.score) / Number(q.total_possible)) * 100) : null;
                return (
                  <li key={q.attempt_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--text-main)]">{q.quiz_title}</div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {q.file_name ? `${q.file_name} · ` : ""}
                        {formatShortDate(q.attempted_at)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-sm font-semibold text-[var(--text-secondary)]">
                        {q.score}/{q.total_possible}
                        {pct != null ? ` (${pct}%)` : ""}
                      </span>
                      <Button type="button" variant="secondary" size="sm" onClick={() => navigate(`/quizzes/${q.quiz_id}`)}>
                        Retry
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {!isNewUser ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Your classes"
              title="Overview"
              action={
                <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/classes")}>
                  All classes
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              }
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentClasses.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-[13.5px] leading-relaxed text-[var(--text-muted)] sm:col-span-2 lg:col-span-3">
                  Start by creating a class or uploading a study document.
                </div>
              ) : (
                recentClasses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate("/classes", { state: { selectId: c.id } })}
                    className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[11px] font-bold text-[var(--primary)]">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-[var(--text-main)]">{c.name}</div>
                        <div className="truncate text-xs text-[var(--text-muted-soft)]">{c.subject ?? "General"}</div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--text-muted-soft)] transition group-hover:text-[var(--text-main)]" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--text-muted)]">
                      <span className="pill pill-neutral">{docCountByClassId[c.id] ?? 0} docs</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : null}

        {!isNewUser ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Activity"
              title="Recent moves"
              description={`Study time (7d): ${studyOverview ? formatDuration(studyOverview.total_seconds_7d) : "—"} · ${studyOverview?.sessions_7d ?? 0} sessions`}
            />
            {activityRows.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">No activity yet. Create a class to begin.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {activityRows.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-3 rounded-xl border border-transparent px-1 py-1 transition hover:border-[var(--border)] hover:bg-[var(--surface-2)]/60"
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--primary)]">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text-main)]">{item.label}</div>
                      {item.detail ? <div className="text-xs text-[var(--text-secondary)]">{item.detail}</div> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
