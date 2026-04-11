/**
 * NE555 / LM555 behavioral reference (simplified for education).
 *
 * **Industry practice (SPICE / ngspice / LTspice):** The IC is modeled with a
 * hierarchical subcircuit: three 5 kΩ divider to internal references (⅓ Vcc, ⅔ Vcc),
 * two comparators, an SR latch, an open-collector discharge on pin 7 (DISCH), and
 * output stage. Timing is entirely determined by **external** R and C; the chip does
 * not “have a frequency” by itself.
 *
 * **Classic astable (datasheet Fig. 9 style):** R1 from Vcc to pin 7, R2 from pin 7
 * to the common node of pins 2 (TRIG) and 6 (THR), capacitor from that node to GND.
 * Pins 2 and 6 must be electrically common; pin 7 is connected to that node through R2
 * (it must not be directly shorted to 2/6 in a standard astable).
 *
 * **Equations (NE555 datasheet):**
 *   t_HIGH ≈ 0.693 × (R1 + R2) × C
 *   t_LOW  ≈ 0.693 × R2 × C
 *   f = 1 / (t_HIGH + t_LOW), duty = t_HIGH / (t_HIGH + t_LOW)
 *
 * **Reset (pin 4):** Active-low: output is forced low when RESET is held low; timing
 * stops. Must be brought high (typically tied to Vcc) for normal operation.
 */

export const NE555_TYPICAL_MIN_SUPPLY_V = 4.5;
/** Slightly relaxed so 5 V rails clearly pass in education builds. */
export const NE555_MIN_SUPPLY_V = 4.0;

/** Reset voltage above GND to release reset (datasheet ~0.7 V typ). */
export const NE555_RESET_RELEASE_MIN_V = 0.8;

export interface AstableRcResult {
  frequencyHz: number;
  dutyCycle: number;
  valid: boolean;
}

/**
 * External R1, R2, C for classic astable (see file comment). Values must be positive.
 */
export function astableTimingFromExternalRc(
  r1Ohms: number,
  r2Ohms: number,
  cFarads: number
): AstableRcResult {
  if (
    !Number.isFinite(r1Ohms) ||
    !Number.isFinite(r2Ohms) ||
    !Number.isFinite(cFarads) ||
    r1Ohms <= 0 ||
    r2Ohms <= 0 ||
    cFarads <= 0
  ) {
    return { frequencyHz: 0, dutyCycle: 0, valid: false };
  }
  const tHigh = 0.693 * (r1Ohms + r2Ohms) * cFarads;
  const tLow = 0.693 * r2Ohms * cFarads;
  const period = tHigh + tLow;
  if (period <= 0 || !Number.isFinite(period)) {
    return { frequencyHz: 0, dutyCycle: 0, valid: false };
  }
  return {
    frequencyHz: 1 / period,
    dutyCycle: tHigh / period,
    valid: true,
  };
}
