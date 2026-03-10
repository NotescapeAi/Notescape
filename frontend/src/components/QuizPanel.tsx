import { useState } from "react";
import { createQuizJob, getQuizJobStatus, type FileRow } from "../lib/api";
import { Sparkles, Loader2, CheckCircle } from "lucide-react";

interface QuizPanelProps {
  classId: number;
  files: FileRow[];
  onQuizCreated?: () => void;
}

export default function QuizPanel({ classId, files, onQuizCreated }: QuizPanelProps) {
  const [fileId, setFileId] = useState<string>("");
  const [mcqCount, setMcqCount] = useState(10);
  const [subjectiveCount, setSubjectiveCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [selectedSubjectiveTypes, setSelectedSubjectiveTypes] = useState<string[]>(["conceptual"]);
  
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const subjectiveTypes = [
    { value: "conceptual", label: "Conceptual", icon: "💡" },
    { value: "definition", label: "Definitions", icon: "📖" },
    { value: "scenario", label: "Scenario-based", icon: "🎯" },
    { value: "short_qa", label: "Short Q&A", icon: "❓" },
  ];

  function friendlyQuizError(err: any): string {
    const detail = err?.response?.data?.detail;
    const raw = typeof detail === "string" ? detail : err?.message || "Failed to generate quiz";
    const lower = String(raw).toLowerCase();
    if (
      lower.includes("relation") ||
      lower.includes("sql") ||
      lower.includes("syntax") ||
      lower.includes("traceback")
    ) {
      return "Something went wrong while generating quiz. Please try again.";
    }
    return String(raw);
  }

  function toggleSubjectiveType(type: string) {
    setSelectedSubjectiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function handleGenerate() {
    if (!fileId) {
      alert("Please select a PDF file");
      return;
    }

    const totalQuestions = mcqCount + subjectiveCount;
    
    if (totalQuestions === 0) {
      alert("Please select at least one question (MCQ or Subjective)");
      return;
    }

    if (subjectiveCount > 0 && selectedSubjectiveTypes.length === 0) {
      alert("Please select at least one subjective question type");
      return;
    }

    setGenerating(true);
    setError(null);
    setProgress(0);
    setSuccess(false);

    try {
      // Build types array based on what user selected
      const types: Array<"mcq" | "conceptual" | "definition" | "scenario" | "short_qa"> = [];
      
      // Add MCQ type if user wants MCQs
      if (mcqCount > 0) {
        types.push("mcq");
      }
      
      // Add selected subjective types if user wants subjective questions
      if (subjectiveCount > 0) {
        selectedSubjectiveTypes.forEach(type => {
          types.push(type as "conceptual" | "definition" | "scenario" | "short_qa");
        });
      }

      // IMPORTANT: Now we send mcq_count specifically!
      const job = await createQuizJob({
        class_id: classId,
        file_id: fileId,
        n_questions: totalQuestions,
        mcq_count: mcqCount,  // ← THIS IS THE KEY FIX!
        types: types,
        difficulty,
      });

      setJobId(job.job_id);

      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const status = await getQuizJobStatus(job.job_id);
          setProgress(status.progress || 0);

          if (status.status === "completed") {
            clearInterval(pollInterval);
            setGenerating(false);
            setJobId(null);
            setProgress(100);
            setSuccess(true);
            
            if (onQuizCreated) {
              onQuizCreated();
            }
            
            setTimeout(() => {
              setSuccess(false);
              setProgress(0);
            }, 3000);
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setGenerating(false);
            setJobId(null);
            setError(status.error_message || "Something went wrong while generating quiz. Please try again.");
          }
        } catch (err: any) {
          console.error("Error polling job:", err);
          clearInterval(pollInterval);
          setGenerating(false);
          setJobId(null);
          setError(friendlyQuizError(err));
        }
      }, 2000);

      setTimeout(() => {
        if (generating) {
          clearInterval(pollInterval);
          setGenerating(false);
          setError("Quiz generation timeout - please try again");
        }
      }, 300000);
    } catch (err: any) {
      console.error("Error creating quiz:", err);
      setGenerating(false);
      setError(friendlyQuizError(err));
    }
  }

  const pdfFiles = files.filter((f) => f.filename.toLowerCase().endsWith(".pdf"));
  const totalQuestions = mcqCount + subjectiveCount;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-bold text-[var(--text-main)]">Quiz Configuration</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Customize your quiz parameters below
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="font-semibold mb-1">Error</div>
          <div>{error}</div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <div className="font-bold">Quiz created successfully!</div>
          </div>
          <div className="mt-1 pl-7">Check the Available Quizzes list to start.</div>
        </div>
      )}

      {/* PDF Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Source Material
        </label>
        <div className="relative">
          <select
            className="w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 pr-10 text-sm font-medium shadow-sm transition-all hover:border-[var(--primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
            value={fileId}
            onChange={(e) => setFileId(e.target.value)}
            disabled={generating}
          >
            <option value="">Select a PDF document...</option>
            {pdfFiles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.filename}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Objective Section - MCQs */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 p-5 space-y-4 transition-all hover:border-[var(--primary)]/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <span className="text-lg">📝</span>
            </span>
            <div>
              <label className="block text-sm font-bold text-[var(--text-main)]">
                Objective Questions
              </label>
              <span className="text-xs text-[var(--text-muted)]">Multiple choice, auto-graded</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between rounded-xl bg-[var(--surface)] p-3 shadow-sm border border-[var(--border)]">
          <span className="text-sm font-medium text-[var(--text-main)] pl-2">Count</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMcqCount(Math.max(0, mcqCount - 5))}
              disabled={generating || mcqCount === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              −
            </button>
            <span className="w-8 text-center text-lg font-bold text-[var(--text-main)] tabular-nums">
              {mcqCount}
            </span>
            <button
              type="button"
              onClick={() => setMcqCount(Math.min(50, mcqCount + 5))}
              disabled={generating || mcqCount >= 50}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Subjective Section */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 p-5 space-y-4 transition-all hover:border-[var(--primary)]/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <span className="text-lg">✍️</span>
            </span>
            <div>
              <label className="block text-sm font-bold text-[var(--text-main)]">
                Subjective Questions
              </label>
              <span className="text-xs text-[var(--text-muted)]">Theory, manual review</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-[var(--surface)] p-3 shadow-sm border border-[var(--border)]">
          <span className="text-sm font-medium text-[var(--text-main)] pl-2">Count</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubjectiveCount(Math.max(0, subjectiveCount - 5))}
              disabled={generating || subjectiveCount === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              −
            </button>
            <span className="w-8 text-center text-lg font-bold text-[var(--text-main)] tabular-nums">
              {subjectiveCount}
            </span>
            <button
              type="button"
              onClick={() => setSubjectiveCount(Math.min(50, subjectiveCount + 5))}
              disabled={generating || subjectiveCount >= 50}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </div>

        {/* Subjective Types */}
        {subjectiveCount > 0 && (
          <div className="space-y-3 pt-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Question Types
            </span>
            <div className="grid grid-cols-2 gap-2">
              {subjectiveTypes.map((type) => {
                const isSelected = selectedSubjectiveTypes.includes(type.value);
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => toggleSubjectiveType(type.value)}
                    disabled={generating}
                    className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] ${
                      isSelected
                        ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm ring-1 ring-[var(--primary)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/50 hover:bg-[var(--surface)]"
                    } disabled:opacity-50`}
                  >
                    <span className="text-lg group-hover:scale-110 transition-transform">{type.icon}</span>
                    <span className={`text-xs font-semibold ${isSelected ? "text-[var(--primary)]" : "text-[var(--text-main)]"}`}>
                      {type.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Difficulty */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Difficulty Level
        </label>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface)] p-1 border border-[var(--border)]">
          {(["easy", "medium", "hard"] as const).map((level) => {
             const isActive = difficulty === level;
             return (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                disabled={generating}
                className={`relative rounded-lg py-2 text-xs font-bold capitalize transition-all ${
                  isActive
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border)]/30"
                } disabled:opacity-50`}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      {/* Total Questions Summary */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--primary)]/5 to-purple-500/5 p-5 border border-[var(--primary)]/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-[var(--text-muted)]">Total Assessment</span>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-[var(--primary)] tabular-nums">{totalQuestions}</span>
            <span className="text-sm font-medium text-[var(--text-muted)]">questions</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-medium">
          <span className="bg-[var(--surface)] px-2 py-1 rounded-md border border-[var(--border)]">{mcqCount} MCQ</span>
          <span>+</span>
          <span className="bg-[var(--surface)] px-2 py-1 rounded-md border border-[var(--border)]">{subjectiveCount} Theory</span>
          <span className="ml-auto capitalize px-2 py-1 rounded-md bg-[var(--primary)]/10 text-[var(--primary)]">{difficulty}</span>
        </div>
      </div>

      {/* Progress Bar */}
      {generating && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-[var(--text-muted)] flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating quiz content...
            </span>
            <span className="text-[var(--primary)]">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          {jobId && (
            <div className="text-[10px] text-[var(--text-muted)] font-mono opacity-50 text-right">
              ID: {jobId.substring(0, 8)}
            </div>
          )}
        </div>
      )}

      {/* Generate Button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || !fileId || totalQuestions === 0 || (subjectiveCount > 0 && selectedSubjectiveTypes.length === 0)}
        className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--primary)] px-6 py-4 text-sm font-bold text-white shadow-lg shadow-[var(--primary)]/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[var(--primary)]/30 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100 disabled:cursor-not-allowed"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:animate-shimmer" />
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12 group-hover:scale-110" />
            <span>Generate Quiz</span>
          </>
        )}
      </button>
    </div>
  );
}
