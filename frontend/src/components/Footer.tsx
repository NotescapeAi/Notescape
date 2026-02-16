import { Link } from "react-router-dom";
import { FormEvent, useState } from "react";
import "./footer.css";
import { sendNewsletterSubscription } from "../lib/newsletter";

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
    <footer className="ns-footer relative w-full mt-auto">
      <div className="container foot-grid">
        <section>
          <div className="foot-brand">
            <img src="/logo1.png" alt="Notescape logo" />
            <strong className="agr-text">Notescape</strong>
          </div>
          <p className="foot-note">The first AI workspace for faster learning.</p>
        </section>

        <section>
          <h4>Product</h4>
          <Link to="/">Home</Link>
          <Link to="/#how">How It Works</Link>
          <Link to="/#features">Features</Link>
        </section>

        <section>
          <h4>Company</h4>
          <Link to="/support">Contact</Link>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Use</Link>
        </section>

        <section className="footer-subscribe">
          <div className="space-y-2">
            <h4 className="text-white font-semibold text-lg">Subscribe</h4>
            <p className="text-white/80 text-sm">Get product updates.</p>

            <form className="pt-1" onSubmit={handleSubscribe}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  type="email"
                  placeholder="Email address"
                  aria-label="Email address for newsletter"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full sm:w-72 rounded-xl px-4 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/30 bg-white"
                />
                <button
                  type="submit"
                  className="h-11 inline-flex items-center justify-center rounded-xl bg-black px-6 text-white text-sm font-semibold leading-none hover:bg-neutral-800 transition"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Subscribing…" : "Subscribe"}
                </button>
              </div>
            </form>

            {feedback && (
              <p className={`subscribe-feedback ${feedback.variant}`} aria-live="polite">
                {feedback.message}
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="container foot-bottom">
        (c) {new Date().getFullYear()} Notescape. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
