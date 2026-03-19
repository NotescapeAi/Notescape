import { useState } from "react";
import { createQuizJob, getQuizJobStatus, uploadFile, type FileRow } from "../lib/api";
import { Sparkles, Loader2, CheckCircle, FileText, Type, Hash, ArrowRight } from "lucide-react";

interface QuizPanelProps {
  classId: number;
  files: FileRow[];
  onQuizCreated?: () => void;
}

type QuizMode = "file" | "text" | "topic";

export default function QuizPanel({ classId, files, onQuizCreated }: QuizPanelProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<QuizMode | null>(null);
  
  // Inputs
  const [fileId, setFileId] = useState<string>("");
  const [textContent, setTextContent] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [topic, setTopic] = useState("");
  
  // Settings
  const [mcqCount, setMcqCount] = useState(10);
  const [subjectiveCount, setSubjectiveCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [selectedSubjectiveTypes, setSelectedSubjectiveTypes] = useState<string[]>(["conceptual"]);
  
  // Status
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const subjectiveTypes = [
    { value: "conceptual", label: "Conceptual", icon: "💡" },
    { value: "definition", label: "Definitions", icon: "📖" },
    { value: "scenario", label: "Scenario-based", icon: "🎯" },
    { value: "short_qa", label: "Short Q&A", icon: "❓" },
  ];

  function friendlyQuizError(err: unknown): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any; // Allow unsafe access for error handling
    const detail = error?.response?.data?.detail;
    const raw = typeof detail === "string" ? detail : error?.message || "Failed to generate quiz";
    const lower = String(raw).toLowerCase();

    if (lower.includes("no chunks found")) {
      return "The document is still processing. Please wait a few seconds and try again.";
    }
    if (lower.includes("file not found")) {
      return "The selected file is no longer available. Please refresh the page.";
    }
    if (lower.includes("network error") || lower.includes("connection refused")) {
      return "Could not connect to the server. Please check your internet connection.";
    }
    if (lower.includes("timeout")) {
      return "Quiz generation took too long. Please try a smaller number of questions.";
    }

    if (
      lower.includes("relation") ||
      lower.includes("sql") ||
      lower.includes("syntax") ||
      lower.includes("traceback") ||
      lower.includes("internal server error")
    ) {
      return "Something went wrong while generating the quiz. Please try again later.";
    }
    
    return String(raw);
  }

  function toggleSubjectiveType(type: string) {
    setSelectedSubjectiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function prepareFileForQuiz(): Promise<{ id: string; sourceType: "file" | "topic" } | null> {
    if (mode === "file") {
      if (!fileId) {
        setError("Please select a file");
        return null;
      }
      return { id: fileId, sourceType: "file" };
    }

    if (mode === "text") {
      if (!textContent.trim()) {
        setError("Please enter some text content");
        return null;
      }
      const title = textTitle.trim() || "Pasted Text";
      const filename = `${title.replace(/[^a-z0-9]/gi, "_")}.txt`;
      const blob = new Blob([textContent], { type: "text/plain" });
      const file = new File([blob], filename, { type: "text/plain" });

      setStatusMessage("Uploading text content...");
      const uploaded = await uploadFile(classId, file);
      return { id: uploaded.id, sourceType: "file" };
    }

    if (mode === "topic") {
      if (!topic.trim()) {
        setError("Please enter a topic");
        return null;
      }
      // Create a placeholder file for the topic
      const filename = `Topic-${topic.replace(/[^a-z0-9]/gi, "_").slice(0, 30)}.txt`;
      const blob = new Blob([topic], { type: "text/plain" });
      const file = new File([blob], filename, { type: "text/plain" });

      setStatusMessage("Setting up topic...");
      const uploaded = await uploadFile(classId, file);
      return { id: uploaded.id, sourceType: "topic" };
    }

    return null;
  }

  async function handleGenerate() {
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
    setStatusMessage("Preparing...");

    try {
      const fileInfo = await prepareFileForQuiz();
      if (!fileInfo) {
        setGenerating(false);
        return;
      }

      setStatusMessage("Queuing quiz generation...");
      
      const types: Array<"mcq" | "conceptual" | "definition" | "scenario" | "short_qa"> = [];
      if (mcqCount > 0) types.push("mcq");
      if (subjectiveCount > 0) {
        selectedSubjectiveTypes.forEach(type => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          types.push(type as any);
        });
      }

      const job = await createQuizJob({
        class_id: classId,
        file_id: fileInfo.id,
        n_questions: totalQuestions,
        mcq_count: mcqCount,
        types: types,
        difficulty,
        source_type: fileInfo.sourceType,
      });

      setStatusMessage("Generating questions...");

      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const status = await getQuizJobStatus(job.job_id);
          setProgress(status.progress || 0);

          if (status.status === "completed") {
            clearInterval(pollInterval);
            setGenerating(false);
            setProgress(100);
            setSuccess(true);
            setStatusMessage("");
            
            if (onQuizCreated) {
              onQuizCreated();
            }
            
            setTimeout(() => {
              setSuccess(false);
              setProgress(0);
              // Reset flow after success
              setStep(1);
              setMode(null);
              setTopic("");
              setFileId("");
              setTextContent("");
            }, 3000);
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setGenerating(false);
            setError(status.error_message || "Something went wrong while generating quiz.");
          }
        } catch (err: unknown) {
          console.error("Error polling job:", err);
          clearInterval(pollInterval);
          setGenerating(false);
          setError(friendlyQuizError(err));
        }
      }, 2000);

      // Safety timeout (5 mins)
      setTimeout(() => {
        if (generating) {
          clearInterval(pollInterval);
          setGenerating(false);
          setError("Quiz generation timeout - please try again");
        }
      }, 300000);

    } catch (err: unknown) {
      console.error("Error creating quiz:", err);
      setGenerating(false);
      setError(friendlyQuizError(err));
    }
  }

  const pdfFiles = files.filter((f) => f.filename.toLowerCase().endsWith(".pdf") || f.filename.toLowerCase().endsWith(".docx") || f.filename.toLowerCase().endsWith(".txt"));

  const canProceedToStep2 = () => {
    if (mode === "file") return !!fileId;
    if (mode === "text") return !!textContent.trim();
    if (mode === "topic") return !!topic.trim();
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-[var(--text-main)]">
          {step === 1 ? "1. Choose Source" : "2. Configure Quiz"}
        </h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {step === 1 
            ? "Select the material you want to be quizzed on"
            : "Customize difficulty and question types"}
        </p>
      </div>

      {/* STEP 1: Source Selection */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setMode("file")}
              className={`flex flex-col items-center justify-center gap-3 p-4 rounded-[16px] border transition-all ${
                mode === "file"
                  ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] ring-2 ring-[var(--primary)] ring-opacity-20"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--text-main)] hover:text-[var(--text-main)]"
              }`}
            >
              <div className={`p-3 rounded-full ${mode === "file" ? "bg-white/50" : "bg-[var(--surface-muted)]"}`}>
                <FileText className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Existing File</span>
            </button>

            <button
              onClick={() => setMode("text")}
              className={`flex flex-col items-center justify-center gap-3 p-4 rounded-[16px] border transition-all ${
                mode === "text"
                  ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] ring-2 ring-[var(--primary)] ring-opacity-20"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--text-main)] hover:text-[var(--text-main)]"
              }`}
            >
              <div className={`p-3 rounded-full ${mode === "text" ? "bg-white/50" : "bg-[var(--surface-muted)]"}`}>
                <Type className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Paste Text</span>
            </button>

            <button
              onClick={() => setMode("topic")}
              className={`flex flex-col items-center justify-center gap-3 p-4 rounded-[16px] border transition-all ${
                mode === "topic"
                  ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] ring-2 ring-[var(--primary)] ring-opacity-20"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--text-main)] hover:text-[var(--text-main)]"
              }`}
            >
              <div className={`p-3 rounded-full ${mode === "topic" ? "bg-white/50" : "bg-[var(--surface-muted)]"}`}>
                <Hash className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">From Topic</span>
            </button>
          </div>

          {/* Input Area based on Mode */}
          <div className="min-h-[120px]">
            {mode === "file" && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Select Document
                </label>
                <select
                  className="mt-2 w-full rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  value={fileId}
                  onChange={(e) => setFileId(e.target.value)}
                  aria-label="Select file"
                >
                  <option value="">Select a file...</option>
                  {pdfFiles.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.filename}
                    </option>
                  ))}
                </select>
                {pdfFiles.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    No supported files (PDF, DOCX, TXT) found in this class.
                  </p>
                )}
              </div>
            )}

            {mode === "text" && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div>
                  <input
                    type="text"
                    placeholder="Title (optional)"
                    className="w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    aria-label="Text title"
                  />
                </div>
                <textarea
                  className="w-full h-32 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
                  placeholder="Paste your study material here..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  aria-label="Paste text content"
                />
              </div>
            )}

            {mode === "topic" && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Enter Topic
                </label>
                <input
                  type="text"
                  className="mt-2 w-full rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  placeholder="e.g., Photosynthesis, The French Revolution..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  aria-label="Topic"
                />
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  We'll generate questions based on general knowledge about this topic.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!canProceedToStep2()}
            className="w-full flex items-center justify-center gap-2 rounded-[18px] bg-[var(--primary)] py-4 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            Next Step
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* STEP 2: Configuration */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          {/* Difficulty */}
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Difficulty
            </label>
            <div className="mt-2 flex gap-2">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 rounded-[12px] border px-3 py-2 text-sm capitalize transition-colors ${
                    difficulty === d
                      ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-medium"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                  }`}
                  disabled={generating}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* MCQs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-main)]">
                📝 MCQs
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMcqCount(Math.max(0, mcqCount - 5))}
                  disabled={generating || mcqCount === 0}
                  className="h-8 w-8 rounded-full bg-[var(--border)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50 flex items-center justify-center"
                  aria-label="Decrease MCQ count"
                >
                  −
                </button>
                <span className="w-8 text-center font-medium">{mcqCount}</span>
                <button
                  type="button"
                  onClick={() => setMcqCount(Math.min(50, mcqCount + 5))}
                  disabled={generating || mcqCount >= 50}
                  className="h-8 w-8 rounded-full bg-[var(--border)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50 flex items-center justify-center"
                  aria-label="Increase MCQ count"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Subjective */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-main)]">
                ✍️ Subjective
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSubjectiveCount(Math.max(0, subjectiveCount - 5))}
                  disabled={generating || subjectiveCount === 0}
                  className="h-8 w-8 rounded-full bg-[var(--border)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50 flex items-center justify-center"
                  aria-label="Decrease subjective count"
                >
                  −
                </button>
                <span className="w-8 text-center font-medium">{subjectiveCount}</span>
                <button
                  type="button"
                  onClick={() => setSubjectiveCount(Math.min(50, subjectiveCount + 5))}
                  disabled={generating || subjectiveCount >= 50}
                  className="h-8 w-8 rounded-full bg-[var(--border)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50 flex items-center justify-center"
                  aria-label="Increase subjective count"
                >
                  +
                </button>
              </div>
            </div>

            {subjectiveCount > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {subjectiveTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => toggleSubjectiveType(type.value)}
                    disabled={generating}
                    className={`flex items-center gap-2 rounded-[12px] border p-2 text-left text-xs transition-all ${
                      selectedSubjectiveTypes.includes(type.value)
                        ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-medium"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                    }`}
                  >
                    <span>{type.icon}</span>
                    {type.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(1)}
              disabled={generating}
              className="flex-1 rounded-[18px] border border-[var(--border)] py-4 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              Back
            </button>
            
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-[2] relative overflow-hidden rounded-[18px] bg-[var(--primary)] py-4 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
            >
              {generating ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{statusMessage || "Generating..."} {progress > 0 && `(${progress}%)`}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  <span>Generate Quiz</span>
                </div>
              )}
              
              {/* Progress Bar Background */}
              {generating && (
                <div 
                  className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {error && (
        <div className="rounded-[16px] border border-red-300 bg-red-50 p-3 text-sm text-red-700 animate-in fade-in slide-in-from-top-2">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {success && (
        <div className="rounded-[16px] border border-green-300 bg-green-50 p-4 text-sm text-green-700 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <div className="font-semibold">Quiz created successfully!</div>
          </div>
        </div>
      )}
    </div>
  );
}
