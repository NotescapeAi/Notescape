import {
  Upload,
  Bot,
  BookOpenCheck,
  Search,
  Database,
  LineChart,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from "lucide-react";

import { Link } from "react-router-dom";
import { useEffect } from "react";
import MarketingLayout from "../components/MarketingLayout";
import class1Img from "../assets/class1.svg";
import class2Img from "../assets/class2.svg";
import practiceImg from "../assets/step3.svg";
import "./landing.css";

const featureCards = [
  {
    title: "Effortless Upload",
    description: "OCR technology preserves diagrams and handwriting from PDFs and slides.",
    icon: Upload,
    color: "purple"
  },
  {
    title: "AI Study Coach",
    description: "Get instant summaries and context-aware clarifications on demand.",
    icon: Bot,
    color: "blue"
  },
  {
    title: "Smart Flashcards",
    description: "Auto-generate study sets with optimized spaced repetition schedules.",
    icon: BookOpenCheck,
    color: "pink"
  },
  {
    title: "Instant Retrieval",
    description: "Find any concept across all your materials with semantic search.",
    icon: Search,
    color: "indigo"
  },
  {
    title: "Secure Vault",
    description: "Access your organized study library from any device, anywhere.",
    icon: Database,
    color: "violet"
  },
  {
    title: "Rich Analytics",
    description: "Visualize your learning progress and identify knowledge gaps.",
    icon: LineChart,
    color: "lavender"
  }
];

export default function LandingPage() {
  useEffect(() => {
    const selectors = ".reveal, .fade-in, .slide-left, .slide-right, .slide-up, .zoom-in";
    const nodes = document.querySelectorAll(selectors);
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
          }
        });
      },
      { threshold: 0.1 }
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <MarketingLayout className="landing-root">
      {/* Hero Section */}
      <section id="hero" className="landing-hero">
        <div className="hero-glow" />
        <div className="container hero-container">
          <div className="hero-content">
            <div className="hero-badge fade-in">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>AI-Powered Learning Platform</span>
            </div>
            
            <h1 className="hero-title slide-up">
              Master your studies <br />
              <span className="text-gradient">with intelligence.</span>
            </h1>
            
            <p className="hero-description slide-up">
              Transform your scattered notes into structured knowledge. Notescape uses AI to generate quizzes, flashcards, and summaries from your course materials.
            </p>
            
            <div className="hero-actions slide-up">
              <Link to="/signup" className="btn-premium">
                Start Learning Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#how" className="btn-outline">
                See how it works
              </a>
            </div>
          </div>

          <div className="hero-visual zoom-in">
            <div className="mockup-container">
              <div className="mockup-glow" />
              <img src="/main.png" alt="Notescape Dashboard" className="mockup-image" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="container">
          <div className="section-header text-center slide-up">
            <h2 className="section-title">Built for the Modern Learner</h2>
            <p className="section-subtitle">Everything you need to master your courses in one place.</p>
          </div>

          <div className="features-grid">
            {featureCards.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="feature-premium-card slide-up">
                  <div className={`feature-icon-wrapper ${feature.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="feature-card-title">{feature.title}</h3>
                  <p className="feature-card-desc">{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how" className="how-section">
        <div className="container">
          <div className="section-header text-center slide-up">
            <h2 className="section-title">Your Path to Mastery</h2>
            <p className="section-subtitle">Three simple steps to transform your learning experience.</p>
          </div>

          <div className="how-walkthrough">
            {/* Step 1 */}
            <div className="walkthrough-item slide-left">
              <div className="walkthrough-content">
                <div className="step-number">01</div>
                <h3>Centralize Your Materials</h3>
                <p>Upload slides, PDFs, and textbook chapters. Notescape organizes everything by class and file type automatically.</p>
                <ul className="step-features">
                  <li><CheckCircle2 className="w-4 h-4" /> OCR for handwritten notes</li>
                  <li><CheckCircle2 className="w-4 h-4" /> Bulk material upload</li>
                </ul>
              </div>
              <div className="walkthrough-visual">
                <img src={class1Img} alt="Upload Step" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="walkthrough-item reverse slide-right">
              <div className="walkthrough-content">
                <div className="step-number">02</div>
                <h3>Interact with AI</h3>
                <p>Chat with your documents. Ask complex questions, get summaries, and clarify difficult concepts with your personal AI coach.</p>
                <ul className="step-features">
                  <li><CheckCircle2 className="w-4 h-4" /> Instant document summaries</li>
                  <li><CheckCircle2 className="w-4 h-4" /> Context-aware Q&A</li>
                </ul>
              </div>
              <div className="walkthrough-visual">
                <img src={class2Img} alt="AI Learning Step" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="walkthrough-item slide-left">
              <div className="walkthrough-content">
                <div className="step-number">03</div>
                <h3>Active Recall Practice</h3>
                <p>Convert your notes into interactive flashcards and quizzes. Notescape tracks your progress to help you focus on weak areas.</p>
                <ul className="step-features">
                  <li><CheckCircle2 className="w-4 h-4" /> Auto-generated flashcards</li>
                  <li><CheckCircle2 className="w-4 h-4" /> Customized quiz sessions</li>
                </ul>
              </div>
              <div className="walkthrough-visual">
                <img src={practiceImg} alt="Practice Step" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="final-cta-section fade-in">
        <div className="container">
          <div className="cta-premium-box">
            <div className="cta-glow" />
            <div className="cta-content text-center">
              <h2 className="cta-title">Ready to ace your next exam?</h2>
              <p className="cta-description">Join thousands of students who have leveled up their study habits with Notescape.</p>
              <div className="cta-actions">
                <Link to="/get-started" className="btn-premium">
                  Get Started for Free
                </Link>
                <p className="cta-no-card text-xs mt-4 opacity-70">No credit card required. Cancel anytime.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
