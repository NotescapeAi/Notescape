import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebase";
import { signOut, deleteUser } from "firebase/auth";
import "./NotescapeStartPage.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // Logout handler
  const handleLogout = async (): Promise<void> => {
    setError("");
    setLoading(true);
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err: unknown) {
      console.error(
        "Logout error:",
        err instanceof Error ? err.message : String(err)
      );
      setError("Failed to logout. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // Delete account handler
  const handleDeleteAccount = async (): Promise<void> => {
    setError("");
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setError("No user found. Please log in again.");
        return;
      }

      await deleteUser(user);
      console.log("Account deleted successfully");
      navigate("/signup");
    } catch (err: unknown) {
      console.error(
        "Delete account error:",
        err instanceof Error ? err.message : String(err)
      );

      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "auth/requires-recent-login"
      ) {
        setError("Please log out and log in again before deleting your account.");
      } else {
        setError("Failed to delete account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <header className="logo">
        <img src="/logo1.png" alt="Notescape logo" width={70} height={50} />
        <h1>Dashboard</h1>
      </header>

      <div className="login-container">
        {error && <p className="error">{error}</p>}

        <button
          className="login-btn"
          onClick={handleLogout}
          disabled={loading}
        >
          {loading ? "Logging out..." : "Logout"}
        </button>

        <button
          className="login-btn delete-btn"
          onClick={handleDeleteAccount}
          disabled={loading}
        >
          {loading ? "Deleting..." : "Delete Account"}
        </button>
      </div>
    </main>
  );
}
