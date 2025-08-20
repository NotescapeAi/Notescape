import { Link, NavLink } from "react-router-dom";

const Navbar: React.FC = () => {
  return (
    <header className="ns-nav-wrap">
      <nav className="ns-nav">
        <Link to="/" className="ns-logo">
          <img src="/logo1.png" alt="Notescape logo" />
          <span className="ns-brand agr-text">Notescape</span>
        </Link>

        <div className="ns-nav-links">
         <a href="/landing#features" className="ns-link">Features</a>

          <NavLink to="/pricing" className="ns-link">Pricing</NavLink>
          <NavLink to="/support" className="ns-link">Support</NavLink>
        </div>

        <div className="ns-actions">
          <Link to="/get-started" className="btn-primary">Sign Up</Link>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
