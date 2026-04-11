import { Container, Graphics, Text } from "pixi.js";
import type { ComponentRuntimeState } from "../types/RuntimeState";
import { DesignTokens } from "./DesignTokens";

/**
 * Renders educational overlays on circuit components:
 * - Warning badges for stressed components
 * - Diagnostic badges for incorrectly wired components
 * - Teaching overlays (charge bars, region labels, etc.)
 */
export class EducationOverlays {
  private overlayLayer: Container;
  private badgeGraphics: Map<string, Graphics> = new Map();
  private tooltipContainer: HTMLDivElement | null = null;
  private isBeginnerMode: boolean = true;

  constructor(overlayLayer: Container) {
    this.overlayLayer = overlayLayer;
  }

  setBeginnerMode(beginner: boolean): void {
    this.isBeginnerMode = beginner;
  }

  isInBeginnerMode(): boolean {
    return this.isBeginnerMode;
  }

  /**
   * Update warning badges for a component based on its runtime state.
   */
  updateBadges(
    componentId: string,
    x: number,
    y: number,
    runtimeState: ComponentRuntimeState
  ): void {
    let badge = this.badgeGraphics.get(componentId);

    const badges = runtimeState.visual.badges ?? [];
    const stress = runtimeState.stress;
    const damage = runtimeState.damage;

    // Determine which badge to show (highest priority)
    let badgeType: string | null = null;
    let badgeColor = 0xffaa00;

    if (damage.damaged && damage.damageLevel && damage.damageLevel >= 2) {
      badgeType = "X";
      badgeColor = DesignTokens.damage.criticalColor;
    } else if (stress.marginLevel === "critical") {
      badgeType = "!!";
      badgeColor = DesignTokens.damage.criticalColor;
    } else if (stress.marginLevel === "danger") {
      badgeType = "!";
      badgeColor = DesignTokens.damage.dangerColor;
    } else if (stress.overVoltage || stress.overCurrent) {
      badgeType = "!";
      badgeColor = DesignTokens.damage.dangerColor;
    } else if (stress.reverseVoltage) {
      badgeType = "R";
      badgeColor = DesignTokens.damage.warningColor;
    } else if (stress.marginLevel === "warning") {
      badgeType = "~";
      badgeColor = DesignTokens.damage.warningColor;
    } else if (badges.includes("overstress")) {
      badgeType = "~";
      badgeColor = DesignTokens.damage.warningColor;
    }

    if (!badgeType) {
      // No badge needed - remove existing
      if (badge) {
        if (badge.parent) badge.parent.removeChild(badge);
        badge.destroy();
        this.badgeGraphics.delete(componentId);
      }
      return;
    }

    if (!badge) {
      badge = new Graphics();
      this.overlayLayer.addChild(badge);
      this.badgeGraphics.set(componentId, badge);
    }

    badge.clear();
    badge.position.set(x + 15, y - 20);

    // Badge background circle
    badge.circle(0, 0, 8);
    badge.fill({ color: badgeColor, alpha: 0.9 });
    badge.stroke({ width: 1.5, color: 0xffffff });

    // Badge text
    const textObj = new Text({
      text: badgeType,
      style: {
        fontSize: 10,
        fill: 0xffffff,
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    });
    textObj.anchor.set(0.5);
    badge.addChild(textObj);
  }

  /**
   * Show a hover tooltip near a component or wire.
   */
  showTooltip(
    screenX: number,
    screenY: number,
    lines: string[]
  ): void {
    this.hideTooltip();

    this.tooltipContainer = document.createElement("div");
    this.tooltipContainer.style.cssText = `
      position: fixed;
      left: ${screenX + 15}px;
      top: ${screenY - 10}px;
      background: rgba(10, 20, 10, 0.95);
      border: 1px solid #00ff88;
      border-radius: 6px;
      padding: 8px 12px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #00ff88;
      z-index: 10000;
      pointer-events: none;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 255, 136, 0.15);
      max-width: 250px;
      line-height: 1.4;
    `;

    this.tooltipContainer.innerHTML = lines
      .map((line) => `<div>${line}</div>`)
      .join("");

    document.body.appendChild(this.tooltipContainer);
  }

  hideTooltip(): void {
    if (this.tooltipContainer) {
      this.tooltipContainer.remove();
      this.tooltipContainer = null;
    }
  }

  /**
   * Generate tooltip content for a component based on its runtime state.
   */
  getComponentTooltipLines(
    componentType: string,
    name: string,
    runtimeState: ComponentRuntimeState
  ): string[] {
    const lines: string[] = [`<strong>${name}</strong> (${componentType})`];

    const el = runtimeState.electrical;
    if (el.voltageAcross !== undefined) {
      lines.push(`V: ${el.voltageAcross.toFixed(4)} V`);
    }
    if (el.currentThrough !== undefined) {
      lines.push(`I: ${(el.currentThrough * 1000).toFixed(2)} mA`);
    }
    if (el.powerDissipation !== undefined) {
      lines.push(`P: ${(el.powerDissipation * 1000).toFixed(2)} mW`);
    }

    const beh = runtimeState.behavior;
    if (beh.mode && beh.mode !== "unknown") {
      lines.push(`Mode: ${beh.mode}`);
    }

    const stress = runtimeState.stress;
    if (stress.marginLevel && stress.marginLevel !== "safe") {
      const stressColor =
        stress.marginLevel === "critical"
          ? "#ff0000"
          : stress.marginLevel === "danger"
            ? "#ff4444"
            : "#ffaa00";
      lines.push(
        `<span style="color:${stressColor}">Stress: ${stress.marginLevel}</span>`
      );
    }

    if (stress.overVoltage) lines.push('<span style="color:#ff4444">Over-voltage!</span>');
    if (stress.overCurrent) lines.push('<span style="color:#ff4444">Over-current!</span>');
    if (stress.reverseVoltage) lines.push('<span style="color:#ffaa00">Reverse voltage</span>');

    const dmg = runtimeState.damage;
    if (dmg.damaged) {
      lines.push(`<span style="color:#ff0000">DAMAGED: ${dmg.damageType}</span>`);
    }

    // Teaching overlays for beginner mode
    if (this.isBeginnerMode) {
      this.addTeachingLines(componentType, runtimeState, lines);
    }

    return lines;
  }

  private addTeachingLines(
    componentType: string,
    state: ComponentRuntimeState,
    lines: string[]
  ): void {
    switch (componentType) {
      case "capacitor":
        if (state.behavior.mode === "charging") {
          lines.push('<span style="color:#4488ff">Charging...</span>');
        } else if (state.behavior.mode === "discharging") {
          lines.push('<span style="color:#ff8844">Discharging...</span>');
        }
        break;
      case "npn_transistor":
      case "pnp_transistor":
        if (state.behavior.mode) {
          lines.push(`Region: ${state.behavior.mode}`);
        }
        break;
      case "diode":
      case "led":
        if (state.electrical.polarity) {
          lines.push(`Bias: ${state.electrical.polarity}`);
        }
        if (state.electrical.conduction) {
          lines.push(`State: ${state.electrical.conduction}`);
        }
        break;
      case "timer555":
        if (state.behavior.mode === "oscillating") {
          lines.push("Output oscillating");
        }
        break;
    }
  }

  /**
   * Generate tooltip content for a wire.
   */
  getWireTooltipLines(
    wireId: string,
    current: number,
    voltage: number
  ): string[] {
    return [
      `<strong>Wire</strong>`,
      `I: ${(current * 1000).toFixed(2)} mA`,
      `V: ${voltage.toFixed(4)} V`,
    ];
  }

  /**
   * Remove a component's badge.
   */
  removeBadge(componentId: string): void {
    const badge = this.badgeGraphics.get(componentId);
    if (badge) {
      if (badge.parent) badge.parent.removeChild(badge);
      badge.destroy();
      this.badgeGraphics.delete(componentId);
    }
  }

  clearBadges(): void {
    for (const [, badge] of this.badgeGraphics) {
      if (badge.parent) badge.parent.removeChild(badge);
      badge.destroy();
    }
    this.badgeGraphics.clear();
  }

  destroy(): void {
    this.hideTooltip();
    this.clearBadges();
  }
}
