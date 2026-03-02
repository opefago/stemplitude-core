import { Graphics } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface OscilloscopeProperties extends CircuitProperties {
  mode: "voltage" | "current";
}

interface WaveformData {
  time: number[];
  voltage: number[];
  current: number[];
}

/**
 * Oscilloscope component - Records and displays waveforms
 * Acts as high impedance (like voltmeter) to measure voltage
 */
export class Oscilloscope extends CircuitComponent {
  protected oscilloscopeProps: OscilloscopeProperties;
  private displayOverlay: HTMLDivElement | null = null;
  private isDisplayVisible: boolean = false;
  private clickStartPos: { x: number; y: number } | null = null;
  private waveformData: WaveformData = {
    time: [],
    voltage: [],
    current: [],
  };
  private maxDataPoints: number = 1000;
  private canvas: HTMLCanvasElement | null = null;
  private animationFrame: number | null = null;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: OscilloscopeProperties = {
      value: 1e9, // Very high resistance (1GΩ) - like voltmeter
      resistance: 1e9,
      tolerance: 0,
      powerRating: 0.001,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      mode: "voltage",
    };

    super(name, "oscilloscope", props, gridX, gridY);
    this.oscilloscopeProps = props as OscilloscopeProperties;
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "probe",
        position: { x: -20, y: 0 }, // Relative to component center
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "ground",
        position: { x: 20, y: 0 }, // Relative to component center
        voltage: 0,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -40, valueY: 40 };
  }

  protected updateNodePositions(): void {
    // Update node positions based on orientation
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    // Probe terminal (left when orientation = 0)
    this.nodes[0].position.x = -20 * cos - 0 * sin;
    this.nodes[0].position.y = -20 * sin + 0 * cos;

    // Ground terminal (right when orientation = 0)
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
    this.labelText.position.set(0, -40);

    // Value label (SCOPE indicator)
    this.valueText.text = "SCOPE";
    this.valueText.style = {
      fontSize: 7,
      fill: 0x00ff88,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 40);
  }

  protected createVisuals(): void {
    if (this.componentGraphics.parent) {
      this.componentGraphics.parent.removeChild(this.componentGraphics);
    }
    this.componentGraphics = new Graphics();

    // Draw oscilloscope screen (rectangle)
    this.componentGraphics
      .rect(-15, -12, 30, 24)
      .stroke({ width: 2, color: 0x00ff88 })
      .fill(0x001a0a);

    // Draw a simple waveform inside
    this.drawMiniWaveform();

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

    // Add click handler to show oscilloscope display
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
   * Draw a mini waveform on the component icon
   */
  private drawMiniWaveform(): void {
    const points: { x: number; y: number }[] = [];
    const steps = 15;
    for (let i = 0; i <= steps; i++) {
      const x = -12 + (i / steps) * 24;
      const y = 5 * Math.sin((i / steps) * 4 * Math.PI);
      points.push({ x, y });
    }

    if (points.length > 0) {
      this.componentGraphics.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        this.componentGraphics.lineTo(points[i].x, points[i].y);
      }
      this.componentGraphics.stroke({ width: 1, color: 0x00ff88 });
    }
  }

  /**
   * Record data point
   */
  public recordData(time: number, voltage: number, current: number): void {
    this.waveformData.time.push(time);
    this.waveformData.voltage.push(voltage);
    this.waveformData.current.push(current);

    // Limit data points
    if (this.waveformData.time.length > this.maxDataPoints) {
      this.waveformData.time.shift();
      this.waveformData.voltage.shift();
      this.waveformData.current.shift();
    }

    // Update display if visible
    if (this.isDisplayVisible && this.canvas) {
      this.drawWaveform();
    }
  }

  /**
   * Clear recorded data
   */
  public clearData(): void {
    this.waveformData = {
      time: [],
      voltage: [],
      current: [],
    };
    if (this.canvas) {
      this.drawWaveform();
    }
  }

  /**
   * Toggle oscilloscope display
   */
  private toggleDisplay(): void {
    if (this.isDisplayVisible) {
      this.hideDisplay();
    } else {
      this.showDisplay();
    }
  }

  /**
   * Show oscilloscope display window
   */
  private showDisplay(): void {
    if (this.displayOverlay) {
      this.displayOverlay.style.display = "block";
      this.isDisplayVisible = true;
      this.startAnimation();
      return;
    }

    this.displayOverlay = document.createElement("div");
    this.displayOverlay.className = "oscilloscope-display";
    this.displayOverlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #0a1a0a 0%, #1a2a1a 100%);
      border: 3px solid #00ff88;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 255, 136, 0.3);
      z-index: 10001;
      width: 600px;
      font-family: 'Courier New', monospace;
    `;

    // Title with SVG icon
    const title = document.createElement("div");
    title.innerHTML = `
      <img src="/assets/oscilloscope.svg" alt="Oscilloscope" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px; filter: brightness(0) saturate(100%) invert(85%) sepia(45%) saturate(1200%) hue-rotate(95deg) brightness(105%) contrast(105%);" />
      ${this.name} - Oscilloscope
    `;
    title.style.cssText = `
      color: #00ff88;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
      text-align: center;
      border-bottom: 2px solid #00ff88;
      padding-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    this.displayOverlay.appendChild(title);

    // Canvas for waveform
    this.canvas = document.createElement("canvas");
    this.canvas.width = 560;
    this.canvas.height = 300;
    this.canvas.style.cssText = `
      background: #000;
      border: 2px solid #00ff88;
      border-radius: 6px;
      display: block;
      margin: 0 auto 15px auto;
    `;
    this.displayOverlay.appendChild(this.canvas);

    // Controls
    const controls = document.createElement("div");
    controls.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      gap: 10px;
    `;

    // Mode selector
    const modeLabel = document.createElement("span");
    modeLabel.textContent = "Mode:";
    modeLabel.style.cssText = "color: #00ff88; font-size: 12px;";
    controls.appendChild(modeLabel);

    const modeSelect = document.createElement("select");
    modeSelect.style.cssText = `
      background: #000;
      color: #00ff88;
      border: 1px solid #00ff88;
      padding: 5px 10px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      cursor: pointer;
    `;
    modeSelect.innerHTML = `
      <option value="voltage">Voltage vs Time</option>
      <option value="current">Current vs Time</option>
    `;
    modeSelect.onchange = () => {
      this.oscilloscopeProps.mode = modeSelect.value as "voltage" | "current";
      this.drawWaveform();
    };
    controls.appendChild(modeSelect);

    // Clear button with trash SVG
    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = `
      <img src="/assets/bin-cancel-delete-remove-trash-garbage.svg" alt="Clear" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) saturate(100%) invert(0%);" />
      Clear
    `;
    clearBtn.style.cssText = `
      background: #ff6666;
      color: #000;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
    `;
    clearBtn.onmouseover = () => (clearBtn.style.background = "#ff8888");
    clearBtn.onmouseout = () => (clearBtn.style.background = "#ff6666");
    clearBtn.onclick = () => this.clearData();
    controls.appendChild(clearBtn);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ Close";
    closeBtn.style.cssText = `
      background: #00ff88;
      color: #000;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    `;
    closeBtn.onmouseover = () => (closeBtn.style.background = "#00ffaa");
    closeBtn.onmouseout = () => (closeBtn.style.background = "#00ff88");
    closeBtn.onclick = () => this.hideDisplay();
    controls.appendChild(closeBtn);

    this.displayOverlay.appendChild(controls);

    // Stats display
    const stats = document.createElement("div");
    stats.id = `oscilloscope-stats-${this.name}`;
    stats.style.cssText = `
      color: #00ff88;
      font-size: 11px;
      text-align: center;
      padding: 10px;
      background: rgba(0, 255, 136, 0.1);
      border-radius: 6px;
    `;
    stats.textContent = "Waiting for data...";
    this.displayOverlay.appendChild(stats);

    document.body.appendChild(this.displayOverlay);
    this.isDisplayVisible = true;
    this.startAnimation();

    console.log(`📊 ${this.name} oscilloscope opened`);
  }

  /**
   * Hide oscilloscope display
   */
  private hideDisplay(): void {
    if (this.displayOverlay) {
      this.displayOverlay.style.display = "none";
      this.isDisplayVisible = false;
      this.stopAnimation();
    }
  }

  /**
   * Start animation loop
   */
  private startAnimation(): void {
    if (this.animationFrame) return;

    const animate = () => {
      this.drawWaveform();
      this.animationFrame = requestAnimationFrame(animate);
    };
    animate();
  }

  /**
   * Stop animation loop
   */
  private stopAnimation(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Draw waveform on canvas
   */
  private drawWaveform(): void {
    if (!this.canvas) return;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    this.drawGrid(ctx, width, height);

    if (this.waveformData.time.length < 2) {
      return;
    }

    // Get data to plot
    const mode = this.oscilloscopeProps.mode;
    const timeData = this.waveformData.time;
    const valueData =
      mode === "voltage"
        ? this.waveformData.voltage
        : this.waveformData.current;

    // Find min/max for scaling
    const timeMin = Math.min(...timeData);
    const timeMax = Math.max(...timeData);
    const valueMin = Math.min(...valueData);
    const valueMax = Math.max(...valueData);

    const timeRange = timeMax - timeMin || 1;
    const valueRange = valueMax - valueMin || 1;

    // Draw waveform
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < timeData.length; i++) {
      const x = ((timeData[i] - timeMin) / timeRange) * (width - 40) + 20;
      const y =
        height - 20 - ((valueData[i] - valueMin) / valueRange) * (height - 40);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw axes labels
    ctx.fillStyle = "#00ff88";
    ctx.font = "10px Courier New";
    ctx.fillText(`${valueMin.toFixed(3)}`, 5, height - 15);
    ctx.fillText(`${valueMax.toFixed(3)}`, 5, 25);
    ctx.fillText(`${timeMin.toFixed(3)}s`, 20, height - 5);
    ctx.fillText(`${timeMax.toFixed(3)}s`, width - 60, height - 5);

    // Update stats
    this.updateStats(valueData);
  }

  /**
   * Draw grid on canvas
   */
  private drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    ctx.strokeStyle = "rgba(0, 255, 136, 0.2)";
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 20; x < width - 20; x += (width - 40) / 10) {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, height - 20);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = 20; y < height - 20; y += (height - 40) / 10) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    // Center lines (bolder)
    ctx.strokeStyle = "rgba(0, 255, 136, 0.5)";
    ctx.lineWidth = 1.5;

    // Center horizontal
    ctx.beginPath();
    ctx.moveTo(20, height / 2);
    ctx.lineTo(width - 20, height / 2);
    ctx.stroke();

    // Center vertical
    ctx.beginPath();
    ctx.moveTo(width / 2, 20);
    ctx.lineTo(width / 2, height - 20);
    ctx.stroke();
  }

  /**
   * Update statistics display
   */
  private updateStats(data: number[]): void {
    if (!this.displayOverlay || data.length === 0) return;

    const stats = this.displayOverlay.querySelector(
      `#oscilloscope-stats-${this.name}`
    ) as HTMLDivElement;
    if (!stats) return;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const pp = max - min; // Peak-to-peak

    const unit = this.oscilloscopeProps.mode === "voltage" ? "V" : "A";

    stats.innerHTML = `
      <strong>Statistics:</strong> 
      Min: ${min.toFixed(4)}${unit} | 
      Max: ${max.toFixed(4)}${unit} | 
      Avg: ${avg.toFixed(4)}${unit} | 
      P-P: ${pp.toFixed(4)}${unit} | 
      Samples: ${data.length}
    `;
  }

  public updateCircuitState(voltage: number, current: number): void {
    super.updateCircuitState(voltage, current);
    // Data recording is handled by CircuitScene during simulation
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      resistance: this.oscilloscopeProps.resistance,
      mode: this.oscilloscopeProps.mode,
    };
  }

  protected updateVisuals(_deltaTime: number): void {
    // Oscilloscope waveform is drawn in the overlay, not on the component itself
    // No animated visual updates needed for the component itself
  }

  /**
   * Cleanup when component is removed
   */
  public destroy(): void {
    this.stopAnimation();
    if (this.displayOverlay) {
      this.displayOverlay.remove();
    }
    super.destroy();
  }
}
