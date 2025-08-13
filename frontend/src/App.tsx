import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import NotescapeStartPage from "./pages/NotescapeStartPage";

export default function App() {
  return (
    <BrowserRouter>
      <main style={{ padding: 32, fontFamily: "Inter, system-ui, sans-serif" }}>
        <h1>Notescape — Frontend ↔ Backend check</h1>
        <p>
          Try <a href="/pricing">/pricing</a>
        </p>

        <Routes>
          <Route path="/" element={<NotescapeStartPage />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
