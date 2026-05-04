/*
 * StepVisuals — three premium, code-built illustrations for the
 * "How it works" walkthrough on the landing page. Each visual is a
 * stylised mock of the actual feature, replacing the previous generic
 * SVG / clipart-style images.
 *
 *   - StepUploadVisual   — drag-and-drop card with three uploaded files
 *   - StepChatVisual     — chat thread grounded in a PDF, with citation
 *   - StepPracticeVisual — flashcard + quiz + progress bars
 */

import { CheckCircle2, FileText, Layers, ListChecks, MessageCircle, Sparkles } from "lucide-react";

/* ───────── Step 1 — Upload ───────────────────────────────────────── */
export function StepUploadVisual() {
  return (
    <div className="step-visual step-visual--upload" aria-hidden>
      <div className="step-vis__halo" />

      <div className="step-vis__card step-vis__upload-zone">
        <div className="step-vis__upload-icon">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="step-vis__upload-title">Drop files here</div>
        <div className="step-vis__upload-sub">PDF · PPTX · Notes</div>
      </div>

      <div className="step-vis__file step-vis__file--a">
        <div className="step-vis__file-icon"><FileText className="w-3.5 h-3.5" /></div>
        <div className="step-vis__file-meta">
          <span className="step-vis__file-name">DBMS_chapter_4.pdf</span>
          <span className="step-vis__file-status">
            <CheckCircle2 className="w-3 h-3" />
            Indexed
          </span>
        </div>
      </div>

      <div className="step-vis__file step-vis__file--b">
        <div className="step-vis__file-icon step-vis__file-icon--pink"><FileText className="w-3.5 h-3.5" /></div>
        <div className="step-vis__file-meta">
          <span className="step-vis__file-name">Lecture_notes.docx</span>
          <span className="step-vis__file-status step-vis__file-status--processing">
            <span className="step-vis__file-spinner" />
            Indexing
          </span>
        </div>
      </div>

      <div className="step-vis__file step-vis__file--c">
        <div className="step-vis__file-icon step-vis__file-icon--mint"><FileText className="w-3.5 h-3.5" /></div>
        <div className="step-vis__file-meta">
          <span className="step-vis__file-name">Slides_week_07.pptx</span>
          <span className="step-vis__file-status">
            <CheckCircle2 className="w-3 h-3" />
            Indexed
          </span>
        </div>
      </div>
    </div>
  );
}

/* ───────── Step 2 — Ask your notes ───────────────────────────────── */
export function StepChatVisual() {
  return (
    <div className="step-visual step-visual--chat" aria-hidden>
      <div className="step-vis__halo step-vis__halo--pink" />

      <div className="step-vis__card step-vis__chat-card">
        <div className="step-vis__chat-head">
          <span className="step-vis__chat-icon">
            <MessageCircle className="w-3.5 h-3.5" />
          </span>
          <span className="step-vis__chat-title">Ask your notes</span>
          <span className="step-vis__chat-pill">PDF</span>
        </div>

        <div className="step-vis__bubble step-vis__bubble--user">
          Explain how 3rd normal form differs from BCNF.
        </div>

        <div className="step-vis__bubble step-vis__bubble--ai">
          <span className="step-vis__bubble-line step-vis__bubble-line--full" />
          <span className="step-vis__bubble-line step-vis__bubble-line--mid" />
          <span className="step-vis__bubble-line step-vis__bubble-line--full" />
          <div className="step-vis__cite">
            <FileText className="w-2.5 h-2.5" />
            DBMS_chapter_4.pdf · p.18
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Step 3 — Practice ─────────────────────────────────────── */
export function StepPracticeVisual() {
  return (
    <div className="step-visual step-visual--practice" aria-hidden>
      <div className="step-vis__halo" />

      {/* Flashcard */}
      <div className="step-vis__flash">
        <div className="step-vis__flash-head">
          <span className="step-vis__chip step-vis__chip--purple">
            <Layers className="w-3 h-3" />
            Flashcard
          </span>
          <span className="step-vis__flash-count">4 / 12</span>
        </div>
        <div className="step-vis__flash-q">What does BCNF eliminate?</div>
        <div className="step-vis__flash-cta">Tap to reveal</div>
      </div>

      {/* Quiz progress */}
      <div className="step-vis__quiz">
        <div className="step-vis__quiz-head">
          <span className="step-vis__chip step-vis__chip--mint">
            <ListChecks className="w-3 h-3" />
            Quiz
          </span>
          <span className="step-vis__quiz-score">8 / 10</span>
        </div>
        <div className="step-vis__quiz-bar">
          <span style={{ width: "80%" }} />
        </div>
        <div className="step-vis__quiz-meta">Topic mastery growing</div>
      </div>

      {/* Mastery progress */}
      <div className="step-vis__mastery">
        <div className="step-vis__mastery-label">Mastery</div>
        <div className="step-vis__mastery-bar">
          <span style={{ width: "72%" }} />
        </div>
        <div className="step-vis__mastery-pct">72%</div>
      </div>
    </div>
  );
}
