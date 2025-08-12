// frontend/src/pages/Pricing.tsx
import React from "react";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/700.css";
import "./pricing.css";

export default function Pricing() {
  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    alert("Thanks! We’ll let you know.");
  };

  return (
    <div className="font-montserrat text-gray-900">
      <main className="pricing-hero flex flex-col items-center text-center px-4">
        <div className="container max-w-2xl space-y-6">
          <header className="eyebrow">New features coming soon</header>

          <h1 className="title">Pricing Plans</h1>

          <p className="subtitle">
            Designed for learners, built for clarity — transparent pricing coming soon.
          </p>

          <form className="waitlist" onSubmit={onSubmit}>
            <input
              type="email"
              name="email"
              required
              placeholder="Enter your email"
              className="input"
            />
            <button type="submit" className="btn">
              Notify Me
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
