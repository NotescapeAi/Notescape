import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const scrollContainer = document.getElementById("app-scroll-container");
    const scrollRoot = (
      document.scrollingElement ?? document.documentElement ?? document.body
    ) as HTMLElement | null;

    const scrollToTop = () => {
      scrollRoot?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      scrollContainer?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    if (hash) {
      const id = hash.replace(/^#/, "");
      const target = id ? document.getElementById(id) : null;
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
    }

    scrollToTop();
  }, [pathname, hash]);

  return null;
}
