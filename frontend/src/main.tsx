import "@fontsource/montserrat/400.css"; // normal
import "@fontsource/montserrat/700.css"; // bold
import React from "react";
import Login from "./pages/Login";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PricingPage from "./pages/Pricing";
import NotescapeStartPage from "./pages/NotescapeStartPage"; // <-- import your start page

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <BrowserRouter>
    <Routes>
      {/* Home route */}
      <Route path="/" element={<NotescapeStartPage />} />
      <Route path="/login" element={<Login />} />
      {/* Pricing route */}
      <Route path="/pricing" element={<PricingPage />} />
    </Routes>
  </BrowserRouter>
);
