export class MnaStampWriter {
  constructor(
    private readonly G: number[][],
    private readonly B: number[][],
    private readonly C: number[][],
    private readonly D: number[][],
    private readonly i: number[],
    private readonly e: number[],
  ) {}

  public stampGminAllNodes(gmin: number): void {
    if (!Number.isFinite(gmin) || gmin <= 0) return;
    for (let n = 0; n < this.G.length; n++) {
      this.G[n]![n]! += gmin;
    }
  }

  public stampTwoNodeConductance(
    n1: number,
    n2: number,
    conductance: number,
  ): void {
    if (conductance <= 0 || !Number.isFinite(conductance)) return;
    if (n1 >= 0) {
      this.G[n1]![n1]! += conductance;
      if (n2 >= 0) this.G[n1]![n2]! -= conductance;
    }
    if (n2 >= 0) {
      this.G[n2]![n2]! += conductance;
      if (n1 >= 0) this.G[n2]![n1]! -= conductance;
    }
  }

  /**
   * Positive source current is defined as flowing from nPlus to nMinus.
   */
  public stampTwoNodeCurrentSource(
    nPlus: number,
    nMinus: number,
    current: number,
  ): void {
    if (!Number.isFinite(current) || current === 0) return;
    if (nPlus >= 0) this.i[nPlus] -= current;
    if (nMinus >= 0) this.i[nMinus] += current;
  }

  /**
   * Stamp independent voltage source into B/C/e and optional series R into D.
   */
  public stampVoltageSource(
    nPlus: number,
    nMinus: number,
    vsIndex: number,
    voltage: number,
    seriesResistanceOhms = 0,
  ): void {
    if (nPlus >= 0) {
      this.B[nPlus]![vsIndex] = 1;
      this.C[vsIndex]![nPlus] = 1;
    }
    if (nMinus >= 0) {
      this.B[nMinus]![vsIndex] = -1;
      this.C[vsIndex]![nMinus] = -1;
    }
    if (seriesResistanceOhms > 0) {
      this.D[vsIndex]![vsIndex] = -Math.max(seriesResistanceOhms, 1e-9);
    }
    this.e[vsIndex] = voltage;
  }
}
