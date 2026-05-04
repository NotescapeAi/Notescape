// src/pages/Classes.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Download, Layers, Lightbulb, MessageCircle, Plus, Sparkles, Target, Upload, X } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import ClassSidebar from "../components/ClassSidebar";
import ClassHeaderButtons, { type FlashcardGenerationOptions } from "../components/ClassHeaderButtons";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import KebabMenu from "../components/KebabMenu";
import PdfStudyViewer, { type PdfSelection, type PdfSnip } from "../components/PdfStudyViewer";
import PptxPreviewFallback from "../components/PptxPreviewFallback";
import { useLayout } from "../layouts/LayoutContext";
import { showAppToast, type AppToastKind } from "../lib/toast";

import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  listFiles,
  uploadFile,
  uploadHandwrittenFile,
  deleteFile,
  updateFile,
  retryFileProcessing,
  retryHandwrittenOCR,
  getOCRReview,
  saveOCRCleanedText,
  generateFlashcardsFromOCR,
  generateQuizFromOCR,
  type FileRow,
  type OCRReviewResult,
  type ClassRow,
  type ChunkPreview,
  generateFlashcardsAsync,
  getFlashcardJobStatus,
  listFlashcards,
  type Flashcard,
  getWeakCards,
  type WeakCard,
  getClassRecommendations,
  type RevisionRecommendation,
  chatAsk,
  createChatSession,
  listChatSessions,
  listChatSessionMessages,
  updateChatSession,
  deleteChatSession,
  addChatMessages,
  type ChatSession,
  type ChatMessage,
  ocrImageSnippet,
  getDocumentViewUrl,
  getDocumentPreview,
  processDocumentPreview,
  type DocumentPreview,
  fetchAuthenticatedBlobUrl,
  apiErrorMessage,
  apiServerOrigin,
} from "../lib/api";

type StudyMsg = ChatMessage & { citations?: any };
type StudyQuickAction = "summary" | "explain" | "quiz" | "key_points";

const EMPTY_STUDY_CHAT_TITLE = "New chat";
const STUDY_QUICK_ACTIONS: Array<{ key: StudyQuickAction; label: string; prompt: string }> = [
  {
    key: "summary",
    label: "Summarize",
    prompt: "Summarize the current document.",
  },
  {
    key: "explain",
    label: "Explain",
    prompt: "Explain this document in simple terms.",
  },
  {
    key: "quiz",
    label: "Generate quiz",
    prompt:
      "Generate an intelligent quiz from the current document. Use specific concepts, definitions, comparisons, examples, and applications from the document. Include answers and source slide or page hints.",
  },
  {
    key: "key_points",
    label: "Key points",
    prompt: "List the key points from this document.",
  },
];

const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const ALLOWED_EXT = new Set<string>([
  ".pdf",
  ".pptx",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".log",
]);

function hasAllowedExt(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return ALLOWED_EXT.has(name.slice(dot).toLowerCase());
}

function isOldPptUpload(file: File) {
  return file.name.toLowerCase().endsWith(".ppt") || file.type === "application/vnd.ms-powerpoint";
}

function isAllowed(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("text/") || ALLOWED_MIME.has(file.type) || hasAllowedExt(file.name);
}

function isPdfFile(file?: FileRow | null) {
  if (!file) return false;
  if ((file as any).mime_type && String((file as any).mime_type).includes("pdf")) return true;
  return file.filename.toLowerCase().endsWith(".pdf");
}

function isReadyStatus(status?: string | null) {
  const s = String(status || "").toUpperCase();
  return s === "INDEXED" || s === "READY" || s === "OCR_READY";
}

function isStudyGenerationReady(file: FileRow): boolean {
  return isReadyStatus(file.status) && (file.chunk_count ?? 0) > 0;
}

function isGenericStudyChatTitle(title?: string | null) {
  const clean = (title || "").trim();
  return (
    !clean ||
    clean === EMPTY_STUDY_CHAT_TITLE ||
    clean === "Chat session" ||
    clean === "New Conversation" ||
    clean.startsWith("Chat about ")
  );
}

function generateStudyChatTitle(text: string) {
  const words = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (words.length === 0) return EMPTY_STUDY_CHAT_TITLE;
  const title = words.join(" ");
  return title.length > 50 ? `${title.slice(0, 47).trim()}...` : title;
}

function studyChatTitleFromMessage(text: string, fileName?: string | null, quickAction?: StudyQuickAction) {
  const doc = displayFilename(fileName, { removeExtension: true });
  const cap = (s: string) => (s.length > 50 ? `${s.slice(0, 47).trim()}...` : s);
  if (quickAction === "quiz") return cap(`Quiz on ${doc}`);
  if (quickAction === "summary") return cap(`Summary of ${doc}`);
  if (quickAction === "key_points") return cap(`Key points from ${doc}`);
  if (quickAction === "explain") return cap(`Explanation of ${doc}`);
  return generateStudyChatTitle(text);
}

function formatStudySessionRowMeta(value?: string | null) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

/** User-visible workflow state for the document list and viewer chrome (not raw backend enums). */
function documentWorkflowLabel(file: FileRow): string {
  const s = String(file.status || "").toUpperCase();
  const chunks = file.chunk_count ?? 0;
  if (s === "FAILED") return "Failed";
  if (needsConvertedOfficePreview(file) && isStudyGenerationReady(file) && !isOfficeViewerReady(file)) {
    const viewer = officeViewerStatus(file);
    if (viewer === "processing") return "Ready, preview processing";
    if (viewer === "failed") return "Ready, preview failed";
    return "Ready, preview unavailable";
  }
  if (s === "UPLOADING") return "Uploading";
  if (s === "UPLOADED") return "Uploaded";
  if (isReadyStatus(s) && chunks > 0) return "Ready";
  if (s === "FAILED_PREVIEW" && chunks > 0) return "Ready";
  if (s === "FAILED_PREVIEW") return "Preview failed";
  if (isReadyStatus(s) && chunks === 0) return "Processing";
  if (s === "EXTRACTING_TEXT" || s === "RUNNING_OCR") return "Extracting text";
  if (s === "CHUNKING" || s === "GENERATING_EMBEDDINGS") return "Indexing content";
  if (s === "CONVERTING_PREVIEW" || s === "PREVIEW_READY") return "Building preview";
  if (
    [
      "PROCESSING",
      "OCR_QUEUED",
      "OCR_DONE",
      "SPLITTING_PAGES",
      "ENHANCING_IMAGE",
      "PREPARING_REVIEW",
    ].includes(s)
  ) {
    return "Processing";
  }
  if (s === "OCR_NEEDS_REVIEW") return "Needs review";
  return "Processing";
}

/** Secondary line under the status pill — no fake percentages. */
function documentStageDetail(file: FileRow): string | null {
  const s = String(file.status || "").toUpperCase();
  if (isStudyGenerationReady(file)) {
    if (needsConvertedOfficePreview(file) && !isOfficeViewerReady(file)) {
      const err = (file.conversion_error || file.preview_error || "").trim();
      const viewer = officeViewerStatus(file);
      if (viewer === "processing") return "Preparing slide preview...";
      if (err) return err.length > 160 ? `${err.slice(0, 157)}…` : err;
      return "Preview PDF was not generated.";
    }
    return null;
  }
  if (s === "FAILED") {
    const err = (file.last_error || "").trim();
    return err.length > 160 ? `${err.slice(0, 157)}…` : err || "Processing failed.";
  }
  if (s === "FAILED_PREVIEW") {
    return (file.chunk_count ?? 0) > 0
      ? "PDF preview unavailable; search and assistant still work."
      : "Could not build PDF preview.";
  }
  const stages: Record<string, string> = {
    UPLOADING: "Saving your upload…",
    UPLOADED: "Waiting for the processor…",
    PROCESSING: "Handoff to document processor…",
    OCR_QUEUED: "In queue…",
    EXTRACTING_TEXT: "Reading text from the file…",
    CHUNKING: "Splitting content into searchable segments…",
    GENERATING_EMBEDDINGS: "Vector index for chat and search…",
    CONVERTING_PREVIEW: "Optional PDF preview (LibreOffice)…",
    PREVIEW_READY: "Wrapping up…",
    OCR_DONE: "Almost done…",
    RUNNING_OCR: "Running OCR on pages…",
    SPLITTING_PAGES: "Preparing pages…",
    ENHANCING_IMAGE: "Enhancing scans…",
    PREPARING_REVIEW: "Preparing review…",
  };
  return stages[s] ?? "Working on your document…";
}

function canOpenDocumentInWorkspace(file: FileRow): boolean {
  if (String(file.status || "").toUpperCase() === "FAILED") return true;
  if (isHandwrittenOCR(file) && String(file.status || "").toUpperCase() === "OCR_NEEDS_REVIEW") return false;
  if (needsConvertedOfficePreview(file)) return isStudyGenerationReady(file) || isOfficeViewerReady(file);
  return isStudyGenerationReady(file);
}

function isHandwrittenOCR(file?: FileRow | null) {
  return String(file?.source_type || "").toLowerCase() === "handwritten_ocr";
}

function isPptxFile(file?: FileRow | null) {
  if (!file) return false;
  const mime = String(file.mime_type || "").toLowerCase();
  return mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || file.filename.toLowerCase().endsWith(".pptx");
}

function isDocxFile(file?: FileRow | null) {
  if (!file) return false;
  const mime = String(file.mime_type || "").toLowerCase();
  return (
    mime.includes("wordprocessingml.document") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.filename.toLowerCase().endsWith(".docx")
  );
}

/** PPTX/DOCX: fetch JSON preview (includes converted PDF URL when ready). */
function needsConvertedOfficePreview(file?: FileRow | null) {
  return isPptxFile(file) || isDocxFile(file);
}

function officeViewerStatus(file?: FileRow | null) {
  return String(file?.viewer_status || "").toLowerCase();
}

function isOfficeViewerReady(file?: FileRow | null) {
  return needsConvertedOfficePreview(file) && officeViewerStatus(file) === "ready" && !!file?.viewer_file_url;
}

function officePreviewViewerUrl(preview?: DocumentPreview | null) {
  const url = preview?.viewer_file_url || preview?.preview?.url || preview?.pdf_url || null;
  if (!url) return null;
  return /\.pptx?($|[?#])/i.test(url) || /\.docx?($|[?#])/i.test(url) ? null : url;
}

function isImageFile(file?: FileRow | null) {
  if (!file) return false;
  const mime = String(file.mime_type || "").toLowerCase();
  const name = file.filename.toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(name);
}

function hasTextPreview(file?: FileRow | null) {
  if (!file) return false;
  const mime = String(file.mime_type || "").toLowerCase();
  const name = file.filename.toLowerCase();
  return (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime.startsWith("text/") ||
    /\.(docx|pptx|txt|md|csv|json|log)$/.test(name)
  );
}

function DocumentTextPreview({ preview }: { preview: DocumentPreview }) {
  const label = preview.kind === "pptx" ? "Extracted slide text" : preview.kind === "docx" ? "Document" : "Text";
  const pages = preview.pages?.length ? preview.pages : ["No previewable text was found in this document."];

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface)] px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        {pages.map((page, idx) => (
          <section
            key={idx}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"
          >
            <div className="mb-3 text-xs font-semibold uppercase text-[var(--text-muted-soft)]">
              {label} {preview.kind === "docx" && pages.length === 1 ? "Preview" : idx + 1}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-main)]">
              {page}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function prettyBytes(bytes?: number) {
  if (!Number.isFinite(bytes ?? NaN)) return "-";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes as number;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 2 : 0)} ${u[i]}`;
}

function timeLocal(s?: string | null) {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function StatusPill({ file }: { file: FileRow }) {
  const s = (file.status || "UPLOADED").toUpperCase();
  const toneByStatus: Record<string, "success" | "warning" | "info" | "danger" | "neutral"> = {
    UPLOADED: "warning",
    UPLOADING: "warning",
    PROCESSING: "warning",
    OCR_QUEUED: "warning",
    EXTRACTING_TEXT: "warning",
    CHUNKING: "info",
    CONVERTING_PREVIEW: "info",
    PREVIEW_READY: "info",
    FAILED_PREVIEW: "warning",
    GENERATING_EMBEDDINGS: "info",
    OCR_DONE: "warning",
    OCR_NEEDS_REVIEW: "info",
    OCR_READY: "success",
    INDEXED: "success",
    READY: "success",
    FAILED: "danger",
  };
  const tone = toneByStatus[s] ?? "warning";
  const dotClass =
    tone === "success"
      ? "bg-[var(--success)]"
      : tone === "danger"
        ? "bg-[var(--danger)]"
        : tone === "info"
          ? "bg-[var(--primary)]"
          : tone === "warning"
            ? "bg-[var(--warning)]"
            : "bg-[var(--text-muted)]";
  const label = documentWorkflowLabel(file);
  return (
    <span className={`pill pill-${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
      {label}
    </span>
  );
}

function flashcardSourceStatus(file: FileRow) {
  if (isStudyGenerationReady(file)) return { disabled: false, label: "Ready for study generation" };
  if (String(file.status || "").toUpperCase() === "OCR_NEEDS_REVIEW") return { disabled: true, label: "Review OCR first" };
  if (
    [
      "PROCESSING",
      "UPLOADED",
      "EXTRACTING_TEXT",
      "CHUNKING",
      "CONVERTING_PREVIEW",
      "PREVIEW_READY",
      "FAILED_PREVIEW",
      "GENERATING_EMBEDDINGS",
      "OCR_QUEUED",
    ].includes(String(file.status || "").toUpperCase())
  ) {
    return { disabled: true, label: "Processing" };
  }
  if (String(file.status || "").toUpperCase() === "FAILED") return { disabled: true, label: "Extraction failed" };
  return { disabled: true, label: "Unsupported" };
}

function displayFilename(name?: string | null, opts?: { removeExtension?: boolean }) {
  const raw = (name || "Document").trim();
  const withoutExt = opts?.removeExtension ? raw.replace(/\.[^.]+$/, "") : raw;
  return withoutExt.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || raw;
}

function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="assistant-markdown min-w-0 break-words text-sm leading-6 text-main">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--primary)] underline underline-offset-2"
            >
              {linkChildren}
            </a>
          ),
          p: ({ children: paragraphChildren }) => <p className="my-2 first:mt-0 last:mb-0">{paragraphChildren}</p>,
          strong: ({ children: strongChildren }) => <strong className="font-bold text-main">{strongChildren}</strong>,
          em: ({ children: emChildren }) => <em className="italic">{emChildren}</em>,
          ul: ({ children: listChildren }) => <ul className="my-2 list-disc space-y-1 pl-5">{listChildren}</ul>,
          ol: ({ children: listChildren }) => <ol className="my-2 list-decimal space-y-1 pl-5">{listChildren}</ol>,
          li: ({ children: itemChildren }) => <li className="pl-1">{itemChildren}</li>,
          code: ({ className, children: codeChildren }) => {
            const inline = !className;
            if (inline) {
              return (
                <code className="rounded-md border border-token surface-2 px-1 py-0.5 text-[0.85em] text-main">
                  {codeChildren}
                </code>
              );
            }
            return <code className={className}>{codeChildren}</code>;
          },
          pre: ({ children: preChildren }) => (
            <pre className="my-3 max-w-full overflow-x-auto rounded-xl border border-token bg-[#111827] p-3 text-xs leading-5 text-white">
              {preChildren}
            </pre>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}


type ClassTab = "documents" | "flashcards";
const DOCUMENTS_PAGE_SIZE = 5;

function Tabs({
  active,
  onChange,
}: {
  active: ClassTab;
  onChange: (t: ClassTab) => void;
}) {
  const items: Array<[ClassTab, string]> = [
    ["documents", "Documents"],
    ["flashcards", "Flashcards"],
  ];
  return (
    <div
      role="tablist"
      aria-label="Class view"
      className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-0.5"
    >
      {items.map(([key, label]) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`inline-flex h-8 items-center justify-center rounded-[var(--radius-sm)] px-3.5 text-[13px] font-semibold transition ${
              isActive
                ? "bg-[var(--surface)] text-[var(--text-main)] shadow-[var(--shadow-xs)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ClassesContent() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ClassTab>("documents");

  const [files, setFiles] = useState<FileRow[] | undefined>([]);
  const [documentsPage, setDocumentsPage] = useState(0);
  const [flashcardSourceIds, setFlashcardSourceIds] = useState<string[]>([]);
  const documentRows = useMemo(() => files ?? [], [files]);
  const documentsPageCount = Math.max(1, Math.ceil(documentRows.length / DOCUMENTS_PAGE_SIZE));
  const currentDocumentsPage = Math.min(documentsPage, documentsPageCount - 1);
  const visibleDocuments = useMemo(
    () =>
      documentRows.slice(
        currentDocumentsPage * DOCUMENTS_PAGE_SIZE,
        currentDocumentsPage * DOCUMENTS_PAGE_SIZE + DOCUMENTS_PAGE_SIZE
      ),
    [documentRows, currentDocumentsPage]
  );
  const [busyUpload, setBusyUpload] = useState(false);
  const [busyFlow, setBusyFlow] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [invalidDropCount, setInvalidDropCount] = useState(0);

  const [preview, setPreview] = useState<ChunkPreview[] | null>(null);
  const [, setCards] = useState<Flashcard[]>([]);
  const [flashcardGenerationSummary, setFlashcardGenerationSummary] = useState<string | null>(null);
  const [weakCards, setWeakCards] = useState<WeakCard[]>([]);
  const [weakCardsLoading, setWeakCardsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<RevisionRecommendation[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [activeFile, setActiveFile] = useState<FileRow | null>(null);
  const [detailsFile, setDetailsFile] = useState<FileRow | null>(null);
  const [activeFileViewUrl, setActiveFileViewUrl] = useState<string | null>(null);
  const [activeFileViewError, setActiveFileViewError] = useState<string | null>(null);
  const [activeFileViewLoading, setActiveFileViewLoading] = useState(false);
  const [activeDocumentPreview, setActiveDocumentPreview] = useState<DocumentPreview | null>(null);
  const [activeDocumentPreviewError, setActiveDocumentPreviewError] = useState<string | null>(null);
  const [activeDocumentPreviewLoading, setActiveDocumentPreviewLoading] = useState(false);
  /** Blob or presigned URL for PDF / PPTX-as-PDF / images — plain fetch cannot send Firebase headers. */
  const [studyViewerBlobUrl, setStudyViewerBlobUrl] = useState<string | null>(null);
  const [studyViewerBlobLoading, setStudyViewerBlobLoading] = useState(false);
  const [studyViewerBlobError, setStudyViewerBlobError] = useState<string | null>(null);
  /** When converted PPTX→PDF blob fails in react-pdf, parent shows PPTX fallback instead of PDF chrome. */
  const [pptxConvertedPdfFailed, setPptxConvertedPdfFailed] = useState(false);
  const [studyViewerRetryNonce, setStudyViewerRetryNonce] = useState(0);
  const [documentPreviewRetryNonce, setDocumentPreviewRetryNonce] = useState(0);
  const [viewUrlRetryNonce, setViewUrlRetryNonce] = useState(0);
  const [ocrReviewOpen, setOcrReviewOpen] = useState(false);
  const [ocrReviewFile, setOcrReviewFile] = useState<FileRow | null>(null);
  const [ocrReview, setOcrReview] = useState<OCRReviewResult | null>(null);
  const [ocrDraftPages, setOcrDraftPages] = useState<Record<number, string>>({});
  const [ocrBusy, setOcrBusy] = useState(false);
  const [uploadMode, setUploadMode] = useState<"typed" | "handwritten">("typed");
  const [pdfFocusMode, setPdfFocusMode] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<{
    text: string;
    x: number;
    y: number;
    fileId: string;
    page: number;
    boundingBox: any;
  } | null>(null);
  const [pendingSnip, setPendingSnip] = useState<PdfSnip | null>(null);

  // Study Assistant (docked panel next to PDF viewer)
  const [studyAssistantOpen, setStudyAssistantOpen] = useState(false);
  const [studySessions, setStudySessions] = useState<ChatSession[]>([]);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [studyMessages, setStudyMessages] = useState<StudyMsg[]>([]);
  const [studySessionsLoading, setStudySessionsLoading] = useState(false);
  const [studyMessagesLoading, setStudyMessagesLoading] = useState(false);
  const [studyMessagesReloadNonce, setStudyMessagesReloadNonce] = useState(0);
  const [studyInput, setStudyInput] = useState('');
  const [renamingStudySession, setRenamingStudySession] = useState<{ id: string; title: string } | null>(null);
  const [studyHistoryOpen, setStudyHistoryOpen] = useState(false);
  const [studyHistorySearch, setStudyHistorySearch] = useState("");
  const studyHistoryDropdownRef = useRef<HTMLDivElement | null>(null);
  const [studyBusySessionId, setStudyBusySessionId] = useState<string | null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [studySelectedQuote, setStudySelectedQuote] = useState<{ text: string; fileId?: string | null; pageNumber?: number | null } | null>(null);
  const studyChatScrollRef = useRef<HTMLDivElement | null>(null);
  const activeStudySessionRef = useRef<string | null>(null);
  const studyMessagesRequestRef = useRef(0);
  const activeStudyDocumentRef = useRef<{ classId: number | null; fileId: string | null }>({
    classId: null,
    fileId: null,
  });
  const fileStatusRef = useRef<Record<string, string>>({});

  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const documentListRef = useRef<HTMLDivElement | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newClassName, setNewClassName] = useState("");

  const { sidebar, setSidebar } = useLayout();
  const prevSidebarRef = useRef(sidebar);
  const [classesPanelCollapsed, setClassesPanelCollapsed] = useState(
    window.localStorage.getItem("notescape.ui.classesPanel") === "collapsed"
  );
  const prevClassesPanelCollapsed = useRef(classesPanelCollapsed);

  useEffect(() => {
    (async () => setClasses(await listClasses()))();
  }, []);

  useEffect(() => {
    const st = (location as any)?.state;
    if (st?.selectId) setSelectedId(Number(st.selectId));
  }, [location]);

  useEffect(() => {
    if (selectedId != null || classes.length === 0) return;
    const stored = Number(localStorage.getItem("last_class_id"));
    const fallback = classes[0]?.id ?? null;
    if (Number.isFinite(stored) && classes.some((c) => c.id === stored)) {
      setSelectedId(stored);
    } else if (fallback !== null) {
      setSelectedId(fallback);
    }
  }, [classes, selectedId]);

  useEffect(() => {
    if (selectedId == null) {
      setFiles([]);
      setFlashcardSourceIds([]);
      setCards([]);
      setActiveTab("documents");
      setActiveFile(null);
      setDocumentsPage(0);
      return;
    }
    setActiveTab("documents");
    setActiveFile(null);
    setDocumentsPage(0);
    setActiveFileViewUrl(null);
    setActiveFileViewError(null);
    setActiveFileViewLoading(false);
    setSelectionMenu(null);
    setPendingSnip(null);
    localStorage.setItem("last_class_id", String(selectedId));
    (async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs ?? []);
      try {
        setCards(await listFlashcards(selectedId));
      } catch {
        /* ignore */
      }
    })();
  }, [selectedId]);

  useEffect(() => {
    const currentFiles = files ?? [];
    if (!selectedId || currentFiles.length === 0) {
      setFlashcardSourceIds([]);
      return;
    }
    const fileIds = new Set(currentFiles.map((f) => f.id));
    const indexedIds = currentFiles.filter((f) => isStudyGenerationReady(f)).map((f) => f.id);
    const defaultId = indexedIds[0] ?? currentFiles[0]?.id ?? null;
    setFlashcardSourceIds((prev) => {
      const kept = prev.filter((id) => fileIds.has(id));
      if (kept.length > 0) return kept;
      return defaultId ? [defaultId] : [];
    });
  }, [selectedId, files]);

  useEffect(() => {
    if (!activeFile) return;
    const fresh = (files ?? []).find((f) => f.id === activeFile.id);
    if (fresh && fresh !== activeFile) {
      setActiveFile(fresh);
    }
  }, [files, activeFile?.id]);

  useEffect(() => {
    setPptxConvertedPdfFailed(false);
  }, [activeFile?.id]);

  useEffect(() => {
    setDocumentsPage((page) => Math.min(page, Math.max(0, documentsPageCount - 1)));
  }, [documentsPageCount]);

  useEffect(() => {
    activeStudyDocumentRef.current = {
      classId: selectedId ?? null,
      fileId: activeFile?.id ?? null,
    };
  }, [selectedId, activeFile?.id]);

  useEffect(() => {
    activeStudySessionRef.current = studySessionId;
  }, [studySessionId]);

  // Load study sessions when active file changes
  useEffect(() => {
    if (!selectedId || !activeFile) {
      setStudySessions([]);
      setStudySessionId(null);
      setStudyMessages([]);
      setStudySessionsLoading(false);
      setStudyMessagesLoading(false);
      setStudyBusySessionId(null);
      setStudyError(null);
      setStudySelectedQuote(null);
      setPendingSnip(null);
      setStudyHistoryOpen(false);
      setStudyHistorySearch("");
      return;
    }
    let cancelled = false;
    const fileId = activeFile.id;
    setStudySessions([]);
    setStudySessionId(null);
    setStudyMessages([]);
    setStudySessionsLoading(true);
    setStudyMessagesLoading(false);
    setStudyBusySessionId(null);
    setStudyError(null);
    setStudySelectedQuote(null);
    setPendingSnip(null);
    setStudyHistoryOpen(false);
    setStudyHistorySearch("");
    (async () => {
      try {
        const sess = await listChatSessions(selectedId, fileId);
        if (
          cancelled ||
          activeStudyDocumentRef.current.classId !== selectedId ||
          activeStudyDocumentRef.current.fileId !== fileId
        ) {
          return;
        }
        const scoped = (sess || []).filter((session) => session.class_id === selectedId && session.document_id === fileId);
        setStudySessions(scoped);
        const stored = localStorage.getItem(`study_session_${selectedId}_${fileId}`);
        const preferred = stored ? scoped.find((s) => s.id === stored)?.id : null;
        const documentSession = scoped.find((s) => s.document_id === fileId)?.id ?? null;
        setStudySessionId(preferred ?? documentSession ?? null);
      } catch (err) {
        if (!cancelled) {
          if (import.meta.env.DEV) console.error("[CHAT] failed to load study chats", err);
          setStudySessions([]);
          setStudySessionId(null);
          setStudyError("Couldn't load chat history. Try reopening the assistant.");
        }
      } finally {
        if (!cancelled) setStudySessionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, activeFile?.id]);

  useEffect(() => {
    if (!studyHistoryOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = studyHistoryDropdownRef.current;
      if (el && !el.contains(e.target as Node)) setStudyHistoryOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [studyHistoryOpen]);

  useEffect(() => {
    if (!studyHistoryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStudyHistoryOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studyHistoryOpen]);

  // Load messages when study session changes
  useEffect(() => {
    const requestId = ++studyMessagesRequestRef.current;
    if (!studySessionId) {
      setStudyMessages([]);
      setStudyMessagesLoading(false);
      setStudyError(null);
      return;
    }
    let cancelled = false;
    const sessionId = studySessionId;
    const fileId = activeFile?.id ?? null;
    setStudyMessages([]);
    setStudyMessagesLoading(true);
    setStudyError(null);
    (async () => {
      try {
        const msgs = await listChatSessionMessages(sessionId, selectedId);
        if (
          cancelled ||
          requestId !== studyMessagesRequestRef.current ||
          activeStudySessionRef.current !== sessionId ||
          activeStudyDocumentRef.current.classId !== (selectedId ?? null) ||
          activeStudyDocumentRef.current.fileId !== fileId
        ) {
          return;
        }
        setStudyMessages((msgs || []).map((m) => ({ ...m, citations: m.citations ?? undefined })));
      } catch (err) {
        if (!cancelled && requestId === studyMessagesRequestRef.current) {
          if (import.meta.env.DEV) console.error("[CHAT] failed to load study messages", err);
          setStudyMessages([]);
          setStudyError("Couldn't load this chat. Select it again or start a new chat.");
        }
      } finally {
        if (!cancelled && requestId === studyMessagesRequestRef.current) {
          setStudyMessagesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studySessionId, selectedId, activeFile?.id, studyMessagesReloadNonce]);

  // Auto-scroll study chat
  useEffect(() => {
    const el = studyChatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [studyMessages.length, studyBusySessionId, studyMessagesLoading]);

  // Clear selection menu on scroll/click outside
  useEffect(() => {
    if (!selectionMenu) return;
    const clear = () => setSelectionMenu(null);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("mousedown", clear);
    return () => {
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("mousedown", clear);
    };
  }, [selectionMenu]);

  useEffect(() => {
    if (!selectedId) return;
    const needsPoll = (files ?? []).some((f) =>
      officeViewerStatus(f) === "processing" ||
      [
        "UPLOADING",
        "UPLOADED",
        "PROCESSING",
        "EXTRACTING_TEXT",
        "CHUNKING",
        "CONVERTING_PREVIEW",
        "PREVIEW_READY",
        "FAILED_PREVIEW",
        "OCR_QUEUED",
        "GENERATING_EMBEDDINGS",
        "OCR_DONE",
        "RUNNING_OCR",
        "SPLITTING_PAGES",
        "ENHANCING_IMAGE",
        "PREPARING_REVIEW",
      ].includes(String(f.status || "").toUpperCase())
    );
    if (!needsPoll) return;
    const id = setInterval(async () => {
      const fs = await listFiles(selectedId);
      setFiles(fs ?? []);
    }, 2000);
    return () => clearInterval(id);
  }, [selectedId, files]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const file of files ?? []) {
      const status = String(file.status || "UPLOADED").toUpperCase();
      const prev = fileStatusRef.current[file.id];
      if (prev && prev !== status) {
        if (isReadyStatus(status)) showToastMessage("Document is ready.");
        if (status === "FAILED") showToastMessage("Processing failed. Please retry.");
      }
      next[file.id] = status;
    }
    fileStatusRef.current = next;
  }, [files]);

  useEffect(() => {
    if (!selectedId || activeTab !== "flashcards") {
      setWeakCards([]);
      setWeakCardsLoading(false);
      setRecommendations([]);
      setRecommendationsLoading(false);
      return;
    }
    let cancelled = false;
    setWeakCardsLoading(true);
    setRecommendationsLoading(true);
    (async () => {
      try {
        const [cards, recs] = await Promise.all([
          getWeakCards({ deck_id: selectedId, limit: 6, days: 30 }),
          getClassRecommendations(selectedId),
        ]);
        if (!cancelled) {
          setWeakCards(cards);
          setRecommendations(recs);
        }
      } catch {
        if (!cancelled) {
          setWeakCards([]);
          setRecommendations([]);
        }
      } finally {
        if (!cancelled) {
          setWeakCardsLoading(false);
          setRecommendationsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, activeTab]);

  useEffect(() => {
    if (!selectedId || !activeFile) {
      setActiveFileViewUrl(null);
      setActiveFileViewError(null);
      setActiveFileViewLoading(false);
      return;
    }
    if (needsConvertedOfficePreview(activeFile)) {
      console.info("[OFFICE_PREVIEW] opening document_id=%s", activeFile.id);
      console.info("[OFFICE_PREVIEW] skipping getDocumentViewUrl for office file");
      setActiveFileViewUrl(null);
      if (activeFileViewError) {
        console.info("[OFFICE_PREVIEW] clearing stale activeFileViewError");
      }
      setActiveFileViewError(null);
      setActiveFileViewLoading(false);
      return;
    }
    let cancelled = false;
    setActiveFileViewLoading(true);
    setActiveFileViewError(null);
    setActiveFileViewUrl(null);
    (async () => {
      try {
        const res = await getDocumentViewUrl(selectedId, activeFile.id);
        if (cancelled) return;
        if (!res?.url) {
          setActiveFileViewError("Could not render this file. Please download instead.");
          return;
        }
        setActiveFileViewUrl(res.url);
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setActiveFileViewError("You're not signed in. Please log in again.");
        } else if (status === 404) {
          setActiveFileViewError("File not found or deleted.");
        } else {
          setActiveFileViewError("Could not render this file. Please download instead.");
        }
        if (import.meta.env.DEV) {
          console.warn("[classes] view url failed", err);
        }
      } finally {
        if (!cancelled) setActiveFileViewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, activeFile?.id, activeFile?.filename, activeFile?.mime_type, viewUrlRetryNonce]);

  useEffect(() => {
    if (!selectedId || !activeFile || isPdfFile(activeFile) || isImageFile(activeFile) || !hasTextPreview(activeFile)) {
      setActiveDocumentPreview(null);
      setActiveDocumentPreviewError(null);
      setActiveDocumentPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setActiveDocumentPreview(null);
    setActiveDocumentPreviewError(null);
    setActiveDocumentPreviewLoading(true);
    (async () => {
      try {
        const officeFile = needsConvertedOfficePreview(activeFile);
        if (officeFile) {
          console.info("[OFFICE_PREVIEW] opening document_id=%s", activeFile.id);
        }
        let res = await getDocumentPreview(selectedId, activeFile.id);
        if (officeFile) {
          console.info(
            "[OFFICE_PREVIEW] preview response viewer_status=%s viewer_file_url=%s",
            res.viewer_status,
            officePreviewViewerUrl(res)
          );
          if (!officePreviewViewerUrl(res) && res.viewer_status !== "processing" && res.preview?.status !== "generating") {
            const retry = await processDocumentPreview(selectedId, activeFile.id);
            console.info(
              "[OFFICE_PREVIEW] retry success viewer_file_url=%s",
              retry.viewer_file_url || retry.pdf_url || null
            );
            res = await getDocumentPreview(selectedId, activeFile.id);
          }
        }
        if (!cancelled) {
          setActiveDocumentPreview(res);
          if (officeFile && officePreviewViewerUrl(res)) {
            if (activeFileViewError) {
              console.info("[OFFICE_PREVIEW] clearing stale activeFileViewError");
            }
            setActiveFileViewError(null);
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setActiveDocumentPreviewError("You're not signed in. Please log in again.");
        } else if (status === 404) {
          setActiveDocumentPreviewError(
            "Preview unavailable. The file could not be found on the server."
          );
        } else if (status === 415) {
          setActiveDocumentPreviewError("Preview is not available for this file type.");
        } else {
          setActiveDocumentPreviewError("Could not build a preview for this file. Please download instead.");
        }
        if (import.meta.env.DEV) {
          console.warn("[classes] document preview failed", err);
        }
      } finally {
        if (!cancelled) setActiveDocumentPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, activeFile?.id, documentPreviewRetryNonce]);

  useEffect(() => {
    let cancelled = false;
    let revoke: (() => void) | undefined;

    async function run() {
      setStudyViewerBlobUrl(null);
      setStudyViewerBlobError(null);
      setStudyViewerBlobLoading(false);
      if (!selectedId || !activeFile) return;

      const isPdf = isPdfFile(activeFile);
      const isImg = isImageFile(activeFile);
      const isOfficePdf = needsConvertedOfficePreview(activeFile);

      const convertedOfficePdfPath =
        isOfficePdf &&
        !activeDocumentPreviewLoading &&
        activeDocumentPreview &&
        (activeDocumentPreview.preview?.type === "pdf" || activeDocumentPreview.pdf_url || activeDocumentPreview.viewer_file_url)
          ? officePreviewViewerUrl(activeDocumentPreview)
          : null;

      let rawUrl: string | null = null;
      if (isPdf || isImg) {
        if (activeFileViewLoading || activeFileViewError || !activeFileViewUrl) return;
        rawUrl = activeFileViewUrl;
      } else if (isOfficePdf) {
        if (!convertedOfficePdfPath) return;
        if (activeFileViewError) {
          console.info("[OFFICE_PREVIEW] clearing stale activeFileViewError");
          setActiveFileViewError(null);
        }
        rawUrl = convertedOfficePdfPath;
      } else {
        return;
      }

      setStudyViewerBlobLoading(true);
      try {
        const out = await fetchAuthenticatedBlobUrl(rawUrl);
        revoke = out.revoke;
        if (cancelled) {
          out.revoke?.();
          return;
        }
        setStudyViewerBlobUrl(out.url);
      } catch (e) {
        if (cancelled) return;
        setStudyViewerBlobError(apiErrorMessage(e, "The file could not be found on the server."));
      } finally {
        if (!cancelled) setStudyViewerBlobLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [
    selectedId,
    activeFile?.id,
    activeFile?.filename,
    activeFile?.mime_type,
    activeFileViewUrl,
    activeFileViewLoading,
    activeFileViewError,
    activeDocumentPreview,
    activeDocumentPreviewLoading,
    activeDocumentPreviewError,
    studyViewerRetryNonce,
  ]);

  function toggleFocusMode() {
    if (pdfFocusMode) {
      setPdfFocusMode(false);
      setSidebar(prevSidebarRef.current);
      setClassesPanelCollapsed(prevClassesPanelCollapsed.current);
      return;
    }
    prevSidebarRef.current = sidebar;
    prevClassesPanelCollapsed.current = classesPanelCollapsed;
    setSidebar("collapsed");
    setClassesPanelCollapsed(true);
    setPdfFocusMode(true);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pdfFocusMode) {
          toggleFocusMode();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pdfFocusMode]);

  function toggleClassesPanel() {
    const next = !classesPanelCollapsed;
    setClassesPanelCollapsed(next);
    window.localStorage.setItem(
      "notescape.ui.classesPanel",
      next ? "collapsed" : "expanded"
    );
  }

  async function handleCreate(name: string) {
    const row = await createClass({ name, subject: "General" });
    setClasses((xs) => [...xs, row]);
    setShowCreate(false);
    setNewClassName("");
  }
  async function handleRename(id: number, name: string) {
    const row = await updateClass(id, { name });
    setClasses((xs) => xs.map((c) => (c.id === id ? row : c)));
  }
  async function handleDeleteClass(id: number) {
    await deleteClass(id);
    setClasses((xs) => xs.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setFiles([]);
      setCards([]);
      setActiveTab("documents");
    }
  }

  async function onRenameSelected(id?: number) {
    const targetId = id ?? selectedId;
    if (!targetId) return;
    const current = classes.find((c) => c.id === targetId)?.name ?? "";
    const next = window.prompt("Rename class", current);
    if (!next || !next.trim()) return;
    await handleRename(targetId, next.trim());
  }

  async function onDeleteSelected(id?: number) {
    const targetId = id ?? selectedId;
    if (!targetId) return;
    const current = classes.find((c) => c.id === targetId)?.name ?? "this class";
    if (!confirm(`Delete \"${current}\"?`)) return;
    await handleDeleteClass(targetId);
  }

  function acceptFile(f: File) {
    if (isOldPptUpload(f)) return false;
    return isAllowed(f);
  }

  async function uploadMany(fileList: FileList | File[], mode: "typed" | "handwritten" = uploadMode) {
    if (!selectedId) {
      alert("Select a class first.");
      return;
    }
    const arr = Array.from(fileList);
    const accepted = arr.filter(acceptFile);
    const rejected = arr.filter((f) => !acceptFile(f));
    setInvalidDropCount(rejected.length);
    if (rejected.some(isOldPptUpload)) {
      showToastMessage("Old .ppt files are not supported yet. Please upload .pptx or PDF.");
    }

    if (accepted.length === 0) return;

    setBusyUpload(true);

    try {
      for (const f of accepted) {
        const row = mode === "handwritten" ? await uploadHandwrittenFile(selectedId, f) : await uploadFile(selectedId, f);
        setFiles((xs) => [row, ...(xs ?? [])]);
        showToastMessage(
          mode === "handwritten"
            ? "Handwritten notes uploaded. OCR review will be ready shortly."
            : "Document uploaded. Processing started."
        );
      }
      setDocumentsPage(0);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      showToastMessage(typeof detail === "string" && detail.trim() ? detail : "Upload failed. Please try again.");
    } finally {
      setBusyUpload(false);
      setDropping(false);
    }
  }

  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    await uploadMany(e.target.files);
    e.target.value = "";
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropping(false);
  }
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    await uploadMany(e.dataTransfer.files);
  }

  async function openOcrReview(file: FileRow) {
    setOcrReviewFile(file);
    setOcrReviewOpen(true);
    setOcrReview(null);
    setOcrDraftPages({});
    setOcrBusy(true);
    try {
      const data = await getOCRReview(file.id);
      setOcrReview(data);
      const drafts: Record<number, string> = {};
      for (const page of data.pages || []) drafts[page.page_number] = page.cleaned_text || page.raw_text || "";
      setOcrDraftPages(drafts);
    } catch (err: any) {
      showToastMessage(err?.response?.data?.detail || err?.message || "Failed to load OCR review.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function saveOcrReview() {
    if (!ocrReviewFile || !ocrReview) return;
    setOcrBusy(true);
    try {
      await saveOCRCleanedText(
        ocrReviewFile.id,
        ocrReview.pages.map((page) => ({
          page_number: page.page_number,
          cleaned_text: ocrDraftPages[page.page_number] ?? "",
        }))
      );
      const fresh = await listFiles(ocrReviewFile.class_id || selectedId!);
      setFiles(fresh);
      setOcrReviewOpen(false);
      showToastMessage("Cleaned OCR text saved. This document is ready for flashcards and quizzes.");
    } catch (err: any) {
      showToastMessage(err?.response?.data?.detail || err?.message || "Failed to save OCR text.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function generateOcrFlashcards() {
    if (!ocrReviewFile) return;
    setOcrBusy(true);
    try {
      await generateFlashcardsFromOCR(ocrReviewFile.id, { style: "mixed" });
      setOcrReviewOpen(false);
      setActiveTab("flashcards");
      showToastMessage("Flashcard generation from reviewed OCR text started.");
    } catch (err: any) {
      showToastMessage(err?.response?.data?.detail || err?.message || "Review and save OCR text before generating flashcards.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function generateOcrQuiz() {
    if (!ocrReviewFile) return;
    setOcrBusy(true);
    try {
      await generateQuizFromOCR(ocrReviewFile.id, { n_questions: 10, mcq_count: 10, types: ["mcq"], difficulty: "medium" });
      showToastMessage("Quiz generation from reviewed OCR text started.");
      setOcrReviewOpen(false);
      navigate(`/quizzes?class_id=${ocrReviewFile.class_id || selectedId}`);
    } catch (err: any) {
      showToastMessage(err?.response?.data?.detail || err?.message || "Review and save OCR text before generating a quiz.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function rerunOcr() {
    if (!ocrReviewFile) return;
    setOcrBusy(true);
    try {
      await retryHandwrittenOCR(ocrReviewFile.id);
      const fresh = await listFiles(ocrReviewFile.class_id || selectedId!);
      setFiles(fresh);
      setOcrReviewOpen(false);
      showToastMessage("OCR retry queued.");
    } catch (err: any) {
      showToastMessage(err?.response?.data?.detail || err?.message || "Failed to retry OCR.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function onDeleteFile(fileId: string, filename: string) {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await deleteFile(fileId);
      setFiles((xs) => (xs ?? []).filter((f) => f.id !== fileId));
      setDetailsFile((current) => (current?.id === fileId ? null : current));
    } catch {
      alert("Failed to delete file");
    }
  }

  function openDocumentInWorkspace(file: FileRow) {
    if (isHandwrittenOCR(file) && String(file.status || "").toUpperCase() === "OCR_NEEDS_REVIEW") {
      void openOcrReview(file);
      return;
    }
    if (!canOpenDocumentInWorkspace(file)) {
      showToastMessage(documentStageDetail(file) || "Document is not ready to open yet.");
      return;
    }
    setActiveTab("documents");
    setActiveFile(file);
  }

  function prepareFlashcardsFromFile(file: FileRow) {
    if (!isStudyGenerationReady(file)) {
      showToastMessage("Document is still processing or not indexed yet.");
      return;
    }
    setFlashcardSourceIds([file.id]);
    setActiveTab("flashcards");
    setDetailsFile(null);
  }

  function prepareQuizFromFile(file: FileRow) {
    if (!isStudyGenerationReady(file)) {
      showToastMessage("Document is still processing or not indexed yet.");
      return;
    }
    if (!selectedId) return;
    navigate(`/quizzes?class_id=${selectedId}`);
    showToastMessage("Choose your document and create a quiz on the Quizzes page.");
  }

  function handleStudyAssistantClick() {
    if (!selectedId) {
      showToastMessage("Select a class first.");
      return;
    }
    if (!activeFile) {
      showToastMessage("Open a document to use the contextual assistant.");
      return;
    }
    setStudyAssistantOpen((open) => !open);
  }

  function closeActiveDocument() {
    setActiveFile(null);
    setActiveFileViewUrl(null);
    setActiveFileViewError(null);
    setActiveFileViewLoading(false);
    setStudyViewerBlobUrl(null);
    setStudyViewerBlobLoading(false);
    setStudyViewerBlobError(null);
    setPptxConvertedPdfFailed(false);
    setStudyViewerRetryNonce(0);
    setDocumentPreviewRetryNonce(0);
    setViewUrlRetryNonce(0);
    setSelectionMenu(null);
    setPendingSnip(null);
    window.requestAnimationFrame(() => {
      documentListRef.current?.focus();
    });
  }

  async function resolveDocumentUrl(file: FileRow): Promise<string | null> {
    if (!selectedId) return null;
    try {
      if (needsConvertedOfficePreview(file)) {
        console.info("[OFFICE_PREVIEW] opening document_id=%s", file.id);
        console.info("[OFFICE_PREVIEW] skipping getDocumentViewUrl for office file");
        let preview = await getDocumentPreview(selectedId, file.id);
        if (!officePreviewViewerUrl(preview) && preview.viewer_status !== "processing" && preview.preview?.status !== "generating") {
          const retry = await processDocumentPreview(selectedId, file.id);
          console.info("[OFFICE_PREVIEW] retry success viewer_file_url=%s", retry.viewer_file_url || retry.pdf_url || null);
          preview = await getDocumentPreview(selectedId, file.id);
        }
        return officePreviewViewerUrl(preview);
      }
      const res = await getDocumentViewUrl(selectedId, file.id);
      return res?.url ?? null;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        showToastMessage("You're not signed in. Please log in again.");
      } else if (status === 404) {
        showToastMessage("File not found or deleted.");
      } else {
        showToastMessage("Could not open this file. Try again.");
      }
      return null;
    }
  }

  async function openDocument(file: FileRow) {
    try {
      const url = await resolveDocumentUrl(file);
      if (!url) return;
      const { url: blobOrDirect, revoke } = await fetchAuthenticatedBlobUrl(url);
      window.open(blobOrDirect, "_blank", "noopener,noreferrer");
      if (revoke) window.setTimeout(revoke, 120_000);
    } catch (e) {
      showToastMessage(apiErrorMessage(e, "Could not open this file."));
    }
  }

  async function downloadDocument(file: FileRow) {
    try {
      const url = file.storage_url || (selectedId ? `/api/classes/${selectedId}/documents/${file.id}/download` : null);
      if (!url) return;
      const { url: blobOrDirect, revoke } = await fetchAuthenticatedBlobUrl(url);
      const link = document.createElement("a");
      link.href = blobOrDirect;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (revoke) window.setTimeout(revoke, 60_000);
    } catch (e) {
      showToastMessage(apiErrorMessage(e, "Download failed."));
    }
  }

  async function retryOfficeDocumentPreview() {
    if (!selectedId || !activeFile || !needsConvertedOfficePreview(activeFile)) return;
    console.info("[OFFICE_PREVIEW] retry started document_id=%s", activeFile.id);
    if (activeFileViewError) {
      console.info("[OFFICE_PREVIEW] clearing stale activeFileViewError");
    }
    setActiveFileViewError(null);
    setActiveDocumentPreviewError(null);
    setActiveDocumentPreviewLoading(true);
    setPptxConvertedPdfFailed(false);
    setStudyViewerBlobError(null);
    try {
      setFiles((xs) =>
        (xs ?? []).map((f) =>
          f.id === activeFile.id ? { ...f, viewer_status: "processing", conversion_error: null, preview_error: null } : f
        )
      );
      setActiveFile((current) =>
        current?.id === activeFile.id
          ? { ...current, viewer_status: "processing", conversion_error: null, preview_error: null }
          : current
      );
      const retry = await processDocumentPreview(selectedId, activeFile.id);
      console.info("[OFFICE_PREVIEW] retry success viewer_file_url=%s", retry.viewer_file_url || retry.pdf_url || null);
      const preview = await getDocumentPreview(selectedId, activeFile.id);
      setActiveDocumentPreview(preview);
      if (officePreviewViewerUrl(preview)) {
        setActiveFileViewError(null);
      }
      const fresh = await listFiles(selectedId);
      setFiles(fresh ?? []);
      const updated = (fresh ?? []).find((f) => f.id === activeFile.id);
      if (updated) setActiveFile(updated);
    } catch (e) {
      showToastMessage(apiErrorMessage(e, "Could not rebuild preview on the server."));
    } finally {
      setActiveDocumentPreviewLoading(false);
    }
    setDocumentPreviewRetryNonce((n) => n + 1);
    setStudyViewerRetryNonce((n) => n + 1);
    setPptxConvertedPdfFailed(false);
  }

  async function onGenerateFlashcards(opts: FlashcardGenerationOptions) {
    if (!selectedId) return alert("Select a class first");
    if ((files?.length ?? 0) === 0) return alert("Upload at least one file first");
    if (flashcardSourceIds.length === 0) {
      showToastMessage("Select study sources first.");
      return;
    }

    const ids = flashcardSourceIds;
    const pending = (files ?? []).filter((f) => ids.includes(f.id) && !isStudyGenerationReady(f));
    if (pending.length > 0) {
      return alert("Some files are still processing. Wait until they are ready before generating flashcards.");
    }

    setBusyFlow(true);
    setFlashcardGenerationSummary(null);
    try {
      const job = await generateFlashcardsAsync({
        class_id: selectedId,
        file_ids: ids,
        top_k: 12,
        cardCountMode: opts.cardCountMode,
        requestedCount: opts.requestedCount,
        style: opts.style,
        difficulty: opts.difficulty,
      });
      showToastMessage("Flashcard job queued. Generating in background...");

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      let completed = false;
      let completedSummary: string | null = null;
      for (let i = 0; i < 90; i++) {
        await sleep(2000);
        const status = await getFlashcardJobStatus(job.job_id);
        if (status.status === "completed") {
          completed = true;
          const countText = typeof status.generatedCount === "number"
            ? `Generated ${status.generatedCount} flashcards from ${ids.length} document${ids.length === 1 ? "" : "s"}.`
            : "Flashcards generated.";
          const modeText = status.cardCountMode === "auto" && typeof status.generatedCount === "number"
            ? ` Auto selected ${status.generatedCount} card${status.generatedCount === 1 ? "" : "s"} based on document length.`
            : "";
          const summary = `${countText}${modeText}${status.warning ? ` ${status.warning}` : ""}`;
          completedSummary = summary;
          setFlashcardGenerationSummary(summary);
          showToastMessage(summary);
          break;
        }
        if (status.status === "failed") {
          throw new Error(status.error_message || "Flashcard generation failed.");
        }
      }
      if (!completed) {
        showToastMessage("Flashcard job still running. Check back in a moment.");
        return;
      }

      const created = await listFlashcards(selectedId);
      setCards(created);
      if (!completedSummary) {
        setFlashcardGenerationSummary(`Flashcards ready (${created.length} total).`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate flashcards";
      alert(msg);
    } finally {
      setBusyFlow(false);
    }
  }

  function handlePdfContextSelect(sel: PdfSelection) {
    if (!activeFile) return;
    if (!sel.text) {
      setSelectionMenu(null);
      return;
    }
    setSelectionMenu({
      text: sel.text,
      x: sel.rect.left + sel.rect.width / 2,
      y: Math.max(sel.rect.top - 8, 8),
      fileId: activeFile.id,
      page: sel.page,
      boundingBox: {
        x: sel.rect.left,
        y: sel.rect.top,
        width: sel.rect.width,
        height: sel.rect.height,
      },
    });
  }

  function handlePdfSnip(snip: PdfSnip) {
    const withFile = { ...snip, file_id: activeFile?.id ?? null };
    setPendingSnip(withFile);
    setStudyAssistantOpen(true);
    showToastMessage("Snippet captured — add a prompt and send.");
  }

  function inferToastKind(message: string): AppToastKind {
    const lower = message.toLowerCase();
    if (lower.includes("failed") || lower.includes("couldn't") || lower.includes("not supported") || lower.includes("error")) return "error";
    if (lower.includes("queued") || lower.includes("processing") || lower.includes("running")) return "loading";
    if (lower.includes("ready") || lower.includes("saved") || lower.includes("uploaded")) return "success";
    return "info";
  }

  function showToastMessage(message: string, kind: AppToastKind = inferToastKind(message)) {
    showAppToast(message, kind);
  }

  function startNewStudySession() {
    if (!selectedId || !activeFile) return;
    activeStudySessionRef.current = null;
    setStudySessionId(null);
    setStudyMessages([]);
    setStudyMessagesLoading(false);
    setStudyError(null);
    setStudyInput("");
    setStudySelectedQuote(null);
    setPendingSnip(null);
    setStudyHistoryOpen(false);
    setStudyHistorySearch("");
    localStorage.removeItem(`study_session_${selectedId}_${activeFile.id}`);
  }

  function selectStudySession(sessionId: string) {
    activeStudySessionRef.current = sessionId;
    setStudySessionId(sessionId);
    setStudyMessages([]);
    setStudyMessagesLoading(true);
    setStudyInput("");
    setStudySelectedQuote(null);
    setPendingSnip(null);
    setStudyError(null);
    setStudyHistoryOpen(false);
    setStudyHistorySearch("");
    if (selectedId && activeFile) {
      localStorage.setItem(`study_session_${selectedId}_${activeFile.id}`, sessionId);
    }
  }

  async function saveStudySessionRename() {
    if (!renamingStudySession) return;
    const title = renamingStudySession.title.trim();
    if (!title) {
      showToastMessage("Chat title cannot be empty.", "error");
      return;
    }
    try {
      const updated = await updateChatSession(renamingStudySession.id, { title });
      setStudySessions((prev) =>
        prev.map((session) => (session.id === updated.id ? { ...session, ...updated } : session))
      );
      setRenamingStudySession(null);
      showToastMessage("Chat renamed.", "success");
    } catch (err) {
      if (import.meta.env.DEV) console.error("[CHAT] failed to rename study chat", err);
      showToastMessage("Could not rename this chat.", "error");
    }
  }

  async function deleteStudySession(sessionId: string) {
    if (!selectedId || !window.confirm("Delete this chat? This cannot be undone.")) return;
    try {
      await deleteChatSession(sessionId, selectedId);
      const remaining = studySessions.filter((session) => session.id !== sessionId);
      setStudySessions(remaining);
      setRenamingStudySession((current) => (current?.id === sessionId ? null : current));
      if (studySessionId === sessionId) {
        const next = remaining[0]?.id ?? null;
        if (next) {
          selectStudySession(next);
        } else {
          startNewStudySession();
        }
      }
      showToastMessage("Chat deleted.", "success");
    } catch (err) {
      if (import.meta.env.DEV) console.error("[CHAT] failed to delete study chat", err);
      showToastMessage("Could not delete this chat.", "error");
    }
  }

  async function onStudyAsk(overrideContent?: string, options?: { quickAction?: StudyQuickAction }) {
    if (!selectedId || !activeFile || studyBusySessionId) return;
    const requestClassId = selectedId;
    const requestFile = activeFile;
    const content = (overrideContent ?? studyInput).trim();
    if (!content && !pendingSnip) return;
    const finalContent = content || "Explain this snippet.";

    let sessionId = studySessionId;
    const selectedSession = studySessions.find((session) => session.id === sessionId);
    const sessionDocumentId = selectedSession?.document_id ?? null;
    if (!sessionId || !selectedSession || (sessionDocumentId && sessionDocumentId !== requestFile.id)) {
      try {
        const s = await createChatSession({
          class_id: requestClassId,
          document_id: requestFile.id,
          title: studyChatTitleFromMessage(finalContent, requestFile.filename, options?.quickAction),
        });
        setStudySessions((prev) => [s, ...prev.filter((session) => session.id !== s.id)]);
        sessionId = s.id;
        activeStudySessionRef.current = s.id;
        setStudySessionId(s.id);
        localStorage.setItem(`study_session_${requestClassId}_${requestFile.id}`, s.id);
      } catch (err) {
        if (import.meta.env.DEV) console.error("[CHAT] failed to create study chat", err);
        showToastMessage("Couldn't create a chat. Please try again.", "error");
        return;
      }
    } else if (sessionId) {
      localStorage.setItem(`study_session_${requestClassId}_${requestFile.id}`, sessionId);
    }
    const requestSessionId = sessionId!;

    const snip = pendingSnip;
    const quote = studySelectedQuote;
    const userMsg: StudyMsg = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: "user",
      content: finalContent,
      selected_text: quote?.text ?? null,
      page_number: snip?.page ?? null,
      bounding_box: null,
      file_id: requestFile.id,
      image_attachment: snip ?? null,
    };
    setStudyMessages((prev) => [...prev, userMsg]);
    setStudyMessagesLoading(false);
    setStudyError(null);
    setStudyInput("");
    setPendingSnip(null);
    setStudySelectedQuote(null);
    setStudyBusySessionId(requestSessionId);

    let assistantText =
      isStudyGenerationReady(requestFile)
        ? "Sorry, I couldn't finish that response. Please try again."
        : "This document is still processing or not indexed yet. Document-specific answers will be available once it is ready.";
    let citations: any = null;
    let generationFailed = false;
    try {
      if (isStudyGenerationReady(requestFile)) {
        let question = quote?.text
          ? `Selected text from "${requestFile.filename}":
"${quote.text}"

${finalContent}`
          : `Current document: "${requestFile.filename}"
Use this document as the primary context unless I explicitly ask for something else.

${finalContent}`;
        if (snip?.data_url && !quote?.text) {
          try {
            const ocr = await ocrImageSnippet(snip.data_url);
            if (ocr?.text) {
              question = `Snippet text from "${requestFile.filename}":
"${ocr.text}"

${finalContent}`;
            }
          } catch { /* ignore */ }
        }
        const res = await chatAsk({
          class_id: requestClassId,
          question,
          top_k: 8,
          file_ids: [requestFile.id],
          mode: "rag",
        });
        assistantText = (res.answer || "").trim() || "Not found in the uploaded material.";
        citations = res.citations ?? null;
      }
    } catch (err) {
      generationFailed = true;
      if (import.meta.env.DEV) console.error("[study assistant] ask failed", err);
    }

    const botMsg: StudyMsg = {
      id: crypto.randomUUID?.() ?? String(Date.now() + 1),
      role: "assistant",
      content: assistantText,
      citations: citations ?? undefined,
    };
    if (
      !generationFailed &&
      activeStudySessionRef.current === requestSessionId &&
      activeStudyDocumentRef.current.classId === requestClassId &&
      activeStudyDocumentRef.current.fileId === requestFile.id
    ) {
      setStudyMessages((prev) => [...prev, botMsg]);
    } else if (generationFailed) {
      showToastMessage("Couldn't finish that response. Your message was saved.");
    }

    try {
      const saved = await addChatMessages({
        session_id: requestSessionId,
        class_id: requestClassId,
        document_id: requestFile.id,
        user_content: userMsg.content,
        assistant_content: generationFailed ? null : botMsg.content,
        citations,
        selected_text: quote?.text ?? null,
        page_number: userMsg.page_number ?? null,
        bounding_box: null,
        file_id: requestFile.id,
        file_scope: [requestFile.id],
        image_attachment: snip ?? null,
      });
      if (
        activeStudySessionRef.current === requestSessionId &&
        activeStudyDocumentRef.current.classId === requestClassId &&
        activeStudyDocumentRef.current.fileId === requestFile.id &&
        Array.isArray(saved?.messages)
      ) {
        setStudyMessages(saved.messages.map((m) => ({ ...m, citations: m.citations ?? undefined })));
      }
      setStudySessions((prev) => {
        const updatedAt = new Date().toISOString();
        return prev
          .map((session) => {
            if (session.id !== requestSessionId) return session;
            const title = isGenericStudyChatTitle(session.title)
              ? studyChatTitleFromMessage(userMsg.content, requestFile.filename, options?.quickAction)
              : session.title;
            if (title !== session.title) updateChatSession(requestSessionId, { title }).catch(() => {});
            return { ...session, title, updated_at: updatedAt };
          })
          .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error("[CHAT] failed to save study messages", err);
      showToastMessage("Couldn't save this chat message. Please try again.", "error");
    } finally {
      setStudyBusySessionId((current) => (current === requestSessionId ? null : current));
    }
  }

  async function onRenameFile(file: FileRow) {
    const next = window.prompt("Rename document", file.filename);
    if (!next || !next.trim() || next.trim() === file.filename) return;
    try {
      const res = await updateFile(file.id, { filename: next.trim() });
      setFiles((xs) => (xs ?? []).map((f) => (f.id === file.id ? { ...f, filename: res.filename } : f)));
    } catch {
      showToastMessage("Rename failed. Please try again.");
    }
  }

  async function onRetryProcessing(file: FileRow) {
    try {
      await retryFileProcessing(file.id);
      setFiles((xs) =>
        (xs ?? []).map((f) =>
          f.id === file.id ? { ...f, status: "OCR_QUEUED", last_error: null } : f
        )
      );
      showToastMessage("Document uploaded. Processing started.");
    } catch {
      showToastMessage("Processing failed. Please retry.");
    }
  }

  const currentClass = selectedId
    ? classes.find((c) => c.id === selectedId)?.name
    : null;
  const currentStudyScopeLabel = studySelectedQuote
    ? "Using selected text"
    : pendingSnip
      ? `Using page ${pendingSnip.page} snippet`
      : activeFile
        ? "Using full document"
        : null;
  const isCurrentStudyBusy = !!studyBusySessionId && studyBusySessionId === studySessionId;
  const isStudySendDisabled = !!studyBusySessionId || (!studyInput.trim() && !pendingSnip);

  const studySessionsSortedFiltered = useMemo(() => {
    const q = studyHistorySearch.trim().toLowerCase();
    const sorted = [...studySessions].sort((a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
    );
    if (!q) return sorted;
    return sorted.filter((s) => {
      const t = (s.title || "").replace(/^\[Study\]\s*/, "").toLowerCase();
      return t.includes(q);
    });
  }, [studySessions, studyHistorySearch]);

  const studyHistoryButtonLabel = useMemo(() => {
    if (!studySessionId) return "Chat history";
    const s = studySessions.find((x) => x.id === studySessionId);
    const raw = (s?.title || "").replace(/^\[Study\]\s*/, "").trim() || "Chat history";
    return raw.length > 42 ? `${raw.slice(0, 39)}…` : raw;
  }, [studySessionId, studySessions]);

  const studyEmptyTitle = activeFile ? "Ask about this document" : selectedId ? "Ask about this class" : "Select a class or document";
  const studyEmptyDescription = activeFile
    ? "Questions and suggested actions will use the current document."
    : selectedId
      ? "Open a document for document-specific answers, or ask about this class."
      : "Choose a class or open a document to start a contextual chat.";
  const isWorkspaceWide = activeTab === "documents" && !!activeFile;
  const layoutClass = studyAssistantOpen && activeFile
    ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]"
    : "grid-cols-1";

  const hasAnyFiles = (files?.length ?? 0) > 0;
  const selectedFlashcardFiles = (files ?? []).filter((f) => flashcardSourceIds.includes(f.id));
  const selectedIndexedCount = selectedFlashcardFiles.filter((f) => isStudyGenerationReady(f)).length;
  const selectedPendingCount = selectedFlashcardFiles.filter((f) => !isStudyGenerationReady(f)).length;
  const canGenerateFlashcards =
    Boolean(selectedId) && flashcardSourceIds.length > 0 && selectedIndexedCount > 0 && selectedPendingCount === 0;
  const generateDisabledReason = !selectedId
    ? "Select a class first."
    : !hasAnyFiles
      ? "Upload at least one document first."
      : flashcardSourceIds.length === 0
        ? "Select at least one source document below."
      : selectedIndexedCount === 0
          ? "Selected document is still processing."
          : selectedPendingCount > 0
            ? "Some selected documents are still processing."
            : undefined;

  const hideReadingClutter = activeTab !== "documents" || !!activeFile;

  return (
    <>
      <div className="h-full min-h-0 overflow-hidden bg-[var(--bg-page)]">
        <div
          className="grid h-full min-h-0 gap-3"
          style={{
            gridTemplateColumns: pdfFocusMode
              ? "minmax(0,1fr)"
              : classesPanelCollapsed ? "72px minmax(0,1fr)" : "280px minmax(0,1fr)",
            transition: "grid-template-columns 0.25s ease",
          }}
        >
          {!pdfFocusMode && (
            <ClassSidebar
              items={classes}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              onNew={() => setShowCreate(true)}
              onRename={(id) => onRenameSelected(id)}
              onDelete={(id) => onDeleteSelected(id)}
              collapsed={classesPanelCollapsed}
              onToggleCollapse={toggleClassesPanel}
            />
          )}

        <section className="h-full min-h-0 overflow-hidden">
          <div
            className={`mx-auto flex h-full min-h-0 w-full flex-col gap-3 ${
              isWorkspaceWide ? "max-w-none" : "max-w-[1200px]"
            }`}
          >
            {!selectedId ? (
              classes.length === 0 ? (
                <div className="panel panel-muted border-dashed text-center space-y-3">
                  <div className="text-lg font-semibold text-main">Create your first class</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Start a class to upload documents and chat with your study assistant.
                  </div>
                  <Button variant="primary" className="mt-2" onClick={() => setShowCreate(true)}>
                    Create class
                  </Button>
                </div>
              ) : (
                <div className="panel panel-muted border-dashed text-center space-y-3">
                  <div className="text-lg font-semibold text-main">Choose a class to begin</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Select a class from the left to open documents and chat.
                  </div>
                </div>
              )
            ) : (
              <>
                <div className={`flex flex-shrink-0 flex-col gap-2.5 border-b border-[var(--border)] pb-3${pdfFocusMode ? " hidden" : ""}`}>
                  <div className="min-w-0">
                    <h2 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">
                      {currentClass}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <Tabs active={activeTab} onChange={setActiveTab} />
                    <div className="flex flex-wrap items-center justify-end gap-2.5">
                      {busyUpload && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)]" />
                          Uploading…
                        </span>
                      )}
                      {busyFlow && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)]" />
                          Processing…
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleStudyAssistantClick}
                        className={`inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                          studyAssistantOpen
                            ? "border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[var(--primary-soft)] text-[var(--primary)]"
                            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-main)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                        }`}
                        aria-pressed={studyAssistantOpen}
                        aria-label="Toggle Study Assistant"
                      >
                        <MessageCircle className="h-4 w-4 flex-shrink-0" />
                        Study Assistant
                      </button>
                    </div>
                  </div>
                </div>
                <div className={`min-h-0 flex-1 ${activeFile && activeTab === "documents" ? "flex flex-col overflow-hidden" : "overflow-y-auto pr-1"}`}>
                {activeTab === "documents" && (
                  <div className={activeFile ? "flex flex-col flex-1 min-h-0" : "space-y-3"}>
                    {activeFile ? (
                      <div className="relative flex flex-col flex-1 min-h-0">
                        <div className={`grid gap-3 flex-1 min-h-0 ${layoutClass}`}>
                      {/* PDF Viewer */}
                      <div className="flex flex-col min-h-0">
                          <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={closeActiveDocument}
                                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] sm:inline-flex"
                                  aria-label="Back to documents"
                                  title="Back to documents"
                                >
                                  <ArrowLeft className="h-4 w-4" />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="truncate text-[14px] font-semibold text-[var(--text-main)]"
                                    title={activeFile.filename}
                                  >
                                    {displayFilename(activeFile.filename)}
                                  </div>
                                  <div className="mt-0.5 text-[11.5px] text-[var(--text-muted-soft)]">
                                    {documentWorkflowLabel(activeFile)}
                                  </div>
                                </div>
                              </div>
                              <div className="hidden items-center gap-2 sm:flex">
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
                                  onClick={() => downloadDocument(activeFile)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Download
                                </button>
                              </div>
                              <div className="sm:hidden">
                                <KebabMenu
                                  items={[
                                    { label: "Download", onClick: () => downloadDocument(activeFile) },
                                    { label: "Back to documents", onClick: closeActiveDocument },
                                  ]}
                                />
                              </div>
                            </div>
                            <div className="flex-1 min-h-0 surface-2">
                              {activeFileViewLoading && !needsConvertedOfficePreview(activeFile) ? (
                                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                  Preparing document...
                                </div>
                              ) : activeFileViewError && !needsConvertedOfficePreview(activeFile) ? (
                                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted">
                                  <div>{activeFileViewError}</div>
                                  <button
                                    className="rounded-lg border border-token px-3 py-2 text-xs font-semibold text-muted"
                                    onClick={() => setViewUrlRetryNonce((n) => n + 1)}
                                  >
                                    Retry
                                  </button>
                                </div>
                              ) : isPdfFile(activeFile) && activeFileViewUrl ? (
                                studyViewerBlobLoading ? (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    Loading preview…
                                  </div>
                                ) : studyViewerBlobError ? (
                                  <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
                                    <div>
                                      <div className="text-sm font-semibold text-main">Preview unavailable</div>
                                      <p className="mt-2 text-sm text-muted">{studyViewerBlobError}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => setStudyViewerRetryNonce((n) => n + 1)}
                                      >
                                        Retry
                                      </Button>
                                      <Button type="button" variant="secondary" onClick={closeActiveDocument}>
                                        Back to documents
                                      </Button>
                                      <Button type="button" onClick={() => downloadDocument(activeFile)}>
                                        Download
                                      </Button>
                                    </div>
                                  </div>
                                ) : studyViewerBlobUrl ? (
                                  <PdfStudyViewer
                                    fileUrl={studyViewerBlobUrl}
                                    fileName={activeFile.filename}
                                    onContextSelect={handlePdfContextSelect}
                                    onSnip={handlePdfSnip}
                                    onSnipError={showToastMessage}
                                    onToggleFocus={toggleFocusMode}
                                    isFocusMode={pdfFocusMode}
                                    isChatVisible={studyAssistantOpen}
                                    onToggleChatVisibility={() => setStudyAssistantOpen((v) => !v)}
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    Loading preview…
                                  </div>
                                )
                              ) : needsConvertedOfficePreview(activeFile) ? (
                                activeDocumentPreviewLoading && !officePreviewViewerUrl(activeDocumentPreview) ? (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    {isPptxFile(activeFile)
                                      ? "Preparing PowerPoint preview…"
                                      : "Preparing Word document preview…"}
                                  </div>
                                ) : activeDocumentPreviewError && !officePreviewViewerUrl(activeDocumentPreview) ? (
                                  <PptxPreviewFallback
                                    file={activeFile}
                                    errorHint={activeDocumentPreviewError}
                                    indexedReady={isStudyGenerationReady(activeFile)}
                                    processingFailed={String(activeFile.status || "").toUpperCase() === "FAILED"}
                                    onDownload={() => downloadDocument(activeFile)}
                                    onBack={closeActiveDocument}
                                    onRetryPreview={() => void retryOfficeDocumentPreview()}
                                    onRetryProcessing={() => onRetryProcessing(activeFile)}
                                    onGenerateFlashcards={
                                      isStudyGenerationReady(activeFile)
                                        ? () => prepareFlashcardsFromFile(activeFile)
                                        : undefined
                                    }
                                    onGenerateQuiz={
                                      isStudyGenerationReady(activeFile)
                                        ? () => prepareQuizFromFile(activeFile)
                                        : undefined
                                    }
                                  />
                                ) : !activeDocumentPreview ? (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    {isPptxFile(activeFile)
                                      ? "Preparing PowerPoint preview…"
                                      : "Preparing Word document preview…"}
                                  </div>
                                ) : pptxConvertedPdfFailed || studyViewerBlobError ? (
                                  <PptxPreviewFallback
                                    file={activeFile}
                                    errorHint={studyViewerBlobError}
                                    indexedReady={isStudyGenerationReady(activeFile)}
                                    processingFailed={String(activeFile.status || "").toUpperCase() === "FAILED"}
                                    onDownload={() => downloadDocument(activeFile)}
                                    onBack={closeActiveDocument}
                                    onRetryPreview={() => void retryOfficeDocumentPreview()}
                                    onRetryProcessing={() => onRetryProcessing(activeFile)}
                                    onGenerateFlashcards={
                                      isStudyGenerationReady(activeFile)
                                        ? () => prepareFlashcardsFromFile(activeFile)
                                        : undefined
                                    }
                                    onGenerateQuiz={
                                      isStudyGenerationReady(activeFile)
                                        ? () => prepareQuizFromFile(activeFile)
                                        : undefined
                                    }
                                  />
                                ) : (activeDocumentPreview.preview?.status === "generating" ||
                                  activeDocumentPreview.viewer_status === "processing") &&
                                  !officePreviewViewerUrl(activeDocumentPreview) ? (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    {isPptxFile(activeFile)
                                      ? "Preparing slide preview..."
                                      : "Preparing document preview..."}
                                  </div>
                                ) : officePreviewViewerUrl(activeDocumentPreview) ? (
                                  studyViewerBlobLoading ? (
                                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                      {isPptxFile(activeFile) ? "Loading slide preview…" : "Loading document preview…"}
                                    </div>
                                  ) : studyViewerBlobUrl ? (
                                    <PdfStudyViewer
                                      fileUrl={studyViewerBlobUrl}
                                      fileName={activeFile.filename}
                                      pageLabelKind={isPptxFile(activeFile) ? "slide" : "page"}
                                      onContextSelect={handlePdfContextSelect}
                                      onSnip={handlePdfSnip}
                                      onSnipError={showToastMessage}
                                      onToggleFocus={toggleFocusMode}
                                      isFocusMode={pdfFocusMode}
                                      isChatVisible={studyAssistantOpen}
                                      onToggleChatVisibility={() => setStudyAssistantOpen((v) => !v)}
                                      onBlobPdfLoadFailed={() => setPptxConvertedPdfFailed(true)}
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                      {isPptxFile(activeFile) ? "Loading slide preview…" : "Loading document preview…"}
                                    </div>
                                  )
                                ) : activeDocumentPreview ? (
                                  <PptxPreviewFallback
                                    file={activeFile}
                                    errorHint={
                                      activeDocumentPreview.conversion_error ||
                                      activeDocumentPreview.preview?.error ||
                                      (activeDocumentPreview.viewer_status === "failed" ? "Preview PDF was not generated." : undefined)
                                    }
                                    conversionFailed={activeDocumentPreview.preview?.status === "failed"}
                                    indexedReady={isStudyGenerationReady(activeFile)}
                                    processingFailed={String(activeFile.status || "").toUpperCase() === "FAILED"}
                                    onDownload={() => downloadDocument(activeFile)}
                                    onBack={closeActiveDocument}
                                    onRetryPreview={() => void retryOfficeDocumentPreview()}
                                    onRetryProcessing={() => onRetryProcessing(activeFile)}
                                    onGenerateFlashcards={
                                      isStudyGenerationReady(activeFile)
                                        ? () => prepareFlashcardsFromFile(activeFile)
                                        : undefined
                                    }
                                    onGenerateQuiz={
                                      isStudyGenerationReady(activeFile)
                                        ? () => prepareQuizFromFile(activeFile)
                                        : undefined
                                    }
                                  >
                                    <DocumentTextPreview preview={activeDocumentPreview} />
                                  </PptxPreviewFallback>
                                ) : (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    {isPptxFile(activeFile)
                                      ? "Preparing PowerPoint preview…"
                                      : "Preparing Word document preview…"}
                                  </div>
                                )
                              ) : isImageFile(activeFile) && activeFileViewUrl ? (
                                studyViewerBlobLoading ? (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    Loading image…
                                  </div>
                                ) : studyViewerBlobError ? (
                                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted">
                                    <div>{studyViewerBlobError}</div>
                                    <Button type="button" variant="secondary" onClick={() => setStudyViewerRetryNonce((n) => n + 1)}>
                                      Retry
                                    </Button>
                                  </div>
                                ) : studyViewerBlobUrl ? (
                                  <div className="flex h-full items-center justify-center bg-[var(--surface)] p-4">
                                    <img
                                      src={studyViewerBlobUrl}
                                      alt={activeFile.filename}
                                      className="max-h-[80vh] max-w-full rounded-lg border border-[var(--border)] bg-white object-contain shadow-sm"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    Loading image…
                                  </div>
                                )
                              ) : hasTextPreview(activeFile) ? (
                                activeDocumentPreviewLoading ? (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    Preparing preview...
                                  </div>
                                ) : activeDocumentPreviewError ? (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    {activeDocumentPreviewError}
                                  </div>
                                ) : activeDocumentPreview ? (
                                  <DocumentTextPreview preview={activeDocumentPreview} />
                                ) : (
                                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                    Preview is not available for this document yet.
                                  </div>
                                )
                              ) : (
                                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                                  Preview is not available for this file type. You can open or download this file instead.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                      {/* Study Assistant — docked inline beside PDF */}
                      {studyAssistantOpen && (
                        <aside
                          className="fixed inset-x-3 bottom-3 z-40 flex max-h-[88vh] min-h-[50vh] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-elevated)] lg:static lg:h-full lg:max-h-none lg:min-h-0"
                          aria-label="Study Assistant"
                        >
                          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                                  <MessageCircle className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[14px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">
                                    Study Assistant
                                  </div>
                                  <div
                                    className="mt-1 truncate text-[12px] leading-snug text-[var(--text-muted)]"
                                    title={`${currentClass ?? ""} · ${activeFile.filename}`}
                                  >
                                    {currentClass ? `${currentClass} · ` : ""}
                                    {displayFilename(activeFile.filename, { removeExtension: true })}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setStudyAssistantOpen(false)}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text-main)]"
                                aria-label="Close Study Assistant"
                                title="Close"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={startNewStudySession}
                                className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                New chat
                              </button>
                              <div className="relative min-w-0 flex-1" ref={studyHistoryDropdownRef}>
                                <button
                                  type="button"
                                  onClick={() => setStudyHistoryOpen((o) => !o)}
                                  className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-left text-[13px] font-medium text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                                  aria-expanded={studyHistoryOpen}
                                  aria-haspopup="listbox"
                                >
                                  <span className="min-w-0 flex-1 truncate">{studyHistoryButtonLabel}</span>
                                  <ChevronDown
                                    className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition ${studyHistoryOpen ? "rotate-180" : ""}`}
                                  />
                                </button>
                                {studyHistoryOpen ? (
                                  <div
                                    className="absolute left-0 right-0 top-full z-[55] mt-1 flex max-h-[min(320px,55vh)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-elevated)]"
                                    role="listbox"
                                  >
                                    <div className="shrink-0 border-b border-[var(--border)] p-2">
                                      <input
                                        type="search"
                                        value={studyHistorySearch}
                                        onChange={(e) => setStudyHistorySearch(e.target.value)}
                                        placeholder="Search chats…"
                                        className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted-soft)] focus:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] focus:ring-2 focus:ring-[var(--ring)]"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    <div className="shrink-0 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-soft)]">
                                      Recent chats
                                    </div>
                                    <div
                                      className="ns-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2"
                                      style={{ maxHeight: "min(240px, 40vh)" }}
                                    >
                                      {studySessionsLoading ? (
                                        <div className="space-y-1.5 py-1">
                                          {[0, 1, 2, 3].map((idx) => (
                                            <div key={idx} className="h-9 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-2)]" />
                                          ))}
                                        </div>
                                      ) : studySessionsSortedFiltered.length === 0 ? (
                                        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-3 text-center text-[12px] text-[var(--text-muted)]">
                                          {studySessions.length === 0
                                            ? "No chats yet. Start with New chat or a quick action."
                                            : "No chats match your search."}
                                        </div>
                                      ) : (
                                        studySessionsSortedFiltered.map((s) => {
                                          const title = s.title.replace(/^\[Study\]\s*/, "").trim() || "Untitled chat";
                                          const active = s.id === studySessionId;
                                          const editing = renamingStudySession?.id === s.id;
                                          return (
                                            <div
                                              key={s.id}
                                              className={`mb-0.5 flex min-h-10 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 transition ${
                                                active
                                                  ? "bg-[var(--primary-soft)]"
                                                  : "hover:bg-[var(--surface-2)]"
                                              }`}
                                            >
                                              {editing ? (
                                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1.5">
                                                  <input
                                                    autoFocus
                                                    value={renamingStudySession.title}
                                                    onChange={(e) =>
                                                      setRenamingStudySession((current) =>
                                                        current ? { ...current, title: e.target.value } : current
                                                      )
                                                    }
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") void saveStudySessionRename();
                                                      if (e.key === "Escape") setRenamingStudySession(null);
                                                    }}
                                                    className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => void saveStudySessionRename()}
                                                    className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                                                  >
                                                    Save
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setRenamingStudySession(null)}
                                                    className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              ) : (
                                                <>
                                                  <button
                                                    type="button"
                                                    onClick={() => selectStudySession(s.id)}
                                                    className="flex min-w-0 flex-1 items-start gap-2 py-2 pl-1 text-left"
                                                  >
                                                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                                                      {active ? (
                                                        <Check className="h-3.5 w-3.5 text-[var(--primary)]" strokeWidth={2.5} />
                                                      ) : null}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                      <span className={`block truncate text-[13px] font-semibold leading-snug ${active ? "text-[var(--primary)]" : "text-[var(--text-main)]"}`}>
                                                        {title}
                                                      </span>
                                                      <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted-soft)]">
                                                        {formatStudySessionRowMeta(s.updated_at)}
                                                      </span>
                                                    </span>
                                                  </button>
                                                  <KebabMenu
                                                    portal
                                                    items={[
                                                      {
                                                        label: "Rename",
                                                        onClick: () => setRenamingStudySession({ id: s.id, title }),
                                                      },
                                                      {
                                                        label: "Delete",
                                                        onClick: () => void deleteStudySession(s.id),
                                                      },
                                                    ]}
                                                  />
                                                </>
                                              )}
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px] leading-snug">
                              {isStudyGenerationReady(activeFile) ? (
                                <span className="pill pill-success">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden />
                                  Using current document
                                </span>
                              ) : (
                                <span className="pill pill-warning">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" aria-hidden />
                                  Document not indexed yet
                                </span>
                              )}
                              {currentStudyScopeLabel && currentStudyScopeLabel !== "Using full document" ? (
                                <span className="text-[var(--text-muted-soft)]">· {currentStudyScopeLabel}</span>
                              ) : null}
                            </div>
                          </div>

                          {/* Messages */}
                          <div
                            ref={studyChatScrollRef}
                            className="ns-scroll min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--surface-2)] px-4 py-4"
                          >
                            {studyMessagesLoading ? (
                              <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
                                <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-xs)]">
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)]" style={{animationDelay:"0ms"}} />
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)]" style={{animationDelay:"150ms"}} />
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)]" style={{animationDelay:"300ms"}} />
                                </div>
                                <div className="text-xs font-medium text-[var(--text-muted)]">Loading this chat…</div>
                              </div>
                            ) : studyError ? (
                              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                                <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
                                  {studyError}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setStudyMessagesReloadNonce((n) => n + 1)}
                                  className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                                >
                                  Try again
                                </button>
                              </div>
                            ) : studyMessages.length === 0 ? (
                              <div className="flex h-full flex-col items-center justify-center gap-4 px-3 py-8 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--primary-soft)]">
                                  <MessageCircle className="h-5 w-5 text-[var(--primary)]" />
                                </div>
                                <div>
                                  <div className="text-[15px] font-semibold text-[var(--text-main)]">{studyEmptyTitle}</div>
                                  <div className="mx-auto mt-1 max-w-[280px] text-[13px] leading-relaxed text-[var(--text-muted)]">
                                    {studyEmptyDescription}
                                  </div>
                                </div>
                                <div className="flex w-full max-w-[320px] flex-wrap justify-center gap-2">
                                  {STUDY_QUICK_ACTIONS.map((action) => (
                                    <button
                                      key={action.key}
                                      type="button"
                                      onClick={() => void onStudyAsk(action.prompt, { quickAction: action.key })}
                                      disabled={!!studyBusySessionId}
                                      className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              studyMessages.map((m) => (
                                <div key={m.id} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                                  <div
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                      m.role === "user"
                                        ? "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]"
                                        : "bg-[var(--primary)] text-[var(--text-inverse)]"
                                    }`}
                                  >
                                    {m.role === "user" ? "You" : "AI"}
                                  </div>
                                  <div className={`flex max-w-[88%] flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                                    {m.selected_text && (
                                      <div className="max-w-full rounded-[var(--radius-sm)] border-l-2 border-[var(--primary)] bg-[var(--primary-soft)] px-2.5 py-1.5 text-[11px] italic text-[var(--primary)]">
                                        <span className="line-clamp-2">{m.selected_text}</span>
                                      </div>
                                    )}
                                    {m.image_attachment?.data_url && (
                                      <img
                                        src={m.image_attachment.data_url}
                                        alt="Snippet"
                                        className="max-h-28 rounded-[var(--radius-sm)] border border-[var(--border)] object-contain"
                                      />
                                    )}
                                    <div
                                      className={`min-w-0 max-w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[var(--text-main)] ${
                                        m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm shadow-[var(--shadow-xs)]"
                                      }`}
                                    >
                                      {m.role === "assistant" ? (
                                        <div className="text-[13px] leading-relaxed">
                                          <MarkdownContent>{m.content}</MarkdownContent>
                                        </div>
                                      ) : (
                                        <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{m.content}</div>
                                      )}
                                    </div>
                                    {m.citations && m.citations.length > 0 && (
                                      <div className="mt-0.5 flex flex-wrap gap-1">
                                        {m.citations.slice(0, 3).map((c: any, i: number) => (
                                          <span
                                            key={i}
                                            className="max-w-[160px] truncate rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                                          >
                                            {c.filename}
                                            {c.page_start ? ` · p.${c.page_start}` : ""}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                            {isCurrentStudyBusy && (
                              <div className="flex gap-2.5">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-[var(--text-inverse)]">
                                  AI
                                </div>
                                <div className="flex items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)]" style={{ animationDelay: "0ms" }} />
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)]" style={{ animationDelay: "150ms" }} />
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--primary)]" style={{ animationDelay: "300ms" }} />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Input area */}
                          <div className="flex-shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            {studySelectedQuote && (
                              <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border-l-2 border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs">
                                <div className="min-w-0 flex-1">
                                  <div className="mb-0.5 font-semibold text-[var(--warning)]">Selected text</div>
                                  <div className="line-clamp-2 italic text-[var(--text-main)]">{studySelectedQuote.text}</div>
                                </div>
                                <button
                                  onClick={() => setStudySelectedQuote(null)}
                                  className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                  aria-label="Remove selected text"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            {pendingSnip && (
                              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs">
                                <div className="mb-1.5 flex items-center justify-between">
                                  <span className="font-semibold text-[var(--text-main)]">Snippet attached</span>
                                  <button
                                    onClick={() => setPendingSnip(null)}
                                    className="text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                    aria-label="Remove snippet"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <img src={pendingSnip.data_url} alt="Snippet" className="max-h-20 rounded-[var(--radius-sm)] border border-[var(--border)]" />
                              </div>
                            )}
                            <div className="flex items-end gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 transition focus-within:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                              <textarea
                                value={studyInput}
                                onChange={(e) => {
                                  setStudyInput(e.target.value);
                                  const el = e.target;
                                  el.style.height = "auto";
                                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                                }}
                                placeholder={activeFile ? "Ask about this document…" : "Ask about this class…"}
                                rows={1}
                                className="min-w-0 flex-1 resize-none border-0 bg-transparent p-0 text-[13.5px] leading-relaxed text-[var(--text-main)] placeholder:text-[var(--text-muted-soft)] focus:outline-none focus:ring-0"
                                style={{ maxHeight: "120px", minHeight: "22px" }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    onStudyAsk();
                                  }
                                }}
                              />
                              <button
                                onClick={() => onStudyAsk()}
                                disabled={isStudySendDisabled}
                                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition ${
                                  !isStudySendDisabled
                                    ? "bg-[var(--primary)] text-[var(--text-inverse)] hover:bg-[var(--primary-hover)] active:scale-95"
                                    : "border border-[var(--border)] text-[var(--text-muted)] opacity-40"
                                }`}
                                aria-label="Send message"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 2L11 13" />
                                  <path d="M22 2L15 22 11 13 2 9l20-7z" />
                                </svg>
                              </button>
                            </div>
                            <div className="px-1 text-[10.5px] text-[var(--text-muted-soft)]">
                              ⏎ Send · ⇧⏎ New line
                            </div>
                          </div>
                        </aside>
                      )}
                    </div>
                  </div>
                ) : null}
                {!hideReadingClutter && (
                  <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={[
                      "application/pdf",
                      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                      "image/*",
                      "text/*",
                      "application/json",
                      ".pdf,.pptx,.docx,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.txt,.md,.csv,.json,.log",
                    ].join(",")}
                    className="hidden"
                    multiple
                    onChange={onUploadChange}
                  />

                  <div
                    ref={documentListRef}
                    tabIndex={-1}
                    className={`overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--surface)] shadow-[var(--shadow-sm)] transition ${
                      dropping ? "border-dashed border-[var(--primary)] bg-[var(--surface-2)]" : "border-[var(--border)]"
                    }`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-[var(--text-main)]">Documents</div>
                        <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                          {uploadMode === "handwritten"
                            ? "Handwritten notes use OCR first. Review extracted text before generating flashcards."
                            : "Upload PDFs, slides, docs, or images. Drop files to upload."}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="hidden items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-0.5 sm:flex">
                          <button
                            type="button"
                            onClick={() => setUploadMode("typed")}
                            className={`h-7 rounded-[var(--radius-sm)] px-2.5 text-[12px] font-semibold transition ${
                              uploadMode === "typed"
                                ? "bg-[var(--surface)] text-[var(--text-main)] shadow-[var(--shadow-xs)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                            }`}
                          >
                            Typed
                          </button>
                          <button
                            type="button"
                            onClick={() => setUploadMode("handwritten")}
                            className={`h-7 rounded-[var(--radius-sm)] px-2.5 text-[12px] font-semibold transition ${
                              uploadMode === "handwritten"
                                ? "bg-[var(--surface)] text-[var(--text-main)] shadow-[var(--shadow-xs)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                            }`}
                          >
                            Handwritten OCR
                          </button>
                        </div>
                        <button
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--primary)] px-3 text-[13px] font-semibold text-[var(--text-inverse)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          onClick={() => fileInputRef.current?.click()}
                          aria-label="Upload document"
                          title="Upload document"
                        >
                          <Upload className="h-4 w-4" />
                          <span>{uploadMode === "handwritten" ? "Upload notes" : "Upload"}</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 border-b border-token px-4 py-2 sm:hidden">
                      <button
                        type="button"
                        onClick={() => setUploadMode("typed")}
                        className={`flex-1 rounded-lg border border-token px-2 py-2 text-xs font-semibold ${uploadMode === "typed" ? "surface-2 text-main" : "text-muted"}`}
                      >
                        Typed PDF / document
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadMode("handwritten")}
                        className={`flex-1 rounded-lg border border-token px-2 py-2 text-xs font-semibold ${uploadMode === "handwritten" ? "surface-2 text-main" : "text-muted"}`}
                      >
                        Handwritten notes
                      </button>
                    </div>
                    {invalidDropCount > 0 && (
                      <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Ignored {invalidDropCount} unsupported file{invalidDropCount > 1 ? "s" : ""}.
                      </div>
                    )}
                    <div>
                      <table className="w-full text-sm">
                        <thead className="hidden border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted-soft)] sm:table-header-group">
                          <tr>
                            <th className="px-4 py-2.5 text-left">File</th>
                            <th className="px-4 py-2.5 text-left">Status</th>
                            <th className="px-4 py-2.5 text-left"></th>
                            <th className="px-4 py-2.5 text-right"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleDocuments.map((f) => (
                            <tr
                              key={f.id}
                              className="block border-t border-[var(--border)] px-4 py-3 transition hover:bg-[var(--surface-2)] sm:table-row sm:px-0 sm:py-0"
                            >
                              <td className="block sm:table-cell sm:px-4 sm:py-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-soft)] text-[10px] font-bold uppercase text-[var(--primary)]">
                                    {(f.filename.split(".").pop() || "F").slice(0, 4).toUpperCase()}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <button
                                      className="block w-full min-w-0 truncate text-left text-[14px] font-semibold text-[var(--text-main)] hover:underline"
                                      onClick={() => openDocumentInWorkspace(f)}
                                      title={f.filename}
                                    >
                                      {f.filename}
                                    </button>
                                    {isHandwrittenOCR(f) && (
                                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--primary)]">
                                        OCR notes
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="mt-2 block sm:mt-0 sm:table-cell sm:px-4 sm:py-3">
                                <div className="flex flex-col gap-1">
                                  <StatusPill file={f} />
                                  {documentStageDetail(f) && String(f.status || "").toUpperCase() !== "FAILED" ? (
                                    <p className="max-w-[240px] text-[11px] leading-snug text-[var(--text-muted)]">
                                      {documentStageDetail(f)}
                                    </p>
                                  ) : String(f.status || "").toUpperCase() === "FAILED" ? (
                                    <p className="max-w-[240px] text-[11px] leading-snug text-[var(--danger)]">
                                      {documentStageDetail(f)}
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                              <td className="mt-3 inline-block pr-3 sm:mt-0 sm:table-cell sm:px-4 sm:py-3">
                                {isHandwrittenOCR(f) && String(f.status || "").toUpperCase() === "OCR_NEEDS_REVIEW" ? (
                                  <button
                                    type="button"
                                    className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[var(--primary-soft)] px-3 text-[12.5px] font-semibold text-[var(--primary)] transition hover:brightness-105"
                                    onClick={() => openOcrReview(f)}
                                  >
                                    Review OCR
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canOpenDocumentInWorkspace(f)}
                                    className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
                                    onClick={() => openDocumentInWorkspace(f)}
                                  >
                                    Open
                                  </button>
                                )}
                              </td>
                              <td className="mt-3 inline-block align-middle sm:mt-0 sm:table-cell sm:px-4 sm:py-3 sm:text-right">
                                <KebabMenu
                                  portal
                                  items={[
                                    { label: "Details", onClick: () => setDetailsFile(f) },
                                    { label: "Open in new tab", onClick: () => openDocument(f) },
                                    { label: "Download", onClick: () => downloadDocument(f) },
                                    { label: "Rename", onClick: () => onRenameFile(f) },
                                    ...(isHandwrittenOCR(f)
                                      ? [{ label: "Review OCR", onClick: () => openOcrReview(f) }]
                                      : []),
                                    { label: "Regenerate flashcards", onClick: () => prepareFlashcardsFromFile(f) },
                                    ...(String(f.status || "").toUpperCase() === "FAILED" ||
                                    (String(f.status || "").toUpperCase() === "OCR_DONE" && (f.chunk_count ?? 0) === 0)
                                      ? [{ label: "Retry processing", onClick: () => onRetryProcessing(f) }]
                                      : []),
                                    { label: "Delete", onClick: () => onDeleteFile(f.id, f.filename) },
                                  ]}
                                />
                              </td>
                            </tr>
                          ))}
                          {(files?.length ?? 0) === 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-8">
                                <button
                                  className="mx-auto flex w-full max-w-md flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-center transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                                  onClick={() => fileInputRef.current?.click()}
                                >
                                  <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--primary-soft)] text-[var(--primary)]">
                                    <Upload className="h-5 w-5" />
                                  </span>
                                  <div className="mt-3 text-[14px] font-semibold text-[var(--text-main)]">
                                    Upload your materials
                                  </div>
                                  <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                                    Drop files here or click to browse.
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                                    {["PDF", "PPTX", "DOCX", "IMAGES"].map((type) => (
                                      <span
                                        key={type}
                                        className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-[var(--text-muted)]"
                                      >
                                        {type}
                                      </span>
                                    ))}
                                  </div>
                                </button>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {documentRows.length > DOCUMENTS_PAGE_SIZE && (
                      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5 text-[12px] text-[var(--text-muted)]">
                        <span>
                          Page {currentDocumentsPage + 1} of {documentsPageCount}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={currentDocumentsPage === 0}
                            onClick={() => setDocumentsPage((page) => Math.max(0, page - 1))}
                            className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={currentDocumentsPage >= documentsPageCount - 1}
                            onClick={() => setDocumentsPage((page) => Math.min(documentsPageCount - 1, page + 1))}
                            className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
                )}
                </div>
              )}


              {activeTab === "flashcards" && (
                <div className="flex min-w-0 flex-col gap-4">
                  {/* Header / overview */}
                  <div className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                          <Sparkles className="h-[18px] w-[18px]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
                            Flashcards
                          </div>
                          <div className="mt-1 text-lg font-semibold text-[var(--text-main)]">
                            Generate and study
                          </div>
                          <div className="mt-1 text-[13px] text-[var(--text-muted)]">
                            Turn selected documents into spaced-repetition cards.
                          </div>
                        </div>
                      </div>
                      <ClassHeaderButtons
                        classId={String(selectedId)}
                        onGenerate={onGenerateFlashcards}
                        canGenerateFlashcards={canGenerateFlashcards && !busyFlow}
                        generateDisabledReason={busyFlow ? "Generating flashcards..." : generateDisabledReason}
                      />
                    </div>

                    {/* Source selection summary chips */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11.5px]">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-semibold text-[var(--text-main)]">
                        <Layers className="h-3.5 w-3.5 text-[var(--primary)]" />
                        {flashcardSourceIds.length} source file(s) selected
                      </span>
                      {generateDisabledReason ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-soft)] px-2.5 py-1 font-semibold text-[var(--warning)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                          {generateDisabledReason}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] px-2.5 py-1 font-semibold text-[var(--success)]">
                          <Check className="h-3 w-3" />
                          {selectedIndexedCount} indexed document(s) ready
                        </span>
                      )}
                    </div>

                    {flashcardGenerationSummary && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] px-3 py-2 text-[13px] font-medium text-[var(--success)]">
                        <Check className="h-4 w-4" />
                        {flashcardGenerationSummary}
                      </div>
                    )}
                  </div>

                  {/* Source material */}
                  <div className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
                          Source material
                        </div>
                        <div className="mt-1 text-[15px] font-semibold text-[var(--text-main)]">
                          Choose what to generate from
                        </div>
                        <div
                          className="mt-0.5 min-w-0 truncate text-[12px] text-[var(--text-muted)]"
                          title={
                            selectedFlashcardFiles.length > 1
                              ? `Generating from ${selectedFlashcardFiles.length} documents`
                              : selectedFlashcardFiles[0]
                                ? `Generating from ${selectedFlashcardFiles[0].filename}`
                                : "No source selected"
                          }
                        >
                          {selectedFlashcardFiles.length > 1
                            ? `Generating from ${selectedFlashcardFiles.length} documents`
                            : selectedFlashcardFiles[0]
                              ? `Generating from ${selectedFlashcardFiles[0].filename}`
                              : "Select one or more documents below"}
                        </div>
                      </div>
                    </div>

                    {(files?.length ?? 0) === 0 ? (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-4 text-sm text-[var(--text-muted)]">
                        <div className="flex items-start gap-2">
                          <Upload className="mt-0.5 h-4 w-4 text-[var(--text-muted-soft)]" />
                          <span>Upload or wait for a document to finish processing before generating flashcards.</span>
                        </div>
                        <Button onClick={() => setActiveTab("documents")}>Go to Documents</Button>
                      </div>
                    ) : (
                      <>
                        {selectedFlashcardFiles.length > 1 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {selectedFlashcardFiles.map((f) => (
                              <span
                                key={f.id}
                                title={f.filename}
                                className="max-w-[220px] truncate rounded-full border border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]"
                              >
                                {f.filename}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-4 grid min-w-0 gap-2">
                          {(files ?? []).map((f) => {
                            const checked = flashcardSourceIds.includes(f.id);
                            const { disabled, label } = flashcardSourceStatus(f);
                            const ext = (f.filename.split(".").pop() || "FILE").toUpperCase();
                            return (
                              <label
                                key={f.id}
                                className={`group flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border px-3.5 py-3 text-[13px] transition ${
                                  checked
                                    ? "border-[color-mix(in_srgb,var(--primary)_38%,var(--border))] bg-[var(--primary-soft)]"
                                    : "border-[var(--border)] bg-[var(--surface)]"
                                } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    setFlashcardSourceIds((prev) => {
                                      if (e.target.checked) return [...prev, f.id];
                                      return prev.filter((id) => id !== f.id);
                                    });
                                  }}
                                  className="h-4 w-4 shrink-0 rounded border-[var(--border-strong)] text-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                                />
                                <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-2 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                                  {ext}
                                </span>
                                <span
                                  title={f.filename}
                                  className={`min-w-0 flex-1 truncate font-medium ${disabled ? "text-[var(--text-muted)]" : "text-[var(--text-main)]"}`}
                                >
                                  {f.filename}
                                </span>
                                <span
                                  className={`shrink-0 ${
                                    disabled
                                      ? "pill pill-warning"
                                      : label.toLowerCase().includes("ready")
                                        ? "pill pill-success"
                                        : "pill pill-neutral"
                                  }`}
                                >
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ background: "currentColor" }}
                                  />
                                  {label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {!canGenerateFlashcards && generateDisabledReason && (
                          <div className="mt-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-soft)] px-3 py-2 text-[12px] font-medium text-[var(--warning)]">
                            {generateDisabledReason}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* What to study next */}
                  <div className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--accent-pink)_14%,transparent)] text-[var(--accent-pink)]">
                          <Lightbulb className="h-[17px] w-[17px]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
                            What to study next
                          </div>
                          <div className="mt-1 text-[15px] font-semibold text-[var(--text-main)]">
                            Recommended revision
                          </div>
                          <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                            Based on your recent progress and weak topics.
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => selectedId && navigate(`/classes/${selectedId}/flashcards/study`)}
                        className="gap-1.5"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Start review
                      </Button>
                    </div>

                    {recommendationsLoading ? (
                      <div className="mt-4 text-[12.5px] text-[var(--text-muted)]">Loading recommendations...</div>
                    ) : recommendations.length === 0 ? (
                      <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-5 text-center text-[12.5px] text-[var(--text-muted)]">
                        Review flashcards or complete a quiz to unlock adaptive recommendations.
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-2.5">
                        {recommendations.slice(0, 3).map((rec) => (
                          <div
                            key={rec.topic}
                            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-[14px] font-semibold text-[var(--text-main)]">
                                  {rec.topic}
                                </div>
                                <div className="mt-1 text-[12px] leading-5 text-[var(--text-muted)]">{rec.reason}</div>
                              </div>
                              <span
                                className={`shrink-0 ${
                                  rec.mastery_score >= 70
                                    ? "pill pill-success"
                                    : rec.mastery_score >= 40
                                      ? "pill pill-info"
                                      : "pill pill-warning"
                                }`}
                              >
                                <Target className="h-3 w-3" />
                                {rec.status} &middot; {rec.mastery_score}%
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() =>
                                  selectedId &&
                                  navigate(`/classes/${selectedId}/flashcards/study?topic=${encodeURIComponent(rec.topic)}`)
                                }
                                className="gap-1"
                              >
                                Review flashcards
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  selectedId &&
                                  navigate(`/quizzes?class_id=${selectedId}&topic=${encodeURIComponent(rec.topic)}`)
                                }
                              >
                                Practice quiz
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setStudyInput(`Help me revise ${rec.topic}. Focus on my weak points and give me a short practice plan.`);
                                  setStudyAssistantOpen(true);
                                }}
                              >
                                Ask Study Assistant
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Needs attention */}
                  <div className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted-soft)]">
                        Needs attention
                      </div>
                    </div>
                    <div className="mt-1 text-[14px] font-semibold text-[var(--text-main)]">
                      Cards you're struggling with
                    </div>
                    {weakCardsLoading ? (
                      <div className="mt-3 text-[12.5px] text-[var(--text-muted)]">Loading weak cards...</div>
                    ) : weakCards.length === 0 ? (
                      <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[12.5px] text-[var(--text-muted)]">
                        No weak cards yet. Keep studying!
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-2">
                        {weakCards.map((c) => (
                          <div
                            key={c.card_id}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
                          >
                            <div className="line-clamp-2 text-[13px] font-semibold text-[var(--text-main)]">
                              {c.question}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                              <span>Struggle <span className="font-semibold text-[var(--warning)]">{Math.round(c.struggle_rate * 100)}%</span></span>
                              <span>Avg {Math.round(c.avg_response_time)}ms</span>
                              <span>Score {c.weakness_score.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>

              {detailsFile && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 sm:items-center"
                  onClick={() => setDetailsFile(null)}
                >
                  <div
                    className="w-full max-w-sm rounded-2xl surface p-5 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-main">{detailsFile.filename}</div>
                        <div className="mt-1">
                          <StatusPill file={detailsFile} />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg p-1 text-muted hover:bg-[var(--surface-2)]"
                        onClick={() => setDetailsFile(null)}
                        aria-label="Close details"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted">Type</dt>
                        <dd className="font-medium text-main">{(detailsFile.filename.split(".").pop() || "File").toUpperCase()}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted">Size</dt>
                        <dd className="font-medium text-main">{prettyBytes(detailsFile.size_bytes)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted">Uploaded</dt>
                        <dd className="text-right font-medium text-main">{timeLocal(detailsFile.uploaded_at)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted">Status</dt>
                        <dd className="font-medium text-main">{documentWorkflowLabel(detailsFile)}</dd>
                      </div>
                      {detailsFile.last_error && (
                        <div>
                          <dt className="text-muted">Processing note</dt>
                          <dd className="mt-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {detailsFile.last_error}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <button className="rounded-lg border border-token px-3 py-2 text-sm font-semibold" onClick={() => openDocumentInWorkspace(detailsFile)}>
                        Open
                      </button>
                      <button className="rounded-lg border border-token px-3 py-2 text-sm font-semibold" onClick={() => downloadDocument(detailsFile)}>
                        Download
                      </button>
                      <button className="rounded-lg border border-token px-3 py-2 text-sm font-semibold" onClick={() => onRenameFile(detailsFile)}>
                        Rename
                      </button>
                      {String(detailsFile.status || "").toUpperCase() === "FAILED" ? (
                        <button className="rounded-lg border border-token px-3 py-2 text-sm font-semibold" onClick={() => onRetryProcessing(detailsFile)}>
                          Retry
                        </button>
                      ) : (
                        <button className="rounded-lg border border-token px-3 py-2 text-sm font-semibold" onClick={() => prepareFlashcardsFromFile(detailsFile)}>
                          Flashcards
                        </button>
                      )}
                      <button className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" onClick={() => onDeleteFile(detailsFile.id, detailsFile.filename)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {ocrReviewOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-3 sm:items-center"
                  onClick={() => !ocrBusy && setOcrReviewOpen(false)}
                >
                  <div
                    className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl surface shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-token px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">OCR review</div>
                        <div className="truncate text-base font-semibold text-main">{ocrReviewFile?.filename || "Handwritten notes"}</div>
                        <div className="mt-1 text-xs text-muted">
                          Review and correct extracted text before generating flashcards or quizzes.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg p-1 text-muted hover:bg-[var(--surface-2)]"
                        onClick={() => setOcrReviewOpen(false)}
                        disabled={ocrBusy}
                        aria-label="Close OCR review"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-4">
                      {ocrBusy && !ocrReview ? (
                        <div className="rounded-xl border border-token surface-2 px-4 py-8 text-center text-sm text-muted">
                          Loading OCR review...
                        </div>
                      ) : !ocrReview?.pages?.length ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                          OCR is still processing. Check back when the document status changes to Needs review.
                        </div>
                      ) : (
                        <div className="grid gap-4">
                          {ocrReview.pages.map((page) => {
                            const low = page.confidence < 0.68 || page.warnings?.includes("low_confidence");
                            const math = page.warnings?.includes("possible_math_detected");
                            return (
                              <section key={page.page_number} className="rounded-xl border border-token surface p-3">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-main">Page {page.page_number}</div>
                                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                                    <span className={`rounded-full border px-2 py-0.5 ${low ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                                      {Math.round((page.confidence || 0) * 100)}% confidence
                                    </span>
                                    {math && (
                                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-700">
                                        Math review needed
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
                                  <div className="min-h-[180px] overflow-hidden rounded-lg border border-token bg-[var(--surface-2)]">
                                    {page.image_url ? (
                                      <img
                                        src={`${apiServerOrigin()}${page.image_url}`}
                                        alt={`OCR source page ${page.page_number}`}
                                        className="h-full max-h-[360px] w-full object-contain"
                                      />
                                    ) : (
                                      <div className="flex h-full items-center justify-center px-4 py-10 text-center text-xs text-muted">
                                        Original page preview unavailable.
                                      </div>
                                    )}
                                  </div>
                                  <textarea
                                    value={ocrDraftPages[page.page_number] ?? ""}
                                    onChange={(e) =>
                                      setOcrDraftPages((prev) => ({ ...prev, [page.page_number]: e.target.value }))
                                    }
                                    className="min-h-[240px] w-full resize-y rounded-lg border border-token surface px-3 py-3 text-sm leading-6 text-main outline-none focus:border-[var(--primary)]"
                                    spellCheck
                                  />
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-token px-4 py-3">
                      <button
                        type="button"
                        className="rounded-lg border border-token px-3 py-2 text-sm font-semibold text-main"
                        onClick={rerunOcr}
                        disabled={ocrBusy}
                      >
                        Re-run OCR
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-token px-3 py-2 text-sm font-semibold text-main"
                          onClick={saveOcrReview}
                          disabled={ocrBusy || !ocrReview?.pages?.length}
                        >
                          Save cleaned text
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-token px-3 py-2 text-sm font-semibold text-main"
                          onClick={generateOcrFlashcards}
                          disabled={ocrBusy || !ocrReviewFile || !isReadyStatus(ocrReviewFile.status)}
                        >
                          Generate flashcards
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white"
                          onClick={generateOcrQuiz}
                          disabled={ocrBusy || !ocrReviewFile || !isReadyStatus(ocrReviewFile.status)}
                        >
                          Generate quiz
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {preview && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-50 flex items-end bg-overlay"
                  onClick={() => setPreview(null)}
                >
                  <div
                    className="mx-auto mb-6 max-h-[80vh] w-[min(920px,96vw)] overflow-hidden rounded-2xl surface shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-token px-4 py-3">
                      <strong>Chunk previews</strong>
                      <button className="rounded-lg border border-token px-2 py-1 text-xs" onClick={() => setPreview(null)}>
                        Close
                      </button>
                    </div>
                    <div className="max-h-[calc(80vh-56px)] overflow-auto p-4">
                      {preview.map((p) => (
                        <div key={p.file_id} className="mb-6">
                          <div className="mb-2 text-sm font-semibold">
                            File {p.file_id} - {p.total_chunks} chunk(s)
                          </div>
                          {p.total_chunks === 0 ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              No text extracted.
                            </div>
                          ) : (
                            <div className="grid gap-3">
                              {p.previews.map((pr) => (
                                <div key={pr.idx} className="rounded-xl border border-token p-3">
                                  <div className="mb-1 text-xs font-semibold text-muted">
                                    Chunk #{pr.idx} {pr.page_start ? `(pages ${pr.page_start}-${pr.page_end})` : ""}
                                    <span className="ml-2 font-normal text-muted">{pr.char_len} chars</span>
                                  </div>
                                  <pre className="m-0 whitespace-pre-wrap text-xs leading-5 text-muted">
                                    {pr.sample}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </>
          )}
          </div>
        </section>
      </div>
    </div>

      {/* Selection context menu from PDF */}
      {selectionMenu && (
        <div
          className="pointer-events-auto fixed z-50"
          style={{ left: selectionMenu.x, top: selectionMenu.y, transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-elevated)]">
            {[
              { label: "Ask", prompt: "Explain this part." },
              { label: "Explain", prompt: "Explain this clearly." },
              { label: "Summarize", prompt: "Summarize this section." },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text-main)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                onClick={() => {
                  setStudySelectedQuote({
                    text: selectionMenu.text,
                    fileId: selectionMenu.fileId,
                    pageNumber: selectionMenu.page,
                  });
                  setStudyAssistantOpen(true);
                  setStudyInput(action.prompt);
                  setSelectionMenu(null);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-main">New class</div>
            <input
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Class name"
              className="mt-4 h-10 w-full rounded-lg border border-token px-3 text-sm"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!newClassName.trim()) return;
                  handleCreate(newClassName.trim());
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Classes() {
  return (
    <AppShell
      title="Classes"
      contentGapClassName="gap-3"
      contentOverflowClassName="overflow-hidden"
      contentHeightClassName="h-full"
      mainClassName="min-h-0 overflow-hidden"
    >
      <ClassesContent />
    </AppShell>
  );
}
