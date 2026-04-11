/**
 * IEC LED (Diode-COM-LED.svg) from chris-pikul/electronic-symbols (MIT).
 * viewBox 0 0 150 150 — use pivot (75,75) and scale 0.4 with anode/cathode at x=0 / x=150.
 */

import type { Graphics } from "pixi.js";
import { GraphicsPath, parseSVGPath } from "pixi.js";

const LINE = {
  width: 12,
  color: 0xffffff,
  cap: "round" as const,
  join: "round" as const,
};

/** Main diode + leads + emission guide stroke */
const MAIN_D =
  "m100 75-50 31.25v-62.5L100 75zm0-34.25v68.5M50 75H0m100 0h50m-50-43.75 18.75-18.75";
const RAY_GUIDE_D = "m118.75 50 18.75-18.75";
const ARROW_HEAD_1_D =
  "m122.49 19.34 3.87-14.45-14.45 3.87 10.58 10.58z";
const ARROW_HEAD_2_D =
  "m141.24 38.09 3.87-14.45-14.45 3.87 10.58 10.58z";

function strokePathD(
  g: Graphics,
  d: string,
  style: typeof LINE | { width: number; color: number; cap: "round"; join: "round" }
): void {
  const gp = new GraphicsPath();
  parseSVGPath(d, gp);
  g.path(gp);
  g.stroke(style);
}

function fillPathD(
  g: Graphics,
  d: string,
  color: number,
  alpha: number = 1
): void {
  const gp = new GraphicsPath();
  parseSVGPath(d, gp);
  g.path(gp);
  g.fill({ color, alpha });
}

export function drawLedIEC(
  g: Graphics,
  opts: {
    /** Fill for photon arrowheads (off / dim / on). */
    arrowFill: number;
    arrowAlpha?: number;
    burnt?: boolean;
  }
): void {
  const strokeStyle = opts.burnt
    ? { ...LINE, color: 0xff6666 as number }
    : LINE;
  strokePathD(g, MAIN_D, strokeStyle);
  strokePathD(g, RAY_GUIDE_D, strokeStyle);

  const a = opts.arrowAlpha ?? 1;
  fillPathD(g, ARROW_HEAD_1_D, opts.arrowFill, a);
  fillPathD(g, ARROW_HEAD_2_D, opts.arrowFill, a);
}
