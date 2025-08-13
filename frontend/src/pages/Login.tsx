import React, { useState, FormEvent, MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

/**
 * Login page — ripple + social handlers + form submit.
 * ESLint-friendly: no unused vars, errors are logged.
 */
export default function Login(): JSX.Element {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const addRipple = (e: MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height);
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  };

  // Use this handler for both Apple & Google buttons
  const onSocial = (provider: "Apple" | "Google", e: MouseEvent<HTMLButtonElement>) => {
    addRipple(e);
    // placeholder behavior — log and show temporary message
    console.log(`${provider} sign-in clicked`);
    setError(`${provider} sign-in not wired yet.`);
    setTimeout(() => setError(""), 1400);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    try {
      // simulate auth request
      await new Promise((r) => setTimeout(r, 900));
      navigate("/dashboard");
    } catch (caughtError) {
      // log the error (prevents ESLint 'defined but never used' complaint)
      // and show a friendly message
      // eslint-disable-next-line no-console
      console.error("Login error:", caughtError);
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

        {/* Apple Sign In */}
        <button
          type="button"
          className="social-btn"
          onClick={(e) => onSocial("Apple", e)}
        >
          <img src="/apple.svg" alt="Apple logo" className="icon" width={18} height={18} />
          CONTINUE WITH APPLE
        </button>

        {/* Google Sign In */}
        <button
          type="button"
          className="social-btn"
          onClick={(e) => onSocial("Google", e)}
        >
          <img src="/google.svg" alt="Google logo" className="icon" width={18} height={18} />
          CONTINUE WITH GOOGLE
        </button>

        <div className="divider" role="separator" aria-label="or">
          <span />
          <p>OR</p>
          <span />
        </div>

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
            onClick={(e) => addRipple(e)}
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
