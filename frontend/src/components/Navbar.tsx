import { useEffect, useState, type MouseEvent } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import BrandLogo from "./BrandLogo";
import "./navbar.css";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  ["ns-link", isActive ? "ns-link--active" : ""].filter(Boolean).join(" ");

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>("#hero");

    const compute = () => {
      if (hero) {
        const top = hero.getBoundingClientRect().top;
        setScrolled(top < -8);
        return;
      }
      const st =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      setScrolled(st > 8);
    };

    document.addEventListener("scroll", compute, { passive: true, capture: true });
    window.addEventListener("resize", compute);
    compute();

    return () => {
      document.removeEventListener("scroll", compute, { capture: true });
      window.removeEventListener("resize", compute);
    };
  }, []);

  /**
   * Smooth-scroll to in-page anchors. If we're already on the right route,
   * just scrollIntoView. Otherwise navigate first, then scroll on next tick.
   */
  function handleHashClick(e: MouseEvent<HTMLAnchorElement>, hash: string) {
    e.preventDefault();
    setIsOpen(false);
    const id = hash.replace(/^#/, "");

    const scrollToTarget = () => {
      const el = document.getElementById(id);
      if (!el) return;
      const prefersReducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      el.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
      // Update URL hash without re-triggering router
      try {
        window.history.replaceState(null, "", `/#${id}`);
      } catch {
        /* no-op */
      }
    };

    if (location.pathname !== "/") {
      navigate("/");
      // Wait for landing page to mount before scrolling
      window.setTimeout(scrollToTarget, 80);
    } else {
      scrollToTarget();
    }
  }

  const isDarkPref =
    typeof window !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const headerStyle = scrolled
    ? isDarkPref
      ? {
          background: "rgba(14, 17, 24, 0.88)",
          backdropFilter: "saturate(160%) blur(12px)",
          WebkitBackdropFilter: "saturate(160%) blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 22px rgba(0,0,0,0.22)",
        }
      : {
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

  return (
    <header
      className="ns-nav-wrap fixed top-0 left-0 right-0 z-50"
      style={headerStyle}
    >
      <nav className="ns-nav flex justify-between items-center px-6 py-3">
        <BrandLogo variant="header" className="ns-logo" />

        <div className="hidden md:flex items-center gap-1 lg:gap-2">
          <a href="/#features" onClick={(e) => handleHashClick(e, "#features")} className="ns-link">
            Features
          </a>
          <a href="/#how" onClick={(e) => handleHashClick(e, "#how")} className="ns-link">
            How it works
          </a>
          <NavLink to="/pricing" className={navLinkClass}>
            Pricing
          </NavLink>
          <NavLink to="/support" className={navLinkClass}>
            Support
          </NavLink>
        </div>

        <div className="hidden md:flex ns-actions items-center gap-3">
          <Link to="/login" className="ns-link">
            Log in
          </Link>
          <Link to="/get-started" className="btn-primary-purple press-feedback">
            Sign up
          </Link>
        </div>

        <div className="md:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={isOpen}
            className="ns-mobile-toggle"
          >
            {isOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </nav>

      {isOpen && (
        <div className="md:hidden ns-mobile-panel">
          <a
            href="/#features"
            onClick={(e) => handleHashClick(e, "#features")}
            className="ns-link"
          >
            Features
          </a>
          <a
            href="/#how"
            onClick={(e) => handleHashClick(e, "#how")}
            className="ns-link"
          >
            How it works
          </a>
          <NavLink to="/pricing" className={navLinkClass} onClick={() => setIsOpen(false)}>
            Pricing
          </NavLink>
          <NavLink to="/support" className={navLinkClass} onClick={() => setIsOpen(false)}>
            Support
          </NavLink>
          <Link to="/login" className="ns-link" onClick={() => setIsOpen(false)}>
            Log in
          </Link>
          <Link
            to="/get-started"
            className="btn-primary-purple mt-2 press-feedback"
            onClick={() => setIsOpen(false)}
          >
            Sign up
          </Link>
        </div>
      )}
    </header>
  );
};

export default Navbar;
