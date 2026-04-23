import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logout as apiLogout } from "../lib/api";
import { logout as firebaseLogout } from "../firebase/firebaseAuth";

export default function LogoutPage() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      try {
        await apiLogout().catch(() => undefined);
        await firebaseLogout().catch(() => undefined);
      } finally {
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate]);
  return null; // nothing to render
}
