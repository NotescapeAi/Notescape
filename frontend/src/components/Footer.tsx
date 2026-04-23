import { Link } from "react-router-dom";
import "./footer.css";

const Footer: React.FC = () => {
  return (
    <footer className="ns-premium-footer">
      <div className="container footer-content">
        <div className="footer-grid">
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
          </div>

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
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Notescape Inc. All rights reserved.</p>
          <div className="footer-badges">
            <span>Built for focused learning</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
