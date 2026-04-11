/**
 * IEC/COM schematic geometry adapted from chris-pikul/electronic-symbols (MIT)
 * https://github.com/chris-pikul/electronic-symbols — SVG paths in comments; drawn with Pixi.
 * Use viewBox 0 0 150 150, pivot (75,75), scale 0.4 to align with grid terminals (±30 horizontal).
 */

import type { Graphics } from "pixi.js";

import { BJT_SVG_PIVOT, BJT_SVG_SCALE } from "./bjtSchematicSvg";

export const IEC_SCHEMATIC_PIVOT = BJT_SVG_PIVOT;
export const IEC_SCHEMATIC_SCALE = BJT_SVG_SCALE;

const LINE = {
  width: 12,
  color: 0xffffff,
  cap: "round" as const,
  join: "round" as const,
};

const LINE_THIN = { ...LINE, width: 10 };

function strokeOpen(g: Graphics, points: number[]): void {
  if (points.length < 4) return;
  g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    g.lineTo(points[i], points[i + 1]);
  }
  g.stroke(LINE);
}

/** Inductor-COM-Magnetic.svg — arcs + dual rails */
export function drawInductorMagneticIEC(g: Graphics): void {
  g.moveTo(0, 75.13);
  g.lineTo(12.5, 75.13);
  g.stroke(LINE);
  for (let i = 0; i < 4; i++) {
    const x0 = 12.5 + i * 31.25;
    g.moveTo(x0, 75.13);
    g.quadraticCurveTo(x0 + 15.625, 56.25, x0 + 31.25, 75.13);
    g.stroke(LINE);
  }
  g.moveTo(137.5, 75.13);
  g.lineTo(150, 75.13);
  g.stroke(LINE);
  g.moveTo(12.5, 43.75);
  g.lineTo(137.5, 43.75);
  g.stroke(LINE);
  g.moveTo(12.5, 31.25);
  g.lineTo(137.5, 31.25);
  g.stroke(LINE);
}

/** Transistor-COM-MOSFET-N.svg */
export function drawMosfetNIEC(g: Graphics): void {
  g.ellipse(75, 75, 50, 50);
  g.stroke(LINE);
  strokeOpen(g, [0, 75, 50, 75]);
  strokeOpen(g, [62.5, 43.75, 62.5, 106.25]);
  strokeOpen(g, [99.66, 0, 99.66, 56.25, 62.5, 56.25]);
  strokeOpen(g, [99.66, 150, 99.66, 93.75, 62.5, 93.75]);
  strokeOpen(g, [50, 50, 50, 100]);
}

/** Transistor-COM-MOSFET-P.svg — bubble on gate + P-specific gate stub */
export function drawMosfetPIEC(g: Graphics): void {
  g.ellipse(75, 75, 50, 50);
  g.stroke(LINE);
  strokeOpen(g, [0, 75, 31.25, 75]);
  strokeOpen(g, [62.5, 43.75, 62.5, 106.25]);
  strokeOpen(g, [99.66, 0, 99.66, 56.25, 62.5, 56.25]);
  strokeOpen(g, [99.66, 150, 99.66, 93.75, 62.5, 93.75]);
  strokeOpen(g, [50, 50, 50, 100]);
  g.ellipse(37.5, 75, 6.25, 6.25);
  g.stroke(LINE);
}

/** Capacitor-IEC-Polarized.svg — plates + polarity mark */
export function drawCapacitorPolarizedIEC(g: Graphics): void {
  strokeOpen(g, [0, 75, 65.5, 75]);
  strokeOpen(g, [65.5, 43.75, 65.5, 106.25]);
  strokeOpen(g, [84.5, 37.5, 84.5, 112.5]);
  strokeOpen(g, [84.5, 75, 150, 75]);
  strokeOpen(g, [109.25, 56, 109.25, 94]);
  strokeOpen(g, [97.75, 75, 120.75, 75]);
}

/** Switch-COM-SPST.svg — lever to upper throw when open */
export function drawSwitchSPSTIEC(g: Graphics, closed: boolean): void {
  g.ellipse(37.5, 75, 6.25, 6.25);
  g.stroke(LINE);
  strokeOpen(g, [0, 74.94, 31.25, 74.94]);
  g.ellipse(112.5, 75, 6.25, 6.25);
  g.stroke(LINE);
  strokeOpen(g, [150, 75.06, 118.75, 75.06]);
  if (closed) {
    strokeOpen(g, [37.5, 75, 112.5, 75]);
  } else {
    strokeOpen(g, [37.5, 75, 102, 36.5]);
  }
}

/**
 * Switch-COM-Pushbutton-NO.svg / NC.svg — rest position by type; contact bar by `contactClosed`.
 * NO: closed = bridge at y=75; open = plunger toward NO (up).
 * NC: closed = plunger toward NC (down); open = plunger up (released).
 */
export function drawPushButtonIEC(
  g: Graphics,
  normallyClosed: boolean,
  contactClosed: boolean
): void {
  g.ellipse(50, 75, 6.25, 6.25);
  g.stroke(LINE);
  strokeOpen(g, [0, 74.94, 43.75, 74.94]);
  g.ellipse(100, 75, 6.25, 6.25);
  g.stroke(LINE);
  strokeOpen(g, [150, 75.06, 106.25, 75.06]);
  if (!normallyClosed) {
    if (contactClosed) {
      strokeOpen(g, [37.5, 75, 112.5, 75]);
    } else {
      strokeOpen(g, [37.5, 50, 112.5, 50]);
      strokeOpen(g, [75, 31.25, 75, 50]);
      strokeOpen(g, [62.5, 31.25, 87.5, 31.25]);
    }
  } else if (contactClosed) {
    strokeOpen(g, [37.5, 87.5, 112.5, 87.5]);
    strokeOpen(g, [75, 68.75, 75, 87.5]);
    strokeOpen(g, [62.5, 68.75, 87.5, 68.75]);
  } else {
    strokeOpen(g, [37.5, 50, 112.5, 50]);
    strokeOpen(g, [75, 31.25, 75, 50]);
    strokeOpen(g, [62.5, 31.25, 87.5, 31.25]);
  }
}

/** Relay-COM-COM-SPST-NO.svg — coil box, dashed link, hinged arm toward NO */
export function drawRelayCOM_SPST_NO_IEC(
  g: Graphics,
  contactClosed: boolean
): void {
  strokeOpen(g, [25, 37.5, 125, 37.5, 125, 62.5, 25, 62.5, 25, 37.5]);
  strokeOpen(g, [125, 50, 150, 50]);
  strokeOpen(g, [0, 49.81, 25, 49.81]);
  strokeOpen(g, [0, 99.69, 25, 99.69]);
  strokeOpen(g, [125, 99.88, 150, 99.88]);
  strokeOpen(g, [93.75, 99.88, 93.75, 112.5]);
  g.ellipse(31.25, 100, 6.25, 6.25);
  g.stroke(LINE);
  g.moveTo(93.75, 102.25);
  g.lineTo(106.25, 102.25);
  g.lineTo(100, 111.75);
  g.closePath();
  g.fill({ color: 0xffffff });
  if (contactClosed) {
    strokeOpen(g, [37.25, 104, 100, 137.5]);
  } else {
    strokeOpen(g, [37.25, 104, 85, 118]);
  }
  const dash = { ...LINE, width: 6 };
  let y = 62.5;
  while (y < 118) {
    g.moveTo(74.88, y);
    g.lineTo(74.88, Math.min(y + 4, 120));
    g.stroke(dash);
    y += 8;
  }
}

/** Switch-COM-SPDT.svg — common left; lever to upper or lower throw */
export function drawSwitchSPDTIEC(g: Graphics, connectUpper: boolean): void {
  g.ellipse(37.5, 75, 6.25, 6.25);
  g.stroke(LINE);
  strokeOpen(g, [0, 74.94, 31.25, 74.94]);
  g.ellipse(112.5, 37.5, 6.25, 6.25);
  g.stroke(LINE);
  g.ellipse(112.5, 112.5, 6.25, 6.25);
  g.stroke(LINE);
  strokeOpen(g, [150, 37.56, 118.75, 37.56]);
  strokeOpen(g, [150, 112.56, 118.75, 112.56]);
  if (connectUpper) {
    strokeOpen(g, [37.5, 75, 112.5, 37.5]);
  } else {
    strokeOpen(g, [37.5, 75, 112.5, 112.5]);
  }
}

export function applyIECSchematicTransform(
  g: Graphics,
  flipSign: number = 1
): void {
  g.pivot.set(IEC_SCHEMATIC_PIVOT, IEC_SCHEMATIC_PIVOT);
  const s = Math.sign(flipSign) || 1;
  g.scale.set(s * IEC_SCHEMATIC_SCALE, IEC_SCHEMATIC_SCALE);
}
