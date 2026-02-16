import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../lib/api";

export default function LogoutPage() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      try { await logout(); } finally { navigate("/login", { replace: true }); }
    })();
  }, [navigate]);
  return null; // nothing to render
}
