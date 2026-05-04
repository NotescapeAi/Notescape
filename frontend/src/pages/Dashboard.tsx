/*
 * Dashboard — premium, curated, student-centred.
 *
 * Information hierarchy (top → bottom):
 *   1. Hero — primary review CTA + quick actions (Upload doc / New class)
 *   2. Quick stats — Classes / Documents / Due / Quiz accuracy
 *   3. This week — momentum panel: streak, study time, days studied + sparkline
 *   4. What to study next — Best next step + Needs attention pair
 *   5. Continue learning — resume card + due-cards preview pair
 *   6. Class progress — class health rows with progress bars
 *   7. Recent activity — clean timeline
 *
 * Every section either drives a decision, surfaces progress, or invites the
 * next session. Sections gracefully omit when there's no real data.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  FileText,
  Flame,
  FolderPlus,
  GraduationCap,
  Layers,
  Lightbulb,
  MessageCircle,
  Mic,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
} from "lucide-react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import StatCard from "../components/ui/StatCard";
import EmptyState from "../components/ui/EmptyState";
import SectionHeader from "../components/ui/SectionHeader";
import {
  MiniWeekBars,
  ProgressBar,
  RadialProgress,
  Sparkline,
  WeekStrip,
} from "../components/analytics/MiniCharts";
import { useUser } from "../hooks/useUser";
import {
  listClasses,
  listFiles,
  getFlashcardProgress,
  listFlashcards,
  getStudySessionOverview,
  getStudySessionTrends,
  getWeakTags,
  getQuizHistory,
  listRecentStudySessions,
  type ClassRow,
  type Flashcard,
  type WeakTag,
  type QuizHistoryItem,
  type StudySession,
  type StudySessionTrend,
} from "../lib/api";

/* =================================================================
   Helpers
================================================================= */

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  return `${mins}m`;
}

function formatRelativeDay(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

/**
 * Build a 7-day series from study trend points (most recent on the right).
 * Missing days come back as 0.
 */
function buildWeekSeries(trends: StudySessionTrend[]): { dates: string[]; seconds: number[] } {
  const out: { dates: string[]; seconds: number[] } = { dates: [], seconds: [] };
  const map = new Map<string, number>();
  for (const t of trends) {
    if (!t?.day) continue;
    map.set(t.day.slice(0, 10), Number(t.total_seconds) || 0);
  }
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.dates.push(key);
    out.seconds.push(map.get(key) ?? 0);
  }
  return out;
}

/** Compute current consecutive-day streak from a 7-day series (today first day). */
function computeStreak(series: number[]): number {
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] > 0) streak++;
    else break;
  }
  return streak;
}

/** Two-letter day labels for the week strip (Mon-first locale-friendly). */
function dayLabelFromIso(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "narrow" });
  } catch {
    return "";
  }
}

/** Compute trend pct accuracy from recent quiz attempts, week-by-week. */
function recentQuizTrend(attempts: QuizHistoryItem[]): number[] {
  // Take the most recent 14 attempts and map each to pct accuracy.
  const recent = [...attempts]
    .filter((a) => Number(a.total_possible) > 0)
    .sort((a, b) => String(a.attempted_at).localeCompare(String(b.attempted_at)))
    .slice(-14);
  return recent.map((a) =>
    Math.max(0, Math.min(100, Math.round((Number(a.score) / Number(a.total_possible)) * 100))),
  );
}

/* =================================================================
   Dashboard
================================================================= */

export default function Dashboard() {
  const { profile } = useUser();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [docCountByClassId, setDocCountByClassId] = useState<Record<number, number>>({});
  const [dueByClassId, setDueByClassId] = useState<Record<number, number>>({});
  const [fileCount, setFileCount] = useState<number>(0);
  const [dueNow, setDueNow] = useState<number>(0);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [resumeFile, setResumeFile] = useState<string | null>(null);
  const [studyClassId, setStudyClassId] = useState<number | null>(null);
  const [recentFiles, setRecentFiles] = useState<Array<{ filename: string; className: string; uploaded_at?: string }>>([]);
  const [studyOverview, setStudyOverview] = useState<{
    total_seconds_7d: number;
    sessions_7d: number;
    avg_seconds_7d: number;
  } | null>(null);
  const [studyTrends, setStudyTrends] = useState<StudySessionTrend[]>([]);
  const [weakTags, setWeakTags] = useState<WeakTag[]>([]);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);

  // Surface the user's first name for personalised body copy elsewhere; the
  // page heading itself stays product-like ("Today's focus") for premium feel.
  const firstName =
    profile?.display_name?.trim().split(/\s+/)[0] ||
    profile?.full_name?.trim().split(/\s+/)[0] ||
    "";
  void firstName;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cs = await listClasses();
        setClasses(cs);

        const fileGroups = await Promise.all(
          cs.map(async (c) => ({ classId: c.id, className: c.name, rows: await listFiles(c.id) })),
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
          })),
        );
        setFileCount(flatFiles.length);
        const sortedFiles = [...flatFiles].sort((a, b) =>
          String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")),
        );
        setRecentFiles(sortedFiles.slice(0, 4));

        const progRows = await Promise.all(cs.map((c) => getFlashcardProgress(c.id).catch(() => null)));
        const dueMap: Record<number, number> = {};
        cs.forEach((c, i) => {
          dueMap[c.id] = Number(progRows[i]?.due_now ?? 0);
        });
        setDueByClassId(dueMap);
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

        const [overview, trendsRows, weakTagRows, historyRows, sessionsRows] = await Promise.all([
          getStudySessionOverview(),
          getStudySessionTrends(7).catch(() => [] as StudySessionTrend[]),
          getWeakTags({ limit: 12 }),
          getQuizHistory().catch(() => [] as QuizHistoryItem[]),
          listRecentStudySessions(8).catch(() => [] as StudySession[]),
        ]);
        setStudyOverview({
          total_seconds_7d: overview.total_seconds_7d,
          sessions_7d: overview.sessions_7d,
          avg_seconds_7d: overview.avg_seconds_7d,
        });
        setStudyTrends(trendsRows);
        setWeakTags(weakTagRows);
        setQuizHistory(
          [...historyRows]
            .sort((a, b) => String(b.attempted_at).localeCompare(String(a.attempted_at)))
            .slice(0, 8),
        );
        setRecentSessions(sessionsRows);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------- Derived data ---------- */

  const week = useMemo(() => buildWeekSeries(studyTrends), [studyTrends]);
  const streak = useMemo(() => computeStreak(week.seconds), [week.seconds]);
  const daysStudied7d = useMemo(() => week.seconds.filter((s) => s > 0).length, [week.seconds]);
  const totalSecondsThisWeek = useMemo(
    () => week.seconds.reduce((a, b) => a + b, 0),
    [week.seconds],
  );

  const quizTrend = useMemo(() => recentQuizTrend(quizHistory), [quizHistory]);
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

  const isNewUser = !loading && classes.length === 0;

  const primaryCta = useMemo(() => {
    if (loading || isNewUser) return null;
    if (dueNow > 0 && studyClassId) {
      return {
        eyebrow: "Best next step",
        title: dueNow === 1 ? "1 card is ready to review" : `${dueNow} cards are ready to review`,
        body: studyClass
          ? `Spaced repetition will surface the ones from ${studyClass.name} first.`
          : "Spaced repetition will surface the ones you need most.",
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
        eyebrow: "Pick up where you left off",
        title: voice ? `Voice flashcards · ${cname}` : `Flashcards · ${cname}`,
        body: lastSession.started_at
          ? `Last studied ${formatRelativeDay(lastSession.started_at).toLowerCase()}.`
          : "Continue your last session in one click.",
        primaryLabel: voice ? "Open voice mode" : "Open flashcards",
        onPrimary: () =>
          voice
            ? navigate(`/classes/${cid}/flashcards/voice`)
            : navigate(`/classes/${cid}/flashcards`),
      };
    }
    if (lastQuiz) {
      const pct =
        Number(lastQuiz.total_possible) > 0
          ? Math.round((Number(lastQuiz.score) / Number(lastQuiz.total_possible)) * 100)
          : null;
      return {
        eyebrow: "Continue practising",
        title: lastQuiz.quiz_title,
        body:
          pct != null
            ? `Last attempt scored ${pct}% — try a fresh round to lock it in.`
            : "Try the quiz again to lock it in.",
        primaryLabel: "Retake quiz",
        onPrimary: () => navigate(`/quizzes/${lastQuiz.quiz_id}`),
      };
    }
    if (fileCount === 0 && classes.length > 0) {
      return {
        eyebrow: "Get started",
        title: "Add your first study material",
        body: "Upload a PDF or notes — flashcards and quizzes generate automatically.",
        primaryLabel: "Upload document",
        onPrimary: () => navigate("/classes"),
      };
    }
    return {
      eyebrow: "Today's focus",
      title: "Open your flashcards",
      body: "Browse decks across every class.",
      primaryLabel: "Open flashcards hub",
      onPrimary: () => navigate("/flashcards"),
    };
  }, [
    loading,
    isNewUser,
    dueNow,
    studyClassId,
    dueCards,
    studyClass,
    lastSession,
    lastQuiz,
    fileCount,
    classes,
    navigate,
  ]);

  /* ---------- Activity feed ---------- */

  const activityRows = useMemo(() => {
    type Row = {
      id: string;
      icon: ReactNode;
      iconTone: "primary" | "success" | "warning" | "neutral";
      label: string;
      detail?: string;
      time: string;
      sortKey: string;
    };
    const rows: Row[] = [];
    recentFiles.slice(0, 3).forEach((f) => {
      rows.push({
        id: `f-${f.filename}-${f.uploaded_at ?? ""}`,
        icon: <FileText className="h-4 w-4" />,
        iconTone: "primary",
        label: "Document added",
        detail: `${f.filename} · ${f.className}`,
        time: formatRelativeDay(f.uploaded_at) || "Recently",
        sortKey: String(f.uploaded_at ?? ""),
      });
    });
    quizHistory.slice(0, 3).forEach((q) => {
      const pct =
        Number(q.total_possible) > 0
          ? Math.round((Number(q.score) / Number(q.total_possible)) * 100)
          : null;
      const passed = pct != null && pct >= 50;
      rows.push({
        id: `q-${q.attempt_id}`,
        icon: <ClipboardList className="h-4 w-4" />,
        iconTone: passed ? "success" : "warning",
        label: "Quiz attempted",
        detail: pct != null ? `${q.quiz_title} · ${pct}%` : q.quiz_title,
        time: formatRelativeDay(q.attempted_at) || "Recently",
        sortKey: String(q.attempted_at ?? ""),
      });
    });
    recentSessions.slice(0, 3).forEach((s) => {
      const isVoice = s.mode?.includes("voice");
      rows.push({
        id: `s-${s.id}`,
        icon: isVoice ? <Mic className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />,
        iconTone: "neutral",
        label: isVoice ? "Voice flashcards" : "Study session",
        detail: [s.class_name, s.duration_seconds ? formatDuration(s.duration_seconds) : ""]
          .filter(Boolean)
          .join(" · "),
        time: formatRelativeDay(s.started_at) || "Recently",
        sortKey: String(s.started_at ?? ""),
      });
    });
    rows.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return rows.slice(0, 7);
  }, [recentFiles, quizHistory, recentSessions]);

  /* ---------- Class health rows ---------- */

  const classHealth = useMemo(() => {
    return classes.slice(0, 6).map((c) => {
      const due = Number(dueByClassId[c.id] ?? 0);
      const docs = Number(docCountByClassId[c.id] ?? 0);
      // Quiz history backend rows may include class_id/class_name even though
      // the public type doesn't list them. Read them tolerantly.
      const classAttempts = quizHistory.filter((q) => {
        const meta = q as { class_id?: number; class_name?: string };
        return meta.class_id === c.id || meta.class_name === c.name;
      });
      const acc = quizAttemptsAccuracyPct(classAttempts);
      return { row: c, due, docs, acc };
    });
  }, [classes, dueByClassId, docCountByClassId, quizHistory]);

  /* ---------- UI ---------- */

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

  /* Build week strip cells */
  const weekCells = week.seconds.map((s, i) => ({
    label: dayLabelFromIso(week.dates[i]),
    active: s > 0,
    intensity: s > 0 ? Math.min(1, s / Math.max(...week.seconds, 600)) : 0,
    title: `${week.dates[i]} · ${formatDuration(s)}`,
  }));

  return (
    <AppShell
      title="Today's focus"
      headerMaxWidthClassName="max-w-[1180px]"
      headerActions={headerActions}
    >
      <div className="mx-auto w-full max-w-[1180px] space-y-7 pb-12">
        {/* ── Section 1 — Hero / primary CTA ───────────────────────── */}
        {!isNewUser && primaryCta ? (
          <section className="premium-cta p-5 sm:p-7">
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <span className="eyebrow">
                  <span className="eyebrow-dot" aria-hidden />
                  {primaryCta.eyebrow}
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
                    className="inline-flex items-center gap-1.5 font-semibold text-[var(--primary)] underline-offset-4 transition hover:underline hover:translate-x-[1px]"
                  >
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Ask your materials
                  </Link>
                  <Link
                    to="/voice-revision"
                    className="inline-flex items-center gap-1.5 font-medium text-[var(--text-secondary)] underline-offset-4 transition hover:text-[var(--text-main)] hover:underline hover:translate-x-[1px]"
                  >
                    <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Voice revision
                  </Link>
                </div>
              </div>
              <div className="flex shrink-0 items-end">
                <button type="button" className="btn-premium press-feedback" onClick={primaryCta.onPrimary}>
                  {primaryCta.primaryLabel}
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {/* ── New user empty state ─────────────────────────────────── */}
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

        {/* ── Section 2 — Quick stats ──────────────────────────────── */}
        {!isNewUser ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Classes"
              value={classes.length}
              icon={<GraduationCap className="h-4 w-4" />}
              tone="primary"
              loading={loading}
            />
            <StatCard
              label="Documents"
              value={fileCount}
              hint={fileCount === 0 ? "Upload one to get started." : undefined}
              icon={<FileText className="h-4 w-4" />}
              tone="neutral"
              loading={loading}
            />
            <StatCard
              label="Due for review"
              value={dueNow}
              hint={dueNow === 0 ? "You're caught up." : undefined}
              icon={<Layers className="h-4 w-4" />}
              tone={dueNow > 0 ? "warning" : "neutral"}
              loading={loading}
            />
            <StatCard
              label="Quiz accuracy"
              value={loading ? "—" : quizAccuracyFromAttempts != null ? `${quizAccuracyFromAttempts}%` : "—"}
              hint={quizAccuracyFromAttempts == null ? "Take a quiz to track this." : undefined}
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

        {/* ── Section 3 — This week (momentum) ─────────────────────── */}
        {!isNewUser ? (
          <section className="dash-momentum ns-card overflow-hidden p-5 sm:p-6">
            <SectionHeader
              eyebrow="This week"
              title="Your learning momentum"
              description={
                streak > 0
                  ? streak >= 5
                    ? "You're on a strong roll — keep it going."
                    : "You're building consistent study habits."
                  : "Get one short session in today to start a streak."
              }
            />

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_1.4fr]">
              {/* Left: streak + study time */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="dash-momentum__cell">
                  <div className="dash-momentum__cell-icon dash-momentum__cell-icon--flame">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div className="dash-momentum__cell-stat">
                    <div className="dash-momentum__cell-value">
                      {loading ? "—" : streak}
                      <span className="dash-momentum__cell-unit">{streak === 1 ? "day" : "days"}</span>
                    </div>
                    <div className="dash-momentum__cell-label">
                      {streak > 0 ? "Current streak" : "No streak yet"}
                    </div>
                  </div>
                </div>

                <div className="dash-momentum__cell">
                  <div className="dash-momentum__cell-icon dash-momentum__cell-icon--time">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="dash-momentum__cell-stat">
                    <div className="dash-momentum__cell-value">
                      {loading ? "—" : formatDuration(totalSecondsThisWeek || studyOverview?.total_seconds_7d || 0)}
                    </div>
                    <div className="dash-momentum__cell-label">
                      Study time · last 7 days
                      {studyOverview && studyOverview.sessions_7d > 0
                        ? ` · ${studyOverview.sessions_7d} session${studyOverview.sessions_7d === 1 ? "" : "s"}`
                        : ""}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: week strip + sparkline */}
              <div className="dash-momentum__chart">
                <div className="dash-momentum__chart-head">
                  <div>
                    <div className="dash-momentum__chart-eyebrow">Days studied</div>
                    <div className="dash-momentum__chart-value">
                      {loading ? "—" : `${daysStudied7d} / 7`}
                    </div>
                  </div>
                  <div className="dash-momentum__chart-spark">
                    <Sparkline
                      values={week.seconds.length ? week.seconds : [0, 0, 0, 0, 0, 0, 0]}
                      width={140}
                      height={36}
                      ariaLabel="Last 7 days study time trend"
                    />
                  </div>
                </div>

                <WeekStrip cells={weekCells} className="mt-4" />
              </div>
            </div>
          </section>
        ) : null}

        {/* ── Section 4 — What to study next ──────────────────────── */}
        {!isNewUser ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {/* Best next step */}
            <div className="dash-focus dash-focus--primary p-5 sm:p-6">
              <div className="dash-focus__head">
                <span className="dash-focus__chip dash-focus__chip--primary">
                  <Target className="h-3.5 w-3.5" />
                  Best next step
                </span>
              </div>
              {weakestQuiz ? (
                <>
                  <h3 className="dash-focus__title">{weakestQuiz.tag}</h3>
                  <p className="dash-focus__body">
                    {weakestQuizClassName ? `${weakestQuizClassName} · ` : ""}
                    Recent quiz accuracy is{" "}
                    <strong className="text-[var(--text-main)]">{Math.round(weakestQuiz.quiz_accuracy_pct)}%</strong> —
                    a focused review will lift it.
                  </p>
                  <ProgressBar value={weakestQuiz.quiz_accuracy_pct} className="mt-4" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {weakestQuiz.class_id ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/classes/${weakestQuiz.class_id}/flashcards?tag=${encodeURIComponent(weakestQuiz.tag)}`,
                          )
                        }
                      >
                        Review flashcards
                      </Button>
                    ) : null}
                    <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/quizzes")}>
                      Browse quizzes
                    </Button>
                  </div>
                </>
              ) : weakestFlash ? (
                <>
                  <h3 className="dash-focus__title">{weakestFlash.tag}</h3>
                  <p className="dash-focus__body">
                    {weakestFlashClassName ? `${weakestFlashClassName} · ` : ""}
                    Flashcards here have been hard lately. A short review will move the needle.
                  </p>
                  <ProgressBar value={100 - weakestFlash.flashcard_difficulty_pct} className="mt-4" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {weakestFlash.class_id ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/classes/${weakestFlash.class_id}/flashcards?tag=${encodeURIComponent(weakestFlash.tag)}`,
                          )
                        }
                      >
                        Review flashcards
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="dash-focus__title">Build your queue</h3>
                  <p className="dash-focus__body">
                    Once you've taken a quiz or reviewed flashcards, we'll surface targeted suggestions here.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="primary" size="sm" onClick={() => navigate("/quizzes")}>
                      Take a quiz
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/flashcards")}>
                      Open flashcards
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Quiz accuracy / trend */}
            <div className="dash-focus p-5 sm:p-6">
              <div className="dash-focus__head">
                <span className="dash-focus__chip">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Quiz accuracy
                </span>
                {quizAccuracyFromAttempts != null ? (
                  <span
                    className={
                      quizAccuracyFromAttempts >= 75
                        ? "topic-chip topic-chip--strong"
                        : quizAccuracyFromAttempts >= 50
                          ? "topic-chip topic-chip--improving"
                          : "topic-chip topic-chip--weak"
                    }
                  >
                    {quizAccuracyFromAttempts}%
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid items-center gap-5 sm:grid-cols-[auto_1fr]">
                <RadialProgress
                  value={quizAccuracyFromAttempts ?? 0}
                  size={92}
                  thickness={8}
                  ariaLabel="Quiz accuracy"
                >
                  <div className="text-[18px] font-semibold tabular-nums text-[var(--text-main)]">
                    {quizAccuracyFromAttempts != null ? `${quizAccuracyFromAttempts}%` : "—"}
                  </div>
                </RadialProgress>
                <div>
                  <div className="text-[13px] font-semibold text-[var(--text-main)]">
                    {quizHistory.length === 0
                      ? "No attempts yet"
                      : quizHistory.length === 1
                        ? "Across 1 attempt"
                        : `Across last ${quizHistory.length} attempts`}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                    {quizAccuracyFromAttempts == null
                      ? "Take a quiz to start tracking your accuracy here."
                      : quizAccuracyFromAttempts >= 75
                        ? "Strong work — keep practising new material."
                        : quizAccuracyFromAttempts >= 50
                          ? "You're improving — focus on your weak topics."
                          : "Targeted flashcard review will help most right now."}
                  </p>
                  {quizTrend.length > 1 ? (
                    <Sparkline
                      values={quizTrend}
                      className="mt-3"
                      width={220}
                      height={28}
                      ariaLabel="Recent quiz score trend"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ── Section 5 — Continue / due cards ─────────────────────── */}
        {!isNewUser ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {/* Continue learning */}
            <div className="ns-card flex flex-col p-5 sm:p-6">
              <SectionHeader
                eyebrow="Continue"
                title={lastSession?.class_id ? "Pick up where you left off" : "Resume study"}
              />
              <div className="mt-3 space-y-3 text-[13.5px] text-[var(--text-muted)]">
                {lastSession?.class_id ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-[var(--text-main)]">
                          {lastSession.class_name || classes.find((c) => c.id === lastSession.class_id)?.name || "Your class"}
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-[var(--text-muted-soft)]">
                          {lastSession.mode?.includes("voice") ? "Voice flashcards" : "Flashcards study"}
                          {lastSession.started_at ? ` · ${formatRelativeDay(lastSession.started_at)}` : ""}
                          {lastSession.duration_seconds ? ` · ${formatDuration(lastSession.duration_seconds)}` : ""}
                        </div>
                      </div>
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
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ) : recentFiles[0] ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="text-[14px] font-semibold text-[var(--text-main)]">
                      {recentFiles[0].filename}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[var(--text-muted-soft)]">
                      {recentFiles[0].className}
                      {recentFiles[0].uploaded_at ? ` · added ${formatRelativeDay(recentFiles[0].uploaded_at)}` : ""}
                    </div>
                    {primaryClass ? (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => navigate("/classes", { state: { selectId: primaryClass.id } })}
                        >
                          Open class
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p>Upload a document in a class to anchor your next session.</p>
                )}

                {resumeFile && lastSession?.class_id ? (
                  <p className="text-[12.5px] text-[var(--text-muted-soft)]">
                    Latest file in this class: <span className="text-[var(--text-secondary)]">{resumeFile}</span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* Due cards preview */}
            <div className="ns-card flex flex-col p-5 sm:p-6">
              <SectionHeader
                eyebrow="Review queue"
                title={studyClass ? `Due cards · ${studyClass.name}` : "Due cards"}
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
              <div className="mt-3 min-h-[110px] space-y-2">
                {dueCards.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-center text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                    <span className="font-medium text-[var(--text-secondary)]">You're caught up.</span>
                    <br />
                    <span className="mt-1 inline-block text-[12.5px]">
                      New cards will surface here as their next review approaches.
                    </span>
                  </div>
                ) : (
                  dueCards.slice(0, 4).map((card) => {
                    const meta = card.topic ?? card.tags?.[0] ?? "";
                    return (
                      <div
                        key={card.id}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm transition hover:border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] hover:bg-[var(--surface-2)]"
                      >
                        <div className="line-clamp-2 font-medium text-[var(--text-main)]">{card.question}</div>
                        {meta ? (
                          <div className="mt-0.5 truncate text-xs text-[var(--text-muted-soft)]">{meta}</div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        ) : null}

        {/* ── Section 6 — Class progress (health) ─────────────────── */}
        {!isNewUser && classHealth.length > 0 ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Your classes"
              title="Class health"
              description="A quick snapshot of how each class is going."
              action={
                <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/classes")}>
                  All classes
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              }
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classHealth.map(({ row: c, due, docs, acc }) => {
                const accTone =
                  acc == null
                    ? "neutral"
                    : acc >= 75
                      ? "success"
                      : acc >= 50
                        ? "warning"
                        : "danger";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate("/classes", { state: { selectId: c.id } })}
                    className="dash-class-card group press-feedback"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="dash-class-card__abbr">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate text-[14.5px] font-semibold text-[var(--text-main)]">
                          {c.name}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted-soft)]">
                          {docs} {docs === 1 ? "doc" : "docs"}
                          {due > 0 ? ` · ${due} due` : ""}
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--text-muted-soft)] transition group-hover:text-[var(--text-main)]" />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <ProgressBar
                        value={acc ?? 0}
                        color={
                          accTone === "success"
                            ? "var(--success)"
                            : accTone === "warning"
                              ? "var(--warning)"
                              : accTone === "danger"
                                ? "var(--danger)"
                                : "var(--primary)"
                        }
                        height={4}
                        className="flex-1"
                      />
                      <span className="dash-class-card__pct">{acc != null ? `${acc}%` : "—"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ── Section 7 — Recent activity (premium timeline) ──────── */}
        {!isNewUser && activityRows.length > 0 ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Recent"
              title="Activity"
              description={
                studyOverview && studyOverview.total_seconds_7d > 0
                  ? `${formatDuration(studyOverview.total_seconds_7d)} of focused study in the last 7 days.`
                  : undefined
              }
            />
            <ul className="dash-activity mt-4">
              {activityRows.map((item) => (
                <li key={item.id} className="dash-activity__row">
                  <span
                    className={`dash-activity__icon dash-activity__icon--${item.iconTone}`}
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-[var(--text-main)]">{item.label}</div>
                    {item.detail ? (
                      <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-secondary)]">
                        {item.detail}
                      </div>
                    ) : null}
                  </div>
                  <span className="dash-activity__time">{item.time}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── Section 8 — Compact insights / footer hint ──────────── */}
        {!isNewUser ? (
          <section className="dash-footer-hint">
            <div className="dash-footer-hint__inner">
              <span className="dash-footer-hint__icon" aria-hidden>
                <Lightbulb className="h-4 w-4" />
              </span>
              <p>
                Short, focused sessions beat long marathons. Try a{" "}
                <Link to="/voice-revision" className="dash-footer-hint__link">
                  10-minute voice revision
                </Link>{" "}
                to lock in what you reviewed today.
              </p>
              {/* Mini bars showing the last 7 days at a glance */}
              <MiniWeekBars
                values={week.seconds.length ? week.seconds : [0, 0, 0, 0, 0, 0, 0]}
                height={28}
                className="dash-footer-hint__bars"
                ariaLabel="Last 7 days of study time"
              />
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
