import { useEffect, useState } from "react";
import { getHealth, getHello } from "./lib/api";

export default function App() {
  const [health, setHealth] = useState<any>(null);
  const [hello, setHello] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getHealth(), getHello()])
      .then(([h, he]) => {
        setHealth(h);
        setHello(he);
      })
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Notescape — Frontend ↔ Backend check</h1>
      {err && <p style={{color:"crimson"}}>Error: {err}</p>}
      <h3>/health</h3>
      <pre>{JSON.stringify(health, null, 2)}</pre>
      <h3>/hello</h3>
      <pre>{JSON.stringify(hello, null, 2)}</pre>
    </main>
  );
}
