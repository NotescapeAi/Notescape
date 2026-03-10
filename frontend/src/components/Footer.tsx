import { Link } from "react-router-dom";
import { FormEvent, useState } from "react";
import "./footer.css";
import { sendNewsletterSubscription } from "../lib/newsletter";
import { Twitter, Linkedin, Github, Mail } from "lucide-react";

type Feedback = {
  variant: "success" | "error";
  message: string;
};

const Footer: React.FC = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const handleSubscribe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFeedback({ variant: "error", message: "Please provide an email address." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await sendNewsletterSubscription(trimmedEmail, "Footer");
      setFeedback({ variant: "success", message: "Subscribed! We'll keep you posted." });
      setEmail("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "unknown error");
      if (message.includes("newsletter configuration is missing")) {
        setFeedback({
          variant: "success",
          message: "Subscribed (demo). Thanks for showing interest!",
        });
        setEmail("");
      } else {
        setFeedback({
          variant: "error",
          message: "Unable to subscribe right now. Please try again later.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <footer className="ns-premium-footer">
      <div className="footer-glow" />
      <div className="container footer-content">
        <div className="footer-grid">
          {/* Brand Column */}
          <div className="footer-brand-col">
            <Link to="/" className="footer-logo">
              <div className="logo-icon">
                <img src="/logo1.png" alt="Notescape" />
              </div>
              <span className="logo-text">Notescape</span>
            </Link>
            <p className="footer-tagline">
              The AI-powered workspace that transforms how students learn, retain, and master new concepts.
            </p>
            <div className="social-links">
              <a href="#" aria-label="Twitter"><Twitter className="w-5 h-5" /></a>
              <a href="#" aria-label="LinkedIn"><Linkedin className="w-5 h-5" /></a>
              <a href="#" aria-label="GitHub"><Github className="w-5 h-5" /></a>
              <a href="mailto:hello@notescape.com" aria-label="Email"><Mail className="w-5 h-5" /></a>
            </div>
          </div>

          {/* Links Columns */}
          <div className="footer-links-group">
            <div className="footer-col">
              <h4>Product</h4>
              <ul>
                <li><Link to="/#features">Features</Link></li>
                <li><Link to="/#how">How it Works</Link></li>
                <li><Link to="/pricing">Pricing</Link></li>
                <li><Link to="/login">Log In</Link></li>
              </ul>
            </div>
            
            <div className="footer-col">
              <h4>Company</h4>
              <ul>
                <li><Link to="/about">About Us</Link></li>
                <li><Link to="/blog">Blog</Link></li>
                <li><Link to="/careers">Careers</Link></li>
                <li><Link to="/contact">Contact</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Legal</h4>
              <ul>
                <li><Link to="/privacy">Privacy Policy</Link></li>
                <li><Link to="/terms">Terms of Service</Link></li>
                <li><Link to="/cookies">Cookie Policy</Link></li>
              </ul>
            </div>
          </div>

          {/* Newsletter Column */}
          <div className="footer-newsletter-col">
            <h4>Stay Updated</h4>
            <p>Get the latest study tips and product updates delivered to your inbox.</p>
            
            <form onSubmit={handleSubscribe} className="footer-form">
              <div className="input-group">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "..." : "Subscribe"}
                </button>
              </div>
              {feedback && (
                <p className={`feedback-msg ${feedback.variant}`}>
                  {feedback.message}
                </p>
              )}
            </form>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Notescape Inc. All rights reserved.</p>
          <div className="footer-badges">
            <span>Made with ❤️ for students</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
