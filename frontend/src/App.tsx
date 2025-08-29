// src/App.tsx
import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Settings from "./pages/Settings";
import LogoutPage from "./pages/Logout";
import LandingPage from "./pages/LandingPage";

// ⬇️ lazy-load all your pages

const NotescapeStartPage  = lazy(() => import("./pages/NotescapeStartPage"));
const Signup              = lazy(() => import("./pages/Signup"));          // make sure this file exists
const Login               = lazy(() => import("./pages/Login"));
const ForgotPassword      = lazy(() => import("./pages/ForgotPassword"));
const Classes             = lazy(() => import("./pages/Classes"));
const Pricing             = lazy(() => import("./pages/Pricing"));
const TermsPage           = lazy(() => import("./pages/TermsPage"));
const PrivacyPolicy       = lazy(() => import("./pages/PrivacyPolicy"));   // pick this as canonical
const ContactPage         = lazy(() => import("./pages/ContactPage"));
const Dashboard           = lazy(() => import("./pages/Dashboard"));

function GetStartedGate() {
  const loggedIn = !!localStorage.getItem("auth_token"); // swap with real auth later
  return <Navigate to={loggedIn ? "/classes" : "/signup"} replace />;
}

function NotFound() {
  return (
    <div style={{ padding: 24 }}>
      Page not found. <a href="/">Go home</a>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
        <Routes>
          {/* marketing / auth */}
          <Route path="/"               element={<LandingPage />} />
          
          <Route path="/start"          element={<NotescapeStartPage />} />
          <Route path="/get-started"    element={<GetStartedGate />} />
          <Route path="/signup"         element={<Signup />} />
          <Route path="/login"          element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/logout" element={<LogoutPage />} />
          {/* app */}
            <Route path="/classes"        element={<Classes />} />
            <Route
            path="/dashboard"
            element={<Dashboard />}/>
            <Route
            path="/settings"
            element={<Settings />}
          />
                    {/* legal / info */}
          <Route path="/pricing"        element={<Pricing />} />
          <Route path="/terms"          element={<TermsPage />} />
          <Route path="/privacy"        element={<PrivacyPolicy />} />
          <Route path="/support"        element={<ContactPage />} />
          {/*<Route path="/support"        element={<Navigate to="/contact" replace />} />
          {/* 404 */}
          <Route path="*"               element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
