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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!ready) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (requireEmailVerified && !user.emailVerified) {
    return <Navigate to="/verify-email" state={{ from: loc }} replace />;
  }
  return <>{children}</>;
}
