// src/App.tsx
import React, { Suspense, lazy, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

// lazy-load pages (your originals)
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
const FlashcardsPage     = lazy(() => import("./pages/FlashcardsPage"));
const Profile            = lazy(() => import("./pages/Profile"));

// ⚠️ these two routes must exist for the menu navigation to show a new UI
const FlashcardsViewMode  = lazy(() => import("./pages/FlashcardsViewMode"));
const FlashcardsStudyMode = lazy(() => import("./pages/FlashcardsStudyMode"));
const FlashcardsBookmarks = lazy(() => import("./pages/FlashcardsBookmarks"));

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
    window.scrollTo(0, 0);
    document.body.style.zoom = "100%";
    document.body.style.overflow = "auto";
  }, [pathname]);
  return null;
}

/**
 * IMPORTANT:
 * Wrap Routes in a component that reads `location` and keys by pathname.
 * This guarantees React mounts the correct element when you navigate
 * from /flashcards → /flashcards/view or /flashcards/study so you don't get
 * the “URL changes but same UI” problem.
 */
function AppRoutes() {
  const location = useLocation();

  return (
    // Key the switch by the current path to force a new tree when route changes.
    <Routes location={location} key={location.pathname}>
      {/* marketing / auth */}
      <Route path="/"                element={<LandingPage />} />
      <Route path="/start"           element={<NotescapeStartPage />} />
      <Route path="/get-started"     element={<GetStartedGate />} />
      <Route path="/signup"          element={<Signup />} />
      <Route path="/login"           element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/logout"          element={<LogoutPage />} />

      {/* app */}
      <Route path="/classes" element={<Classes />} />

      {/* Put the specific routes FIRST (good practice, though v6 matches exactly) */}
      <Route path="/classes/:classId/flashcards/view"      element={<FlashcardsViewMode />} />
      <Route path="/classes/:classId/flashcards/study"     element={<FlashcardsStudyMode />} />
      <Route path="/classes/:classId/flashcards/bookmarks" element={<FlashcardsBookmarks />} />
      <Route path="/classes/:classId/flashcards"           element={<FlashcardsPage />} />

      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/settings"  element={<Settings />} />

      {/* legal / info */}
      <Route path="/pricing"   element={<Pricing />} />
      <Route path="/terms"     element={<TermsPage />} />
      <Route path="/privacy"   element={<PrivacyPolicy />} />
      <Route path="/support"   element={<ContactPage />} />
      <Route path="/profile"   element={<Profile />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    // ✅ Make sure there is exactly ONE BrowserRouter in the whole app.
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  );
}
