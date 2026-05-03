import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../firebase/firebase";

export default function RequireAuth({
  children,
  requireEmailVerified = true,
}: {
  children: React.ReactNode;
  requireEmailVerified?: boolean;
}) {
  const loc = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const devAuthBypass =
    import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === "true";

  useEffect(() => {
    if (devAuthBypass) {
      setReady(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => unsub();
  }, [devAuthBypass]);

  if (!ready) return <div style={{ padding: 24 }}>Loading…</div>;
  if (devAuthBypass) return <>{children}</>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (requireEmailVerified && !user.emailVerified) {
    return <Navigate to="/verify-email" state={{ from: loc }} replace />;
  }
  return <>{children}</>;
}
