import { Container, Graphics, Text } from "pixi.js";
import type { WireVisualState, WireParticle, WirePathCache } from "../types/WireTypes";
import { DesignTokens } from "./DesignTokens";

type Point = { x: number; y: number };

function fract01(x: number): number {
  return x - Math.floor(x);
}

/**
 * EveryCircuit-style wire current animation system.
 * Renders continuous particle flow along wires proportional to current magnitude.
 * Uses a pre-allocated particle pool to avoid per-frame allocation.
 */
export class WireParticleSystem {
  private particleLayer: Container;
  private glowLayer: Container;
  private particlePool: Graphics[] = [];
  private activeParticles: Map<string, WireParticle[]> = new Map();
  private wirePathCaches: Map<string, WirePathCache> = new Map();
  private glowGraphics: Map<string, Graphics> = new Map();
  private arrowGraphics: Map<string, Graphics> = new Map();
  private debugLabels: Map<string, Text> = new Map();
  private poolIndex: number = 0;
  private lastUpdateTime: number = 0;

  constructor(particleLayer: Container, glowLayer: Container) {
    this.particleLayer = particleLayer;
    this.glowLayer = glowLayer;
    this.initializePool();
  }

  private initializePool(): void {
    const { poolSize, radius, color } = DesignTokens.particle;
    for (let i = 0; i < poolSize; i++) {
      const g = new Graphics();
      g.circle(0, 0, radius);
      g.fill({ color, alpha: 1 });
      g.visible = false;
      g.alpha = 0;
      this.particleLayer.addChild(g);
      this.particlePool.push(g);
    }
  }

  /**
   * Update wire path geometry cache. Call when wire topology changes (not every frame).
   */
  updateWirePaths(
    wireId: string,
    segments: Array<{ start: Point; end: Point }>
  ): void {
    const worldPoints: Point[] = [];
    if (segments.length > 0) {
      worldPoints.push(segments[0].start);
      for (const seg of segments) {
        worldPoints.push(seg.end);
      }
    }

    const segmentLengths: number[] = [];
    let totalLength = 0;
    const cumulativeLengths: number[] = [0];

    for (let i = 0; i < worldPoints.length - 1; i++) {
      const dx = worldPoints[i + 1].x - worldPoints[i].x;
      const dy = worldPoints[i + 1].y - worldPoints[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segmentLengths.push(len);
      totalLength += len;
      cumulativeLengths.push(totalLength);
    }

    this.wirePathCaches.set(wireId, {
      wireId,
      worldPoints,
      totalLength,
      segmentLengths,
      segmentCumulativeLengths: cumulativeLengths,
    });
  }

  /**
   * Main update loop — call once per animation frame.
   */
  update(deltaTimeMs: number, wireStates: Map<string, WireVisualState>): void {
    const now = performance.now();
    if (this.lastUpdateTime === 0) this.lastUpdateTime = now;
    const dt = deltaTimeMs / 1000; // Convert to seconds
    this.lastUpdateTime = now;

    // Hide all particles first
    this.poolIndex = 0;
    for (const g of this.particlePool) {
      g.visible = false;
    }

    // Update each wire
    for (const [wireId, state] of wireStates) {
      const pathCache = this.wirePathCaches.get(wireId);
      if (!pathCache || pathCache.totalLength < 1) continue;

      if (!state.energized || state.currentMagnitude < DesignTokens.particle.currentThreshold) {
        this.updateGlow(wireId, pathCache, 0);
        this.activeParticles.delete(wireId);
        const arrow = this.arrowGraphics.get(wireId);
        if (arrow) arrow.visible = false;
        const label = this.debugLabels.get(wireId);
        if (label) label.visible = false;
        continue;
      }

      // Update glow
      this.updateGlow(wireId, pathCache, state.glowLevel);

      // Compute particle parameters
      const absI = state.currentMagnitude;
      const speed = this.computeSpeed(absI);
      const spacing = this.computeSpacing(absI);
      const numParticles = Math.max(
        1,
        Math.floor(pathCache.totalLength / spacing)
      );
      const alpha = this.computeAlpha(absI);
      const fadeMul = state.visualFade ?? 1;

      // Get or create particle state array
      let particles = this.activeParticles.get(wireId);
      if (!particles || particles.length !== numParticles) {
        particles = [];
        for (let i = 0; i < numParticles; i++) {
          particles.push({
            wireId,
            progress: i / numParticles,
            speed,
            alpha,
            active: true,
          });
        }
        this.activeParticles.set(wireId, particles);
      }

      // Move particles
      const direction = state.currentDirection;
      const progressDelta = (speed * dt) / pathCache.totalLength;
      const phase = state.phaseShift ?? 0;

      for (const particle of particles) {
        particle.progress += progressDelta * direction;

        // Wrap around
        if (particle.progress > 1) particle.progress -= 1;
        if (particle.progress < 0) particle.progress += 1;

        particle.alpha = alpha;
        particle.speed = speed;

        // Phase must advance *along conventional current* on this wire. Using +phase for
        // all directions adds forward motion along the polyline every frame and can dominate
        // progressDelta * direction on negative-flow segments (arrow tangent flips, dots slip).
        const visProgress = fract01(
          particle.progress + phase * (direction === 0 ? 1 : direction),
        );

        // Render particle from pool
        const pos = this.getPositionAlongPath(pathCache, visProgress);
        if (pos && this.poolIndex < this.particlePool.length) {
          const g = this.particlePool[this.poolIndex++];
          g.position.set(pos.x, pos.y);
          g.alpha = particle.alpha * fadeMul;
          g.visible = true;
        }
      }

      this.drawDirectionArrow(
        wireId,
        pathCache,
        direction,
        state.phaseShift,
        fadeMul,
      );
      this.drawDebugLabel(wireId, pathCache, state.debugText);
    }
  }

  private drawDebugLabel(
    wireId: string,
    pathCache: WirePathCache,
    debugText?: string
  ): void {
    let label = this.debugLabels.get(wireId);
    if (!label) {
      label = new Text({
        text: "",
        style: {
          fontFamily: "Arial",
          fontSize: 9,
          fill: 0x00ffff,
          stroke: { color: 0x000000, width: 2 },
        },
      });
      label.anchor.set(0.5, 1);
      this.particleLayer.addChild(label);
      this.debugLabels.set(wireId, label);
    }

    if (!debugText) {
      label.visible = false;
      return;
    }

    const pos = this.getPositionAlongPath(pathCache, 0.5);
    if (!pos) {
      label.visible = false;
      return;
    }
    label.text = debugText;
    label.position.set(pos.x, pos.y - 10);
    label.visible = true;
  }

  private drawDirectionArrow(
    wireId: string,
    pathCache: WirePathCache,
    direction: number,
    phaseShift?: number,
    fadeMul: number = 1,
  ): void {
    let arrow = this.arrowGraphics.get(wireId);
    if (!arrow) {
      arrow = new Graphics();
      this.particleLayer.addChild(arrow);
      this.arrowGraphics.set(wireId, arrow);
    }

    arrow.clear();
    if (direction === 0 || pathCache.totalLength < 20) {
      arrow.visible = false;
      return;
    }
    arrow.visible = true;

    const dir = direction === 0 ? 1 : direction;
    const midProgress = fract01(0.5 + (phaseShift ?? 0) * dir);
    const midPos = this.getPositionAlongPath(pathCache, midProgress);
    const aheadPos = this.getPositionAlongPath(
      pathCache,
      fract01(midProgress + 0.02)
    );
    const behindPos = this.getPositionAlongPath(
      pathCache,
      fract01(midProgress - 0.02)
    );
    if (!midPos || !aheadPos || !behindPos) return;

    let dx = aheadPos.x - behindPos.x;
    let dy = aheadPos.y - behindPos.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;
    dx /= len;
    dy /= len;

    if (direction < 0) {
      dx = -dx;
      dy = -dy;
    }

    const size = 10;
    const tipX = midPos.x + dx * size;
    const tipY = midPos.y + dy * size;
    const perpX = -dy;
    const perpY = dx;
    const baseX = midPos.x - dx * size * 0.5;
    const baseY = midPos.y - dy * size * 0.5;

    arrow.moveTo(tipX, tipY);
    arrow.lineTo(baseX + perpX * size * 0.6, baseY + perpY * size * 0.6);
    arrow.lineTo(baseX - perpX * size * 0.6, baseY - perpY * size * 0.6);
    arrow.closePath();
    const a = Math.min(1, Math.max(0, fadeMul));
    arrow.fill({ color: 0xffff00, alpha: 0.9 * a });
    arrow.stroke({ width: 1.5, color: 0xff8800, alpha: a });
  }

  private computeSpeed(absI: number): number {
    const { minSpeed, maxSpeed, speedScale } = DesignTokens.particle;
    return Math.min(minSpeed + speedScale * Math.log(1 + absI), maxSpeed);
  }

  private computeSpacing(absI: number): number {
    const { minSpacing, maxSpacing } = DesignTokens.particle;
    // Higher current = smaller spacing (more particles)
    const normalizedI = Math.min(absI / 1.0, 1.0);
    return maxSpacing - normalizedI * (maxSpacing - minSpacing);
  }

  private computeAlpha(absI: number): number {
    const { minAlpha, maxAlpha, currentThreshold } = DesignTokens.particle;
    const normalizedI = Math.min(
      (absI - currentThreshold) / (1.0 - currentThreshold),
      1.0
    );
    return minAlpha + normalizedI * (maxAlpha - minAlpha);
  }

  private getPositionAlongPath(
    cache: WirePathCache,
    progress: number
  ): Point | null {
    if (cache.worldPoints.length < 2) return null;

    const targetDist = progress * cache.totalLength;
    const cumLens = cache.segmentCumulativeLengths;

    // Find which segment we're on
    for (let i = 0; i < cumLens.length - 1; i++) {
      if (targetDist >= cumLens[i] && targetDist <= cumLens[i + 1]) {
        const segLen = cumLens[i + 1] - cumLens[i];
        if (segLen < 0.001) continue;
        const t = (targetDist - cumLens[i]) / segLen;
        const p0 = cache.worldPoints[i];
        const p1 = cache.worldPoints[i + 1];
        return {
          x: p0.x + (p1.x - p0.x) * t,
          y: p0.y + (p1.y - p0.y) * t,
        };
      }
    }

    return cache.worldPoints[cache.worldPoints.length - 1];
  }

  private updateGlow(
    wireId: string,
    pathCache: WirePathCache,
    glowLevel: number
  ): void {
    let glowG = this.glowGraphics.get(wireId);

    if (glowLevel < 0.01) {
      if (glowG) {
        glowG.visible = false;
      }
      return;
    }

    if (!glowG) {
      glowG = new Graphics();
      this.glowLayer.addChild(glowG);
      this.glowGraphics.set(wireId, glowG);
    }

    glowG.clear();
    glowG.visible = true;

    const points = pathCache.worldPoints;
    if (points.length < 2) return;

    const glowWidth =
      DesignTokens.wire.glowMinWidth +
      glowLevel * (DesignTokens.wire.glowMaxWidth - DesignTokens.wire.glowMinWidth);
    const glowAlpha =
      DesignTokens.wire.glowMinAlpha +
      glowLevel * (DesignTokens.wire.glowMaxAlpha - DesignTokens.wire.glowMinAlpha);

    glowG.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      glowG.lineTo(points[i].x, points[i].y);
    }
    glowG.stroke({
      width: glowWidth,
      color: DesignTokens.wire.glowColor,
      alpha: glowAlpha,
    });
  }

  /**
   * Remove a wire's particles and glow when the wire is deleted.
   */
  removeWire(wireId: string): void {
    this.activeParticles.delete(wireId);
    this.wirePathCaches.delete(wireId);

    const glowG = this.glowGraphics.get(wireId);
    if (glowG) {
      if (glowG.parent) glowG.parent.removeChild(glowG);
      glowG.destroy();
      this.glowGraphics.delete(wireId);
    }
    const arrowG = this.arrowGraphics.get(wireId);
    if (arrowG) {
      if (arrowG.parent) arrowG.parent.removeChild(arrowG);
      arrowG.destroy();
      this.arrowGraphics.delete(wireId);
    }
    const label = this.debugLabels.get(wireId);
    if (label) {
      if (label.parent) label.parent.removeChild(label);
      label.destroy();
      this.debugLabels.delete(wireId);
    }
  }

  /**
   * Immediately hide all particle/arrow/glow visuals.
   * Useful when simulation stops.
   */
  clearVisuals(): void {
    this.activeParticles.clear();
    this.poolIndex = 0;
    for (const g of this.particlePool) {
      g.visible = false;
    }
    for (const [, g] of this.glowGraphics) {
      g.visible = false;
      g.clear();
    }
    for (const [, g] of this.arrowGraphics) {
      g.visible = false;
      g.clear();
    }
    for (const [, label] of this.debugLabels) {
      label.visible = false;
    }
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    for (const g of this.particlePool) {
      g.destroy();
    }
    this.particlePool = [];
    for (const [, g] of this.glowGraphics) {
      g.destroy();
    }
    this.glowGraphics.clear();
    for (const [, g] of this.arrowGraphics) {
      g.destroy();
    }
    this.arrowGraphics.clear();
    for (const [, label] of this.debugLabels) {
      label.destroy();
    }
    this.debugLabels.clear();
    this.activeParticles.clear();
    this.wirePathCaches.clear();
  }
}
