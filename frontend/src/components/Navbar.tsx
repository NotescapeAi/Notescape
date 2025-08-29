import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="ns-nav-wrap fixed top-0 left-0 right-0 z-50 bg-white shadow-md">
      <nav className="ns-nav flex justify-between items-center px-6 py-3">
        {/* Logo */}
        <Link to="/" className="ns-logo flex items-center gap-2">
          <img src="/logo1.png" alt="Notescape logo" className="h-8 w-auto" />
          {<span className="ns-brand text-xl font-bold">Notescape</span>}
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          <a href="/" className="ns-link hover:text-blue-600">
            Features
          </a>
          <NavLink to="/pricing" className="ns-link hover:text-blue-600">
            Pricing
          </NavLink>
          <NavLink to="/support" className="ns-link hover:text-blue-600">
            Support
          </NavLink>
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex ns-actions">
          <Link to="/get-started" className="btn-primary">
            Sign Up
          </Link>
        </div>

        {/* Mobile Toggle */}
        <div className="md:hidden">
          <button onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </nav>

      {/* Mobile Dropdown */}
      {isOpen && (
        <div className="md:hidden bg-white border-t shadow-md px-6 py-4 flex flex-col gap-3">
          <a
            href="/"
            className="ns-link hover:text-blue-600"
            onClick={() => setIsOpen(false)}
          >
            Features
          </a>
          <NavLink
            to="/pricing"
            className="ns-link hover:text-blue-600"
            onClick={() => setIsOpen(false)}
          >
            Pricing
          </NavLink>
          <NavLink
            to="/support"
            className="ns-link hover:text-blue-600"
            onClick={() => setIsOpen(false)}
          >
            Support
          </NavLink>
          <Link
            to="/get-started"
            className="btn-primary mt-2"
            onClick={() => setIsOpen(false)}
          >
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
};

export default Navbar;
