import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, FileText, Sparkles } from "lucide-react";
import AppShell from "../layouts/AppShell";
import {
  listClasses,
  listFiles,
  getFlashcardProgress,
  listFlashcards,
  type ClassRow,
  type Flashcard,
} from "../lib/api";

export default function Dashboard() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [fileCount, setFileCount] = useState<number>(0);
  const [dueNow, setDueNow] = useState<number>(0);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [resumeFile, setResumeFile] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<Array<{ filename: string; className: string }>>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  function isDue(card: Flashcard) {
    if (!card.due_at) return true;
    return new Date(card.due_at) <= new Date();
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cs = await listClasses();
        setClasses(cs);
        const files = await Promise.all(cs.map(async (c) => ({ className: c.name, rows: await listFiles(c.id) })));
        const flatFiles = files.flatMap((group) =>
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
        setRecentFiles(sortedFiles.slice(0, 3));
        if (cs[0]) {
          const prog = await getFlashcardProgress(cs[0].id);
          setDueNow(prog?.due_now ?? 0);
          const classFiles = await listFiles(cs[0].id);
          setResumeFile(classFiles?.[0]?.filename ?? null);
          const cards = await listFlashcards(cs[0].id);
          setDueCards((cards ?? []).filter(isDue).slice(0, 5));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const recentClasses = useMemo(() => classes.slice(0, 4), [classes]);
  const activityItems = useMemo(() => {
    const items: Array<{ id: string; label: string; detail?: string }> = [];
    if (recentFiles[0]) {
      items.push({
        id: `upload-${recentFiles[0].filename}`,
        label: "Uploaded document",
        detail: `${recentFiles[0].filename} in ${recentFiles[0].className}`,
      });
    }
    if (classes[0]) {
      items.push({
        id: `class-${classes[0].id}`,
        label: "Created class",
        detail: classes[0].name,
      });
    }
    if (dueCards[0]) {
      items.push({
        id: `study-${dueCards[0].id}`,
        label: "Study session ready",
        detail: "Flashcards due today",
      });
    }
    return items.slice(0, 3);
  }, [classes, dueCards, recentFiles]);
  const metrics = [
    { label: "Classes", value: loading ? "..." : classes.length, hint: "Active classes" },
    { label: "Documents", value: loading ? "..." : fileCount, hint: "Study materials" },
    { label: "Cards due today", value: loading ? "..." : dueNow, hint: "Ready to review" },
    { label: "Study time", value: "N/A", hint: "Log sessions soon" },
  ];

  return (
    <AppShell title="Your Workspace" breadcrumbs={["Dashboard"]} showGreeting>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#7B5FEF] via-[#A18BFF] to-[#EF5F8B] p-8 text-white shadow-[0_24px_60px_rgba(123,95,239,0.32)] animate-hero-gradient">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.22),_transparent_55%)]" />
            <div className="relative space-y-3">
              <div className="text-xs uppercase tracking-[0.35em] text-white/80">Continue where you left off</div>
              <h2 className="text-3xl font-semibold">Pick up the next concept, right now.</h2>
              <p className="text-sm text-white/80">Resume your last class or jump into flashcards due today.</p>
              <Link
                to="/classes"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#4B34C2] shadow-lg"
              >
                <Sparkles className="h-4 w-4" />
                Continue studying
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-[0_16px_40px_rgba(15,16,32,0.08)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[#7B5FEF]">Resume</div>
                <div className="mt-2 text-xl font-semibold text-[#0F1020]">
                  {classes[0]?.name ?? "No class yet"}
                </div>
                <div className="text-sm text-[#6B5CA5]">
                  {resumeFile ? `Last document: ${resumeFile}` : "Upload a document to continue."}
                </div>
              </div>
              {classes[0] && (
                <button
                  className="rounded-full bg-[#7B5FEF] px-4 py-2 text-xs font-semibold text-white"
                  onClick={() => navigate("/classes", { state: { selectId: classes[0].id } })}
                >
                  Open class
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[24px] bg-white p-5 shadow-[0_14px_36px_rgba(15,16,32,0.08)]"
            >
              <div className="text-xs uppercase tracking-[0.3em] text-[#7B5FEF]">{metric.label}</div>
              <div className="mt-2 text-3xl font-semibold text-[#0F1020]">{metric.value}</div>
              <div className="mt-2 text-xs text-[#6B5CA5]">{metric.hint}</div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-[28px] bg-white p-6 shadow-[0_16px_40px_rgba(15,16,32,0.08)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[#7B5FEF]">Due Today</div>
                <div className="mt-2 text-lg font-semibold text-[#0F1020]">Flashcards ready</div>
              </div>
              {classes[0] && (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-[#EFE7FF] px-4 py-2 text-xs font-semibold text-[#6B5CA5]"
                  onClick={() =>
                    navigate(`/classes/${classes[0].id}/flashcards/study`, {
                      state: { cards: dueCards, className: classes[0].name, startIndex: 0 },
                    })
                  }
                >
                  Study now
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-4 space-y-3">
              {dueCards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#EFE7FF] bg-[#F8F5FF] px-5 py-6 text-sm text-[#6B5CA5]">
                  No cards due yet. You are all caught up.
                </div>
              ) : (
                dueCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-[#EFE7FF] bg-[#FCFBFF] px-4 py-3 text-sm text-[#0F1020]"
                  >
                    <div className="font-semibold">{card.question}</div>
                    <div className="text-xs text-[#6B5CA5]">
                      {card.difficulty ?? "medium"} difficulty
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-[0_16px_40px_rgba(15,16,32,0.08)]">
            <div className="text-xs uppercase tracking-[0.3em] text-[#7B5FEF]">Recent classes</div>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-[#0F1020]">
              {recentClasses.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#EFE7FF] bg-[#F8F5FF] px-4 py-5 text-center text-sm text-[#6B5CA5]">
                  No classes yet.
                </div>
              ) : (
                recentClasses.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-2xl border border-[#EFE7FF] bg-[#FCFBFF] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7B5FEF] text-[11px] font-semibold text-white">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="font-semibold text-[#0F1020]">{c.name}</div>
                        <div className="text-xs text-[#6B5CA5]">{c.subject ?? "General"}</div>
                      </div>
                    </div>
                    <button
                      className="rounded-full border border-[#EFE7FF] px-3 py-1 text-[11px] text-[#6B5CA5]"
                      onClick={() => navigate("/classes", { state: { selectId: c.id } })}
                    >
                      View
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-6 shadow-[0_16px_40px_rgba(15,16,32,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-[#7B5FEF]">Recent activity</div>
              <div className="mt-2 text-lg font-semibold text-[#0F1020]">Learning overview</div>
            </div>
            <span className="text-xs text-[#6B5CA5]">Last 7 days</span>
          </div>
          <div className="mt-5 space-y-4 text-sm text-[#6B5CA5]">
            {activityItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#EFE7FF] bg-[#F8F5FF] px-5 py-6 text-center text-sm text-[#6B5CA5]">
                No activity yet. Create a class to begin your learning flow.
              </div>
            ) : (
              activityItems.map((item, idx) => (
                <div key={item.id} className="flex items-start gap-4">
                  <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#F1EDFF] text-[#7B5FEF]">
                    {idx === 0 ? <FileText className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-[#0F1020]">{item.label}</div>
                    {item.detail && <div className="text-xs text-[#6B5CA5]">{item.detail}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

