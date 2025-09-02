import { Link } from "react-router-dom";
import { FormEvent } from "react";
import './footer.css';
const Footer: React.FC = () => {
  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
  };

  return (
    <footer className="ns-footer relative w-full mt-auto">
      <div className="container foot-grid">
        <div>
          <div className="foot-brand">
            <img src="/logo1.png" alt="Notescape logo" />
            <strong className="agr-text">Notescape</strong>
          </div>
          <p className="foot-note">The first AI workspace for faster learning.</p>
        </div>

       <div>
  <h4>Product</h4>
  <Link to="/">Home</Link>
  <a href="/#how">How It Works</a>
  <a href="/#features">Features</a>
</div>


        <div>
          <h4>Company</h4>
          <Link to="/support">Contact</Link>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Use</Link>
        </div>

        <div>
          <h4>Subscribe</h4>
          <form className="subscribe" onSubmit={handleSubscribe}>
            <input type="email" placeholder="Enter your email" required />
            <button type="submit">Subscribe</button>
          </form>
        </div>
      </div>

      <div className="container foot-bottom">
        © {new Date().getFullYear()} Notescape. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
