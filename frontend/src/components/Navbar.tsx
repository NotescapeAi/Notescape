import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { useTheme } from "../hooks/useTheme";
import "./navbar.css";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  ["ns-link", isActive ? "ns-link--active" : ""].filter(Boolean).join(" ");

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

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

  const headerStyle = scrolled
    ? isDark
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
          <Link to="/#features" className="ns-link hover:text-blue-600">
            Features
          </Link>
          <NavLink to="/pricing" className={navLinkClass}>
            Pricing
          </NavLink>
          <NavLink to="/support" className={navLinkClass}>
            Support
          </NavLink>
        </div>

        <div className="hidden md:flex ns-actions items-center gap-3">
          <Link to="/get-started" className="btn-primary-purple">
            Sign Up
          </Link>
        </div>

        <div className="md:hidden">
          <button onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
            {isOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </nav>

      {isOpen && (
        <div className="md:hidden surface-95 backdrop-blur border-t shadow-md px-6 py-4 flex flex-col gap-3">
          <Link to="/#features" className="ns-link hover:text-blue-600" onClick={() => setIsOpen(false)}>
            Features
          </Link>
          <NavLink to="/pricing" className={navLinkClass} onClick={() => setIsOpen(false)}>
            Pricing
          </NavLink>
          <NavLink to="/support" className={navLinkClass} onClick={() => setIsOpen(false)}>
            Support
          </NavLink>
          <Link to="/get-started" className="btn-primary-purple mt-2" onClick={() => setIsOpen(false)}>
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
};

export default Navbar;
