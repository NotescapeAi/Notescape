// src/pages/Login.tsx
import React, { useState, FormEvent, MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, signInWithGoogle, signInWithGithub } from "../firebase/firebaseAuth";
import "./NotescapeStartPage.css"

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Ripple effect
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

  // Social login handler
  const onSocial = async (provider: "Github" | "Google", e: MouseEvent<HTMLButtonElement>) => {
    addRipple(e);
    setError("");
    try {
      if (provider === "Google") {
        await signInWithGoogle();
      } else if (provider === "Github") {
        await signInWithGithub();
      }
      navigate("/dashboard");
    } catch (err: unknown) {
      console.error(`${provider} login error:`, err);
      if (err instanceof Error) {
        setError(`${provider} login failed: ${err.message}`);
      } else {
        setError(`${provider} login failed. Please try again.`);
      }
    }
  };

  // Email/Password login
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: unknown) {
      console.error("Login error:", err);
      if (err instanceof Error) {
        setError(`Login failed: ${err.message}`);
      } else {
        setError("Login failed. Please check your credentials.");
      }
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

      <div className="auth-page">
        <div className="login-container">
          <h2 className="login-title">Log in</h2>

          {/* GitHub Sign In */}
          <button type="button" className="social-btn" onClick={(e) => onSocial("Github", e)}>
            <img src="/github-mark.png" alt="Github logo" className="icon" width={18} height={18} />
            CONTINUE WITH GITHUB
          </button>

          {/* Google Sign In */}
          <button type="button" className="social-btn" onClick={(e) => onSocial("Google", e)}>
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
            <Link to="/get-started" className="ghost-btn">
              Create account
            </Link>
            <Link to="/forgot-password" className="ghost-btn">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
