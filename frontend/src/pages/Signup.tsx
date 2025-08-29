// src/pages/NotescapeStartPage.tsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  signup,
  signInWithGoogle,
  signInWithGithub,
} from "../firebase/firebaseAuth";
import { auth } from "../firebase/firebase";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import "./Signup.css";

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

  // Helper to normalize email
  const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

  // Social login handler
  const onSocial = async (provider: "Github" | "Google") => {
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

      if (err instanceof FirebaseError) {
        // Handle account-exists-with-different-credential conflict
        if (err.code === "auth/account-exists-with-different-credential") {
          const conflictEmail =
            (err.customData?.email as string | undefined) || "";
          if (conflictEmail) {
            try {
              const methods = await fetchSignInMethodsForEmail(
                auth,
                normalizeEmail(conflictEmail)
              );
              if (methods.includes("password")) {
                setError(
                  "An account with this email already exists with a password. Please log in with email & password."
                );
              } else if (methods.includes("google.com")) {
                setError(
                  "This email is already linked with Google. Please continue with Google."
                );
              } else if (methods.includes("github.com")) {
                setError(
                  "This email is already linked with Github. Please continue with Github."
                );
              } else {
                setError(
                  "An account with this email already exists with a different sign-in method."
                );
              }
            } catch (fetchErr) {
              console.error("fetchSignInMethodsForEmail error:", fetchErr);
              setError(`${provider} login failed. Please try another method.`);
            }
          } else {
            setError(`${provider} login failed. Please try another method.`);
          }
        } else if (err.code === "auth/popup-closed-by-user") {
          setError("Sign-in was cancelled. Please try again.");
        } else {
          setError(`${provider} login failed. Please try again.`);
        }
      } else {
        setError(`${provider} login failed. Please try again.`);
      }
    }
  };

  // Email/Password signup
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const cleanEmail = normalizeEmail(email);

    if (!cleanEmail || !password || !confirmPassword) {
      setError("Please fill all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await signup(cleanEmail, password);
      navigate("/dashboard");
    } catch (err: unknown) {
      console.error("Signup error:", err);

      if (err instanceof FirebaseError) {
        if (err.code === "auth/email-already-in-use") {
          try {
            const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
            if (methods.includes("password")) {
              setError("You already have an account. Please log in instead.");
            } else if (methods.includes("google.com")) {
              setError(
                "This email is already linked with Google. Please continue with Google sign-in."
              );
            } else if (methods.includes("github.com")) {
              setError(
                "This email is already linked with Github. Please continue with Github sign-in."
              );
            } else {
              setError(
                "This email is already in use. Try logging in or use a different email."
              );
            }
          } catch (fetchErr) {
            console.error("fetchSignInMethodsForEmail error:", fetchErr);
            setError("This email is already in use. Please log in instead.");
          }
        } else {
          setError("Signup failed. Please try again.");
        }
      } else {
        setError("Signup failed. Please try again.");
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

      <section
        className="login-container"
        role="region"
        aria-label="Get Started"
      >
        <h2 className="login-title">Sign Up</h2>

        {/* Social buttons */}
        <button
          className="social-btn"
          onClick={() => onSocial("Github")}
          aria-label="Continue with Github"
        >
          <img
            src="/github-mark.png"
            alt="Github logo"
            className="icon"
            width={18}
            height={18}
          />
          Continue with Github
        </button>

        <button
          className="social-btn"
          onClick={() => onSocial("Google")}
          aria-label="Continue with Google"
        >
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

        {!showEmailForm && (
          <button className="login-btn" onClick={handleEmailClick}>
            <span className="btn-inner">
              <MailIcon />
              Continue with e-mail
            </span>
          </button>
        )}

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
                aria-label="Email"
              />
            </div>

            <div className="form-field password-field">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-label="Password"
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
                aria-label="Confirm password"
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
