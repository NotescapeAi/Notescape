import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    // 1. Disable browser's default scroll restoration to avoid conflict
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // 2. Identify all possible scroll containers
    // Some layouts might scroll 'body', others might scroll '#app-scroll-container'
    // or 'html'. We reset them all to be safe.
    const scrollContainer = document.getElementById("app-scroll-container");
    const docElement = document.documentElement;
    const body = document.body;

    const scrollToTop = () => {
      // Force instant scroll to top
      window.scrollTo(0, 0);
      
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
      if (docElement) {
        docElement.scrollTop = 0;
      }
      if (body) {
        body.scrollTop = 0;
      }
    };

    // 3. Execute scroll reset immediately
    scrollToTop();

    // 4. Also execute in the next animation frame to handle cases where 
    // content might resize or layout shifts after initial render (e.g. Suspense fallback)
    requestAnimationFrame(() => {
        scrollToTop();
    });

  }, [pathname]); // Run whenever the route path changes

  return null;
}
