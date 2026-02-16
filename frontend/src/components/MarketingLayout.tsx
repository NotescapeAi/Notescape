import React from "react";
import PublicLayout from "../layouts/PublicLayout";

type MarketingLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

export default function MarketingLayout({ children, className = "" }: MarketingLayoutProps) {
  return (
    <PublicLayout className={className}>
      {children}
    </PublicLayout>
  );
}
