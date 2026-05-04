// frontend/src/pages/Pricing.tsx
import React from "react";
import { motion } from "framer-motion"; 
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/700.css";
import "./pricing.css";
import MarketingLayout from "../components/MarketingLayout";


export default function Pricing() {
  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    alert("Thanks! We’ll let you know.");
  };

  return (
    <MarketingLayout className="pricing-root">
      <main className="pricing-hero">
        <div className="container">
          <div className="pricing-card">
            <motion.header
              className="eyebrow"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              Notescape
            </motion.header>

            <motion.h1
              className="title"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              Pricing
            </motion.h1>

            <motion.p
              className="subtitle"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              Paid tiers are not live yet. Join the waitlist and we will email you when subscriptions and pricing are available.
            </motion.p>

            <motion.form
              className="waitlist"
              onSubmit={onSubmit}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.6 }}
            >
              <input
                type="email"
                name="email"
                required
                placeholder="Enter your email"
                className="input"
                autoComplete="email"
              />
              <button type="submit" className="btn">
                Notify Me
              </button>
            </motion.form>
          </div>
        </div>
      </main>
    </MarketingLayout>
  );
}
