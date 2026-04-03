/**
 * IEC-style BJT schematic geometry from chris-pikul/electronic-symbols
 * (https://github.com/chris-pikul/electronic-symbols, MIT License).
 * Files: SVG/Transistor-COM-BJT-NPN.svg, SVG/Transistor-COM-BJT-PNP.svg
 *
 * Strokes use #ffffff so Pixi `tint` matches prior BJT coloring. Stroke width is
 * raised so lines stay readable after scaling (see NPNTransistor / PNPTransistor).
 *
 * Original viewBox is 0 0 150 150 with center at (75, 75). Components apply
 * pivot (75, 75) and uniform scale BJT_SVG_SCALE so schematic terminals land at:
 *   base: (-30, 0), collector: (10, -30), emitter: (10, 30)  [NPN]
 */

import type { Graphics } from "pixi.js";

export const BJT_SVG_VIEW_SIZE = 150;
export const BJT_SVG_PIVOT = 75;
/** Maps SVG space to scene units; terminals use 20px grid alignment. */
export const BJT_SVG_SCALE = 0.4;

/** Match embedded SVG stroke width (visually ~5px after BJT_SVG_SCALE). */
const BJT_LINE = {
  width: 12,
  color: 0xffffff,
  cap: "round" as const,
  join: "round" as const,
};

/** NPN — emitter arrow filled triangle points outward (conventional current). */
export const NPN_BJT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">
<circle cx="75" cy="75" r="50" fill="none" stroke="#ffffff" stroke-miterlimit="10" stroke-width="12"/>
<path fill="none" stroke="#ffffff" stroke-miterlimit="10" stroke-width="12" d="M100 150v-31.25M0 75h50m0-31.25v62.5M100 0v40.5l-50 22m0 25 37.52 22.47"/>
<path fill="#ffffff" d="m81.8 115.26 14.95.24-7.27-13.07-7.68 12.83z"/>
</svg>`;

/** PNP — emitter arrow points inward toward the base bar. */
export const PNP_BJT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">
<circle cx="75" cy="75" r="50" fill="none" stroke="#ffffff" stroke-miterlimit="10" stroke-width="12"/>
<path fill="none" stroke="#ffffff" stroke-miterlimit="10" stroke-width="12" d="M0 75h50m0 31.25v-62.5M100 150v-40.5l-50-22M99.84 0v31.25L62.22 53.94"/>
<path fill="#ffffff" d="M60.23 46.41 53 59.5l14.95-.28-7.72-12.81z"/>
</svg>`;

function strokePolyline(g: Graphics, points: number[]): void {
  if (points.length < 4) return;
  g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    g.lineTo(points[i], points[i + 1]);
  }
  g.stroke(BJT_LINE);
}

/** Same geometry as {@link NPN_BJT_SVG}, drawn with Pixi primitives (SVG as guide only). */
export function drawNpnBjtInSvgSpace(g: Graphics): void {
  g.ellipse(75, 75, 50, 50);
  g.stroke(BJT_LINE);

  strokePolyline(g, [100, 150, 100, 118.75]);
  strokePolyline(g, [0, 75, 50, 75]);
  strokePolyline(g, [50, 43.75, 50, 106.25]);
  strokePolyline(g, [100, 0, 100, 40.5, 50, 62.5]);
  strokePolyline(g, [50, 87.5, 87.52, 109.97]);

  g.moveTo(81.8, 115.26);
  g.lineTo(96.75, 115.5);
  g.lineTo(89.48, 102.43);
  g.closePath();
  g.fill({ color: 0xffffff });
}

/** Same geometry as {@link PNP_BJT_SVG}, drawn with Pixi primitives (SVG as guide only). */
export function drawPnpBjtInSvgSpace(g: Graphics): void {
  g.ellipse(75, 75, 50, 50);
  g.stroke(BJT_LINE);

  strokePolyline(g, [0, 75, 50, 75]);
  strokePolyline(g, [50, 106.25, 50, 43.75]);
  strokePolyline(g, [100, 150, 100, 109.5, 50, 87.5]);
  strokePolyline(g, [99.84, 0, 99.84, 31.25, 62.22, 53.94]);

  g.moveTo(60.23, 46.41);
  g.lineTo(53, 59.5);
  g.lineTo(67.95, 59.22);
  g.closePath();
  g.fill({ color: 0xffffff });
}
