import React, { useEffect, useState } from "react";
import { sendEmailVerification, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebase";
import "./NotescapeStartPage.css";

const RESEND_COOLDOWN_SECONDS = 45;

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const email = auth.currentUser?.email;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (user.emailVerified) {
      navigate("/classes", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const interval = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [cooldown]);

  const resendEmail = async () => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (sending || cooldown > 0) return;
    setError("");
    setMessage("");
    setSending(true);
    try {
      await sendEmailVerification(user);
      setMessage("Verification email sent. Check your inbox (and spam).");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      console.error("sendEmailVerification error:", err);
      setError("Unable to send verification email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const checkVerification = async () => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    setError("");
    setMessage("");
    setChecking(true);
    try {
      await user.reload();
      if (user.emailVerified) {
        navigate("/classes", { replace: true });
        return;
      }
      setMessage("Email still unverified. Keep an eye on your inbox.");
    } catch (err) {
      console.error("Email verification refresh failed:", err);
      setError("Could not refresh verification status. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const changeEmail = async () => {
    setError("");
    setMessage("");
    try {
      await signOut(auth);
    } catch (err) {
      console.error("signOut error while changing email:", err);
    }
    navigate("/signup", { replace: true });
  };

  return (
    <div className="auth-root">
      <main className="page">
        <section className="auth-page" aria-live="polite">
          <header className="logo">
            <img src="/logo1.png" alt="Notescape logo" width={70} height={50} />
            <h1>Notescape</h1>
          </header>
          <div className="login-container">
            <h2 className="login-title">Check your inbox to verify your email</h2>
            <p>
              We sent a verification link to <strong>{email ?? "your email"}</strong>. You’ll need to confirm
              that address before you can use Notescape.
            </p>
            <p className="muted-text">
              Didn’t receive anything? It can take a minute. Look in spam/filtered folders just in case.
            </p>
            {error && <p className="error">{error}</p>}
            {message && <p className="success">{message}</p>}
            <div className="form-field">
              <button
                type="button"
                className="login-btn"
                onClick={resendEmail}
                disabled={sending || cooldown > 0}
              >
                {!sending ? (
                  cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"
                ) : (
                  <span className="spinner" aria-hidden />
                )}
              </button>
            </div>
            <div className="form-field">
              <button
                type="button"
                className="social-btn"
                onClick={checkVerification}
                disabled={checking}
              >
                {!checking ? "I already verified, check again" : <span className="spinner" aria-hidden />}
              </button>
            </div>
            <div className="links2">
              <button type="button" className="ghost-btn" onClick={changeEmail}>
                Change email
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
