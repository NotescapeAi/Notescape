import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
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
  headerMaxWidthClassName?: string;
  headerActions?: React.ReactNode;
  contentGapClassName?: string;
  contentOverflowClassName?: string;
  contentHeightClassName?: string;
  mainClassName?: string;
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
  headerMaxWidthClassName = "max-w-none",
  headerActions,
  contentGapClassName = "gap-8",
  contentOverflowClassName = "overflow-y-auto",
  contentHeightClassName = "min-h-full",
  mainClassName = "",
  children,
}: Props) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("notescape.sidebar.collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

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
      mobileNavOpen,
      setMobileNavOpen,
    }),
    [collapsed, mobileNavOpen]
  );

  return (
    <LayoutContext.Provider value={layout}>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-page)] text-[var(--text)]">
        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-[var(--overlay)] backdrop-blur-[2px] transition-opacity lg:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}
        <AppSidebar
          collapsed={collapsed}
          onToggle={handleToggle}
          mobileOpen={mobileNavOpen}
          onNavigate={() => setMobileNavOpen(false)}
        />
        <div
          className={`min-w-0 flex-1 overflow-x-hidden px-4 py-5 transition-[margin-left] duration-200 ease-in-out sm:px-5 lg:px-7 lg:py-6 ${collapsed ? "lg:ml-[80px]" : "lg:ml-[244px]"} ml-0 ${contentOverflowClassName}`}
        >
          <div className={`flex min-w-0 flex-col ${contentHeightClassName} ${contentGapClassName}`}>
            <div className={`mx-auto w-full ${headerMaxWidthClassName}`}>
              <TopBar
                title={title}
                breadcrumbs={breadcrumbs}
                subtitle={subtitle}
                showGreeting={showGreeting}
                backLabel={backLabel}
                backTo={backTo}
                backState={backState}
                headerActions={headerActions}
                onOpenMobileNav={() => setMobileNavOpen(true)}
              />
            </div>
            <main className={`flex-1 min-w-0 ${mainClassName}`}>{children}</main>
          </div>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
