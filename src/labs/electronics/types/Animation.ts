export interface ElectronParticle {
  id: string;
  position: Point;
  velocity: Point;
  path: Point[];
  pathIndex: number;
  speed: number; // Proportional to current
  color: string;
  size: number;
}

export interface AnimationState {
  electrons: ElectronParticle[];
  glowEffects: GlowEffect[];
  sparkEffects: SparkEffect[];
  isAnimating: boolean;
  animationSpeed: number;
}

export interface GlowEffect {
  componentId: string;
  intensity: number; // 0-1
  color: string;
  pulseRate?: number;
}

export interface SparkEffect {
  id: string;
  position: Point;
  particles: SparkParticle[];
  duration: number;
  startTime: number;
}

export interface SparkParticle {
  position: Point;
  velocity: Point;
  life: number;
  maxLife: number;
  color: string;
}

export interface Point {
  x: number;
  y: number;
}
