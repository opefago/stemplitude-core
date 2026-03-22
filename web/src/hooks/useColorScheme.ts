import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "color-scheme";

export type ColorScheme = "light" | "dark";

export type ColorSchemePreference = "light" | "dark" | "system";

function getSystemPreference(): ColorScheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredPreference(): ColorSchemePreference | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return null;
}

function getResolvedScheme(): ColorScheme {
  const stored = getStoredPreference();
  if (stored === "light" || stored === "dark") return stored;
  return getSystemPreference();
}

function applyScheme(scheme: ColorScheme) {
  document.documentElement.setAttribute("data-color-scheme", scheme);
}

export function useColorScheme() {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(getResolvedScheme);
  const [preference, setPreferenceState] = useState<ColorSchemePreference>(
    () => getStoredPreference() ?? "system"
  );

  useEffect(() => {
    applyScheme(colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    const stored = getStoredPreference();
    if (!stored) {
      const system = getSystemPreference();
      setColorSchemeState(system);
      applyScheme(system);
      setPreferenceState("system");
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const stored = getStoredPreference();
      if (stored === "system" || !stored) {
        const system = getSystemPreference();
        setColorSchemeState(system);
        applyScheme(system);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setColorScheme = useCallback((value: ColorSchemePreference) => {
    setPreferenceState(value);
    if (value === "system") {
      localStorage.setItem(STORAGE_KEY, "system");
      const resolved = getSystemPreference();
      setColorSchemeState(resolved);
      applyScheme(resolved);
    } else {
      setColorSchemeState(value);
      localStorage.setItem(STORAGE_KEY, value);
      applyScheme(value);
    }
  }, []);

  const toggleColorScheme = useCallback(() => {
    const next = colorScheme === "light" ? "dark" : "light";
    setColorScheme(next);
  }, [colorScheme, setColorScheme]);

  return {
    colorScheme,
    preference,
    toggleColorScheme,
    setColorScheme,
  };
}
