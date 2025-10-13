// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { initUserId } from "./lib/auth"; // ✅ correct import

// Ensure user_id exists before the app renders
initUserId(); // ✅ correct call

console.log("User ID:", localStorage.getItem("user_id"));
alert("Your user_id is: " + localStorage.getItem("user_id"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);