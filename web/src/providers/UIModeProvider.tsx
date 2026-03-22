import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UIMode = "kids" | "explorer" | "pro";
export type UIModeSource = "student" | "tenant" | "age" | "default";

interface UIModeContextValue {
  mode: UIMode;
  source: UIModeSource;
  setMode: (mode: UIMode, source?: UIModeSource) => void;
}

const UIModeContext = createContext<UIModeContextValue>({
  mode: "pro",
  source: "default",
  setMode: () => {},
});

const CSS_VARS: Record<UIMode, Record<string, string>> = {
  kids: {
    "--ui-font-scale": "1.25",
    "--ui-radius": "1.5rem",
    "--ui-spacing": "1.5rem",
    "--ui-grid-cols": "2",
    "--ui-nav-type": "bottom",
    "--ui-icon-size": "2rem",
    "--ui-primary": "#FF6B6B",
    "--ui-secondary": "#4ECDC4",
    "--ui-accent": "#FFE66D",
    "--ui-surface": "#FFF9F0",
  },
  explorer: {
    "--ui-font-scale": "1.1",
    "--ui-radius": "0.75rem",
    "--ui-spacing": "1.25rem",
    "--ui-grid-cols": "3",
    "--ui-nav-type": "sidebar",
    "--ui-icon-size": "1.5rem",
    "--ui-primary": "#6C5CE7",
    "--ui-secondary": "#00CEC9",
    "--ui-accent": "#FDCB6E",
    "--ui-surface": "#F8F9FA",
  },
  pro: {
    "--ui-font-scale": "1",
    "--ui-radius": "0.5rem",
    "--ui-spacing": "1rem",
    "--ui-grid-cols": "4",
    "--ui-nav-type": "sidebar-compact",
    "--ui-icon-size": "1.25rem",
    "--ui-primary": "#2D3436",
    "--ui-secondary": "#0984E3",
    "--ui-accent": "#00B894",
    "--ui-surface": "#FFFFFF",
  },
};

function applyThemeVars(mode: UIMode) {
  const root = document.documentElement;
  const vars = CSS_VARS[mode];
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  root.dataset.uiMode = mode;
}

interface UIModeProviderProps {
  children: ReactNode;
  initialMode?: UIMode;
  initialSource?: UIModeSource;
}

export function UIModeProvider({
  children,
  initialMode = "pro",
  initialSource = "default",
}: UIModeProviderProps) {
  const [mode, setModeState] = useState<UIMode>(initialMode);
  const [source, setSource] = useState<UIModeSource>(initialSource);

  useEffect(() => {
    applyThemeVars(mode);
  }, [mode]);

  const value = useMemo<UIModeContextValue>(
    () => ({
      mode,
      source,
      setMode: (newMode: UIMode, newSource: UIModeSource = "default") => {
        setModeState(newMode);
        setSource(newSource);
      },
    }),
    [mode, source],
  );

  return <UIModeContext.Provider value={value}>{children}</UIModeContext.Provider>;
}

export function useUIMode() {
  const ctx = useContext(UIModeContext);
  if (!ctx) {
    throw new Error("useUIMode must be used within a UIModeProvider");
  }
  return ctx;
}
