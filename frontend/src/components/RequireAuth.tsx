// src/components/RequireAuth.tsx
import { Navigate, useLocation } from "react-router-dom";
import { isLoggedIn } from "../lib/api";

export default function RequireAuth({ children }: { children: JSX.Element }) {
  const loc = useLocation();
  return isLoggedIn() ? children : <Navigate to="/login" state={{ from: loc }} replace />;
}
