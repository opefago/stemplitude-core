/**
 * Transient (time-domain) simulation is running — used to gate behavioral
 * animations (e.g. 555 astable) so they do not run on the idle canvas.
 */
export let transientSimulationRunning = false;

export function setTransientSimulationRunning(active: boolean): void {
  transientSimulationRunning = active;
}
