import "@fontsource/montserrat/400.css"; // normal
import "@fontsource/montserrat/700.css"; // bold
import React from "react";

import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PricingPage from "./pages/Pricing";

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <BrowserRouter>
    <Routes>
      {/* ...other routes */}
      <Route path="/pricing" element={<PricingPage />} />
    </Routes>
  </BrowserRouter>
);
