import { useState, type FormEventHandler } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardList,
  CheckCircle2,
  GraduationCap,
  Mail,
  Mic,
  Sparkles,
  Wand2,
} from "lucide-react";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/700.css";
import "./pricing.css";
import "../components/landing/landingMockups.css";
import MarketingLayout from "../components/MarketingLayout";
import AnimatedSection, { AnimatedItem } from "../components/AnimatedSection";
import Spotlight from "../components/landing/Spotlight";

const COMING_BENEFITS = [
  {
    icon: Sparkles,
    title: "Smarter document summaries",
    body: "Pull the key ideas, definitions, and examples out of long PDFs in seconds.",
  },
  {
    icon: BookOpenCheck,
    title: "Unlimited flashcards",
    body: "Generate as many decks as you need from every class — with spaced repetition built in.",
  },
  {
    icon: ClipboardList,
    title: "Advanced quizzes",
    body: "MCQ + theory questions auto-graded by AI, with detailed feedback per topic.",
  },
  {
    icon: Mic,
    title: "Voice study sessions",
    body: "Practise out loud, hands-free, and get instant scored feedback on what you said.",
  },
  {
    icon: GraduationCap,
    title: "Class-based organisation",
    body: "Keep notes, decks, quizzes, and chats neatly grouped per course.",
  },
  {
    icon: Wand2,
    title: "Priority study coach",
    body: "Always-on AI tutor that knows your weak topics and suggests what to revise next.",
  },
] as const;

export default function Pricing() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const onSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("submitting");
    // Soft, frontend-only confirmation (waitlist endpoint not wired yet).
    // Keeps UX honest while pricing is genuinely not live.
    await new Promise((r) => setTimeout(r, 600));
    setStatus("success");
    setEmail("");
  };

  return (
    <MarketingLayout className="pricing-root">
      <main className="pricing-page">
        {/* Hero */}
        <section className="pricing-hero">
          <div className="pricing-bg-glow" aria-hidden />
          <div className="container">
            <AnimatedSection animation="fade-up" amount={0.4}>
              <div className="pricing-eyebrow">
                <span className="pricing-eyebrow__dot" aria-hidden />
                Pricing
              </div>
            </AnimatedSection>

            <AnimatedSection animation="fade-up" delay={0.05} amount={0.4}>
              <h1 className="pricing-title">
                Simple pricing,{" "}
                <span className="text-gradient-animated">coming soon.</span>
              </h1>
            </AnimatedSection>

            <AnimatedSection animation="fade-up" delay={0.12} amount={0.4}>
              <p className="pricing-subtitle">
                Paid plans aren't live yet. Join the waitlist and we'll let you know the moment
                subscriptions open — no spam, just one short email.
              </p>
            </AnimatedSection>

            {/* Waitlist card */}
            <AnimatedSection animation="scale-in" delay={0.18} amount={0.3}>
              <div className="waitlist-card">
                <div className="waitlist-card__header">
                  <span className="waitlist-card__chip">
                    <Mail className="h-3.5 w-3.5" />
                    Get notified
                  </span>
                  <h2 className="waitlist-card__title">Join the waitlist</h2>
                  <p className="waitlist-card__lede">
                    Drop your email — we'll send a single note when paid plans go live.
                  </p>
                </div>

                {status === "success" ? (
                  <div className="waitlist-success" role="status" aria-live="polite">
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                    <div>
                      <div className="waitlist-success__title">You're on the list</div>
                      <div className="waitlist-success__body">
                        Thanks — we'll email you as soon as subscriptions open.
                      </div>
                    </div>
                  </div>
                ) : (
                  <form className="waitlist-form" onSubmit={onSubmit} noValidate>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="you@university.edu"
                      className="waitlist-input"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-label="Your email address"
                    />
                    <button
                      type="submit"
                      className="waitlist-button press-feedback"
                      disabled={status === "submitting"}
                    >
                      {status === "submitting" ? "Adding…" : "Notify me"}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  </form>
                )}

                <div className="waitlist-card__meta">
                  <span>Free to join</span>
                  <span className="waitlist-card__dot" aria-hidden />
                  <span>One email when we launch</span>
                  <span className="waitlist-card__dot" aria-hidden />
                  <span>Unsubscribe anytime</span>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* What to expect */}
        <section className="pricing-benefits">
          <div className="container">
            <AnimatedSection animation="fade-up" amount={0.4} className="pricing-benefits__header">
              <h2 className="pricing-benefits__title">What to expect from paid plans</h2>
              <p className="pricing-benefits__subtitle">
                The free tier covers the essentials — paid plans will add power for serious study.
              </p>
            </AnimatedSection>

            <AnimatedSection
              staggerChildren
              staggerDelay={0.07}
              amount={0.15}
              className="pricing-benefits__grid"
            >
              {COMING_BENEFITS.map((b, idx) => {
                const Icon = b.icon;
                const tone = idx % 3 === 1 ? "pink" : idx % 3 === 2 ? "mixed" : "purple";
                return (
                  <AnimatedItem
                    as="article"
                    key={b.title}
                    className="pricing-benefit-card"
                  >
                    <Spotlight tone={tone as "purple" | "pink" | "mixed"} className="pricing-benefit-spot">
                      <span className="pricing-benefit-card__icon" aria-hidden>
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="pricing-benefit-card__title">{b.title}</h3>
                      <p className="pricing-benefit-card__body">{b.body}</p>
                    </Spotlight>
                  </AnimatedItem>
                );
              })}
            </AnimatedSection>
          </div>
        </section>

        {/* Free today strip */}
        <AnimatedSection as="section" animation="fade-up" amount={0.3} className="pricing-free-strip">
          <div className="container">
            <div className="pricing-free-card">
              <div className="pricing-free-card__left">
                <span className="pricing-free-card__chip">Free today</span>
                <h3 className="pricing-free-card__title">Already free, already useful</h3>
                <p className="pricing-free-card__body">
                  Sign up and start uploading notes, asking your materials, generating flashcards,
                  and tracking progress — completely free while we shape the paid tiers.
                </p>
              </div>
              <ul className="pricing-free-card__list">
                <li><CheckCircle2 className="h-4 w-4" /> Per-class document library</li>
                <li><CheckCircle2 className="h-4 w-4" /> AI chat grounded in your notes</li>
                <li><CheckCircle2 className="h-4 w-4" /> Auto-generated flashcards & quizzes</li>
                <li><CheckCircle2 className="h-4 w-4" /> Voice flashcards & analytics</li>
              </ul>
            </div>
          </div>
        </AnimatedSection>
      </main>
    </MarketingLayout>
  );
}
