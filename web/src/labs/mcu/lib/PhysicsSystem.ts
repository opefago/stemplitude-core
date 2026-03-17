/**
 * Physics & Math System for Gear Game
 * Single source of truth for all mechanical calculations
 */

export interface MechanicalState {
  omega: number; // angular velocity (rad/s)
  torque: number; // torque (N·m)
  direction: number; // +1 or -1
  power?: number; // power (W) = τ × ω
}

export interface GearProperties {
  teeth: number;
  radius: number; // proportional to teeth count
}

export interface PulleyProperties {
  radius: number;
}

export class PhysicsSystem {
  // Conversion constants
  static readonly RAD_TO_RPM = 60 / (2 * Math.PI);
  static readonly RPM_TO_RAD = (2 * Math.PI) / 60;

  /**
   * Convert angular velocity to RPM
   */
  static omegaToRPM(omega: number): number {
    return omega * PhysicsSystem.RAD_TO_RPM;
  }

  /**
   * Convert RPM to angular velocity
   */
  static rpmToOmega(rpm: number): number {
    return rpm * PhysicsSystem.RPM_TO_RAD;
  }

  /**
   * Calculate power from torque and angular velocity
   */
  static calculatePower(torque: number, omega: number): number {
    return torque * Math.abs(omega);
  }

  /**
   * Gear pair calculations (meshing gears)
   * Returns output state for gear2 given input state of gear1
   */
  static gearPairTransmission(
    input: MechanicalState,
    gear1: GearProperties,
    gear2: GearProperties,
    efficiency: number = 0.95,
  ): MechanicalState {
    // Angular speed relation: ω2 = ω1 × (T1 / T2)
    const speedRatio = gear1.teeth / gear2.teeth;
    const outputOmega = input.omega * speedRatio;

    // Torque relation: τ2 = τ1 × (T2 / T1) × efficiency
    const torqueRatio = gear2.teeth / gear1.teeth;
    const outputTorque = input.torque * torqueRatio * efficiency;

    // Direction: meshing reverses rotational direction
    const outputDirection = -input.direction;

    return {
      omega: outputOmega * outputDirection,
      torque: outputTorque,
      direction: outputDirection,
      power: PhysicsSystem.calculatePower(outputTorque, outputOmega),
    };
  }

  /**
   * Pulley pair calculations (belt transmission)
   * Returns output state for pulley2 given input state of pulley1
   */
  static pulleyPairTransmission(
    input: MechanicalState,
    pulley1: PulleyProperties,
    pulley2: PulleyProperties,
    isCrossedBelt: boolean = false,
    efficiency: number = 0.95,
  ): MechanicalState {
    // Angular speed relation: ω2 = ω1 × (R1 / R2)
    const speedRatio = pulley1.radius / pulley2.radius;
    const outputOmega = input.omega * speedRatio;

    // Torque relation: τ2 = τ1 × (R2 / R1) × efficiency
    const torqueRatio = pulley2.radius / pulley1.radius;
    const outputTorque = input.torque * torqueRatio * efficiency;

    // Direction: open belt → same direction, crossed belt → reversed direction
    const outputDirection = isCrossedBelt ? -input.direction : input.direction;

    return {
      omega: outputOmega * outputDirection,
      torque: outputTorque,
      direction: outputDirection,
      power: PhysicsSystem.calculatePower(outputTorque, outputOmega),
    };
  }

  /**
   * Calculate required torque for forklift at given angle
   * For rotating arm variant
   */
  static forkliftTorqueRequired(
    weight: number, // Weight to lift (N)
    armLength: number, // Arm length (m)
    angle: number, // Current angle (rad)
    gravity: number = 9.81, // Gravity constant
  ): number {
    // τ_req = W * g * (L * cos θ) - lever arm calculation
    return weight * gravity * armLength * Math.cos(angle);
  }

  /**
   * Calculate vertical position for forklift arm
   */
  static forkliftVerticalPosition(
    baseHeight: number, // Base height (m)
    armLength: number, // Arm length (m)
    angle: number, // Current angle (rad)
  ): number {
    // y = y0 + L × sin(θ)
    return baseHeight + armLength * Math.sin(angle);
  }

  /**
   * Slider-crank position calculation
   */
  static sliderCrankPosition(
    crankRadius: number, // Crank radius (m)
    connectingRodLength: number, // Connecting rod length (m)
    angle: number, // Crank angle (rad)
  ): number {
    // x = r·cos θ + sqrt(l² − (r·sin θ)²)
    const term1 = crankRadius * Math.cos(angle);
    const term2 = Math.sqrt(
      Math.pow(connectingRodLength, 2) -
        Math.pow(crankRadius * Math.sin(angle), 2),
    );
    return term1 + term2;
  }

  /**
   * Compose ratios for serial transmission chain
   * Multiplies ratios for chain of transmissions
   */
  static serialTransmissionRatio(ratios: number[]): number {
    return ratios.reduce((product, ratio) => product * ratio, 1);
  }

  /**
   * Convert torque to linear force at radius
   */
  static torqueToForce(torque: number, radius: number): number {
    return torque / radius;
  }

  /**
   * Convert linear force to torque at radius
   */
  static forceToTorque(force: number, radius: number): number {
    return force * radius;
  }

  /**
   * Check if belt can transmit torque without slipping
   */
  static checkBeltSlip(
    transmittedTorque: number,
    normalForce: number,
    frictionCoefficient: number,
    effectiveRadius: number,
  ): boolean {
    const maxTransmissibleTorque =
      frictionCoefficient * normalForce * effectiveRadius;
    return Math.abs(transmittedTorque) <= maxTransmissibleTorque;
  }
}
