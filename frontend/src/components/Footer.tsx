import { Heart } from "lucide-react";
import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo";
import "./footer.css";

const Footer: React.FC = () => {
  return (
    <footer className="ns-premium-footer">
      <div className="ns-footer-grain" aria-hidden />
      <div className="ns-footer-glow ns-footer-glow--a" aria-hidden />
      <div className="ns-footer-glow ns-footer-glow--b" aria-hidden />

      <div className="container footer-content">
        <div className="footer-grid">
          <div className="footer-brand-col">
            <BrandLogo variant="footer" className="footer-logo" />
            <p className="footer-tagline">
              An AI-powered workspace that helps you learn, retain, and master new ideas — your way.
            </p>
          </div>

          <div className="footer-links-group">
            <div className="footer-col">
              <h4>Product</h4>
              <ul>
                <li><Link to="/#features">Features</Link></li>
                <li><Link to="/#how">How it works</Link></li>
                <li><Link to="/pricing">Pricing</Link></li>
                <li><Link to="/login">Log in</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Help</h4>
              <ul>
                <li><Link to="/support">Support</Link></li>
                <li><Link to="/support#faq">FAQs</Link></li>
                <li><Link to="/support#contact">Contact us</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Legal</h4>
              <ul>
                <li><Link to="/privacy">Privacy</Link></li>
                <li><Link to="/terms">Terms</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Notescape. All rights reserved.</p>
          <div className="footer-badges">
            <span className="footer-love" aria-label="Built with love for students">
              <span>Built with</span>
              <Heart
                className="footer-love__heart"
                aria-hidden="true"
                fill="currentColor"
                strokeWidth={0}
              />
              <span>for students</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
