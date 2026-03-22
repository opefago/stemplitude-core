import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useUIMode, type UIMode } from "./UIModeProvider";

interface ThemeContextValue {
  mode: UIMode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { mode } = useUIMode();

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-mode", mode);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(() => ({ mode }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
