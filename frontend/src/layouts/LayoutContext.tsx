import { createContext, useContext } from "react";

export type SidebarState = "expanded" | "collapsed";

export type LayoutState = {
  sidebar: SidebarState;
  setSidebar: (next: SidebarState) => void;
};

export const LayoutContext = createContext<LayoutState | null>(null);

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) {
    throw new Error("useLayout must be used within LayoutContext.Provider");
  }
  return ctx;
}
