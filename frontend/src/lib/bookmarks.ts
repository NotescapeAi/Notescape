/// src/lib/bookmarks.ts
import { useEffect, useMemo, useState } from "react";

const KEY = "notescape.bookmarks";
const EVT = "notescape:bookmarks"; // NEW: broadcast so all components re-sync

export default function useBookmarks() {
  const [map, setMap] = useState<Record<string, boolean>>({});

  // initial load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMap(JSON.parse(raw));
    } catch {}
  }, []);

  // persist + broadcast
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
    } catch {}
    // notify other hook instances (same tab)
    window.dispatchEvent(new Event(EVT));
  }, [map]);

  // listen for changes from other components/tabs
  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem(KEY);
        setMap(raw ? JSON.parse(raw) : {});
      } catch {}
    };
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const api = useMemo(
    () => ({
      isBookmarked: (id: string | number) => !!map[String(id)],
      toggle: (id: string | number) =>
        setMap((m) => ({ ...m, [String(id)]: !m[String(id)] })),
      set: (id: string | number, val: boolean) =>
        setMap((m) => ({ ...m, [String(id)]: val })),
      clearAll: () => setMap({}),
    }),
    [map]
  );

  return api;
}