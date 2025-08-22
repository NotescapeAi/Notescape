import "@fontsource/montserrat/400.css"; // normal
import "@fontsource/montserrat/700.css"; // bold
import React from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import Login from "./pages/Login";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PricingPage from "./pages/Pricing";
import ForgotPassword from "./pages/ForgotPassword";
import NotescapeStartPage from "./pages/NotescapeStartPage";
import Dashboard from "./pages/Dashboard";
import LandingPage from "./pages/LandingPage"; 
import TermsPage from "./pages/TermsPage";       // ✅ new import
import PrivacyPage from "./pages/PrivacyPage";   // ✅ new import
import SupportPage from "./pages/ContactPage";   // ✅ new import

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <BrowserRouter>

    <Routes>
      {/* Existing routes */}
      <Route path="/" element={<NotescapeStartPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/get-started" element={<NotescapeStartPage />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/landing" element={<LandingPage />} />

      {/* ✅ New routes */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy-policy" element={<PrivacyPage />} />
      <Route path="/contact" element={<SupportPage />} />
    </Routes>

  </BrowserRouter>
);
