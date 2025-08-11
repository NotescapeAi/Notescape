const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function getHealth() {
  const r = await fetch(`${API}/health`);
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

export async function getHello() {
  const r = await fetch(`${API}/hello`);
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}
