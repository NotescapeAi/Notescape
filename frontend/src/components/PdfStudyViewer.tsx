import { useEffect, useMemo, useRef, useState } from "react";
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
  onTextSelect?: (selection: PdfSelection) => void;
  onSnip?: (snip: PdfSnip) => void;
  onSnipError?: (message: string) => void;
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

export default function PdfStudyViewer({ fileUrl, fileName, onTextSelect, onSnip, onSnipError }: Props) {
  const [numPages, setNumPages] = useState(1);
  const [pageNumber, setPageNumber] = useState(1);
  const [snipMode, setSnipMode] = useState(false);
  const [useIframe, setUseIframe] = useState(false);
  const [snipRect, setSnipRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pageWidth, setPageWidth] = useState(820);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPageNumber(1);
    setUseIframe(false);
  }, [fileUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setPageWidth(Math.min(820, width - 24));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageLabel = useMemo(() => `${pageNumber} / ${numPages}`, [pageNumber, numPages]);

  function handleSelection() {
    if (!onTextSelect || snipMode) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    onTextSelect({ text, rect, page: pageNumber });
  }

  function beginSnip(e: React.MouseEvent<HTMLDivElement>) {
    if (!snipMode) return;
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = Math.max(e.clientX - bounds.left, 0);
    const y = Math.max(e.clientY - bounds.top, 0);
    setDragStart({ x, y });
    setSnipRect({ left: x, top: y, width: 0, height: 0 });
    console.log("snip:start", { x, y });
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
    console.log("snip:drag", { left, top, width, height });
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
    console.log("snip:end", { sx, sy, sw, sh });
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
      console.log("snip:img", { width: out.width, height: out.height });
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-token surface px-4 py-2 text-xs text-muted">
        <div className="font-semibold">{fileName}</div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-token px-2 py-1"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
          >
            Prev
          </button>
          <span>{pageLabel}</span>
          <button
            className="rounded-lg border border-token px-2 py-1"
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
          >
            Next
          </button>
          <button
            className={`rounded-lg border px-2 py-1 ${
              snipMode ? "border-strong bg-inverse text-inverse" : "border-token"
            } ${useIframe ? "cursor-not-allowed opacity-60" : ""}`}
            onClick={() => {
              if (useIframe) {
                onSnipError?.("Snip isn't available in fallback mode. Reload the PDF.");
                return;
              }
              setSnipMode((v) => !v);
              setSnipRect(null);
              setDragStart(null);
            }}
            disabled={useIframe}
          >
            {snipMode ? "Cancel snip" : "Snip"}
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-auto ${snipMode ? "cursor-crosshair select-none" : ""}`}
        onMouseUp={handleSelection}
      >
        <div
          ref={pageRef}
          className="relative flex justify-center py-6"
          onMouseDown={beginSnip}
          onMouseMove={moveSnip}
          onMouseUp={endSnip}
        >
          {useIframe ? (
            <iframe
              title={fileName}
              src={`${fileUrl}#toolbar=1&navpanes=0&view=FitH`}
              className="h-[70vh] w-full rounded-lg border border-token surface"
            />
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={(data) => setNumPages(data.numPages)}
              onLoadError={() => setUseIframe(true)}
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
