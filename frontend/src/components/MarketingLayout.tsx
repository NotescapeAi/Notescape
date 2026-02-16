import React from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";

type MarketingLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

export default function MarketingLayout({ children, className = "" }: MarketingLayoutProps) {
  const rootClass = `${className}`.trim();
  return (
    <>
      <Navbar />
      <div className={rootClass || undefined}>
        {children}
        <Footer />
      </div>
    </>
  );
}
