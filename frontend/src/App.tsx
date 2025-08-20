import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import NotescapeStartPage from "./pages/NotescapeStartPage";

// Landing + extra pages
import LandingPage from "./pages/LandingPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import SupportPage from "./pages/ContactPage";

function App() {
  return (
    <Router>
      <main style={{ padding: 32, fontFamily: "Inter, system-ui, sans-serif" }}>
        <h1>Notescape — Frontend ↔ Backend check</h1>
        <p>
          Try <a href="/pricing">/pricing</a>
        </p>

        <Routes>
          {/* Existing routes */}
          <Route path="/" element={<NotescapeStartPage />} />
          <Route path="/login" element={<Login />} />

          {/* New routes */}
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/support" element={<SupportPage />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
