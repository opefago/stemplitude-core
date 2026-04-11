import { Container, Graphics, Text } from "pixi.js";
import type {
  ComponentDefinition,
  ComponentInstance,
  SimulationStyleState,
} from "../types/ComponentTypes";
import type { ComponentRuntimeState } from "../types/RuntimeState";
import { DesignTokens } from "./DesignTokens";
import { renderSymbolParts } from "./SymbolPartRenderer";

/**
 * Visual representation of a circuit component in the PixiJS scene.
 * Separates geometry, nodes, labels, and effects into distinct layers
 * so each concern can update independently.
 */
export class ComponentView {
  public root: Container;
  public symbolLayer: Container;
  public nodeLayer: Container;
  public labelLayer: Container;
  public effectsLayer: Container;

  private nodeGraphics: Map<string, Graphics> = new Map();
  private nodeHoverRings: Map<string, Graphics> = new Map();
  private symbolGraphics: Graphics;
  private labelText: Text;
  private valueText: Text;

  constructor(
    public instance: ComponentInstance,
    public definition: ComponentDefinition
  ) {
    this.root = new Container();
    this.symbolLayer = new Container();
    this.nodeLayer = new Container();
    this.labelLayer = new Container();
    this.effectsLayer = new Container();

    this.root.addChild(this.symbolLayer);
    this.root.addChild(this.nodeLayer);
    this.root.addChild(this.labelLayer);
    this.root.addChild(this.effectsLayer);

    this.symbolGraphics = new Graphics();
    this.symbolLayer.addChild(this.symbolGraphics);

    this.labelText = new Text({
      text: "",
      style: {
        fontSize: DesignTokens.symbol.labelFontSize,
        fill: DesignTokens.symbol.labelColor,
        fontFamily: DesignTokens.symbol.fontFamily,
      },
    });
    this.labelText.anchor.set(0.5);

    this.valueText = new Text({
      text: "",
      style: {
        fontSize: DesignTokens.symbol.valueFontSize,
        fill: DesignTokens.symbol.valueColor,
        fontFamily: DesignTokens.symbol.fontFamily,
      },
    });
    this.valueText.anchor.set(0.5);

    this.labelLayer.addChild(this.labelText);
    this.labelLayer.addChild(this.valueText);
  }

  renderGeometry(): void {
    this.symbolGraphics.clear();

    if (this.definition.drawPixi) {
      this.definition.drawPixi({
        graphics: this.symbolGraphics,
        state: this.instance.state,
        styleState: {},
        limits: this.definition.limits,
      });
    } else if (this.definition.parts) {
      renderSymbolParts(
        this.symbolGraphics,
        this.definition.parts,
        this.instance.state,
        this.labelLayer as unknown as { addChild: (child: Text) => void }
      );
    }
  }

  updateAnchorNodes(
    styleState?: SimulationStyleState,
    hoveredNodeId?: string | null
  ): void {
    for (const [, g] of this.nodeGraphics) {
      if (g.parent) g.parent.removeChild(g);
      g.destroy();
    }
    for (const [, g] of this.nodeHoverRings) {
      if (g.parent) g.parent.removeChild(g);
      g.destroy();
    }
    this.nodeGraphics.clear();
    this.nodeHoverRings.clear();

    for (const anchor of this.definition.anchors) {
      if (anchor.visible === false) continue;

      const isHovered = hoveredNodeId === anchor.id;
      const isSelected = styleState?.selected ?? false;
      const isActive =
        (styleState?.currentMagnitude ?? 0) > DesignTokens.particle.currentThreshold;

      let fillColor = DesignTokens.node.default;
      if (isHovered) fillColor = DesignTokens.node.hover;
      else if (isSelected) fillColor = DesignTokens.node.selected;
      else if (isActive) fillColor = DesignTokens.node.activeCurrent;

      const g = new Graphics();
      g.circle(anchor.x, anchor.y, DesignTokens.node.radius);
      g.fill(fillColor);
      g.stroke({
        width: DesignTokens.node.strokeWidth,
        color: DesignTokens.node.strokeColor,
      });
      this.nodeLayer.addChild(g);
      this.nodeGraphics.set(anchor.id, g);

      if (isHovered) {
        const ring = new Graphics();
        ring.circle(anchor.x, anchor.y, DesignTokens.node.hoverRingRadius);
        ring.fill({ color: fillColor, alpha: DesignTokens.node.hoverRingAlpha });
        this.nodeLayer.addChild(ring);
        this.nodeHoverRings.set(anchor.id, ring);
      }
    }
  }

  updateStateVisuals(runtimeState?: ComponentRuntimeState): void {
    if (!runtimeState) return;

    const variant = runtimeState.visual.colorVariant ?? "normal";
    const tintMap: Record<string, number> = {
      normal: 0xffffff,
      active: DesignTokens.state.active,
      warning: DesignTokens.state.warning,
      danger: DesignTokens.state.danger,
      damaged: DesignTokens.state.damaged,
    };
    this.symbolGraphics.tint = tintMap[variant] ?? 0xffffff;

    const glowLevel = runtimeState.visual.glowLevel ?? 0;
    this.symbolGraphics.alpha = 0.7 + 0.3 * Math.min(glowLevel, 1);
  }

  setLabel(name: string, value: string): void {
    this.labelText.text = name;
    this.valueText.text = value;
  }

  setLabelPositions(labelY: number, valueY: number): void {
    this.labelText.position.set(0, labelY);
    this.valueText.position.set(0, valueY);
  }

  setSelected(selected: boolean): void {
    if (selected) {
      this.root.alpha = 1;
    } else {
      this.root.alpha = 1;
    }
  }

  destroy(): void {
    for (const [, g] of this.nodeGraphics) g.destroy();
    for (const [, g] of this.nodeHoverRings) g.destroy();
    this.nodeGraphics.clear();
    this.nodeHoverRings.clear();
    this.symbolGraphics.destroy();
    this.labelText.destroy();
    this.valueText.destroy();
    this.root.destroy({ children: true });
  }
}
