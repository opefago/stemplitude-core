export interface ElementStamp {
  componentId: string;
  componentType: string;
  apply: (vsIndex: number) => number;
}

/**
 * Ordered list of element stamps to apply to an MNA system.
 * This separates "what is in the circuit" from "how matrices are solved".
 */
export class CircuitNetlist {
  private readonly stamps: ElementStamp[] = [];

  public add(stamp: ElementStamp): void {
    this.stamps.push(stamp);
  }

  public applyAll(initialVsIndex = 0): number {
    let vsIndex = initialVsIndex;
    for (const stamp of this.stamps) {
      vsIndex = stamp.apply(vsIndex);
    }
    return vsIndex;
  }

  public size(): number {
    return this.stamps.length;
  }
}
