import React, { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import "./NotescapeStartPage.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email) {
      setError("Please enter your email.");
      return;
    }

    setSubmitting(true);

    try {
      // simulate API request
      await new Promise((r) => setTimeout(r, 1000));
      setMessage("If this email exists, a reset link has been sent.");
    } catch  {
      setError("Something went wrong. Please try again.");
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
        <h2 className="login-title">Forgot Password</h2>

        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}

        <form onSubmit={onSubmit} noValidate>
          <div className="form-field">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label="Email"
            />
          </div>

          <button type="submit" className="login-btn" disabled={submitting}>
            {!submitting ? "Send Reset Link" : "Sending..."}
          </button>
        </form>

        <div className="links1">
          <Link to="/login" className="ghost-btn">
            Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
}
