// frontend/src/pages/Pricing.tsx
import React from "react";
import { motion } from "framer-motion"; 
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
    <div>
      <Navbar />

      <main className="pricing-hero">
        <div className="container">
          {/* Eyebrow */}
          <motion.header
            className="eyebrow"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            New features coming soon
          </motion.header>

          {/* Title */}
          <motion.h1
            className="title text-purple-700"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Pricing Plans
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="subtitle"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Designed for learners, built for clarity — transparent pricing coming soon.
          </motion.p>

          {/* Form */}
          <motion.form
            className="waitlist"
            onSubmit={onSubmit}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.6 }}
          >
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
          </motion.form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
