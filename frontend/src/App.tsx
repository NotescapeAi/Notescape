// src/App.tsx

import React, { Suspense, lazy, useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase/firebase";

import RequireAuth from "./components/RequireAuth";
import ScrollToTop from "./components/ScrollToTop";
import { UserProvider } from "./hooks/useUser";
import { ThemeProvider } from "./hooks/useTheme";

/* =========================
   Lazy-loaded Pages
========================= */

const LandingPage        = lazy(() => import("./pages/LandingPage"));
const NotescapeStartPage = lazy(() => import("./pages/NotescapeStartPage"));
const Signup             = lazy(() => import("./pages/Signup"));
const Login              = lazy(() => import("./pages/Login"));
const ForgotPassword     = lazy(() => import("./pages/ForgotPassword"));
const LogoutPage         = lazy(() => import("./pages/Logout"));

const Classes            = lazy(() => import("./pages/Classes"));
const Dashboard          = lazy(() => import("./pages/Dashboard"));
const Settings           = lazy(() => import("./pages/Settings"));
const Profile            = lazy(() => import("./pages/Profile"));
const Chatbot            = lazy(() => import("./pages/Chatbot"));

const FlashcardsPage     = lazy(() => import("./pages/FlashcardsPage"));
const FlashcardsHub      = lazy(() => import("./pages/FlashcardsHub"));
const FlashcardsViewMode = lazy(() => import("./pages/FlashcardsViewMode"));
const FlashcardsStudyMode = lazy(() => import("./pages/FlashcardsStudyMode"));
const FlashcardsBookmarks = lazy(() => import("./pages/FlashcardsBookmarks"));

const Pricing            = lazy(() => import("./pages/Pricing"));
const TermsPage          = lazy(() => import("./pages/TermsPage"));
const PrivacyPolicy      = lazy(() => import("./pages/PrivacyPolicy"));
const ContactPage        = lazy(() => import("./pages/ContactPage"));
const VerifyEmail        = lazy(() => import("./pages/VerifyEmail"));



const QuizzesPage = lazy(() => import("./pages/quizzes/QuizzesPage"));
const QuizAttemptPage = lazy(() => import("./pages/quizzes/QuizAttemptPage"));


function GetStartedGate() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!ready) return <div style={{ padding: 24 }}>Loading</div>;
  if (user) {
    if (!user.emailVerified) {
      return <Navigate to="/verify-email" replace />;
    }
    return <Navigate to="/classes" replace />;
  }
  return <Navigate to="/signup" replace />;
}

function NotFound() {
  return (
    <div style={{ padding: 24 }}>
      Page not found. <a href="/">Go home</a>
    </div>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div id="app-scroll-container" className="app-content">
        {children}
      </div>
    </div>
  );
}

/* =========================
   Routes
========================= */

function AppRoutes() {
  const location = useLocation();

  return (
    <Routes location={location} key={location.pathname}>
      {/* Marketing / Auth */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/start" element={<NotescapeStartPage />} />
      <Route path="/get-started" element={<GetStartedGate />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email"  element={<RequireAuth requireEmailVerified={false}><VerifyEmail /></RequireAuth>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/logout" element={<LogoutPage />} />

      {/* App (Protected) */}
      <Route
        path="/classes"
        element={
          <RequireAuth>
            <Classes />
          </RequireAuth>
        }
      />

      <Route
        path="/classes/:classId/flashcards/view"
        element={
          <RequireAuth>
            <FlashcardsViewMode />
          </RequireAuth>
        }
      />
      <Route
        path="/classes/:classId/flashcards/study"
        element={
          <RequireAuth>
            <FlashcardsStudyMode />
          </RequireAuth>
        }
      />
      <Route
        path="/classes/:classId/flashcards/bookmarks"
        element={
          <RequireAuth>
            <FlashcardsBookmarks />
          </RequireAuth>
        }
      />
      <Route
        path="/classes/:classId/flashcards"
        element={
          <RequireAuth>
            <FlashcardsPage />
          </RequireAuth>
        }
      />


      <Route path="/quizzes" element={<RequireAuth><QuizzesPage /></RequireAuth>} />
      <Route path="/quizzes/:quizId" element={<RequireAuth><QuizAttemptPage /></RequireAuth>} />

      <Route
        path="/flashcards"
        element={
          <RequireAuth>
            <FlashcardsHub />
          </RequireAuth>
        }
      />


      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <Settings />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Profile />
          </RequireAuth>
        }
      />
      <Route
        path="/chatbot"
        element={
          <RequireAuth>
            <Chatbot />
          </RequireAuth>
        }
      />

      {/* Legal / Info */}
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/support" element={<ContactPage />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/* =========================
   App Root
========================= */

export default function App() {
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  return (
    <ThemeProvider>
      <UserProvider>
        <BrowserRouter>
          <ScrollToTop />
          <AppLayout>
            <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
              <AppRoutes />
            </Suspense>
          </AppLayout>
        </BrowserRouter>
      </UserProvider>
    </ThemeProvider>
  );
}
