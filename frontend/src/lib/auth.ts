export function initUserId() {
  const KEY = "user_id";
  let u = localStorage.getItem(KEY);
  if (!u || !u.trim()) {
    // Make one and save it once
    if (!("randomUUID" in crypto)) {
      // small fallback if very old browser
      const rnd = () => Math.random().toString(16).slice(2);
      u = `u-${rnd()}-${rnd()}-${Date.now().toString(16)}`;
    } else {
      u = crypto.randomUUID();
    }
    localStorage.setItem(KEY, u);
  }
  return u;
}