import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Reset browser scroll
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto", // ✅ valid value
    });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
