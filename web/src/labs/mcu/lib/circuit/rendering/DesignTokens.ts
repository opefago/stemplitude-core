export const DesignTokens = {
  // Node / anchor colors
  node: {
    default: 0xe6ff00,
    hover: 0xfff799,
    selected: 0x00e5ff,
    activeCurrent: 0x00ff99,
    invalid: 0xff5a5a,
    radius: 7,
    hoverRingRadius: 11,
    hoverRingAlpha: 0.3,
    strokeWidth: 2,
    strokeColor: 0x888800,
  },

  // Component symbol drawing
  symbol: {
    strokeWidth: 3,
    strokeColor: 0xffffff,
    activeColor: 0x44ff44,
    fillColor: 0x333333,
    labelFontSize: 10,
    valueFontSize: 8,
    labelColor: 0xffffff,
    valueColor: 0xcccccc,
    fontFamily: "Arial",
  },

  // Wire colors and sizes
  wire: {
    baseColor: 0xffffff,
    /** Minimum axis-aligned stub from pin before main routing (schematic escape). */
    escapeMinPx: 14,
    thickness: 2,
    glowColor: 0x00ffff,
    glowMinAlpha: 0.05,
    glowMaxAlpha: 0.4,
    glowMinWidth: 4,
    glowMaxWidth: 8,
    highlightColor: 0xffff00,
    tempColor: 0x00ff00,
    endpointRadius: 3,
  },

  // Current flow particles (EveryCircuit-style, rendered above wires)
  particle: {
    color: 0x00ffff,
    radius: 4.5,
    minAlpha: 0.6,
    maxAlpha: 1.0,
    minSpeed: 8, // px/s — idle drift along wire
    maxSpeed: 90, // px/s — cap at high |I|
    minSpacing: 14, // px between particles at high current
    maxSpacing: 44, // px between particles at low current
    currentThreshold: 0.001, // A — below this, no particles
    speedScale: 22, // multiplier for log(1 + |I|)
    poolSize: 500,
    /** Scales arrow model units to screen px */
    directionArrowScale: 0.33,
    directionArrowFill: 0xf5d547,
    directionArrowStroke: 0xcc6a16,
    directionArrowStrokeWidth: 1.25,
  },

  // Voltage visualization
  voltage: {
    lowColor: 0x2244aa,
    midColor: 0x44ff44,
    highColor: 0xff4444,
    maxDisplayVoltage: 24,
  },

  // Component state colors
  state: {
    normal: 0xffffff,
    active: 0x44ff44,
    warning: 0xffaa00,
    danger: 0xff4444,
    damaged: 0x444444,
    cutoff: 0x444466,
    saturation: 0xff8888,
    activeRegion: 0xffaa00,
  },

  // Grid
  grid: {
    size: 20,
    minorColor: 0x333333,
    majorColor: 0x444444,
    backgroundColor: 0x1a1a1a,
    majorEvery: 5,
  },

  // Damage / stress
  damage: {
    safeColor: 0x44ff44,
    warningColor: 0xffaa00,
    dangerColor: 0xff4444,
    criticalColor: 0xff0000,
    damagedColor: 0x444444,
    sparkColor: 0xffff88,
    smokeColor: 0x666666,
  },

  // Oscilloscope
  oscilloscope: {
    phosphorColor: 0x00ff88,
    gridColor: 0x003311,
    backgroundColor: 0x001a0a,
    channel1Color: 0x00ff88,
    channel2Color: 0x4488ff,
    channel3Color: 0xff8844,
    borderColor: 0x00ff88,
  },
} as const;
