import { Graphics, Text } from "pixi.js";
import type {
  SymbolPart,
  ComponentState,
  PartStyle,
} from "../types/ComponentTypes";
import { DesignTokens } from "./DesignTokens";

/**
 * Renders an array of SymbolPart definitions into a PIXI.Graphics object.
 * Supports conditional visibility and state-driven styling.
 */
export function renderSymbolParts(
  graphics: Graphics,
  parts: SymbolPart[],
  state: ComponentState,
  textContainer?: { addChild: (child: Text) => void }
): void {
  for (const part of parts) {
    if (part.visibleWhen && !part.visibleWhen(state)) {
      continue;
    }

    const styleOverride = part.styleWhen ? part.styleWhen(state) : {};

    switch (part.kind) {
      case "line":
        renderLine(graphics, part, styleOverride);
        break;
      case "circle":
        renderCircle(graphics, part, styleOverride);
        break;
      case "rect":
        renderRect(graphics, part, styleOverride);
        break;
      case "path":
        renderPath(graphics, part, styleOverride);
        break;
      case "text":
        if (textContainer) {
          renderText(textContainer, part, styleOverride);
        }
        break;
    }
  }
}

function renderLine(
  g: Graphics,
  part: Extract<SymbolPart, { kind: "line" }>,
  style: Partial<PartStyle>
): void {
  const strokeColor =
    style.stroke ?? part.stroke ?? DesignTokens.symbol.strokeColor;
  const lineWidth =
    style.lineWidth ?? part.lineWidth ?? DesignTokens.symbol.strokeWidth;
  const alpha = style.alpha ?? 1;

  g.moveTo(part.x1, part.y1);
  g.lineTo(part.x2, part.y2);
  g.stroke({ width: lineWidth, color: strokeColor, alpha });
}

function renderCircle(
  g: Graphics,
  part: Extract<SymbolPart, { kind: "circle" }>,
  style: Partial<PartStyle>
): void {
  const alpha = style.alpha ?? 1;

  g.circle(part.x, part.y, part.r);

  if (part.fill !== undefined || style.fill !== undefined) {
    g.fill({ color: style.fill ?? part.fill!, alpha });
  }
  if (part.stroke !== undefined || style.stroke !== undefined) {
    const strokeColor =
      style.stroke ?? part.stroke ?? DesignTokens.symbol.strokeColor;
    const lineWidth =
      style.lineWidth ?? part.lineWidth ?? DesignTokens.symbol.strokeWidth;
    g.stroke({ width: lineWidth, color: strokeColor, alpha });
  }
}

function renderRect(
  g: Graphics,
  part: Extract<SymbolPart, { kind: "rect" }>,
  style: Partial<PartStyle>
): void {
  const alpha = style.alpha ?? 1;

  g.rect(part.x, part.y, part.width, part.height);

  if (part.fill !== undefined || style.fill !== undefined) {
    g.fill({ color: style.fill ?? part.fill!, alpha });
  }
  if (part.stroke !== undefined || style.stroke !== undefined) {
    const strokeColor =
      style.stroke ?? part.stroke ?? DesignTokens.symbol.strokeColor;
    const lineWidth =
      style.lineWidth ?? part.lineWidth ?? DesignTokens.symbol.strokeWidth;
    g.stroke({ width: lineWidth, color: strokeColor, alpha });
  }
}

function renderText(
  container: { addChild: (child: Text) => void },
  part: Extract<SymbolPart, { kind: "text" }>,
  style: Partial<PartStyle>
): void {
  const text = new Text({
    text: part.text,
    style: {
      fontSize: part.fontSize ?? DesignTokens.symbol.valueFontSize,
      fill: style.fill ?? part.fill ?? DesignTokens.symbol.labelColor,
      fontFamily: DesignTokens.symbol.fontFamily,
    },
  });
  text.anchor.set(0.5);
  text.position.set(part.x, part.y);
  container.addChild(text);
}

/**
 * Parses a subset of SVG path `d` attribute commands into PIXI.Graphics calls.
 * Supports: M, L, Q, C, A (simplified), Z and their lowercase relative variants.
 */
function renderPath(
  g: Graphics,
  part: Extract<SymbolPart, { kind: "path" }>,
  style: Partial<PartStyle>
): void {
  const strokeColor =
    style.stroke ?? part.stroke ?? DesignTokens.symbol.strokeColor;
  const lineWidth =
    style.lineWidth ?? part.lineWidth ?? DesignTokens.symbol.strokeWidth;
  const alpha = style.alpha ?? 1;

  const commands = parseSVGPath(part.d);
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        cx = cmd.args[0];
        cy = cmd.args[1];
        startX = cx;
        startY = cy;
        g.moveTo(cx, cy);
        break;
      case "m":
        cx += cmd.args[0];
        cy += cmd.args[1];
        startX = cx;
        startY = cy;
        g.moveTo(cx, cy);
        break;
      case "L":
        cx = cmd.args[0];
        cy = cmd.args[1];
        g.lineTo(cx, cy);
        break;
      case "l":
        cx += cmd.args[0];
        cy += cmd.args[1];
        g.lineTo(cx, cy);
        break;
      case "Q":
        g.quadraticCurveTo(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3]);
        cx = cmd.args[2];
        cy = cmd.args[3];
        break;
      case "q":
        g.quadraticCurveTo(
          cx + cmd.args[0],
          cy + cmd.args[1],
          cx + cmd.args[2],
          cy + cmd.args[3]
        );
        cx += cmd.args[2];
        cy += cmd.args[3];
        break;
      case "C":
        g.bezierCurveTo(
          cmd.args[0],
          cmd.args[1],
          cmd.args[2],
          cmd.args[3],
          cmd.args[4],
          cmd.args[5]
        );
        cx = cmd.args[4];
        cy = cmd.args[5];
        break;
      case "c":
        g.bezierCurveTo(
          cx + cmd.args[0],
          cy + cmd.args[1],
          cx + cmd.args[2],
          cy + cmd.args[3],
          cx + cmd.args[4],
          cy + cmd.args[5]
        );
        cx += cmd.args[4];
        cy += cmd.args[5];
        break;
      case "Z":
      case "z":
        g.lineTo(startX, startY);
        cx = startX;
        cy = startY;
        break;
    }
  }

  if (part.fill !== undefined || style.fill !== undefined) {
    g.fill({ color: style.fill ?? part.fill!, alpha });
  }
  g.stroke({ width: lineWidth, color: strokeColor, alpha });
}

type PathCommand = { type: string; args: number[] };

function parseSVGPath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const regex = /([MmLlQqCcAaZz])([^MmLlQqCcAaZz]*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1];
    const argsStr = match[2].trim();
    const args =
      argsStr.length > 0
        ? argsStr
            .replace(/,/g, " ")
            .split(/\s+/)
            .map(Number)
            .filter((n) => !isNaN(n))
        : [];
    commands.push({ type, args });
  }

  return commands;
}
