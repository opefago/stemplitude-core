import { Graphics, Text } from "pixi.js";
import { CircuitComponent, CircuitProperties } from "../CircuitComponent";
import {
  astableTimingFromExternalRc,
  NE555_MIN_SUPPLY_V,
  NE555_RESET_RELEASE_MIN_V,
} from "../model/timer555Model";
import { transientSimulationRunning } from "../state/circuitSimulationFlags";
import {
  resolveDiscreteRcForTimer555,
} from "../state/circuitComponentWiring";
import type { AstableDiscreteRcResult } from "../model/timer555DiscreteRc";

export interface Timer555Properties extends CircuitProperties {
  mode: "astable" | "monostable";
  /** From discrete resistors (Vcc–DIS, DIS–TRIG) and cap (TRIG–GND); 0 if missing. */
  r1Ohms: number;
  r2Ohms: number;
  cFarads: number;
  /** Derived from R1,R2,C via datasheet formulas when astable. */
  frequency: number;
  dutyCycle: number;
  outputHigh: boolean;
  /** Current operation status, mostly for UI diagnostics. */
  status?: string;
  /** Last discrete RC extraction reason from netlist resolver. */
  discreteReason?: AstableDiscreteRcResult["reason"];
}

/** Body half-size — enlarged so pin spacing clears terminal discs (grid ~20px). */
const BODY_HW = 52;
const BODY_HH = 62;

/**
 * NE555 astable: timing from discrete R1, R2, C on the schematic (Falstad-style netlist),
 * not from hidden fields. (Full SPICE + MNA output source not implemented — timer555Model.ts.)
 */
export class Timer555 extends CircuitComponent {
  protected timerProps: Timer555Properties;
  private pinLabelTexts: Text[] = [];
  private centerLabel: Text | null = null;
  /** Last evaluated reason when not oscillating (for status line). */
  private statusReason: string = "—";
  /** Last discrete R/C scan (same nets as solver). */
  private lastDiscrete: AstableDiscreteRcResult | null = null;

  constructor(name: string, gridX: number = 0, gridY: number = 0) {
    const props: Timer555Properties = {
      value: 0,
      tolerance: 0,
      powerRating: 0.5,
      voltage: 5,
      current: 0,
      power: 0,
      burnt: false,
      glowing: false,
      mode: "astable",
      r1Ohms: 0,
      r2Ohms: 0,
      cFarads: 0,
      frequency: 0,
      dutyCycle: 0,
      outputHigh: false,
    };

    super(name, "timer555", props, gridX, gridY);
    this.timerProps = props as Timer555Properties;
  }

  protected initializeNodes(): void {
    const ySide = 32;
    this.nodes = [
      {
        id: "vcc",
        position: { x: 0, y: -64 },
        voltage: 5,
        current: 0,
        connections: [],
        role: "power",
      },
      {
        id: "gnd",
        position: { x: 0, y: 64 },
        voltage: 0,
        current: 0,
        connections: [],
        role: "ground",
      },
      {
        id: "out",
        position: { x: 64, y: 0 },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "trig",
        position: { x: -64, y: ySide },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "thresh",
        position: { x: -64, y: -ySide },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "disch",
        position: { x: 64, y: -ySide },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "ctrl",
        position: { x: 64, y: ySide },
        voltage: 0,
        current: 0,
        connections: [],
      },
      {
        id: "rst",
        position: { x: -64, y: 0 },
        voltage: 5,
        current: 0,
        connections: [],
      },
    ];
  }

  protected getTerminalPinRadius(): number {
    return 5;
  }

  protected getDefaultLabelPositions(): { labelY: number; valueY: number } {
    return { labelY: -88, valueY: 82 };
  }

  private clearPinLabels(): void {
    if (!this.pinLabelTexts) return;
    this.pinLabelTexts.forEach((t) => {
      if (t.parent) t.parent.removeChild(t);
      t.destroy();
    });
    this.pinLabelTexts = [];
    if (this.centerLabel) {
      if (this.centerLabel.parent) this.centerLabel.parent.removeChild(this.centerLabel);
      this.centerLabel.destroy();
      this.centerLabel = null;
    }
  }

  private addPinLabel(text: string, x: number, y: number, fontSize: number = 8): void {
    const t = new Text({
      text,
      style: {
        fontSize,
        fill: 0xffffff,
        fontFamily: "Arial",
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.componentGraphics.addChild(t);
    if (!this.pinLabelTexts) this.pinLabelTexts = [];
    this.pinLabelTexts.push(t);
  }

  private recomputeDerivedTiming(): void {
    this.lastDiscrete = resolveDiscreteRcForTimer555(this.getName());
    if (this.lastDiscrete.valid) {
      this.timerProps.r1Ohms = this.lastDiscrete.r1Ohms;
      this.timerProps.r2Ohms = this.lastDiscrete.r2Ohms;
      this.timerProps.cFarads = this.lastDiscrete.cFarads;
    } else {
      this.timerProps.r1Ohms = 0;
      this.timerProps.r2Ohms = 0;
      this.timerProps.cFarads = 0;
    }
    const t = astableTimingFromExternalRc(
      this.timerProps.r1Ohms,
      this.timerProps.r2Ohms,
      this.timerProps.cFarads
    );
    if (t.valid) {
      this.timerProps.frequency = t.frequencyHz;
      this.timerProps.dutyCycle = t.dutyCycle;
    } else {
      this.timerProps.frequency = 0;
      this.timerProps.dutyCycle = 0;
    }
  }

  private discreteFailLabel(
    reason: AstableDiscreteRcResult["reason"]
  ): string {
    switch (reason) {
      case "tie_2_6":
        return "tie 2&6";
      case "short_7_2":
        return "7=2&6";
      case "need_r1":
        return "R1 Vcc–7";
      case "need_r2":
        return "R2 7–2&6";
      case "need_c":
        return "C 2&6–GND";
      case "no_solver":
      case "no_resolver":
        return "nets";
      default:
        return "R/C";
    }
  }

  private getDiscreteReason(): AstableDiscreteRcResult["reason"] {
    return this.lastDiscrete?.reason ?? "no_solver";
  }

  private refreshOperationalStatus(): void {
    const vSupply = this.nodes[0].voltage - this.nodes[1].voltage;
    const vRst = this.nodes[7].voltage - this.nodes[1].voltage;
    const t = astableTimingFromExternalRc(
      this.timerProps.r1Ohms,
      this.timerProps.r2Ohms,
      this.timerProps.cFarads
    );

    if (!transientSimulationRunning) {
      this.statusReason = "Stop sim";
      return;
    }
    if (vSupply < NE555_MIN_SUPPLY_V) {
      this.statusReason = "Vcc low";
      return;
    }
    if (vRst < NE555_RESET_RELEASE_MIN_V) {
      this.statusReason = "RST low";
      return;
    }
    if (this.timerProps.mode !== "astable") {
      this.statusReason = "mode";
      return;
    }
    if (!this.lastDiscrete?.valid) {
      this.statusReason = this.discreteFailLabel(
        this.lastDiscrete?.reason ?? "no_solver"
      );
      return;
    }
    if (!t.valid || this.timerProps.frequency <= 0) {
      this.statusReason = "R/C";
      return;
    }
    this.statusReason = "run";
  }

  protected createVisuals(): void {
    this.clearPinLabels();
    this.componentGraphics.clear();

    const stroke = { width: 2, color: 0xffffff };
    const g = this.componentGraphics;
    const hw = BODY_HW;
    const hh = BODY_HH;

    g.moveTo(-hw, -hh);
    g.lineTo(-8, -hh);
    g.quadraticCurveTo(0, -hh - 10, 8, -hh);
    g.lineTo(hw, -hh);
    g.lineTo(hw, hh);
    g.lineTo(-hw, hh);
    g.closePath();
    g.stroke(stroke);

    this.centerLabel = new Text({
      text: "555",
      style: {
        fontSize: 22,
        fill: 0xffffff,
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    });
    this.centerLabel.anchor.set(0.5);
    this.centerLabel.position.set(0, 0);
    this.componentGraphics.addChild(this.centerLabel);

    this.addPinLabel("VCC", 0, -38);
    this.addPinLabel("GND", 0, 38);
    this.addPinLabel("OUT", 28, 0);
    this.addPinLabel("TRIG", -28, 22);
    this.addPinLabel("THR", -28, -22);
    this.addPinLabel("DIS", 28, -22);
    this.addPinLabel("CV", 28, 22);
    this.addPinLabel("RST", -28, 0);

    const lead = (x1: number, y1: number, x2: number, y2: number) => {
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke(stroke);
    };

    lead(0, -hh, 0, -64);
    lead(0, hh, 0, 64);
    lead(hw, 0, 64, 0);
    lead(-hw, 32, -64, 32);
    lead(-hw, -32, -64, -32);
    lead(hw, -32, 64, -32);
    lead(hw, 32, 64, 32);
    lead(-hw, 0, -64, 0);

    this.updateLabels();
  }

  private updateLabels(): void {
    if (!this.timerProps) return;
    this.labelText.text = this.name;
    this.labelText.style = {
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: "Arial",
    };
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -88);

    const m = this.timerProps.mode;
    const f = this.timerProps.frequency;
    const d = this.timerProps.dutyCycle;
    const oh = this.timerProps.outputHigh;
    const live = m === "astable" && this.statusReason === "run";

    if (m === "astable") {
      const fK = f >= 1000 ? `${(f / 1000).toFixed(2)}kHz` : `${f.toFixed(1)}Hz`;
      this.valueText.text = live
        ? `${fK} ${(d * 100).toFixed(0)}% ${oh ? "HI" : "LO"}`
        : `${fK} ${(d * 100).toFixed(0)}% OFF (${this.statusReason})`;
    } else {
      this.valueText.text = `1-shot ${oh ? "HI" : "LO"}`;
    }
    this.valueText.style = {
      fontSize: 8,
      fill: live ? (oh ? 0x66ff66 : 0xaaaaaa) : 0x888888,
      fontFamily: "Arial",
    };
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, 82);
  }

  protected updateNodePositions(): void {
    const bases: { x: number; y: number }[] = [
      { x: 0, y: -64 },
      { x: 0, y: 64 },
      { x: 64, y: 0 },
      { x: -64, y: 32 },
      { x: -64, y: -32 },
      { x: 64, y: -32 },
      { x: 64, y: 32 },
      { x: -64, y: 0 },
    ];
    const cos = Math.cos((this.orientation * Math.PI) / 180);
    const sin = Math.sin((this.orientation * Math.PI) / 180);

    for (let i = 0; i < this.nodes.length; i++) {
      const b = bases[i];
      this.nodes[i].position.x = b.x * cos - b.y * sin;
      this.nodes[i].position.y = b.x * sin + b.y * cos;
    }
  }

  protected updateNodeVoltages(): void {
    // Solver owns node voltages; keep component-level voltage as OUT-to-GND.
    this.circuitProps.voltage = this.nodes[2].voltage - this.nodes[1].voltage;
  }

  protected updateVisuals(deltaTime: number): void {
    this.recomputeDerivedTiming();
    this.refreshOperationalStatus();
    const vOut = this.nodes[2].voltage - this.nodes[1].voltage;
    const vSupply = this.nodes[0].voltage - this.nodes[1].voltage;
    this.timerProps.outputHigh =
      this.statusReason === "run" && vSupply > 0 ? vOut > vSupply * 0.5 : false;
    this.circuitProps.voltage = vOut;

    this.updateLabels();

    if (this.centerLabel) {
      this.centerLabel.style.fill = this.timerProps.outputHigh ? 0xffffaa : 0xffffff;
    }
  }

  public override update(deltaTime: number): void {
    super.update(deltaTime);
    this.updateVisuals(deltaTime);
  }

  public updateCircuitState(voltage: number, current: number): void {
    super.updateCircuitState(voltage, current);
    this.recomputeDerivedTiming();
  }

  public getCircuitProperties() {
    return {
      ...super.getCircuitProperties(),
      mode: this.timerProps.mode,
      r1Ohms: this.timerProps.r1Ohms,
      r2Ohms: this.timerProps.r2Ohms,
      cFarads: this.timerProps.cFarads,
      frequency: this.timerProps.frequency,
      dutyCycle: this.timerProps.dutyCycle,
      outputHigh: this.timerProps.outputHigh,
      status: this.statusReason,
      discreteReason: this.getDiscreteReason(),
    } as Timer555Properties & CircuitProperties;
  }

  public getImpedance(_frequency: number = 0): number {
    return 1e6;
  }
}
