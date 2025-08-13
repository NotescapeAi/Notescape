import React, { MouseEvent } from "react";
import "./NotescapeStartPage.css";

export default function NotescapeStartPage() {
  const handleRipple = (e: MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height);
    ripple.className = "ripple";

    // use template literals (backticks) so the px value is valid
    ripple.style.width = ripple.style.height = `${size}px`;

    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  };

  return (
    <main className="page">
      <header className="logo" aria-label="Notescape logo">
        <span className="logo-mark" aria-hidden="true">
    <img src="/logo1.png" alt="Notescape icon" />
  </span>
        <h1>Notescape</h1>
      </header>

      <section className="login-container" role="region" aria-label="Get Started">
        <h2 className="login-title">Get Started</h2>

        <button className="social-btn" onClick={handleRipple} aria-label="Continue with Apple">
          <span className="btn-inner">
            <AppleIcon />
            Continue with Apple
          </span>
        </button>

        <button className="social-btn" onClick={handleRipple} aria-label="Continue with Google">
          <span className="btn-inner">
            <GoogleIcon />
            Continue with Google
          </span>
        </button>

        <div className="divider" role="separator" aria-label="or">
          <span />
          <p>OR</p>
          <span />
        </div>

        <button className="login-btn" onClick={handleRipple} aria-label="Continue with email">
          <span className="btn-inner">
            <MailIcon />
            Continue with e-mail
          </span>
        </button>

        <div className="links">
          <a href="#" className="ghost-btn" aria-label="Sign in">
            Already have an account?
          </a>
        </div>
      </section>
    </main>
  );
}

/* ---------- Icons ---------- */
function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.365 1.43c.04.51-.19 1.04-.55 1.53-.36.49-.98.91-1.58.87-.05-.55.21-1.12.56-1.56.37-.47 1.04-.82 1.57-.84zM20.5 17.14c-.3.69-.47.99-.9 1.6-.58.83-1.4 1.87-2.42 1.89-.91.02-1.15-.55-2.4-.55s-1.52.53-2.42.57c-1.01.04-1.78-.9-2.36-1.73-1.28-1.86-2.27-5.26-.95-7.56.66-1.14 1.84-1.86 3.13-1.88 1.23-.02 2.38.63 3.09.63.7 0 2.13-.78 3.59-.67.61.03 2.35.25 3.46 1.88-.09.06-2.07 1.21-2.02 3.82.03 3.04 2.49 4.05 2.49 4.05z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.84h5.44c-.24 1.38-1.64 4.05-5.44 4.05-3.27 0-5.94-2.7-5.94-6.04S8.73 6 12 6c1.86 0 3.12.78 3.84 1.47l2.61-2.52C17.08 3.52 14.78 2.6 12 2.6 6.92 2.6 2.8 6.7 2.8 12s4.12 9.4 9.2 9.4c5.4 0 8.96-3.79 8.96-9.13 0-.62-.07-1.09-.16-1.56H12z" />
      <path fill="#34A853" d="M3.17 7.35l3.2 2.35C7.33 7.96 9.43 6 12 6c1.86 0 3.12.78 3.84 1.47l2.61-2.52C17.08 3.52 14.78 2.6 12 2.6c-3.64 0-6.73 2.09-8.83 4.75z" />
      <path fill="#4A90E2" d="M12 21.4c2.78 0 5.08-.91 6.79-2.49l-2.49-2.37c-.68.49-1.6.84-2.64.84-3.8 0-5.2-2.67-5.44-4.05H2.8c0 3.34 2.67 6.07 5.94 6.07z" />
      <path fill="#FBBC05" d="M21.96 11.27H12v3.84h5.44c-.26 1.38-1.64 4.05-5.44 4.05-3.27 0-5.94-2.7-5.94-6.04 0-.8.15-1.56.4-2.24H3.17A9.4 9.4 0 002.8 12c0 5.3 4.12 9.4 9.2 9.4 5.4 0 8.96-3.79 8.96-9.13 0-.62-.07-1.09-.16-1.56z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );
}
