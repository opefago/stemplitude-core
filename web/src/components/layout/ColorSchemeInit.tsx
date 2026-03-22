import type { ReactNode } from "react";
import { useColorScheme } from "../../hooks/useColorScheme";

/**
 * Initializes color scheme by running useColorScheme at app root.
 * Ensures data-color-scheme is set on document.documentElement.
 */
export function ColorSchemeInit({ children }: { children: ReactNode }) {
  useColorScheme();
  return <>{children}</>;
}
