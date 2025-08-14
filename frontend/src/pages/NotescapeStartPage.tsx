import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  signup,
  signInWithGoogle,
  signInWithApple,
} from "../firebase/firebaseAuth";
import "./NotescapeStartPage.css";

export default function NotescapeStartPage() {
  const navigate = useNavigate();

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleEmailClick = () => {
    setShowEmailForm(true);
  };

  // Social login handler
  const onSocial = async (provider: "Apple" | "Google") => {
    setError("");
    try {
      if (provider === "Google") {
        await signInWithGoogle();
      } else if (provider === "Apple") {
        await signInWithApple();
      }
      navigate("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`${provider} login error:`, err.message);
        setError(`${provider} login failed. Please try again.`);
      } else {
        console.error(`${provider} login error:`, err);
        setError(`${provider} login failed.`);
      }
    }
  };

  // Email/Password signup
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!email || !password || !confirmPassword) {
      setError("Please fill all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await signup(email, password);
      navigate("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Signup error:", err.message);
        setError("Signup failed. Please try again.");
      } else {
        console.error("Signup error:", err);
        setError("Signup failed.");
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

      <section className="login-container" role="region" aria-label="Get Started">
        <h2 className="login-title">Get Started</h2>

        {/* Social buttons */}
        <button className="social-btn" onClick={() => onSocial("Apple")}>
          <img
            src="/apple.svg"
            alt="Apple logo"
            className="icon"
            width={18}
            height={18}
          />
          Continue with Apple
        </button>

        <button className="social-btn" onClick={() => onSocial("Google")}>
          <img
            src="/google.svg"
            alt="Google logo"
            className="icon"
            width={18}
            height={18}
          />
          Continue with Google
        </button>

        <div className="divider" role="separator" aria-label="or">
          <span />
          <p>OR</p>
          <span />
        </div>

        {/* Continue with Email button */}
        {!showEmailForm && (
          <button className="login-btn" onClick={handleEmailClick}>
            <span className="btn-inner">
              <MailIcon />
              Continue with e-mail
            </span>
          </button>
        )}

        {/* Email Form */}
        {showEmailForm && (
          <form className="email-form" onSubmit={onSubmit} noValidate>
            {error && <p className="error">{error}</p>}

            <div className="form-field">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-field password-field">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <div className="form-field password-field">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>

            <button type="submit" className="login-btn" disabled={submitting}>
              {!submitting ? "Sign Up" : "Signing Up..."}
            </button>
          </form>
        )}

        <div className="links1">
          <Link to="/login" className="ghost-btn">
            Already have an account?
          </Link>
        </div>
      </section>
    </main>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
      />
    </svg>
  );
}
