import { useEffect, useMemo, useState } from "react";
import AppSidebar from "../components/AppSidebar";
import TopBar from "../components/TopBar";
import { LayoutContext, type SidebarState } from "./LayoutContext";

type Props = {
  title: string;
  breadcrumbs?: string[];
  subtitle?: string;
  showGreeting?: boolean;
  backLabel?: string;
  backTo?: string;
  backState?: Record<string, unknown>;
  children: React.ReactNode;
};

export default function AppShell({
  title,
  breadcrumbs,
  subtitle,
  showGreeting,
  backLabel,
  backTo,
  backState,
  children,
}: Props) {
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

  const layout = useMemo(
    () => ({
      sidebar: (collapsed ? "collapsed" : "expanded") as SidebarState,
      setSidebar: (next: SidebarState) => {
        const shouldCollapse = next === "collapsed";
        setCollapsed(shouldCollapse);
        window.localStorage.setItem("notescape.sidebar.collapsed", shouldCollapse ? "1" : "0");
      },
    }),
    [collapsed]
  );

  return (
    <LayoutContext.Provider value={layout}>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <AppSidebar collapsed={collapsed} onToggle={handleToggle} />
        <div
          className="min-h-screen px-4 py-5 transition-[margin-left] duration-200 ease-in-out lg:px-6"
          style={{ marginLeft: collapsed ? "76px" : "260px" }}
        >
          <div className="flex min-w-0 flex-col gap-6">
            <TopBar
              title={title}
              breadcrumbs={breadcrumbs}
              subtitle={subtitle}
              showGreeting={showGreeting}
              backLabel={backLabel}
              backTo={backTo}
              backState={backState}
            />
            <main className="flex-1">{children}</main>
          </div>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
