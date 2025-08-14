import React, { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { AuthError } from "firebase/auth"; 
import { auth } from "../firebase/firebase";
import "./NotescapeStartPage.css";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setSubmitting(true);

    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/login`,
      });
      setMessage(
        "Password reset email sent! Check your inbox and follow the link to set a new password."
      );
      setEmail("");

     
      setTimeout(() => {
        navigate("/login");
      }, 5000);
    } catch (err: unknown) {
      console.error("Password reset error:", err);

      if (typeof err === "object" && err !== null && "code" in err) {
        const authErr = err as AuthError;
        if (authErr.code === "auth/user-not-found") {
          setError("No account found with this email.");
        } else {
          setError("Something went wrong. Please try again.");
        }
      } else {
        setError("An unexpected error occurred.");
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
