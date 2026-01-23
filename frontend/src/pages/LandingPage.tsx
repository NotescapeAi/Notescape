import {
  Upload,
  Bot,
  BookOpenCheck,
  Search,
  Database,
  LineChart
} from "lucide-react";

import { Link } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import "./landing.css";

const featureCards = [
  {
    title: "Effortless Material Upload",
    description: "Upload PDFs, slides and even handwritten notes - organized automatically.",
    icon: Upload
  },
  {
    title: "AI-Powered Assistance",
    description: "Get instant summaries and clarifications from the integrated AI coach.",
    icon: Bot
  },
  {
    title: "Active Learning Tools",
    description: "Auto-generate flashcards and quizzes with spaced repetition.",
    icon: BookOpenCheck
  },
  {
    title: "Smart Content Retrieval",
    description: "Find exactly what you need instantly with context-aware search.",
    icon: Search
  },
  {
    title: "Centralized Storage",
    description: "Access all your files, sessions and progress data in one secure space.",
    icon: Database
  },
  {
    title: "Progress Tracking",
    description: "Identify strengths and gaps with rich analytics and insights.",
    icon: LineChart
  }
];


export default function LandingPage() {
  useEffect(() => {
    const selectors =
      ".reveal, .fade-in, .slide-left, .slide-right, .slide-up, .slide-down, .zoom-in, .flip-up, .rotate-in, .scale-up, .bounce-in";
    const nodes = document.querySelectorAll(selectors);
    const prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (prefersReduce.matches) {
      nodes.forEach((el) => el.classList.add("active"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("active", entry.isIntersecting);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    nodes.forEach((el) => {
      if (el.classList.contains("btn-primary")) return;
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Navbar />
      <div className="landing-root">
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
            
                <Link to="/signup" className="btn-primary cta-purple">
                  Get started
                </Link>
                <a className="btn-ghost slide-up" href="#how">
                  Watch Demo
                </a>
            
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
              {featureCards.map((feature, index) => {
                const Icon = feature.icon;
                const delay = 80 + index * 20;
                return (
                  <article
                    key={feature.title}
                    className="feature-card slide-up"
                    style={{ transitionDelay: `${delay}ms` }}
                  >
                    <div className="fi">
                      <Icon color="#4f46e5" size={22} strokeWidth={2.2} />
                    </div>
                    <div className="feature-title">{feature.title}</div>
                    <div className="feature-desc">{feature.description}</div>
                  </article>
                );
              })}
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
              <img src="/class1.svg" alt="Upload mock" className="how-img slide-right" />
            </div>

            <div className="how-grid reverse">
              <img src="/step2.svg" alt="AI mock" className="how-img slide-left" />
              <div className="how-copy slide-right">
                <h3>2. Engage with AI-Powered Learning</h3>
                <p>Ask questions, generate summaries and get tailored explanations.</p>
              </div>
            </div>

            <div className="how-grid">
              <div className="how-copy ">
                <h3>3. Practice with Auto-Generated Study Tools</h3>
                <p>Create flashcards and quizzes automatically and track improvements.</p>
              </div>
              <img src="/step3.svg" alt="Practice mock" className="how-img slide-right" />
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
              <Link to="/get-started" className="btn-primary cta-purple">
                Sign Up for Free
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
