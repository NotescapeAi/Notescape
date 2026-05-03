import { useEffect, useState } from "react";
import AppSidebar from "../components/AppSidebar";

type Props = { children: React.ReactNode };

export default function DashboardShell({ children }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("notescape.sidebar.collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("notescape.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text)]">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex">
          <AppSidebar collapsed={collapsed} onToggle={handleToggle} />
          <main className={`min-w-0 flex-1 overflow-x-hidden p-6 transition-[margin-left] duration-200 sm:p-8 lg:p-8 ${collapsed ? "lg:ml-[80px]" : "lg:ml-[244px]"} ml-0`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
