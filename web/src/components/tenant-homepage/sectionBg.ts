import type { CSSProperties } from "react";

export interface BgSettings {
  color?: string;
  gradient?: string;
  image_url?: string;
  overlay?: number;
}

export function getBgFromContent(content: Record<string, unknown>): BgSettings {
  const raw = content._bg;
  if (raw && typeof raw === "object") return raw as BgSettings;
  return {};
}

/**
 * Build a CSSProperties object from _bg settings.
 * Priority: image (with overlay) > gradient > solid color > fallbackColor.
 */
export function sectionBgStyle(
  bg: BgSettings,
  fallbackColor?: string,
): CSSProperties {
  if (bg.image_url) {
    const ov = bg.overlay ?? 0.4;
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,${ov}), rgba(0,0,0,${ov})), url(${bg.image_url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "transparent",
    };
  }
  if (bg.gradient) {
    return { backgroundImage: bg.gradient, backgroundColor: "transparent" };
  }
  const color = bg.color || fallbackColor;
  return color ? { backgroundColor: color, backgroundImage: "none" } : {};
}

/**
 * Extract CTA button style overrides from content._styles.cta_btn
 */
export function getCtaBtnStyle(content: Record<string, unknown>): CSSProperties {
  const styles = content._styles as Record<string, Record<string, string>> | undefined;
  const btn = styles?.cta_btn;
  if (!btn) return {};
  const result: CSSProperties = {};
  if (btn.backgroundColor) result.background = btn.backgroundColor;
  if (btn.color) result.color = btn.color;
  if (btn.borderRadius) result.borderRadius = btn.borderRadius;
  if (btn.paddingV || btn.paddingH) {
    result.padding = `${btn.paddingV || "12px"} ${btn.paddingH || "28px"}`;
  }
  return result;
}
