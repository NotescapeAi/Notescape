import "@fontsource/montserrat/400.css"; // normal
import "@fontsource/montserrat/700.css"; // bold
import React from "react";
import Login from "./pages/Login";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PricingPage from "./pages/Pricing";
import ForgotPassword from "./pages/ForgotPassword";
import NotescapeStartPage from "./pages/NotescapeStartPage"; // <-- import your start page
import Dashboard from "./pages/Dashboard";
const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <BrowserRouter>
    <Routes>
      {/* Home route */}
      <Route path="/" element={<NotescapeStartPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/get-started" element={<NotescapeStartPage />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/dashboard" element={<Dashboard />} />
      {/* Pricing route */}
      <Route path="/pricing" element={<PricingPage />} />
    </Routes>
  </BrowserRouter>
);
