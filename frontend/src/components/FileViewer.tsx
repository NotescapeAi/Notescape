import React from "react";

export default function FileViewer({
  url,
  name,
  mime,
  onClose,
}: {
  url: string;
  name: string;
  mime?: string | null;
  onClose: () => void;
}) {
  const isPDF =
    (mime && mime.includes("pdf")) ||
    name.toLowerCase().endsWith(".pdf");

  const cannotPreview = !isPDF;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16,24,40,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(1200px, 96vw)",
          height: "90vh",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(16,24,40,.35)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid #EEF2F6",
            background: "#FAFAFB",
          }}
        >
          <div
            title={name}
            style={{
              fontWeight: 700,
              color: "#101828",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "70%",
            }}
          >
            {name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none", color: "var(--primary)", fontWeight: 600 }}
              title="Open in new tab"
            >
              Open
            </a>
            <a
              href={url}
              download
              style={{ textDecoration: "none", color: "var(--primary)", fontWeight: 600 }}
              title="Download"
            >
              Download
            </a>
            <button
              onClick={onClose}
              style={{
                border: "1px solid #E4E7EC",
                background: "#fff",
                borderRadius: 10,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ flex: 1, background: "#00000008" }}>
          {cannotPreview ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#475467",
                padding: 24,
                textAlign: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  Preview not available
                </div>
                <div style={{ fontSize: 14 }}>
                  This file type cannot be previewed here. You can open it in a new tab or download it.
                </div>
              </div>
            </div>
          ) : (
            <iframe
              title={name}
              src={`${url}#toolbar=0&navpanes=0&view=FitH`}
              style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
