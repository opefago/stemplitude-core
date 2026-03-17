import { Graphics, Text } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface VoltmeterProperties extends CircuitProperties {
  // Voltmeters have very high resistance
}

/**
 * Voltmeter component - Measures voltage across it
 * Acts as a very high resistance (ideal voltmeter has R≈∞)
 */
export class Voltmeter extends CircuitComponent {
  protected voltmeterProps: VoltmeterProperties;
  private displayOverlay: HTMLDivElement | null = null;
  private isDisplayVisible: boolean = false;
  private clickStartPos: { x: number; y: number } | null = null;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: VoltmeterProperties = {
      value: 1e9, // Very high resistance (1GΩ)
      resistance: 1e9,
      tolerance: 0,
      powerRating: 0.001,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
    };

    super(name, "voltmeter", props, gridX, gridY);
    this.voltmeterProps = props as VoltmeterProperties;
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

    // Value label (voltage reading)
    const voltage = this.circuitProps.voltage;
    const voltageStr =
      Math.abs(voltage) >= 1
        ? `${voltage.toFixed(2)}V`
        : `${(voltage * 1000).toFixed(0)}mV`;
    this.valueText.text = voltageStr;
    this.valueText.style = {
      fontSize: 10,
      fill: 0x00aaff,
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

    // Draw voltmeter circle
    this.componentGraphics
      .circle(0, 0, 15)
      .stroke({ width: 2, color: 0x00aaff });

    // Draw 'V' symbol
    const vSymbol = new Text({
      text: "V",
      style: {
        fontSize: 16,
        fill: 0x00aaff,
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    });
    vSymbol.anchor.set(0.5);
    vSymbol.position.set(0, 0);
    this.componentGraphics.addChild(vSymbol);

    // Draw terminals
    this.componentGraphics
      .moveTo(-20, 0)
      .lineTo(-15, 0)
      .stroke({ width: 2, color: 0xaaaaaa });

    this.componentGraphics
      .moveTo(15, 0)
      .lineTo(20, 0)
      .stroke({ width: 2, color: 0xaaaaaa });

    // Add + and - signs
    const plusSign = new Text({
      text: "+",
      style: {
        fontSize: 12,
        fill: 0xff4444,
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    });
    plusSign.position.set(-28, -8);
    this.componentGraphics.addChild(plusSign);

    const minusSign = new Text({
      text: "−",
      style: {
        fontSize: 12,
        fill: 0x4444ff,
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    });
    minusSign.position.set(20, -8);
    this.componentGraphics.addChild(minusSign);

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
   * Show digital voltmeter display
   */
  private showDisplay(): void {
    if (this.displayOverlay) {
      this.displayOverlay.style.display = "block";
      this.isDisplayVisible = true;
      return;
    }

    this.displayOverlay = document.createElement("div");
    this.displayOverlay.className = "voltmeter-display";
    this.displayOverlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      border: 3px solid #00aaff;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 170, 255, 0.3);
      z-index: 10001;
      min-width: 280px;
      font-family: 'Courier New', monospace;
    `;

    // Title
    const title = document.createElement("div");
    title.textContent = `⚡ ${this.name} - Voltmeter`;
    title.style.cssText = `
      color: #00aaff;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 15px;
      text-align: center;
      border-bottom: 2px solid #00aaff;
      padding-bottom: 10px;
    `;
    this.displayOverlay.appendChild(title);

    // Digital display
    const display = document.createElement("div");
    display.id = `voltmeter-reading-${this.name}`;
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
      border: 2px solid #00aaff;
      box-shadow: inset 0 0 10px rgba(0, 170, 255, 0.2);
    `;
    display.textContent = this.formatVoltage(this.circuitProps.voltage);
    this.displayOverlay.appendChild(display);

    // Info text
    const info = document.createElement("div");
    info.textContent = "Real-time voltage measurement";
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
      background: #00aaff;
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
    closeBtn.onmouseover = () => (closeBtn.style.background = "#00ccff");
    closeBtn.onmouseout = () => (closeBtn.style.background = "#00aaff");
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
   * Format voltage for display with appropriate units
   */
  private formatVoltage(voltage: number): string {
    const absVoltage = Math.abs(voltage);
    const sign = voltage < 0 ? "-" : "+";

    if (absVoltage >= 1000) {
      return `${sign}${(absVoltage / 1000).toFixed(3)} kV`;
    } else if (absVoltage >= 1) {
      return `${sign}${absVoltage.toFixed(3)} V`;
    } else if (absVoltage >= 0.001) {
      return `${sign}${(absVoltage * 1000).toFixed(2)} mV`;
    } else {
      return `${sign}${(absVoltage * 1000000).toFixed(2)} µV`;
    }
  }

  public updateCircuitState(voltage: number, current: number): void {
    super.updateCircuitState(voltage, current);

    // Update display if visible
    if (this.isDisplayVisible && this.displayOverlay) {
      const display = this.displayOverlay.querySelector(
        `#voltmeter-reading-${this.name}`
      ) as HTMLDivElement;
      if (display) {
        display.textContent = this.formatVoltage(voltage);
      }
    }
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      resistance: this.voltmeterProps.resistance,
    };
  }

  protected updateVisuals(_deltaTime: number): void {
    // Voltmeter display is updated in updateCircuitState() and shown in the overlay
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
