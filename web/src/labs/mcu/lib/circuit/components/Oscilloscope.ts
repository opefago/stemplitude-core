import { Graphics } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";

export interface OscilloscopeProperties extends CircuitProperties {
  mode: "voltage" | "current" | "both";
}

interface RingBuffer {
  data: Float64Array;
  head: number;
  size: number;
  capacity: number;
}

function createRingBuffer(capacity: number): RingBuffer {
  return { data: new Float64Array(capacity), head: 0, size: 0, capacity };
}

function ringPush(buf: RingBuffer, value: number): void {
  buf.data[buf.head] = value;
  buf.head = (buf.head + 1) % buf.capacity;
  if (buf.size < buf.capacity) buf.size++;
}

function ringGet(buf: RingBuffer, index: number): number {
  if (index < 0 || index >= buf.size) return 0;
  const start = (buf.head - buf.size + buf.capacity) % buf.capacity;
  return buf.data[(start + index) % buf.capacity];
}

export class Oscilloscope extends CircuitComponent {
  protected oscilloscopeProps: OscilloscopeProperties;
  private displayOverlay: HTMLDivElement | null = null;
  private isDisplayVisible: boolean = false;
  private clickStartPos: { x: number; y: number } | null = null;

  // Ring buffers for efficient data storage
  private timeBuf: RingBuffer;
  private voltageBuf: RingBuffer;
  private currentBuf: RingBuffer;
  private maxDataPoints: number = 2000;

  private canvas: HTMLCanvasElement | null = null;
  private animationFrame: number | null = null;
  private miniWaveformGraphics: Graphics | null = null;
  private miniGridGraphics: Graphics | null = null;
  private lastMiniRedraw: number = 0;

  // Multi-channel state
  private channelEnabled = { voltage: true, current: true };

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: OscilloscopeProperties = {
      value: 1e9,
      resistance: 1e9,
      tolerance: 0,
      powerRating: 0.001,
      voltage: 0,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      mode: "both",
    };

    super(name, "oscilloscope", props, gridX, gridY);
    this.oscilloscopeProps = props as OscilloscopeProperties;
    this.timeBuf = createRingBuffer(this.maxDataPoints);
    this.voltageBuf = createRingBuffer(this.maxDataPoints);
    this.currentBuf = createRingBuffer(this.maxDataPoints);
  }

  protected initializeNodes(): void {
    this.nodes = [
      {
        id: "probe",
        position: { x: -20, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "probe",
      },
      {
        id: "ground",
        position: { x: 20, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "ground",
      },
    ];
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -40, valueY: 40 };
  }

  protected updateNodePositions(): void {
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);
    this.nodes[0].position.x = -20 * cos;
    this.nodes[0].position.y = -20 * sin;
    this.nodes[1].position.x = 20 * cos;
    this.nodes[1].position.y = 20 * sin;
  }

  private updateLabels(): void {
    this.labelText.text = this.name;
    this.labelText.style = { fontSize: 10, fill: 0xffffff, fontFamily: "Arial" };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -40);

    this.valueText.text = "SCOPE";
    this.valueText.style = { fontSize: 7, fill: 0x00ff88, fontFamily: "Arial" };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 40);
  }

  protected createVisuals(): void {
    if (this.componentGraphics.parent) {
      this.componentGraphics.parent.removeChild(this.componentGraphics);
    }
    this.componentGraphics = new Graphics();

    // Screen background
    this.componentGraphics
      .rect(-15, -12, 30, 24)
      .fill(0x001a0a)
      .stroke({ width: 2, color: 0x00ff88 });

    // Mini grid lines inside the screen
    this.miniGridGraphics = new Graphics();
    const gridAlpha = 0.15;
    for (let i = 1; i < 4; i++) {
      this.miniGridGraphics
        .moveTo(-12, -12 + i * 6)
        .lineTo(12, -12 + i * 6)
        .stroke({ width: 0.5, color: 0x00ff88, alpha: gridAlpha });
    }
    for (let i = 1; i < 5; i++) {
      this.miniGridGraphics
        .moveTo(-12 + i * 4.8, -12)
        .lineTo(-12 + i * 4.8, 12)
        .stroke({ width: 0.5, color: 0x00ff88, alpha: gridAlpha });
    }
    // Center crosshairs brighter
    this.miniGridGraphics
      .moveTo(-12, 0)
      .lineTo(12, 0)
      .stroke({ width: 0.5, color: 0x00ff88, alpha: 0.3 });
    this.miniGridGraphics
      .moveTo(0, -12)
      .lineTo(0, 12)
      .stroke({ width: 0.5, color: 0x00ff88, alpha: 0.3 });

    this.componentGraphics.addChild(this.miniGridGraphics);

    // Live mini waveform graphics (redrawn each frame)
    this.miniWaveformGraphics = new Graphics();
    this.componentGraphics.addChild(this.miniWaveformGraphics);
    this.drawMiniWaveform();

    // Terminal leads
    this.componentGraphics
      .moveTo(-20, 0)
      .lineTo(-15, 0)
      .stroke({ width: 2, color: 0xaaaaaa });
    this.componentGraphics
      .moveTo(15, 0)
      .lineTo(20, 0)
      .stroke({ width: 2, color: 0xaaaaaa });

    this.updateLabels();
    this.displayContainer.addChild(this.componentGraphics);
    this.createPinGraphics();

    this.componentGraphics.eventMode = "static";
    this.componentGraphics.cursor = "pointer";

    this.componentGraphics.on("pointerdown", (event) => {
      this.clickStartPos = { x: event.global.x, y: event.global.y };
    });

    this.componentGraphics.on("pointerup", (event) => {
      if (this.clickStartPos) {
        const dx = event.global.x - this.clickStartPos.x;
        const dy = event.global.y - this.clickStartPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          this.toggleDisplay();
        }
        this.clickStartPos = null;
      }
    });
  }

  /**
   * Draw live mini waveform on the schematic component using PixiJS Graphics.
   * Shows the last N data points scrolling across the 30x24px display area.
   */
  private drawMiniWaveform(): void {
    if (!this.miniWaveformGraphics) return;
    this.miniWaveformGraphics.clear();

    const g = this.miniWaveformGraphics;
    const displayW = 24;
    const displayH = 20;
    const offsetX = -12;
    const offsetY = -10;

    if (!this.voltageBuf || this.voltageBuf.size < 2) {
      // Static sine wave placeholder
      g.moveTo(offsetX, 0);
      for (let i = 0; i <= 15; i++) {
        const x = offsetX + (i / 15) * displayW;
        const y = 5 * Math.sin((i / 15) * 4 * Math.PI);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 1, color: 0x00ff88 });
      return;
    }

    // Show last N points in the mini display
    const pointsToShow = Math.min(this.voltageBuf.size, 60);
    const startIdx = this.voltageBuf.size - pointsToShow;

    // Auto-scale
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = startIdx; i < this.voltageBuf.size; i++) {
      const v = ringGet(this.voltageBuf, i);
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    const vRange = vMax - vMin || 1;

    // Draw voltage trace (green)
    if (this.channelEnabled.voltage) {
      for (let i = 0; i < pointsToShow; i++) {
        const v = ringGet(this.voltageBuf, startIdx + i);
        const x = offsetX + (i / (pointsToShow - 1)) * displayW;
        const y = offsetY + displayH - ((v - vMin) / vRange) * displayH;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 1, color: 0x00ff88 });
    }

    // Draw current trace (blue) if enabled
    if (this.channelEnabled.current && this.currentBuf && this.currentBuf.size >= 2) {
      let cMin = Infinity;
      let cMax = -Infinity;
      for (let i = startIdx; i < this.currentBuf.size; i++) {
        const c = ringGet(this.currentBuf, i);
        if (c < cMin) cMin = c;
        if (c > cMax) cMax = c;
      }
      const cRange = cMax - cMin || 1;

      for (let i = 0; i < pointsToShow; i++) {
        const c = ringGet(this.currentBuf, startIdx + i);
        const x = offsetX + (i / (pointsToShow - 1)) * displayW;
        const y = offsetY + displayH - ((c - cMin) / cRange) * displayH;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 1, color: 0x4488ff });
    }
  }

  public recordData(time: number, voltage: number, current: number): void {
    ringPush(this.timeBuf, time);
    ringPush(this.voltageBuf, voltage);
    ringPush(this.currentBuf, current);

    // Update mini waveform at ~30fps
    const now = performance.now();
    if (now - this.lastMiniRedraw > 33) {
      this.drawMiniWaveform();
      this.lastMiniRedraw = now;
    }

    if (this.isDisplayVisible && this.canvas) {
      this.drawWaveform();
    }
  }

  public clearData(): void {
    this.timeBuf = createRingBuffer(this.maxDataPoints);
    this.voltageBuf = createRingBuffer(this.maxDataPoints);
    this.currentBuf = createRingBuffer(this.maxDataPoints);
    this.drawMiniWaveform();
    if (this.canvas) this.drawWaveform();
  }

  private toggleDisplay(): void {
    if (this.isDisplayVisible) this.hideDisplay();
    else this.showDisplay();
  }

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
      width: 650px;
      font-family: 'Courier New', monospace;
    `;

    // Title
    const title = document.createElement("div");
    title.innerHTML = `${this.name} - Oscilloscope`;
    title.style.cssText = `
      color: #00ff88;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
      text-align: center;
      border-bottom: 2px solid #00ff88;
      padding-bottom: 10px;
    `;
    this.displayOverlay.appendChild(title);

    // Canvas for waveform
    this.canvas = document.createElement("canvas");
    this.canvas.width = 610;
    this.canvas.height = 340;
    this.canvas.style.cssText = `
      background: #000;
      border: 2px solid #00ff88;
      border-radius: 6px;
      display: block;
      margin: 0 auto 15px auto;
    `;
    this.displayOverlay.appendChild(this.canvas);

    // Channel toggles row
    const channelRow = document.createElement("div");
    channelRow.style.cssText = `
      display: flex;
      gap: 15px;
      margin-bottom: 10px;
      justify-content: center;
    `;

    const ch1Toggle = this.createChannelToggle("CH1: Voltage", "#00ff88", true, (on) => {
      this.channelEnabled.voltage = on;
    });
    const ch2Toggle = this.createChannelToggle("CH2: Current", "#4488ff", true, (on) => {
      this.channelEnabled.current = on;
    });
    channelRow.appendChild(ch1Toggle);
    channelRow.appendChild(ch2Toggle);
    this.displayOverlay.appendChild(channelRow);

    // Controls row
    const controls = document.createElement("div");
    controls.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      gap: 10px;
    `;

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.style.cssText = `
      background: #ff6666; color: #000; border: none; border-radius: 6px;
      padding: 6px 12px; font-size: 11px; font-weight: bold; cursor: pointer;
    `;
    clearBtn.onclick = () => this.clearData();
    controls.appendChild(clearBtn);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = `
      background: #00ff88; color: #000; border: none; border-radius: 6px;
      padding: 6px 12px; font-size: 11px; font-weight: bold; cursor: pointer;
    `;
    closeBtn.onclick = () => this.hideDisplay();
    controls.appendChild(closeBtn);
    this.displayOverlay.appendChild(controls);

    // Measurements display
    const measurements = document.createElement("div");
    measurements.id = `oscilloscope-stats-${this.name}`;
    measurements.style.cssText = `
      color: #00ff88;
      font-size: 11px;
      padding: 10px;
      background: rgba(0, 255, 136, 0.1);
      border-radius: 6px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    `;
    measurements.textContent = "Waiting for data...";
    this.displayOverlay.appendChild(measurements);

    document.body.appendChild(this.displayOverlay);
    this.isDisplayVisible = true;
    this.startAnimation();
  }

  private createChannelToggle(
    label: string,
    color: string,
    defaultOn: boolean,
    onChange: (on: boolean) => void
  ): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.style.cssText = `
      display: flex; align-items: center; gap: 6px; cursor: pointer;
      color: ${color}; font-size: 12px;
    `;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = defaultOn;
    checkbox.onchange = () => onChange(checkbox.checked);
    wrapper.appendChild(checkbox);
    wrapper.appendChild(document.createTextNode(label));
    return wrapper;
  }

  private hideDisplay(): void {
    if (this.displayOverlay) {
      this.displayOverlay.style.display = "none";
      this.isDisplayVisible = false;
      this.stopAnimation();
    }
  }

  private startAnimation(): void {
    if (this.animationFrame) return;
    const animate = () => {
      this.drawWaveform();
      this.animationFrame = requestAnimationFrame(animate);
    };
    animate();
  }

  private stopAnimation(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private drawWaveform(): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const W = this.canvas.width;
    const H = this.canvas.height;
    const margin = { left: 50, right: 15, top: 15, bottom: 30 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    this.drawEnhancedGrid(ctx, W, H, margin);

    const n = this.voltageBuf.size;
    if (n < 2) return;

    // Time window
    const tMin = ringGet(this.timeBuf, 0);
    const tMax = ringGet(this.timeBuf, n - 1);
    const tRange = tMax - tMin || 1;

    // Voltage channel
    if (this.channelEnabled.voltage) {
      let vMin = Infinity, vMax = -Infinity;
      for (let i = 0; i < n; i++) {
        const v = ringGet(this.voltageBuf, i);
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
      const pad = (vMax - vMin) * 0.1 || 1;
      vMin -= pad;
      vMax += pad;
      const vRange = vMax - vMin || 1;

      // Y-axis labels for voltage
      ctx.fillStyle = "#00ff88";
      ctx.font = "10px Courier New";
      for (let i = 0; i <= 5; i++) {
        const val = vMin + (i / 5) * vRange;
        const y = margin.top + plotH - (i / 5) * plotH;
        ctx.fillText(this.formatValue(val, "V"), 2, y + 3);
      }

    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const t = ringGet(this.timeBuf, i);
        const v = ringGet(this.voltageBuf, i);
        const x = margin.left + ((t - tMin) / tRange) * plotW;
        const y = margin.top + plotH - ((v - vMin) / vRange) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Current channel
    if (this.channelEnabled.current && this.currentBuf.size >= 2) {
      let cMin = Infinity, cMax = -Infinity;
      for (let i = 0; i < n; i++) {
        const c = ringGet(this.currentBuf, i);
        if (c < cMin) cMin = c;
        if (c > cMax) cMax = c;
      }
      const pad = (cMax - cMin) * 0.1 || 0.1;
      cMin -= pad;
      cMax += pad;
      const cRange = cMax - cMin || 1;

      // Y-axis labels on right side for current
      ctx.fillStyle = "#4488ff";
      ctx.font = "10px Courier New";
      ctx.textAlign = "right";
      for (let i = 0; i <= 5; i++) {
        const val = cMin + (i / 5) * cRange;
        const y = margin.top + plotH - (i / 5) * plotH;
        ctx.fillText(this.formatValue(val, "A"), W - 2, y + 3);
      }
      ctx.textAlign = "left";

      ctx.strokeStyle = "#4488ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const t = ringGet(this.timeBuf, i);
        const c = ringGet(this.currentBuf, i);
        const x = margin.left + ((t - tMin) / tRange) * plotW;
        const y = margin.top + plotH - ((c - cMin) / cRange) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    }

    // Time axis labels
    ctx.fillStyle = "#888";
    ctx.font = "10px Courier New";
    for (let i = 0; i <= 5; i++) {
      const t = tMin + (i / 5) * tRange;
      const x = margin.left + (i / 5) * plotW;
      ctx.fillText(this.formatTime(t), x, H - 5);
    }

    // Time delta indicator
    const deltaT = tRange;
    ctx.fillStyle = "#aaa";
    ctx.font = "11px Courier New";
    ctx.fillText(`\u0394t: ${this.formatTime(deltaT)}`, margin.left + plotW / 2 - 30, H - 5);

    this.updateMeasurements();
  }

  private drawEnhancedGrid(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    margin: { left: number; right: number; top: number; bottom: number }
  ): void {
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    // Minor grid (10x10)
    ctx.strokeStyle = "rgba(0, 255, 136, 0.12)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const x = margin.left + (i / 10) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + plotH);
      ctx.stroke();

      const y = margin.top + (i / 10) * plotH;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();
    }

    // Center crosshairs (brighter)
    ctx.strokeStyle = "rgba(0, 255, 136, 0.35)";
    ctx.lineWidth = 1;
    const cx = margin.left + plotW / 2;
    const cy = margin.top + plotH / 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, cy);
    ctx.lineTo(margin.left + plotW, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, margin.top);
    ctx.lineTo(cx, margin.top + plotH);
    ctx.stroke();
  }

  private updateMeasurements(): void {
    if (!this.displayOverlay) return;
    const el = this.displayOverlay.querySelector(
      `#oscilloscope-stats-${this.name}`
    ) as HTMLDivElement;
    if (!el) return;

    const n = this.voltageBuf.size;
    if (n < 2) {
      el.textContent = "Waiting for data...";
      return;
    }

    // Compute voltage stats
    let vMin = Infinity, vMax = -Infinity, vSum = 0, vSumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = ringGet(this.voltageBuf, i);
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
      vSum += v;
      vSumSq += v * v;
    }
    const vAvg = vSum / n;
    const vRms = Math.sqrt(vSumSq / n);
    const vPp = vMax - vMin;

    // Frequency detection via zero crossings
    const freq = this.detectFrequency(this.voltageBuf, this.timeBuf);

    // Compute current stats
    let cMin = Infinity, cMax = -Infinity, cSum = 0, cSumSq = 0;
    for (let i = 0; i < n; i++) {
      const c = ringGet(this.currentBuf, i);
      if (c < cMin) cMin = c;
      if (c > cMax) cMax = c;
      cSum += c;
      cSumSq += c * c;
    }
    const cRms = Math.sqrt(cSumSq / n);

    const period = freq > 0 ? 1 / freq : 0;

    el.innerHTML = `
      <div style="color:#00ff88">
        <strong>CH1 Voltage:</strong><br/>
        Max: ${this.formatValue(vMax, "V")} &nbsp; Min: ${this.formatValue(vMin, "V")}<br/>
        P-P: ${this.formatValue(vPp, "V")} &nbsp; RMS: ${this.formatValue(vRms, "V")}
      </div>
      <div style="color:#4488ff">
        <strong>CH2 Current:</strong><br/>
        Max: ${this.formatValue(cMax, "A")} &nbsp; Min: ${this.formatValue(cMin, "A")}<br/>
        P-P: ${this.formatValue(cMax - cMin, "A")} &nbsp; RMS: ${this.formatValue(cRms, "A")}
      </div>
      <div style="color:#aaa; grid-column: span 2; text-align: center; margin-top: 4px;">
        Freq: ${freq > 0 ? this.formatFreq(freq) : "---"} &nbsp;
        Period: ${period > 0 ? this.formatTime(period) : "---"} &nbsp;
        Samples: ${n}
      </div>
    `;
  }

  private detectFrequency(valueBuf: RingBuffer, timeBuf: RingBuffer): number {
    const n = valueBuf.size;
    if (n < 10) return 0;

    // Compute DC offset (mean)
    let sum = 0;
    for (let i = 0; i < n; i++) sum += ringGet(valueBuf, i);
    const mean = sum / n;

    // Count positive-going zero crossings
    let crossings = 0;
    let firstCrossingTime = 0;
    let lastCrossingTime = 0;

    for (let i = 1; i < n; i++) {
      const prev = ringGet(valueBuf, i - 1) - mean;
      const curr = ringGet(valueBuf, i) - mean;
      if (prev <= 0 && curr > 0) {
        // Interpolate crossing time
        const frac = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr));
        const t0 = ringGet(timeBuf, i - 1);
        const t1 = ringGet(timeBuf, i);
        const crossTime = t0 + frac * (t1 - t0);

        if (crossings === 0) firstCrossingTime = crossTime;
        lastCrossingTime = crossTime;
        crossings++;
      }
    }

    if (crossings < 2) return 0;
    const totalTime = lastCrossingTime - firstCrossingTime;
    if (totalTime <= 0) return 0;
    return (crossings - 1) / totalTime;
  }

  private formatValue(val: number, unit: string): string {
    const abs = Math.abs(val);
    if (abs >= 1000) return `${(val / 1000).toFixed(2)}k${unit}`;
    if (abs >= 1) return `${val.toFixed(3)}${unit}`;
    if (abs >= 1e-3) return `${(val * 1e3).toFixed(2)}m${unit}`;
    if (abs >= 1e-6) return `${(val * 1e6).toFixed(1)}\u00B5${unit}`;
    return `${val.toFixed(6)}${unit}`;
  }

  private formatTime(t: number): string {
    const abs = Math.abs(t);
    if (abs >= 1) return `${t.toFixed(3)}s`;
    if (abs >= 1e-3) return `${(t * 1e3).toFixed(2)}ms`;
    if (abs >= 1e-6) return `${(t * 1e6).toFixed(1)}\u00B5s`;
    return `${(t * 1e9).toFixed(0)}ns`;
  }

  private formatFreq(f: number): string {
    if (f >= 1e6) return `${(f / 1e6).toFixed(2)}MHz`;
    if (f >= 1e3) return `${(f / 1e3).toFixed(2)}kHz`;
    return `${f.toFixed(2)}Hz`;
  }

  public updateCircuitState(voltage: number, current: number): void {
    super.updateCircuitState(voltage, current);
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      resistance: this.oscilloscopeProps.resistance,
      mode: this.oscilloscopeProps.mode,
    };
  }

  protected updateVisuals(_deltaTime: number): void {
    // Mini waveform is updated via recordData -> drawMiniWaveform
  }

  public destroy(): void {
    this.stopAnimation();
    if (this.displayOverlay) {
      this.displayOverlay.remove();
    }
    super.destroy();
  }
}
