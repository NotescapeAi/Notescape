import { FormEvent, useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import "./navbar.css";
import { sendNewsletterSubscription } from "../lib/newsletter";


const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [subscribeMessage, setSubscribeMessage] = useState("");
  const [subscribeSubmitting, setSubscribeSubmitting] = useState(false);

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>("#hero");

    const compute = () => {
      // If we can see the hero, use its position vs viewport.
      if (hero) {
        const top = hero.getBoundingClientRect().top;
        setScrolled(top < -8); // scrolled when hero has moved past top
        return;
      }
      // Fallbacks if there is no #hero
      const st =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      setScrolled(st > 8);
    };

    // Listen to ANY scroll (including container scrolls)
    document.addEventListener("scroll", compute, { passive: true, capture: true });
    window.addEventListener("resize", compute);
    compute(); // run once on mount

    return () => {
      document.removeEventListener("scroll", compute, { capture: true });
      window.removeEventListener("resize", compute);
    };
  }, []);

  const headerStyle = scrolled
    ? {
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "saturate(160%) blur(12px)",
        WebkitBackdropFilter: "saturate(160%) blur(12px)",
        borderBottom: "1px solid rgba(15,23,36,0.08)",
        boxShadow: "0 6px 18px rgba(15,23,36,0.06)",
      }
    : {
        background: "transparent",
        borderBottom: "1px solid transparent",
        boxShadow: "none",
      };

  useEffect(() => {
    if (!isOpen) {
      setSubscribeOpen(false);
    }
  }, [isOpen]);

  const resetSubscribeState = () => {
    setSubscribeStatus("idle");
    setSubscribeMessage("");
  };

  const toggleSubscribe = () => {
    setSubscribeOpen((prev) => {
      const next = !prev;
      if (!next) {
        resetSubscribeState();
      }
      return next;
    });
  };

  const handleNewsletterSubscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subscribeEmail.trim()) {
      setSubscribeStatus("error");
      setSubscribeMessage("Please provide an email.");
      return;
    }
    setSubscribeSubmitting(true);
    setSubscribeStatus("pending");
    setSubscribeMessage("");
    try {
      await sendNewsletterSubscription(subscribeEmail, "Navbar");
      setSubscribeStatus("success");
      setSubscribeMessage("Thanks! You'll receive the latest updates soon.");
      setSubscribeEmail("");
    } catch (err) {
      console.error("Newsletter subscription failed:", err);
      setSubscribeStatus("error");
      setSubscribeMessage("Unable to sign you up right now. Please try again later.");
    } finally {
      setSubscribeSubmitting(false);
    }
  };

  const renderSubscribePopover = (variant: "desktop" | "mobile") => (
    <div
      className={`subscribe-popover ${variant === "desktop" ? "desktop-only" : "mobile-only"}`}
      aria-live="polite"
    >
      <form className="subscribe-popover__form" onSubmit={handleNewsletterSubscribe}>
        <input
          type="email"
          aria-label="Email address"
          placeholder="Enter your email"
          value={subscribeEmail}
          onChange={(event) => setSubscribeEmail(event.target.value)}
          required
        />
        <button type="submit" disabled={subscribeSubmitting || !subscribeEmail.trim()}>
          {subscribeSubmitting ? "Sending..." : "Subscribe"}
        </button>
      </form>
      {subscribeMessage && (
        <p className={`subscribe-popover__message ${subscribeStatus === "error" ? "error" : "success"}`}>
          {subscribeMessage}
        </p>
      )}
    </div>
  );

  return (
    <header
      className="ns-nav-wrap fixed top-0 left-0 right-0 z-50"
      style={headerStyle}
    >
      <nav className="ns-nav flex justify-between items-center px-6 py-3">
        {/* Logo */}
        <Link to="/" className="ns-logo flex items-center gap-2">
          <img src="/logo1.png" alt="Notescape logo" className="h-8 w-auto" />
          <span className="ns-brand text-xl font-bold">Notescape</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link to="/#features" className="ns-link hover:text-blue-600">Features</Link>
          <NavLink to="/pricing" className="ns-link hover:text-blue-600">Pricing</NavLink>
          <NavLink to="/support" className="ns-link hover:text-blue-600">Support</NavLink>
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex ns-actions">
          <div className="subscribe-wrapper">
            <button
              type="button"
              className="subscribe-trigger"
              onClick={toggleSubscribe}
              aria-expanded={subscribeOpen}
            >
              {subscribeStatus === "success" ? "Subscribed" : "Subscribe"}
            </button>
            {subscribeOpen && renderSubscribePopover("desktop")}
          </div>
          <Link to="/get-started" className="btn-primary cta-purple">
            Sign Up
          </Link>
        </div>

        {/* Mobile Toggle */}
        <div className="md:hidden">
          <button onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
            {isOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </nav>

      {/* Mobile Dropdown */}
      {isOpen && (
        <div className="md:hidden surface-95 backdrop-blur border-t shadow-md px-6 py-4 flex flex-col gap-3">
          <Link to="/#features" className="ns-link hover:text-blue-600" onClick={() => setIsOpen(false)}>Features</Link>
          <NavLink to="/pricing" className="ns-link hover:text-blue-600" onClick={() => setIsOpen(false)}>Pricing</NavLink>
          <NavLink to="/support" className="ns-link hover:text-blue-600" onClick={() => setIsOpen(false)}>Support</NavLink>
          <button
            type="button"
            className="ns-link subscribe-mobile-toggle"
            onClick={toggleSubscribe}
            aria-expanded={subscribeOpen}
          >
            Subscribe
          </button>
          {subscribeOpen && renderSubscribePopover("mobile")}
          <Link to="/get-started" className="btn-primary cta-purple mt-2" onClick={() => setIsOpen(false)}>Sign Up</Link>
        </div>
      )}
    </header>
  );
};

export default Navbar;
