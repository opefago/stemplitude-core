import type { AstableDiscreteRcResult } from "../model/timer555DiscreteRc";

/**
 * Optional resolver: number of wires incident on a component (set from CircuitScene).
 */
let wireCountFor: ((componentId: string) => number) | null = null;

export function setComponentWireCountGetter(
  fn: (componentId: string) => number
): void {
  wireCountFor = fn;
}

export function getComponentWireCount(componentId: string): number {
  return wireCountFor ? wireCountFor(componentId) : 0;
}

/** After solver union-find, pins with the same matrix index are one electrical node. */
let sameNetFor: ((componentId: string, nodeIdA: string, nodeIdB: string) => boolean) | null =
  null;

export function setSameNetChecker(
  fn: (componentId: string, nodeIdA: string, nodeIdB: string) => boolean
): void {
  sameNetFor = fn;
}

export function arePinsSameElectricalNode(
  componentId: string,
  nodeIdA: string,
  nodeIdB: string
): boolean {
  return sameNetFor ? sameNetFor(componentId, nodeIdA, nodeIdB) : false;
}

export type DiscreteRcResolver = (timerId: string) => AstableDiscreteRcResult;

let discreteRcResolver: DiscreteRcResolver | null = null;

export function setDiscreteRcResolver(fn: DiscreteRcResolver | null): void {
  discreteRcResolver = fn;
}

/** NE555 astable R1/R2/C from discrete resistors/capacitors (Falstad-style). */
export function resolveDiscreteRcForTimer555(timerId: string): AstableDiscreteRcResult {
  if (!discreteRcResolver) {
    return {
      r1Ohms: 0,
      r2Ohms: 0,
      cFarads: 0,
      valid: false,
      reason: "no_resolver",
    };
  }
  return discreteRcResolver(timerId);
}
