import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Scissors,
  X,
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

export type PdfSelection = {
  text: string;
  rect: DOMRect;
  page: number;
};

export type PdfSnip = {
  data_url: string;
  content_type: string;
  page: number;
  width: number;
  height: number;
  file_id?: string | null;
};

type Props = {
  fileUrl: string;
  fileName: string;
  /** Toolbar label: ``page`` (default) or ``slide`` for converted presentations. */
  pageLabelKind?: "page" | "slide";
  /** When false, hide Snip and Focus (e.g. plain image viewers reusing layout — not used for PDF). */
  showPdfTools?: boolean;
  onTextSelect?: (selection: PdfSelection) => void;
  onContextSelect?: (selection: PdfSelection) => void;
  onSnip?: (snip: PdfSnip) => void;
  onSnipError?: (message: string) => void;
  onToggleFocus?: () => void;
  isFocusMode?: boolean;
  isChatVisible?: boolean;
  onToggleChatVisibility?: () => void;
  /** When set, a failed react-pdf load on a blob URL delegates to the parent (e.g. PPTX converted-PDF fallback UI). */
  onBlobPdfLoadFailed?: () => void;
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function PdfStudyViewer({
  fileUrl,
  fileName,
  pageLabelKind = "page",
  showPdfTools = true,
  onTextSelect,
  onContextSelect,
  onSnip,
  onSnipError,
  onToggleFocus,
  isFocusMode,
  isChatVisible,
  onToggleChatVisibility,
  onBlobPdfLoadFailed,
}: Props) {
  const [numPages, setNumPages] = useState(1);
  const [pageNumber, setPageNumber] = useState(1);
  const [snipMode, setSnipMode] = useState(false);
  const [useIframe, setUseIframe] = useState(false);
  /** When react-pdf fails on a blob URL, do not fall back to iframe (iframe often shows raw JSON error bodies). */
  const [hardPdfFailure, setHardPdfFailure] = useState(false);
  const [snipRect, setSnipRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pageWidth, setPageWidth] = useState(980);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPageNumber(1);
    setUseIframe(false);
    setHardPdfFailure(false);
  }, [fileUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setPageWidth(Math.min(1400, width - 32));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageLabel = useMemo(() => `${pageNumber} / ${numPages}`, [pageNumber, numPages]);
  const pageToolbarPrefix = pageLabelKind === "slide" ? "Slide" : "Page";

  function handleSelection(callback?: (selection: PdfSelection) => void) {
    if (snipMode) return;
    if (!onTextSelect && !callback) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const payload = { text, rect, page: pageNumber };
    onTextSelect?.(payload);
    callback?.(payload);
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    if (snipMode) return;
    e.preventDefault();
    handleSelection(onContextSelect);
  }

  function beginSnip(e: React.MouseEvent<HTMLDivElement>) {
    if (!snipMode) return;
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = Math.max(e.clientX - bounds.left, 0);
    const y = Math.max(e.clientY - bounds.top, 0);
    setDragStart({ x, y });
    setSnipRect({ left: x, top: y, width: 0, height: 0 });
  }

  function moveSnip(e: React.MouseEvent<HTMLDivElement>) {
    if (!snipMode || !dragStart) return;
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = Math.max(e.clientX - bounds.left, 0);
    const y = Math.max(e.clientY - bounds.top, 0);
    const left = Math.min(dragStart.x, x);
    const top = Math.min(dragStart.y, y);
    const width = Math.abs(dragStart.x - x);
    const height = Math.abs(dragStart.y - y);
    setSnipRect({ left, top, width, height });
  }

  function endSnip() {
    if (!snipMode || !dragStart || !snipRect) {
      setDragStart(null);
      return;
    }
    const canvas = pageRef.current?.querySelector("canvas");
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!canvas || !bounds) {
      setDragStart(null);
      onSnipError?.("Couldn't capture that area. Try again.");
      return;
    }
    const displayRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / displayRect.width;
    const scaleY = canvas.height / displayRect.height;
    const sx = (snipRect.left - (displayRect.left - bounds.left)) * scaleX;
    const sy = (snipRect.top - (displayRect.top - bounds.top)) * scaleY;
    const sw = snipRect.width * scaleX;
    const sh = snipRect.height * scaleY;
    if (sw <= 2 || sh <= 2) {
      setDragStart(null);
      setSnipRect(null);
      onSnipError?.("That selection was too small. Try again.");
      return;
    }
    const out = document.createElement("canvas");
    out.width = Math.floor(sw);
    out.height = Math.floor(sh);
    const ctx = out.getContext("2d");
    if (ctx) {
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
      const dataUrl = out.toDataURL("image/png");
      onSnip?.({
        data_url: dataUrl,
        content_type: "image/png",
        page: pageNumber,
        width: out.width,
        height: out.height,
      });
    } else {
      onSnipError?.("Couldn't capture that area. Try again.");
    }
    setSnipMode(false);
    setDragStart(null);
    setSnipRect(null);
  }

  const toolBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40";
  const toolBtnActive =
    "border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[var(--primary-soft)] text-[var(--primary)]";

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
        <button
          className={toolBtn}
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          disabled={pageNumber <= 1}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[96px] text-center text-[12.5px] font-semibold text-[var(--text-main)] tabular-nums">
          {pageToolbarPrefix} {pageLabel}
        </span>
        <button
          className={toolBtn}
          onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          disabled={pageNumber >= numPages}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {(showPdfTools && (onSnip || onToggleFocus || (isFocusMode && onToggleChatVisibility))) ? (
          <span
            aria-hidden
            className="mx-1 hidden h-5 w-px bg-[var(--border)] sm:inline-block"
          />
        ) : null}

        {showPdfTools && !useIframe && onSnip && (
          <button
            className={`inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[12px] font-semibold transition ${
              snipMode
                ? toolBtnActive
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
            }`}
            onClick={() => {
              setSnipMode((v) => !v);
              setSnipRect(null);
              setDragStart(null);
            }}
            aria-label={snipMode ? "Cancel snip" : "Capture snippet"}
            aria-pressed={snipMode}
            title={snipMode ? "Cancel snip" : "Capture snippet"}
          >
            {snipMode ? <X className="h-3.5 w-3.5" /> : <Scissors className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{snipMode ? "Cancel" : "Snip"}</span>
          </button>
        )}
        {showPdfTools && onToggleFocus && (
          <button
            className={`inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[12px] font-semibold transition ${
              isFocusMode
                ? toolBtnActive
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
            }`}
            onClick={onToggleFocus}
            aria-label={isFocusMode ? "Exit focus" : "Focus reader"}
            aria-pressed={isFocusMode}
            title={isFocusMode ? "Exit focus" : "Focus reader"}
          >
            {isFocusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isFocusMode ? "Exit" : "Focus"}</span>
          </button>
        )}
        {showPdfTools && isFocusMode && onToggleChatVisibility && (
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] font-semibold text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]"
            onClick={onToggleChatVisibility}
            aria-label={isChatVisible ? "Hide chat" : "Show chat"}
            title={isChatVisible ? "Hide chat" : "Show chat"}
          >
            {isChatVisible ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isChatVisible ? "Hide chat" : "Show chat"}</span>
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-auto ${snipMode ? "cursor-crosshair select-none" : ""}`}
        onContextMenu={handleContextMenu}
      >
        <div
          ref={pageRef}
          className="relative flex justify-center py-6"
          onMouseDown={beginSnip}
          onMouseMove={moveSnip}
          onMouseUp={endSnip}
        >
          {hardPdfFailure ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="text-sm font-semibold text-main">Preview unavailable</div>
              <p className="max-w-md text-sm text-muted">
                The file could not be loaded as a PDF in this viewer. Try Retry from the document toolbar, download the
                file, or open it in another app.
              </p>
            </div>
          ) : useIframe ? (
            <iframe
              title={fileName}
              src={`${fileUrl}#toolbar=1&navpanes=0&view=FitH`}
              className="h-[82vh] w-full rounded-lg border border-token surface"
            />
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={(data) => setNumPages(data.numPages)}
              onLoadError={() => {
                if (fileUrl.startsWith("blob:")) {
                  setUseIframe(true);
                  return;
                }
                if (onBlobPdfLoadFailed) {
                  onBlobPdfLoadFailed();
                  return;
                } else {
                  setUseIframe(true);
                }
              }}
              loading={<div className="text-xs text-muted">Loading PDF...</div>}
              error={<div className="text-xs text-muted">Could not load this PDF.</div>}
            >
            <Page pageNumber={pageNumber} width={pageWidth} />
          </Document>
          )}
          {snipMode && !useIframe && (
            <div
              ref={overlayRef}
              className="absolute inset-0"
              onMouseDown={beginSnip}
              onMouseMove={moveSnip}
              onMouseUp={endSnip}
            />
          )}
          {snipRect && (
            <div
              className="absolute border-2 border-strong surface-tint"
              style={{
                left: snipRect.left,
                top: snipRect.top,
                width: snipRect.width,
                height: snipRect.height,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
