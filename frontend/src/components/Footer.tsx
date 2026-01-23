import { Link } from "react-router-dom";
import { FormEvent, useState } from "react";
import emailjs from "@emailjs/browser";
import "./footer.css";

const Footer: React.FC = () => {
  const [subscribed, setSubscribed] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault();

    try {
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID,
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
        {
          user_email: email,
        },
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY
      );

      setSubscribed(true);
      setEmail("");
    } catch (error) {
      console.error("Subscription failed", error);
      alert("Subscription failed. Try again.");
    }
  };

  return (
    <footer className="ns-footer relative w-full mt-auto">
      <div className="container foot-grid">
        <div>
          <div className="foot-brand">
            <img src="/logo1.png" alt="Notescape logo" />
            <strong className="agr-text">Notescape</strong>
          </div>
          <p className="foot-note">
            The first AI workspace for faster learning.
          </p>
        </div>

        <div>
          <h4>Product</h4>
          <Link to="/">Home</Link>
          <Link to="/#how">How It Works</Link>
          <Link to="/#features">Features</Link>
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
          {subscribed ? (
            <p className="text-green-600 font-semibold mt-2">
              ✅ Subscribed!
            </p>
          ) : (
            <form className="subscribe" onSubmit={handleSubscribe}>
              <input
                type="email"
                placeholder="Enter your email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit">Subscribe</button>
            </form>
          )}
        </div>
      </div>

      <div className="container foot-bottom">
        © {new Date().getFullYear()} Notescape. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
