import {
  Upload,
  Bot,
  BookOpenCheck,
  Search,
  Mic,
  LineChart,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  FileText,
  ClipboardList,
  Layers,
} from "lucide-react";

import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import AnimatedSection, { AnimatedItem } from "../components/AnimatedSection";
import HeroDashboardMock from "../components/landing/HeroDashboardMock";
import {
  StepUploadVisual,
  StepChatVisual,
  StepPracticeVisual,
} from "../components/landing/StepVisuals";
import Spotlight from "../components/landing/Spotlight";
import "../components/landing/landingMockups.css";
import "./landing.css";

const featureCards = [
  {
    title: "Upload anything",
    description: "Drop in PDFs, slides, or scanned handwritten notes. We read it all and keep your formatting.",
    icon: Upload,
    color: "purple",
  },
  {
    title: "Ask your notes",
    description: "Chat with your own materials. Get answers grounded in the exact pages you uploaded.",
    icon: Bot,
    color: "blue",
  },
  {
    title: "Smart flashcards",
    description: "Auto-generated cards with spaced repetition — review the right thing at the right time.",
    icon: BookOpenCheck,
    color: "pink",
  },
  {
    title: "Find anything fast",
    description: "Search by meaning, not keywords. Surface the concept you need across every class.",
    icon: Search,
    color: "indigo",
  },
  {
    title: "Voice revision",
    description: "Practice out loud, hands-free. Get scored feedback on what you actually said.",
    icon: Mic,
    color: "violet",
  },
  {
    title: "Track your progress",
    description: "See where you're strong, where you slip, and what to study next — at a glance.",
    icon: LineChart,
    color: "lavender",
  },
];

export default function LandingPage() {
  return (
    <MarketingLayout className="landing-root">
      {/* Hero Section */}
      <section id="hero" className="landing-hero">
        {/* Layered atmospheric background — soft aurora, no harsh colour */}
        <div className="hero-aurora hero-aurora--a" aria-hidden />
        <div className="hero-aurora hero-aurora--b" aria-hidden />
        <div className="hero-aurora hero-aurora--c" aria-hidden />
        <div className="hero-grid" aria-hidden />
        <div className="hero-glow" aria-hidden />

        <div className="container hero-container">
          <div className="hero-content">
            <AnimatedSection animation="fade-up" amount={0.4}>
              <div className="hero-badge">
                <span className="hero-badge__pulse" aria-hidden />
                <Sparkles className="w-3.5 h-3.5" />
                <span>The AI study companion for students</span>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="fade-up" delay={0.05} amount={0.4}>
              <h1 className="hero-title">
                Master your studies <br />
                <span className="text-gradient-animated">with intelligence.</span>
              </h1>
            </AnimatedSection>

            <AnimatedSection animation="fade-up" delay={0.12} amount={0.4}>
              <p className="hero-description">
                Upload your notes, ask them questions, and turn every PDF into flashcards,
                quizzes, and voice revision — all in one calm, premium workspace.
              </p>
            </AnimatedSection>

            <AnimatedSection animation="fade-up" delay={0.18} amount={0.4}>
              <div className="hero-actions">
                <Link to="/signup" className="btn-premium press-feedback">
                  Start learning free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="#how" className="btn-outline press-feedback">
                  See how it works
                </a>
              </div>
            </AnimatedSection>
          </div>

          {/* Hero composition — code-built dashboard preview + floating mini-cards */}
          <AnimatedSection animation="scale-in" delay={0.1} amount={0.3} className="hero-visual">
            <div className="hero-stage">
              <div className="hero-stage__halo" aria-hidden />
              <div className="hero-stage__main">
                <HeroDashboardMock />
              </div>

              {/* Floating chat preview — top-left */}
              <div className="hero-card hero-card--chat" aria-hidden>
                <div className="hero-card__head">
                  <span className="hero-card__icon hero-card__icon--primary">
                    <Bot className="w-3.5 h-3.5" />
                  </span>
                  <span className="hero-card__label">Ask your notes</span>
                </div>
                <div className="hero-card__chat-row hero-card__chat-row--user">
                  Summarise chapter 4 in 5 bullets.
                </div>
                <div className="hero-card__chat-row hero-card__chat-row--ai">
                  <span className="hero-card__typing">
                    <span /><span /><span />
                  </span>
                </div>
              </div>

              {/* Floating flashcard — bottom-left */}
              <div className="hero-card hero-card--flash" aria-hidden>
                <div className="hero-card__head">
                  <span className="hero-card__icon hero-card__icon--pink">
                    <Layers className="w-3.5 h-3.5" />
                  </span>
                  <span className="hero-card__label">Flashcard · 4 / 12</span>
                </div>
                <div className="hero-card__question">What is normalisation in databases?</div>
                <div className="hero-card__chip">Tap to reveal</div>
              </div>

              {/* Floating quiz preview — top-right */}
              <div className="hero-card hero-card--quiz" aria-hidden>
                <div className="hero-card__head">
                  <span className="hero-card__icon hero-card__icon--mint">
                    <ClipboardList className="w-3.5 h-3.5" />
                  </span>
                  <span className="hero-card__label">Quiz · 8 / 10 correct</span>
                </div>
                <div className="hero-card__bar">
                  <span style={{ width: "80%" }} />
                </div>
              </div>

              {/* Floating doc — bottom-right */}
              <div className="hero-card hero-card--doc" aria-hidden>
                <div className="hero-card__head">
                  <span className="hero-card__icon hero-card__icon--violet">
                    <FileText className="w-3.5 h-3.5" />
                  </span>
                  <span className="hero-card__label">DBMS_lecture.pdf</span>
                </div>
                <div className="hero-card__lines">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="container">
          <AnimatedSection animation="fade-up" amount={0.4} className="section-header text-center">
            <h2 className="section-title">Built for the modern learner</h2>
            <p className="section-subtitle">Every tool you need to master a course — in one place.</p>
          </AnimatedSection>

          <AnimatedSection
            staggerChildren
            staggerDelay={0.08}
            amount={0.15}
            className="features-grid"
          >
            {featureCards.map((feature, idx) => {
              const Icon = feature.icon;
              const tones = ["purple", "coral", "sky", "mixed", "lilac", "pink"] as const;
              const tone = tones[idx % tones.length];
              return (
                <AnimatedItem as="article" key={feature.title} className="feature-premium-card">
                  <Spotlight tone={tone} className="feature-spot">
                    <div className={`feature-icon-wrapper ${feature.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="feature-card-title">{feature.title}</h3>
                    <p className="feature-card-desc">{feature.description}</p>
                  </Spotlight>
                </AnimatedItem>
              );
            })}
          </AnimatedSection>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how" className="how-section">
        <div className="container">
          <AnimatedSection animation="fade-up" amount={0.4} className="section-header text-center">
            <h2 className="section-title">Your path to mastery</h2>
            <p className="section-subtitle">Three steps to make your study time count.</p>
          </AnimatedSection>

          <div className="how-walkthrough">
            {/* Step 1 */}
            <AnimatedSection animation="slide-left" amount={0.25} className="walkthrough-item">
              <div className="walkthrough-content">
                <div className="step-number">01</div>
                <h3>Bring your study material</h3>
                <p>
                  Upload PDFs, slides, or photos of your handwritten notes.
                  Notescape organises everything by class and pulls out the structure for you.
                </p>
                <ul className="step-features">
                  <li><CheckCircle2 className="w-4 h-4" /> OCR for handwritten notes</li>
                  <li><CheckCircle2 className="w-4 h-4" /> Per-class document library</li>
                </ul>
              </div>
              <div className="walkthrough-visual">
                <StepUploadVisual />
              </div>
            </AnimatedSection>

            {/* Step 2 */}
            <AnimatedSection animation="slide-right" amount={0.25} className="walkthrough-item reverse">
              <div className="walkthrough-content">
                <div className="step-number">02</div>
                <h3>Ask your notes anything</h3>
                <p>
                  Chat with your documents like you'd chat with a tutor. Get summaries,
                  explanations, and instant clarifications — all grounded in your own material.
                </p>
                <ul className="step-features">
                  <li><CheckCircle2 className="w-4 h-4" /> Source-cited answers</li>
                  <li><CheckCircle2 className="w-4 h-4" /> Context-aware Q&A</li>
                </ul>
              </div>
              <div className="walkthrough-visual">
                <StepChatVisual />
              </div>
            </AnimatedSection>

            {/* Step 3 */}
            <AnimatedSection animation="slide-left" amount={0.25} className="walkthrough-item">
              <div className="walkthrough-content">
                <div className="step-number">03</div>
                <h3>Practise until it sticks</h3>
                <p>
                  Turn notes into flashcards and quizzes. Revise hands-free with voice mode,
                  and let smart spacing focus you on the bits you struggle with most.
                </p>
                <ul className="step-features">
                  <li><CheckCircle2 className="w-4 h-4" /> Spaced repetition flashcards</li>
                  <li><CheckCircle2 className="w-4 h-4" /> Voice revision sessions</li>
                </ul>
              </div>
              <div className="walkthrough-visual">
                <StepPracticeVisual />
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
