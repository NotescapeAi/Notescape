// frontend/src/pages/Pricing.tsx
import React from "react";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/700.css";
import "./pricing.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function Pricing() {
  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    alert("Thanks! We’ll let you know.");
  };

  return (
    <div >
      {/* --- Navbar --- */}
      <Navbar />

      {/* --- Main Content --- */}
      <main className="pricing-hero flex flex-col items-center text-center flex-grow">
        <div className="container space-y-6 max-w-5xl">
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

      {/* --- Footer --- */}
      <Footer />
    </div>
  );
}
