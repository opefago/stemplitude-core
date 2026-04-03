/**
 * IEC/COM logic gates + Zener diode from chris-pikul/electronic-symbols (MIT).
 * SVG path strings → Pixi GraphicsPath + stroke; viewBox 0 0 150 150, pivot (75,75), scale 0.4.
 */

import type { Graphics } from "pixi.js";
import { GraphicsPath, parseSVGPath } from "pixi.js";

const LINE = {
  width: 12,
  color: 0xffffff,
  cap: "round" as const,
  join: "round" as const,
};

function strokePathD(g: Graphics, d: string): void {
  const gp = new GraphicsPath();
  parseSVGPath(d, gp);
  g.path(gp);
  g.stroke(LINE);
}

/** Diode-COM-Zener.svg */
export function drawZenerDiodeIEC(g: Graphics): void {
  strokePathD(
    g,
    "m100 75-50 31.25v-62.5L100 75zm-50 0H0m100 0h50"
  );
  strokePathD(g, "M112.5 109.5 100 100V50l-12.5-9.5");
}

/** IC-COM-Logic-AND.svg */
export function drawLogicAndIEC(g: Graphics): void {
  strokePathD(
    g,
    "M31.25 37.5h25c18.75 0 56.25 0 56.25 37.5S75 112.5 56.25 112.5h-25ZM0 49.81h31.25M0 100.06h31.25M112.5 75H150"
  );
}

/** IC-COM-Logic-OR.svg */
export function drawLogicOrIEC(g: Graphics): void {
  strokePathD(
    g,
    "M31.25 37.5h25c37.5 0 56.25 37.5 56.25 37.5s-18.75 37.5-56.25 37.5h-25s12.5-18.75 12.5-37.5-12.5-37.5-12.5-37.5ZM0 49.81h37.5M0 100.06h37.5m75-25.06H150"
  );
}

/** IC-COM-Logic-NAND.svg */
export function drawLogicNandIEC(g: Graphics): void {
  strokePathD(
    g,
    "M31.25 37.5h25c18.75 0 56.25 0 56.25 37.5S75 112.5 56.25 112.5h-25ZM0 49.81h31.25M0 100.06h31.25M134.5 75H150"
  );
  g.circle(124.88, 74.88, 9.38);
  g.stroke(LINE);
}

/** IC-COM-Logic-NOR.svg */
export function drawLogicNorIEC(g: Graphics): void {
  strokePathD(
    g,
    "M31.25 37.5h25c37.5 0 56.25 37.5 56.25 37.5s-18.75 37.5-56.25 37.5h-25s12.5-18.75 12.5-37.5-12.5-37.5-12.5-37.5ZM0 49.81h37.5M0 100.06h37.5m97-24.93H150"
  );
  g.circle(124.88, 75, 9.38);
  g.stroke(LINE);
}

/** IC-COM-Logic-XOR.svg */
export function drawLogicXorIEC(g: Graphics): void {
  strokePathD(
    g,
    "M31.25 37.5h25c37.5 0 56.25 37.5 56.25 37.5s-18.75 37.5-56.25 37.5h-25s12.5-18.75 12.5-37.5-12.5-37.5-12.5-37.5ZM0 49.81h37.5M0 100.06h37.5m75-25.06H150"
  );
  strokePathD(g, "M18.75 113s12.5-18.75 12.5-37.5-12.5-38-12.5-38");
}

/** IC-COM-Logic-Inverter.svg (NOT) */
export function drawLogicInverterIEC(g: Graphics): void {
  strokePathD(g, "M22 37.5v75L112.5 75 22 37.5zM22 75H0m137.75 0H150");
  g.circle(128.13, 74.88, 9.38);
  g.stroke(LINE);
}
