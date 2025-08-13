import React, { useState, MouseEvent, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./NotescapeStartPage.css"; // your stylesheet

export default function Login(): JSX.Element {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const addRipple = (e: MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height);
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  };

  const onSocial = (provider: "Apple" | "Google", e: MouseEvent<HTMLButtonElement>) => {
    // ripple + placeholder behavior
    addRipple(e);
    setError(`Social sign-in with ${provider} is not wired yet.`);
    setTimeout(() => setError(""), 1400);
    // TODO: wire provider OAuth flow here
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      const form = (e.currentTarget.closest(".login-container") as HTMLElement | null);
      if (form) {
        form.classList.remove("shake");
        void form.offsetWidth; // restart animation
        form.classList.add("shake");
      }
      setError("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    try {
      // simulate auth request
      await new Promise((r) => setTimeout(r, 900));
      // TODO: call real auth API, handle errors
      navigate("/dashboard"); // change destination as needed
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <header className="logo">
  <img src="/logo1.png" alt="Notescape logo" width={70} height={50} />
  <h1>Notescape</h1>
</header>


      <div className="login-container">
        <h2 className="login-title">Log in</h2>

        {/* Social buttons */}
        <button className="social-btn" onClick={() => console.log("Apple Sign In")}>
          <img src="/apple.svg" alt="Apple logo" className="icon" width={18} height={18} />
          Continue with Apple
        </button>

        {/* Google Sign In */}
        <button className="social-btn" onClick={() => console.log("Google Sign In")}>
          <img src="/google.svg" alt="Google logo" className="icon" width={18} height={18} />
          Continue with Google
        </button>

        <div className="divider" role="separator" aria-label="or">
          <span />
          <p>OR</p>
          <span />
        </div>

        {/* Error */}
        {error && <p className="error" role="status">{error}</p>}

        <form onSubmit={onSubmit} noValidate>
          <div className="form-field">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
              aria-label="Email"
            />
          </div>

          <div className="form-field">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              aria-label="Password"
            />
          </div>

          <button
            type="submit"
            className="login-btn"
            onClick={(e) => addRipple(e as MouseEvent<HTMLButtonElement>)}
            disabled={submitting}
          >
            {!submitting ? "LOG IN" : <span className="spinner" aria-hidden />}
          </button>
        </form>

        <div className="links2">
          <Link to="/signup" className="ghost-btn">Create account</Link>
          <Link to="/forgot-password" className="ghost-btn">Forgot password?</Link>
        </div>
      </div>
    </main>
  );
}


