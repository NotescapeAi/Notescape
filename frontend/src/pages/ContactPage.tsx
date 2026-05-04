import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  LifeBuoy,
  MessageCircle,
  Rocket,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import MarketingLayout from "../components/MarketingLayout";
import AnimatedSection, { AnimatedItem } from "../components/AnimatedSection";
import Spotlight from "../components/landing/Spotlight";
import { postContact } from "../lib/api";
import "./contactPage.css";
import "../components/landing/landingMockups.css";

type ContactTopic = "general" | "bug" | "feature";

type TopicMeta = {
  id: ContactTopic;
  label: string;
  icon: LucideIcon;
  hint: string;
};

const TOPICS: TopicMeta[] = [
  {
    id: "general",
    label: "General help",
    icon: MessageCircle,
    hint: "Account, billing, or anything else.",
  },
  {
    id: "bug",
    label: "Report a problem",
    icon: Bug,
    hint: "Something not working as expected.",
  },
  {
    id: "feature",
    label: "Feature request",
    icon: Lightbulb,
    hint: "An idea that would make Notescape better.",
  },
];

const FAQS = [
  {
    q: "How do I add my study material?",
    a: "Open a class and click Upload — Notescape accepts PDFs, slides, and even photos of handwritten notes. Once it's processed, you can chat with it, generate flashcards, and quiz yourself.",
  },
  {
    q: "Is Notescape free to use?",
    a: "Yes. The whole app is free while we shape the paid plans. You can use classes, AI chat, flashcards, quizzes, voice flashcards, and analytics at no cost — just sign up and start.",
  },
  {
    q: "Where do flashcards come from?",
    a: "We generate them automatically from the documents you upload. You can also create cards manually, edit them, bookmark important ones, and review with spaced repetition.",
  },
  {
    q: "How does the AI chat work?",
    a: "Chat is grounded in the documents you upload. Ask anything about your notes — answers cite the exact pages so you always know where the information came from.",
  },
  {
    q: "Can I use Notescape for handwritten notes?",
    a: "Yes. Upload photos or scans and we'll run OCR to extract the text. You can review and edit before turning the notes into flashcards or a quiz.",
  },
  {
    q: "Will my notes stay private?",
    a: "Your uploads are tied to your account. We don't share your study material with anyone, and you can delete files or your whole account whenever you want from Settings.",
  },
];

const QUICK_LINKS = [
  {
    icon: Rocket,
    title: "Getting started",
    body: "Create your first class, upload notes, and explore the basics.",
  },
  {
    icon: Sparkles,
    title: "Best practices",
    body: "Tips to get the most out of flashcards, quizzes, and voice mode.",
  },
  {
    icon: AlertTriangle,
    title: "Known issues",
    body: "What we're aware of and currently fixing.",
  },
] as const;

export default function ContactPage() {
  const [topic, setTopic] = useState<ContactTopic>("general");
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? "General";
      await postContact({
        ...formData,
        message: `[${topicLabel}]\n\n${formData.message}`,
      });
      setStatus("success");
      setFormData({ name: "", email: "", message: "" });
    } catch (error) {
      console.error("Contact error:", error);
      setStatus("error");
    }
  };

  return (
    <MarketingLayout className="support-root">
      <main className="support-page">
        {/* Hero */}
        <section className="support-hero">
          <div className="support-bg-glow" aria-hidden />
          <div className="container">
            <AnimatedSection animation="fade-up" amount={0.4}>
              <div className="support-eyebrow">
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
                <span>Support</span>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="fade-up" delay={0.05} amount={0.4}>
              <h1 className="support-title">
                How can we{" "}
                <span className="text-gradient-animated">help?</span>
              </h1>
            </AnimatedSection>

            <AnimatedSection animation="fade-up" delay={0.12} amount={0.4}>
              <p className="support-subtitle">
                Most answers live in our FAQs below. If you still need a hand, drop us a note —
                a real person reads every message.
              </p>
            </AnimatedSection>
          </div>
        </section>

        {/* Quick links */}
        <section className="support-quicklinks">
          <div className="container">
            <AnimatedSection
              staggerChildren
              staggerDelay={0.07}
              amount={0.2}
              className="support-quicklinks__grid"
            >
              {QUICK_LINKS.map((q, idx) => {
                const Icon = q.icon;
                const tone = idx % 3 === 1 ? "pink" : idx % 3 === 2 ? "mixed" : "purple";
                return (
                  <AnimatedItem
                    as="article"
                    key={q.title}
                    className="support-quicklink"
                  >
                    <Spotlight tone={tone as "purple" | "pink" | "mixed"} className="support-quicklink-spot">
                      <span className="support-quicklink__icon" aria-hidden>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="support-quicklink__title">{q.title}</h3>
                        <p className="support-quicklink__body">{q.body}</p>
                      </div>
                    </Spotlight>
                  </AnimatedItem>
                );
              })}
            </AnimatedSection>
          </div>
        </section>

        {/* FAQ */}
        <section className="support-faq" id="faq">
          <div className="container">
            <AnimatedSection animation="fade-up" amount={0.3} className="support-section-header">
              <h2 className="support-section-title">Common questions</h2>
              <p className="support-section-subtitle">A quick look at what students ask the most.</p>
            </AnimatedSection>

            <AnimatedSection
              staggerChildren
              staggerDelay={0.06}
              amount={0.1}
              className="support-faq__list"
            >
              {FAQS.map((item, idx) => {
                const open = openFaq === idx;
                return (
                  <AnimatedItem
                    key={item.q}
                    className={`support-faq__item ${open ? "is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className="support-faq__trigger"
                      onClick={() => setOpenFaq(open ? null : idx)}
                      aria-expanded={open}
                    >
                      <span className="support-faq__question">{item.q}</span>
                      <ChevronDown
                        className={`support-faq__chev ${open ? "is-rotated" : ""}`}
                        aria-hidden
                      />
                    </button>
                    <div
                      className="support-faq__panel"
                      role="region"
                      aria-hidden={!open}
                    >
                      <p>{item.a}</p>
                    </div>
                  </AnimatedItem>
                );
              })}
            </AnimatedSection>
          </div>
        </section>

        {/* Contact form */}
        <section className="support-contact" id="contact">
          <div className="container">
            <AnimatedSection animation="fade-up" amount={0.3} className="support-section-header">
              <h2 className="support-section-title">Still need a hand?</h2>
              <p className="support-section-subtitle">
                Pick a topic, tell us a bit about it, and we'll get back to you within 1 business day.
              </p>
            </AnimatedSection>

            <AnimatedSection animation="scale-in" amount={0.2}>
              <form className="support-form" onSubmit={handleSubmit} noValidate>
                {/* Topic switcher */}
                <fieldset className="support-form__topics">
                  <legend className="sr-only">Topic</legend>
                  {TOPICS.map((t) => {
                    const Icon = t.icon;
                    const active = topic === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTopic(t.id)}
                        className={`support-topic ${active ? "is-active" : ""}`}
                        aria-pressed={active}
                      >
                        <span className="support-topic__icon" aria-hidden>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="support-topic__label">
                          <span className="support-topic__title">{t.label}</span>
                          <span className="support-topic__hint">{t.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </fieldset>

                <div className="support-form__row">
                  <label className="support-form__field">
                    <span className="support-form__label">Name</span>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="support-form__input"
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </label>
                  <label className="support-form__field">
                    <span className="support-form__label">Email</span>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="support-form__input"
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </label>
                </div>

                <label className="support-form__field">
                  <span className="support-form__label">
                    {topic === "bug"
                      ? "What went wrong?"
                      : topic === "feature"
                        ? "Tell us your idea"
                        : "Your message"}
                  </span>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    className="support-form__textarea"
                    placeholder={
                      topic === "bug"
                        ? "Steps to reproduce, what you expected, what happened…"
                        : topic === "feature"
                          ? "Describe the feature and what problem it would solve for you…"
                          : "How can we help?"
                    }
                  />
                </label>

                <div className="support-form__footer">
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="support-form__submit press-feedback"
                  >
                    {status === "loading" ? "Sending…" : "Send message"}
                  </button>
                  <span className="support-form__meta">We usually reply within 1 business day.</span>
                </div>

                {status === "success" && (
                  <div className="support-form__alert support-form__alert--success" role="status">
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                    <span>Thanks — your message is on its way.</span>
                  </div>
                )}
                {status === "error" && (
                  <div className="support-form__alert support-form__alert--error" role="alert">
                    <AlertTriangle className="h-5 w-5" aria-hidden />
                    <span>Something went wrong. Please try again in a moment.</span>
                  </div>
                )}
              </form>
            </AnimatedSection>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
