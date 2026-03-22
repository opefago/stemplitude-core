import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  toggleCollapsed: () => void;
  closed: boolean;
  setClosed: (value: boolean | ((prev: boolean) => boolean)) => void;
  openSidebar: () => void;
  closeSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const openSidebar = useCallback(() => {
    setClosed(false);
  }, []);

  const closeSidebar = useCallback(() => {
    setClosed(true);
  }, []);

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      closed,
      setClosed,
      openSidebar,
      closeSidebar,
    }),
    [collapsed, toggleCollapsed, closed, openSidebar, closeSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}

/** Returns null when outside SidebarProvider - use when sidebar may not exist (e.g. PlatformShell) */
export function useSidebarOptional(): SidebarContextValue | null {
  return useContext(SidebarContext);
}
