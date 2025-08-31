// src/App.tsx
import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";

// ✅ lazy-load all pages
const LandingPage        = lazy(() => import("./pages/LandingPage"));
const NotescapeStartPage = lazy(() => import("./pages/NotescapeStartPage"));
const Signup             = lazy(() => import("./pages/Signup"));
const Login              = lazy(() => import("./pages/Login"));
const ForgotPassword     = lazy(() => import("./pages/ForgotPassword"));
const Classes            = lazy(() => import("./pages/Classes"));
const Pricing            = lazy(() => import("./pages/Pricing"));
const TermsPage          = lazy(() => import("./pages/TermsPage"));
const PrivacyPolicy      = lazy(() => import("./pages/PrivacyPolicy"));
const ContactPage        = lazy(() => import("./pages/ContactPage"));
const Dashboard          = lazy(() => import("./pages/Dashboard"));
const Settings           = lazy(() => import("./pages/Settings"));
const LogoutPage         = lazy(() => import("./pages/Logout"));

function GetStartedGate() {
  const loggedIn = !!localStorage.getItem("auth_token");
  return <Navigate to={loggedIn ? "/classes" : "/signup"} replace />;
}

function NotFound() {
  return (
    <div style={{ padding: 24 }}>
      Page not found. <a href="/">Go home</a>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Reset scroll and zoom correctly when navigating
    window.scrollTo(0, 0);
    document.body.style.zoom = "100%";
    document.body.style.overflow = "auto";
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
        <Routes>
          {/* marketing / auth */}
          <Route path="/"                element={<LandingPage />} />
          <Route path="/start"           element={<NotescapeStartPage />} />
          <Route path="/get-started"     element={<GetStartedGate />} />
          <Route path="/signup"          element={<Signup />} />
          <Route path="/login"           element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/logout"          element={<LogoutPage />} />

          {/* app */}
          <Route path="/classes"   element={<Classes />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings"  element={<Settings />} />

          {/* legal / info */}
          <Route path="/pricing"   element={<Pricing />} />
          <Route path="/terms"     element={<TermsPage />} />
          <Route path="/privacy"   element={<PrivacyPolicy />} />
          <Route path="/support"   element={<ContactPage />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
