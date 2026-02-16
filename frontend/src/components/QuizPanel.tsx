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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-[var(--text-main)]">Generate Quiz</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Create a quiz from your PDF materials
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-[16px] border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-[16px] border border-green-300 bg-green-50 p-4 text-sm text-green-700">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <div className="font-semibold">Quiz created successfully!</div>
          </div>
          <div className="mt-1">Check the Quiz History to attempt it.</div>
        </div>
      )}

      {/* PDF Selector */}
      <div>
        <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
          PDF Document
        </label>
        <select
          className="mt-2 w-full rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          value={fileId}
          onChange={(e) => setFileId(e.target.value)}
          disabled={generating}
        >
          <option value="">Select PDF</option>
          {pdfFiles.map((f) => (
            <option key={f.id} value={f.id}>
              {f.filename}
            </option>
          ))}
        </select>
      </div>

      {/* Objective Section - MCQs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-main)]">
            📝 Objective (MCQs)
          </label>
          <span className="text-xs text-[var(--text-muted)]">Auto-scored</span>
        </div>
        
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-main)]">Number of MCQs</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMcqCount(Math.max(0, mcqCount - 5))}
                disabled={generating || mcqCount === 0}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-[var(--text-main)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50"
              >
                −
              </button>
              <span className="w-12 text-center text-lg font-semibold text-[var(--primary)]">
                {mcqCount}
              </span>
              <button
                type="button"
                onClick={() => setMcqCount(Math.min(50, mcqCount + 5))}
                disabled={generating || mcqCount >= 50}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-[var(--text-main)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Subjective Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-main)]">
            ✍️ Subjective (Theory)
          </label>
          <span className="text-xs text-[var(--text-muted)]">Manual review</span>
        </div>

        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
          {/* Subjective Count */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-main)]">Number of Questions</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubjectiveCount(Math.max(0, subjectiveCount - 5))}
                disabled={generating || subjectiveCount === 0}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-[var(--text-main)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50"
              >
                −
              </button>
              <span className="w-12 text-center text-lg font-semibold text-[var(--primary)]">
                {subjectiveCount}
              </span>
              <button
                type="button"
                onClick={() => setSubjectiveCount(Math.min(50, subjectiveCount + 5))}
                disabled={generating || subjectiveCount >= 50}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-[var(--text-main)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>

          {/* Subjective Types */}
          {subjectiveCount > 0 && (
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Question Types
              </span>
              <div className="grid grid-cols-2 gap-2">
                {subjectiveTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => toggleSubjectiveType(type.value)}
                    disabled={generating}
                    className={`flex items-center gap-2 rounded-[12px] px-3 py-2.5 text-xs font-semibold transition-all ${
                      selectedSubjectiveTypes.includes(type.value)
                        ? "bg-[var(--primary)] text-white shadow-md"
                        : "bg-[var(--surface)] text-[var(--text-main)] border border-[var(--border)] hover:border-[var(--primary)]"
                    } disabled:opacity-50`}
                    style={{ border: selectedSubjectiveTypes.includes(type.value) ? "none" : undefined }}
                  >
                    <span className="text-base">{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Difficulty */}
      <div>
        <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Difficulty
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["easy", "medium", "hard"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setDifficulty(level)}
              disabled={generating}
              className={`rounded-[12px] px-4 py-3 text-sm font-semibold transition-all ${
                difficulty === level
                  ? "bg-[var(--primary)] text-white shadow-md"
                  : "bg-[var(--surface)] text-[var(--text-main)] border border-[var(--border)] hover:border-[var(--primary)]"
              } disabled:opacity-50`}
              style={{ border: difficulty === level ? "none" : undefined }}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Total Questions Summary */}
      <div className="rounded-[16px] bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-main)]">Total Questions</span>
          <span className="text-2xl font-bold text-[var(--primary)]">{totalQuestions}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{mcqCount} MCQs • {subjectiveCount} Subjective</span>
          <span className="font-medium">{difficulty}</span>
        </div>
      </div>

      {/* Progress Bar */}
      {generating && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-muted)]">Generating quiz...</span>
            <span className="font-semibold text-[var(--primary)]">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {jobId && (
            <div className="text-xs text-[var(--text-muted)]">
              Job ID: {jobId.substring(0, 8)}...
            </div>
          )}
        </div>
      )}

      {/* Generate Button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || !fileId || totalQuestions === 0 || (subjectiveCount > 0 && selectedSubjectiveTypes.length === 0)}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-purple-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(123,95,239,0.35)] hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        style={{ border: "none" }}
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating Quiz...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate Quiz
          </>
        )}
      </button>
    </div>
  );
}
