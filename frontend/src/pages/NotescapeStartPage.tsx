import React from "react";
import { useNavigate } from "react-router-dom";
import "./NotescapeStartPage.css";

export default function NotescapeStartPage() {
  const navigate = useNavigate();

  const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
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

  const handleEmailClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // show ripple
    handleRipple(e);

    // wait a bit so ripple animation is visible, then navigate
    setTimeout(() => {
      navigate("/login");
    }, 220); // adjust delay to match ripple duration (ms)
  };

  return (
    <main className="page">
      <header className="logo">
  <img src="/logo1.png" alt="Notescape logo" width={70} height={50} />
  <h1>Notescape</h1>
</header>


      <section className="login-container" role="region" aria-label="Get Started">
        <h2 className="login-title">Get Started</h2>

        <button className="social-btn" onClick={() => console.log("Apple Sign In")}>
          <img src="/apple.svg" alt="Apple logo" className="icon" width={18} height={18} />
          Continue with Apple
        </button>

        {/* Google Sign In */}
        <button className="social-btn" onClick={() => console.log("Google Sign In")}>
          <img src="/google.svg" alt="Google logo" className="icon" width={18} height={18}  />
          Continue with Google
        </button>

        <div className="divider" role="separator" aria-label="or">
          <span />
          <p>OR</p>
          <span />
        </div>

        <button className="login-btn" onClick={handleEmailClick} aria-label="Continue with email">
          <span className="btn-inner">
            <MailIcon />
            Continue with e-mail
          </span>
        </button>

       
      </section>
    </main>
  );
}

/* ---------- Icons ---------- */


function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );
}
