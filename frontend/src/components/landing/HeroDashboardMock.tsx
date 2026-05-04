/*
 * HeroDashboardMock — fully code-built premium dashboard preview.
 *
 * Replaces the static `/main.png` screenshot with a stylised, theme-aware
 * mock UI that hints at Notescape's actual product (sidebar with classes,
 * dashboard stats, due-card preview, chat snippet, progress bar). It is
 * pure HTML+CSS so it stays sharp at any DPR and is fast to load.
 */

import { Bot, FileText, GraduationCap, Layers, MessageCircle, Mic, Search, Sparkles } from "lucide-react";

export default function HeroDashboardMock() {
  return (
    <div className="hero-dash" role="img" aria-label="Notescape dashboard preview">
      {/* Window chrome — adds the 'real product' feel */}
      <div className="hero-dash__chrome">
        <span className="hero-dash__dot hero-dash__dot--r" />
        <span className="hero-dash__dot hero-dash__dot--y" />
        <span className="hero-dash__dot hero-dash__dot--g" />
        <span className="hero-dash__url">notescape.app/dashboard</span>
        <span className="hero-dash__chrome-icon">
          <Search className="w-3 h-3" />
        </span>
      </div>

      <div className="hero-dash__body">
        {/* Sidebar with class items */}
        <aside className="hero-dash__sidebar">
          <div className="hero-dash__brand">
            <span className="hero-dash__brand-dot" />
            <span className="hero-dash__brand-text">Notescape</span>
          </div>

          <div className="hero-dash__sidebar-label">Workspace</div>
          <ul className="hero-dash__nav">
            <li className="hero-dash__nav-item is-active">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </li>
            <li className="hero-dash__nav-item">
              <FileText className="w-3.5 h-3.5" />
              <span>Classes</span>
            </li>
            <li className="hero-dash__nav-item">
              <Layers className="w-3.5 h-3.5" />
              <span>Flashcards</span>
            </li>
            <li className="hero-dash__nav-item">
              <Bot className="w-3.5 h-3.5" />
              <span>Ask materials</span>
            </li>
            <li className="hero-dash__nav-item">
              <Mic className="w-3.5 h-3.5" />
              <span>Voice revision</span>
            </li>
          </ul>
        </aside>

        {/* Main content */}
        <section className="hero-dash__main">
          {/* Top stat row */}
          <div className="hero-dash__stat-row">
            <div className="hero-dash__stat">
              <div className="hero-dash__stat-icon hero-dash__stat-icon--primary">
                <GraduationCap className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="hero-dash__stat-label">Classes</div>
                <div className="hero-dash__stat-value">4</div>
              </div>
            </div>
            <div className="hero-dash__stat">
              <div className="hero-dash__stat-icon hero-dash__stat-icon--pink">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="hero-dash__stat-label">Due today</div>
                <div className="hero-dash__stat-value">12</div>
              </div>
            </div>
            <div className="hero-dash__stat">
              <div className="hero-dash__stat-icon hero-dash__stat-icon--mint">
                <span className="hero-dash__stat-pct">87%</span>
              </div>
              <div>
                <div className="hero-dash__stat-label">Mastery</div>
                <div className="hero-dash__stat-bar">
                  <span style={{ width: "87%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Best-next-step card */}
          <div className="hero-dash__cta">
            <div className="hero-dash__cta-eyebrow">
              <span className="hero-dash__cta-dot" />
              Best next step
            </div>
            <div className="hero-dash__cta-title">Review 12 cards from Database Systems</div>
            <div className="hero-dash__cta-bar">
              <span style={{ width: "62%" }} />
            </div>
          </div>

          {/* Chat preview */}
          <div className="hero-dash__chat">
            <div className="hero-dash__chat-head">
              <span className="hero-dash__chat-icon">
                <MessageCircle className="w-3 h-3" />
              </span>
              <span className="hero-dash__chat-label">Ask your notes</span>
            </div>
            <div className="hero-dash__chat-bubble hero-dash__chat-bubble--user">
              Summarise normalisation in databases.
            </div>
            <div className="hero-dash__chat-bubble hero-dash__chat-bubble--ai">
              <span className="hero-dash__chat-typing">
                <span /><span /><span />
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
