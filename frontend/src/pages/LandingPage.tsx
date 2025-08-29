import {
  Upload,
  Bot,
  BookOpenCheck,
  Search,
  Database,
  LineChart
} from "lucide-react";

import "./landing.css";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import GetStartedLink from "../components/GetStartedLink";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function LandingPage() {
  //  Scroll animations trigger
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
          } else {
            entry.target.classList.remove("active"); // remove if you want animation only once
          }
        });
      },
      { threshold: 0.15 }
    );

    document
      .querySelectorAll(
        ".reveal, .fade-in, .slide-left, .slide-right, .slide-up, .slide-down, .zoom-in, .flip-up, .rotate-in, .scale-up, .bounce-in"
      )
      .forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Navbar/>

      {/* Hero Section */}
      <section id="hero" className="landing-hero fade-in">
        <div className="container hero-grid">
          <div className="hero-copy slide-left">
            <h1 className="hero-title agr-hero">
              Digitize.<br />Understand.<br />Master.
            </h1>
            <p className="hero-sub">
              Instantly convert your notes into flashcards, quizzes and concise summaries
              clear up any concept on demand with an AI coach.
            </p>
            <div className="cta-row">
              <GetStartedLink className="btn-primary bounce-in">
                Get started
              </GetStartedLink>
              <a className="btn-ghost slide-up" href="#how">
                Watch Demo
              </a>
            </div>
          </div>

          <div className="hero-media zoom-in">
            <img src="/main.png" alt="Notescape UI preview" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <h2 className="h2 text-center mb-12 fade-in text-4xl font-bold bg-gradient-to-r ">
            Your Complete Personal Learning Workspace
          </h2>

          <div className="features-grid">
            <div className="feature-card slide-up">
              <Upload className="feature-icon" />
              <div className="feature-title">Effortless Material Upload</div>
              <div className="feature-desc">
                Upload PDFs, slides and even handwritten notes—organized automatically.
              </div>
            </div>

            <div className="feature-card slide-up">
              <Bot className="feature-icon" />
              <div className="feature-title">AI-Powered Assistance</div>
              <div className="feature-desc">
                Get instant summaries and clarifications from the integrated AI coach.
              </div>
            </div>

            <div className="feature-card slide-up">
              <BookOpenCheck className="feature-icon" />
              <div className="feature-title">Active Learning Tools</div>
              <div className="feature-desc">
                Auto-generate flashcards and quizzes with spaced repetition.
              </div>
            </div>

            <div className="feature-card slide-up">
              <Search className="feature-icon" />
              <div className="feature-title">Smart Content Retrieval</div>
              <div className="feature-desc">
                Find exactly what you need instantly with context-aware search.
              </div>
            </div>

            <div className="feature-card slide-up">
              <Database className="feature-icon" />
              <div className="feature-title">Centralized Storage</div>
              <div className="feature-desc">
                Access all your files, sessions and progress data in one secure space.
              </div>
            </div>

            <div className="feature-card slide-up">
              <LineChart className="feature-icon" />
              <div className="feature-title">Progress Tracking</div>
              <div className="feature-desc">
                Identify strengths and gaps with rich analytics and insights.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="how">
        <div className="container">
          <h2 className="h2 fade-in">See How it Works</h2>

          <div className="how-grid">
            <div className="how-copy slide-left">
              <h3>1. Upload Your Study Materials</h3>
              <p>Drag and drop PDFs, slides or notes. OCR preserves diagrams and handwriting.</p>
            </div>
            <img src="/step1.png" alt="Upload mock" className="how-img slide-right" />
          </div>

          <div className="how-grid reverse">
            <img src="/step2.png" alt="AI mock" className="how-img slide-left" />
            <div className="how-copy slide-right">
              <h3>2. Engage with AI-Powered Learning</h3>
              <p>Ask questions, generate summaries and get tailored explanations.</p>
            </div>
          </div>

          <div className="how-grid">
            <div className="how-copy slide-left">
              <h3>3. Practice with Auto-Generated Study Tools</h3>
              <p>Create flashcards and quizzes automatically and track improvements.</p>
            </div>
            <img src="/step3.png" alt="Practice mock" className="how-img slide-right" />
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="cta-wrap">
        <div className="container">
          <div className="cta-banner fade-in">
            <div>
              <h3 className="cta-title">Ready to Transform Your Study Habits?</h3>
              <p className="cta-sub">Sign up for free today</p>
            </div>
            <Link to="/get-started" className="btn-primary slide-up">
              Sign Up for Free
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
