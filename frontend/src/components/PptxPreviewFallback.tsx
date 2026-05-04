import type { ReactNode } from "react";
import { FileText, Presentation } from "lucide-react";
import Button from "./Button";
import type { FileRow } from "../lib/api";

function sanitizeDetailMessage(raw?: string | null): string {
  if (!raw?.trim()) return "Something went wrong while loading this document.";
  const t = raw.trim();
  if (t.startsWith("{") && t.includes("detail")) {
    try {
      const j = JSON.parse(t) as { detail?: unknown };
      const d = j?.detail;
      if (typeof d === "string" && d.trim()) return d.trim();
      if (Array.isArray(d) && d[0] && typeof (d[0] as { msg?: string }).msg === "string") {
        return String((d[0] as { msg: string }).msg).trim();
      }
    } catch {
      /* ignore */
    }
    return "The file could not be found on the server.";
  }
  return t;
}

function officeKindFromFile(file: FileRow): "pptx" | "docx" {
  return file.filename.toLowerCase().endsWith(".docx") ? "docx" : "pptx";
}

export type PptxPreviewFallbackProps = {
  file: FileRow;
  /** When the preview API or slide-PDF fetch failed (optional server-ish message). */
  errorHint?: string | null;
  /** True when the server returned preview failed / conversion error (not merely “unsupported”). */
  conversionFailed?: boolean;
  indexedReady: boolean;
  processingFailed: boolean;
  onDownload: () => void;
  onBack: () => void;
  onRetryPreview?: () => void;
  onRetryProcessing?: () => void;
  onGenerateFlashcards?: () => void;
  onGenerateQuiz?: () => void;
  /** e.g. extracted slide text */
  children?: ReactNode;
};

export default function PptxPreviewFallback({
  file,
  errorHint,
  conversionFailed = false,
  indexedReady,
  processingFailed,
  onDownload,
  onBack,
  onRetryPreview,
  onRetryProcessing,
  onGenerateFlashcards,
  onGenerateQuiz,
  children,
}: PptxPreviewFallbackProps) {
  const kind = officeKindFromFile(file);
  const Icon = kind === "docx" ? FileText : Presentation;
  const officeName = kind === "docx" ? "Word document" : "PowerPoint";

  let title: string;
  let body: string;
  if (errorHint?.trim()) {
    title = "Could not load preview";
    body = sanitizeDetailMessage(errorHint);
  } else if (conversionFailed) {
    title = "Preview generation failed";
    body = `The ${officeName} could not be converted to a preview on the server (often missing LibreOffice). You can still download the original file or retry processing below.`;
  } else if (processingFailed) {
    title = "Document processing failed";
    body =
      "Processing or extraction did not complete successfully. Download the file or re-upload it if the problem persists.";
  } else if (indexedReady && children) {
    title = `Showing extracted text (${officeName})`;
    body =
      "Preview PDF was not generated. You can read extracted text below, download the original file, or retry preview conversion.";
  } else if (indexedReady) {
    title = "Preview PDF was not generated";
    body = `The ${officeName} content is indexed, but the viewer PDF is missing. Retry preview conversion or download the original file.`;
  } else {
    title = "Preparing preview";
    body = `Still processing this ${officeName} file. When indexing finishes you can generate study material, or download the original now.`;
  }

  return (
    <div className="flex h-full w-full max-w-full flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-10 sm:px-8">
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center shadow-sm"
        style={{ boxShadow: "var(--shadow-panel, 0 8px 30px rgba(15,23,42,0.06))" }}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
          <Icon className="h-7 w-7" aria-hidden />
        </div>
        <h3 className="text-base font-semibold text-[var(--text-main)]">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <Button type="button" className="w-full sm:w-auto" onClick={onDownload}>
            Download original
          </Button>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onBack}>
            Back to documents
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {indexedReady && onGenerateFlashcards ? (
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onGenerateFlashcards}>
              Generate flashcards
            </Button>
          ) : null}
          {indexedReady && onGenerateQuiz ? (
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onGenerateQuiz}>
              Generate quiz
            </Button>
          ) : null}
          {onRetryPreview ? (
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onRetryPreview}>
              Retry preview
            </Button>
          ) : null}
          {processingFailed && onRetryProcessing ? (
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onRetryProcessing}>
              Retry processing
            </Button>
          ) : null}
        </div>
      </div>

      {children ? (
        <div className="mt-8 w-full max-w-3xl border-t border-[var(--border)] pt-8">{children}</div>
      ) : null}
    </div>
  );
}
