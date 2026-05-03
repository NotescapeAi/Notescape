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
  TrendingDown,
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
  createStudyPlan,
  listStudyPlans,
  getStudyPlan,
  getClassAnalytics,
  getQuizHistory,
  listRecentStudySessions,
  type ClassRow,
  type Flashcard,
  type WeakTag,
  type StudyPlan,
  type ClassAnalytics,
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
  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>([]);
  const [planGoal, setPlanGoal] = useState("exam_preparation");
  const [planExamDate, setPlanExamDate] = useState("");
  const [planMinutes, setPlanMinutes] = useState(45);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [classAnalytics, setClassAnalytics] = useState<ClassAnalytics | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const navigate = useNavigate();

  const firstName =
    profile?.display_name?.trim().split(/\s+/)[0] ||
    profile?.full_name?.trim().split(/\s+/)[0] ||
    "";

  function isDue(card: Flashcard) {
    if (!card.due_at) return true;
    return new Date(card.due_at) <= new Date();
  }

  async function handleCreatePlan() {
    if (!selectedClassId) return;
    setCoachLoading(true);
    setCoachError(null);
    try {
      await createStudyPlan({
        class_id: selectedClassId,
        goal: planGoal,
        daily_time_minutes: planMinutes,
        exam_date: planExamDate || undefined,
      });
      await refreshStudyCoach(selectedClassId);
    } catch (err: unknown) {
      setCoachError(err instanceof Error ? err.message : "Failed to create plan.");
    } finally {
      setCoachLoading(false);
    }
  }

  async function refreshStudyCoach(targetClassId?: number | null) {
    const cid = targetClassId ?? selectedClassId;
    if (!cid) return;
    setCoachLoading(true);
    try {
      const [plans, analyticsData] = await Promise.all([listStudyPlans(), getClassAnalytics(cid)]);
      let hydratedPlans = plans;
      const targetPlan = plans.find((p) => p.class_id === cid) || plans[0];
      if (targetPlan) {
        const detail = await getStudyPlan(targetPlan.id);
        hydratedPlans = plans.map((p) => (p.id === detail.id ? detail : p));
      }
      setStudyPlans(hydratedPlans);
      setClassAnalytics(analyticsData);
    } finally {
      setCoachLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cs = await listClasses();
        setClasses(cs);
        if (cs[0]) setSelectedClassId(cs[0].id);

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
        const dueIdx = progRows.findIndex((p) => Number(p?.due_now ?? 0) > 0);
        const cardClassId = dueIdx >= 0 ? cs[dueIdx]?.id : cs[0]?.id;
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
          [...historyRows].sort((a, b) => String(b.attempted_at).localeCompare(String(a.attempted_at))).slice(0, 6)
        );
        setRecentSessions(sessionsRows);

        if (cs[0]) await refreshStudyCoach(cs[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedClassId) refreshStudyCoach(selectedClassId);
  }, [selectedClassId]);

  const recentClasses = useMemo(() => classes.slice(0, 6), [classes]);
  const weakInsights = useMemo(
    () => [...weakTags].sort((a, b) => a.quiz_accuracy_pct - b.quiz_accuracy_pct).slice(0, 5),
    [weakTags]
  );
  const strongInsights = useMemo(
    () => [...weakTags].sort((a, b) => b.quiz_accuracy_pct - a.quiz_accuracy_pct).slice(0, 5),
    [weakTags]
  );
  const overallAccuracy = useMemo(() => {
    if (!weakTags.length) return null;
    const total = weakTags.reduce((sum, tag) => sum + (tag.quiz_accuracy_pct || 0), 0);
    return Math.round(total / weakTags.length);
  }, [weakTags]);
  const activePlan = useMemo(
    () => studyPlans.find((p) => p.class_id === selectedClassId) || studyPlans[0],
    [studyPlans, selectedClassId]
  );
  const planProgress = useMemo(() => {
    if (!activePlan?.items) return { total: 0, completed: 0, pending: 0 };
    const total = activePlan.items.length;
    const completed = activePlan.items.filter((i) => i.status === "completed").length;
    const pending = activePlan.items.filter((i) => i.status === "pending").length;
    return { total, completed, pending };
  }, [activePlan]);

  const weakest = weakInsights[0];
  const weakestClassName = weakest?.class_id ? classes.find((c) => c.id === weakest.class_id)?.name : null;
  const primaryClass = classes[0];
  const studyClass = studyClassId ? classes.find((c) => c.id === studyClassId) : primaryClass;

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
        icon: <Sparkles className="h-4 w-4" />,
        label: s.mode?.includes("voice") ? "Voice revision session" : "Study session",
        detail: [s.class_name, s.started_at ? formatShortDate(s.started_at) : ""].filter(Boolean).join(" · "),
      });
    });
    if (dueCards.length && studyClass) {
      rows.push({
        id: "due",
        icon: <BookOpen className="h-4 w-4" />,
        label: "Flashcards ready",
        detail: `${dueNow} due across your classes`,
      });
    }
    return rows.slice(0, 6);
  }, [recentFiles, quizHistory, recentSessions, dueCards.length, dueNow, studyClass]);

  const isNewUser = !loading && classes.length === 0;

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/classes"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 text-sm font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Upload className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Upload document</span>
        <span className="sm:hidden">Upload</span>
      </Link>
      <Link
        to="/classes"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:px-3.5"
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
      subtitle="Your workspace for classes, active recall, and quizzes."
      headerMaxWidthClassName="max-w-[1180px]"
      headerActions={headerActions}
    >
      <div className="mx-auto w-full max-w-[1180px] space-y-6 pb-10">
        {!isNewUser ? (
          <div className="ns-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted-soft)]">
                Today
              </p>
              <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[var(--text-muted)]">
                Here is what deserves your attention — short sessions beat rare marathons.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="primary" size="sm" onClick={() => navigate("/chatbot")}>
                <MessageCircle className="h-4 w-4" aria-hidden />
                Study Assistant
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/voice-revision")}>
                <Mic className="h-4 w-4" aria-hidden />
                Voice Flashcards
              </Button>
            </div>
          </div>
        ) : null}

        {isNewUser ? (
          <>
            <EmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title="Welcome to Notescape"
              description="Follow the steps below, then open Classes to add your first materials."
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
              hint="Organize by subject or term."
              icon={<GraduationCap className="h-4 w-4" />}
              loading={loading}
            />
            <StatCard
              label="Documents"
              value={fileCount}
              hint="PDFs, notes, and slides."
              icon={<FileText className="h-4 w-4" />}
              loading={loading}
            />
            <StatCard
              label="Flashcards due"
              value={dueNow}
              hint="Across all classes."
              icon={<Layers className="h-4 w-4" />}
              loading={loading}
            />
            <StatCard
              label="Quiz accuracy"
              value={overallAccuracy != null ? `${overallAccuracy}%` : "—"}
              hint={overallAccuracy != null ? "Blended across tagged topics." : "Complete a quiz to unlock."}
              icon={<Target className="h-4 w-4" />}
              loading={loading}
            />
          </section>
        ) : null}

        {!isNewUser ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="What to study next"
              title={weakest ? "Focus where quizzes say you are shaky" : "Build your signal"}
              description={
                weakest
                  ? `We prioritize topics with lower recent accuracy so you do not drift before exams.`
                  : "Upload documents and attempt quizzes to unlock recommendations."
              }
            />
            {weakest ? (
              <div className="mt-4 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                    <TrendingDown className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-[var(--text-main)]">{weakest.tag}</div>
                    <div className="mt-0.5 text-[13.5px] text-[var(--text-muted)]">
                      {weakestClassName ? `${weakestClassName} · ` : ""}
                      Quiz accuracy ~{Math.round(weakest.quiz_accuracy_pct)}%. Short reviews here compound quickly.
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {weakest.class_id ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/classes/${weakest.class_id}/flashcards?tag=${encodeURIComponent(weakest.tag)}`
                        )
                      }
                    >
                      Review flashcards
                    </Button>
                  ) : null}
                  {weakest.class_id ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/quizzes")}>
                      Take quiz
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/chatbot")}>
                    Ask assistant
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                Upload documents and attempt quizzes to unlock recommendations.
              </p>
            )}
          </section>
        ) : null}

        {!isNewUser ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="ns-card flex flex-col p-5">
              <SectionHeader
                eyebrow="Due today"
                title="Flashcards in queue"
                action={
                  studyClassId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        navigate(`/classes/${studyClassId}/flashcards/study`, {
                          state: { cards: dueCards, className: studyClass?.name ?? "", startIndex: 0 },
                        })
                      }
                    >
                      Study now
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  ) : null
                }
              />
              <div className="mt-4 min-h-[110px] space-y-2">
                {dueCards.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-center text-[13.5px] text-[var(--text-muted)]">
                    You are caught up. Nice work.
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
              </div>
            </section>

            <section className="ns-card flex flex-col p-5">
              <SectionHeader eyebrow="Resume" title={primaryClass?.name ?? "Pick a class"} />
              <p className="mt-2 text-[13.5px] text-[var(--text-muted)]">
                {resumeFile ? (
                  <>
                    Last document: <span className="font-medium text-[var(--text-main)]">{resumeFile}</span>
                  </>
                ) : (
                  "Upload a document in any class to anchor your next session."
                )}
              </p>
              {primaryClass ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => navigate("/classes", { state: { selectId: primaryClass.id } })}
                  >
                    Open class
                  </Button>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {!isNewUser ? (
          <section className="ns-card p-5">
            <SectionHeader
              eyebrow="Your classes"
              title="Overview"
              description="Jump back into the material you care about."
              action={
                <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/classes")}>
                  All classes
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              }
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentClasses.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)] sm:col-span-2 lg:col-span-3">
                  No classes yet.
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHeader
                eyebrow="Learning insights"
                title="Weak and strong areas"
                description="Powered by your recent quiz performance."
              />
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {overallAccuracy == null ? "Not enough data yet" : `Blended accuracy ${overallAccuracy}%`}
              </span>
            </div>
            {weakTags.length ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Weak areas</div>
                  <ul className="mt-3 space-y-2">
                    {weakInsights.map((tag) => (
                      <li key={`weak-${tag.tag_id}`} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-[var(--text-main)]">{tag.tag}</span>
                        <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{Math.round(tag.quiz_accuracy_pct)}%</span>
                      </li>
                    ))}
                  </ul>
                  {weakInsights[0]?.class_id ? (
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/classes/${weakInsights[0].class_id}/flashcards?tag=${encodeURIComponent(weakInsights[0].tag)}`
                          )
                        }
                      >
                        Study weak areas
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Strong areas</div>
                  <ul className="mt-3 space-y-2">
                    {strongInsights.map((tag) => (
                      <li key={`strong-${tag.tag_id}`} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-[var(--text-main)]">{tag.tag}</span>
                        <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{Math.round(tag.quiz_accuracy_pct)}%</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                    Keep light reviews on strong tags so they stay exam-ready.
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">Complete a quiz or review flashcards to see insights.</p>
            )}
          </section>
        ) : null}

        {!isNewUser ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Study coach"
              title="Plan, analytics, voice"
              description="Adaptive tasks tied to the class you select."
              action={<span className="text-xs text-[var(--text-secondary)]">{coachLoading ? "Updating…" : "Synced to weak topics"}</span>}
            />

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-[var(--text-main)] sm:col-span-2">
                    Class
                    <select
                      value={selectedClassId ?? ""}
                      onChange={(e) => setSelectedClassId(Number(e.target.value))}
                      className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-main)]"
                    >
                      <option value="">Select class</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-[var(--text-main)]">
                    Exam date
                    <input
                      type="date"
                      value={planExamDate}
                      onChange={(e) => setPlanExamDate(e.target.value)}
                      className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-main)]"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-[var(--text-main)]">
                    Daily minutes
                    <input
                      type="number"
                      min={15}
                      max={180}
                      value={planMinutes}
                      onChange={(e) => setPlanMinutes(Number(e.target.value))}
                      className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-main)]"
                    />
                  </label>
                </div>
                <label className="mt-4 block text-sm font-semibold text-[var(--text-main)]">
                  Goal
                  <select
                    value={planGoal}
                    onChange={(e) => setPlanGoal(e.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-main)]"
                  >
                    <option value="exam_preparation">Exam preparation</option>
                    <option value="quick_revision">Quick revision</option>
                    <option value="weak_topic_recovery">Weak-topic recovery</option>
                    <option value="full_course_review">Full course review</option>
                  </select>
                </label>
                {coachError ? (
                  <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-100">
                    {coachError}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="primary" onClick={handleCreatePlan} disabled={!selectedClassId || coachLoading}>
                    Create / refresh plan
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => navigate("/voice-revision")}>
                    Voice Flashcards
                  </Button>
                  {activePlan ? (
                    <span className="self-center text-xs text-[var(--text-secondary)]">
                      {planProgress.completed}/{planProgress.total || "0"} tasks · {activePlan.title}
                    </span>
                  ) : null}
                </div>
                {activePlan ? (
                  <div className="mt-4 space-y-2">
                    {(activePlan.items ?? []).slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--text-main)]">{item.title}</div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            {item.topic} · {item.date} · {item.task_type}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                          {item.status}
                        </span>
                      </div>
                    ))}
                    {activePlan.items && activePlan.items.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--text-secondary)]">
                        Plan generated. Tasks will appear when data is ready.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    Create a plan to generate day-wise tasks with flashcards, quizzes, and voice revision.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted-soft)]">Analytics</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--text-main)]">
                      Exam readiness {classAnalytics?.exam_readiness?.score ?? 0}%
                    </div>
                  </div>
                  <div className="text-right text-xs text-[var(--text-secondary)]">
                    {classAnalytics?.exam_readiness?.components
                      ? `Mastery ${classAnalytics.exam_readiness.components.mastery}% · Coverage ${classAnalytics.exam_readiness.components.coverage}%`
                      : "Practice to unlock detail"}
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {(classAnalytics?.weak_topics ?? []).slice(0, 4).map((topic) => (
                    <div
                      key={topic.topic}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--text-main)]">{topic.topic}</div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          Mastery {topic.mastery_score}% · Quiz {topic.quiz_accuracy_pct}% · Voice {topic.voice_score_pct}%
                        </div>
                      </div>
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                        {topic.status}
                      </span>
                    </div>
                  ))}
                  {(classAnalytics?.weak_topics?.length ?? 0) === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--text-secondary)]">
                      Take a quiz or voice session to surface weak topics.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {!isNewUser ? (
          <section className="ns-card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Recent activity"
              title="Last moves"
              description={`Study time (7d): ${studyOverview ? formatDuration(studyOverview.total_seconds_7d) : "—"} · ${studyOverview?.sessions_7d ?? 0} sessions`}
            />
            {activityRows.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">No activity yet. Create a class to begin.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {activityRows.map((item) => (
                  <li key={item.id} className="flex gap-3 rounded-xl border border-transparent px-1 py-1 transition hover:border-[var(--border)] hover:bg-[var(--surface-2)]/60">
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
