import { Graphics, Text } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface AmmeterProperties extends CircuitProperties {
  // Ammeters have very low resistance
}

/**
 * Ammeter component - Measures current through it
 * Acts as a very small resistance (ideal ammeter has R≈0)
 */
export class Ammeter extends CircuitComponent {
  protected ammeterProps: AmmeterProperties;
  private displayOverlay: HTMLDivElement | null = null;
  private isDisplayVisible: boolean = false;
  private clickStartPos: { x: number; y: number } | null = null;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: AmmeterProperties = {
      value: 0.001, // Very low resistance (1mΩ)
      resistance: 0.001,
      tolerance: 0,
      powerRating: 10,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
    };

    super(name, "ammeter", props, gridX, gridY);
    this.ammeterProps = props as AmmeterProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "positive",
        position: { x: -20, y: 0 }, // Relative to component center
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "negative",
        position: { x: 20, y: 0 }, // Relative to component center
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -35, valueY: 35 };
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Positive terminal (left when orientation = 0)
    this.nodes[0].position.x = -20 * cos - 0 * sin;
    this.nodes[0].position.y = -20 * sin + 0 * cos;

    // Negative terminal (right when orientation = 0)
    this.nodes[1].position.x = 20 * cos - 0 * sin;
    this.nodes[1].position.y = 20 * sin + 0 * cos;
  }

  private updateLabels(): void {
    // Component label (name)
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -35);

    // Value label (current reading)
    const current = Math.abs(this.circuitProps.current);
    const currentStr =
      current >= 1
        ? `${current.toFixed(2)}A`
        : `${(current * 1000).toFixed(1)}mA`;
    this.valueText.text = currentStr;
    this.valueText.style = {
      fontSize: 10,
      fill: 0xffaa00,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 35);
  }

  protected createVisuals(): void {
    if (this.componentGraphics.parent) {
      this.componentGraphics.parent.removeChild(this.componentGraphics);
    }
    this.componentGraphics = new Graphics();

    // Draw ammeter circle
    this.componentGraphics
      .circle(0, 0, 15)
      .stroke({ width: 2, color: 0xffaa00 });

    // Draw 'A' symbol
    const aSymbol = new Text({
      text: "A",
      style: {
        fontSize: 16,
        fill: 0xffaa00,
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    });
    aSymbol.anchor.set(0.5);
    aSymbol.position.set(0, 0);
    this.componentGraphics.addChild(aSymbol);

    // Draw terminals
    this.componentGraphics
      .moveTo(-20, 0)
      .lineTo(-15, 0)
      .stroke({ width: 2, color: 0xaaaaaa });

    this.componentGraphics
      .moveTo(15, 0)
      .lineTo(20, 0)
      .stroke({ width: 2, color: 0xaaaaaa });

    // Use base class labels
    this.updateLabels();

    this.displayContainer.addChild(this.componentGraphics);
    this.createPinGraphics();

    // Make it interactive
    this.componentGraphics.eventMode = "static";
    this.componentGraphics.cursor = "pointer";

    // Add click handler to show digital display
    // Don't use stopPropagation to allow dragging to work
    this.componentGraphics.on("pointerdown", (event) => {
      // Store click start position to detect if it was a drag or click
      this.clickStartPos = { x: event.global.x, y: event.global.y };
    });

    this.componentGraphics.on("pointerup", (event) => {
      // Only toggle display if pointer hasn't moved much (i.e., it was a click, not a drag)
      if (this.clickStartPos) {
        const dx = event.global.x - this.clickStartPos.x;
        const dy = event.global.y - this.clickStartPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If moved less than 5 pixels, consider it a click
        if (distance < 5) {
          this.toggleDisplay();
        }

        this.clickStartPos = null;
      }
    });
  }

  /**
   * Toggle digital display overlay
   */
  private toggleDisplay(): void {
    if (this.isDisplayVisible) {
      this.hideDisplay();
    } else {
      this.showDisplay();
    }
  }

  /**
   * Show digital ammeter display
   */
  private showDisplay(): void {
    if (this.displayOverlay) {
      this.displayOverlay.style.display = "block";
      this.isDisplayVisible = true;
      return;
    }

    this.displayOverlay = document.createElement("div");
    this.displayOverlay.className = "ammeter-display";
    this.displayOverlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      border: 3px solid #ffaa00;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 170, 0, 0.3);
      z-index: 10001;
      min-width: 280px;
      font-family: 'Courier New', monospace;
    `;

    // Title
    const title = document.createElement("div");
    title.textContent = `⚡ ${this.name} - Ammeter`;
    title.style.cssText = `
      color: #ffaa00;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 15px;
      text-align: center;
      border-bottom: 2px solid #ffaa00;
      padding-bottom: 10px;
    `;
    this.displayOverlay.appendChild(title);

    // Digital display
    const display = document.createElement("div");
    display.id = `ammeter-reading-${this.name}`;
    display.style.cssText = `
      background: #000;
      color: #00ff00;
      font-size: 32px;
      font-weight: bold;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
      font-family: 'Courier New', monospace;
      letter-spacing: 2px;
      border: 2px solid #ffaa00;
      box-shadow: inset 0 0 10px rgba(255, 170, 0, 0.2);
    `;
    display.textContent = this.formatCurrent(this.circuitProps.current);
    this.displayOverlay.appendChild(display);

    // Info text
    const info = document.createElement("div");
    info.textContent = "Real-time current measurement";
    info.style.cssText = `
      color: #888;
      font-size: 11px;
      margin-top: 10px;
      text-align: center;
    `;
    this.displayOverlay.appendChild(info);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ Close";
    closeBtn.style.cssText = `
      background: #ffaa00;
      color: #000;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      margin-top: 15px;
      width: 100%;
      transition: all 0.2s;
    `;
    closeBtn.onmouseover = () => (closeBtn.style.background = "#ffcc00");
    closeBtn.onmouseout = () => (closeBtn.style.background = "#ffaa00");
    closeBtn.onclick = () => this.hideDisplay();
    this.displayOverlay.appendChild(closeBtn);

    document.body.appendChild(this.displayOverlay);
    this.isDisplayVisible = true;

    console.log(`📊 ${this.name} display opened`);
  }

  /**
   * Hide digital display
   */
  private hideDisplay(): void {
    if (this.displayOverlay) {
      this.displayOverlay.style.display = "none";
      this.isDisplayVisible = false;
    }
  }

  /**
   * Format current for display with appropriate units
   */
  private formatCurrent(current: number): string {
    const absCurrent = Math.abs(current);
    const sign = current < 0 ? "-" : "+";

    if (absCurrent >= 1) {
      return `${sign}${absCurrent.toFixed(3)} A`;
    } else if (absCurrent >= 0.001) {
      return `${sign}${(absCurrent * 1000).toFixed(2)} mA`;
    } else if (absCurrent >= 0.000001) {
      return `${sign}${(absCurrent * 1000000).toFixed(2)} µA`;
    } else {
      return `${sign}${(absCurrent * 1000000000).toFixed(2)} nA`;
    }
  }

  public updateCircuitState(voltage: number, current: number): void {
    super.updateCircuitState(voltage, current);

    // Update display if visible
    if (this.isDisplayVisible && this.displayOverlay) {
      const display = this.displayOverlay.querySelector(
        `#ammeter-reading-${this.name}`
      ) as HTMLDivElement;
      if (display) {
        display.textContent = this.formatCurrent(current);
      }
    }
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      resistance: this.ammeterProps.resistance,
    };
  }

  protected updateVisuals(_deltaTime: number): void {
    // Ammeter display is updated in updateCircuitState() and shown in the overlay
    // No animated visual updates needed for the component itself
  }

  /**
   * Cleanup when component is removed
   */
  public destroy(): void {
    if (this.displayOverlay) {
      this.displayOverlay.remove();
    }
    super.destroy();
  }
}
