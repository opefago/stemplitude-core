import * as PIXI from "pixi.js";
import { ElectronParticle, Point } from "../types/Animation";
import { Connection, CircuitComponent } from "../types/Circuit";

export class ElectronAnimator {
  private particles: ElectronParticle[] = [];
  private container: PIXI.Container;
  private particleGraphics: Map<string, PIXI.Graphics> = new Map();

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  public createElectronsForConnection(
    connection: Connection,
    current: number,
    components: CircuitComponent[]
  ) {
    // Remove existing particles for this connection
    this.particles = this.particles.filter(
      (p) => !p.id.startsWith(`electron-${connection.id}`)
    );

    if (Math.abs(current) < 0.001) return; // No significant current

    // Calculate electron speed based on current
    const baseSpeed = 2;
    const speed = baseSpeed * Math.abs(current) * 1000; // Scale for visibility

    // Create path from connection points
    const path: Point[] =
      connection.points.length > 0
        ? connection.points
        : this.getConnectionPath(connection, components);

    // Create multiple electrons along the path
    const electronCount = Math.min(Math.max(Math.floor(speed), 1), 8);
    const pathLength = this.calculatePathLength(path);

    for (let i = 0; i < electronCount; i++) {
      const electronId = `electron-${connection.id}-${i}`;
      const startDistance = (i / electronCount) * pathLength;
      const position = this.getPositionAlongPath(path, startDistance);

      const electron: ElectronParticle = {
        id: electronId,
        position,
        velocity: { x: 0, y: 0 },
        path,
        pathIndex: 0,
        speed: speed / 60, // Convert to pixels per frame
        color: current > 0 ? "#00BFFF" : "#FF4500", // Blue for positive, orange for negative
        size: 3,
      };

      this.particles.push(electron);
      this.createElectronGraphic(electron);
    }
  }

  public updateElectrons() {
    this.particles.forEach((electron) => {
      this.moveElectronAlongPath(electron);
      this.updateElectronGraphic(electron);
    });
  }

  public clearElectrons() {
    this.particles = [];
    this.particleGraphics.forEach((graphic) => {
      this.container.removeChild(graphic);
    });
    this.particleGraphics.clear();
  }

  private getConnectionPath(
    connection: Connection,
    components: CircuitComponent[]
  ): Point[] {
    // Find the components connected by this connection
    const fromComponent = components.find((c) =>
      c.pins.some((pin) => pin.id === connection.fromPin)
    );
    const toComponent = components.find((c) =>
      c.pins.some((pin) => pin.id === connection.toPin)
    );

    if (!fromComponent || !toComponent) {
      return [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ];
    }

    const fromPin = fromComponent.pins.find(
      (pin) => pin.id === connection.fromPin
    );
    const toPin = toComponent.pins.find((pin) => pin.id === connection.toPin);

    if (!fromPin || !toPin) {
      return [fromComponent.position, toComponent.position];
    }

    // Create a simple path between the pins
    return [
      {
        x: fromComponent.position.x + fromPin.position.x,
        y: fromComponent.position.y + fromPin.position.y,
      },
      {
        x: toComponent.position.x + toPin.position.x,
        y: toComponent.position.y + toPin.position.y,
      },
    ];
  }

  private calculatePathLength(path: Point[]): number {
    let length = 0;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }

  private getPositionAlongPath(path: Point[], distance: number): Point {
    if (path.length < 2) return path[0] || { x: 0, y: 0 };

    let currentDistance = 0;
    for (let i = 1; i < path.length; i++) {
      const segmentStart = path[i - 1];
      const segmentEnd = path[i];
      const segmentLength = Math.sqrt(
        Math.pow(segmentEnd.x - segmentStart.x, 2) +
          Math.pow(segmentEnd.y - segmentStart.y, 2)
      );

      if (currentDistance + segmentLength >= distance) {
        const segmentProgress = (distance - currentDistance) / segmentLength;
        return {
          x: segmentStart.x + (segmentEnd.x - segmentStart.x) * segmentProgress,
          y: segmentStart.y + (segmentEnd.y - segmentStart.y) * segmentProgress,
        };
      }

      currentDistance += segmentLength;
    }

    return path[path.length - 1];
  }

  private moveElectronAlongPath(electron: ElectronParticle) {
    if (electron.path.length < 2) return;

    // Find current segment
    const currentPoint = electron.path[electron.pathIndex];
    const nextPoint = electron.path[electron.pathIndex + 1];

    if (!currentPoint || !nextPoint) {
      // Reset to beginning of path
      electron.pathIndex = 0;
      electron.position = { ...electron.path[0] };
      return;
    }

    // Calculate direction to next point
    const dx = nextPoint.x - currentPoint.x;
    const dy = nextPoint.y - currentPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) {
      electron.pathIndex++;
      return;
    }

    // Move towards next point
    const normalizedDx = dx / distance;
    const normalizedDy = dy / distance;

    electron.position.x += normalizedDx * electron.speed;
    electron.position.y += normalizedDy * electron.speed;

    // Check if we've reached the next point
    const distanceToNext = Math.sqrt(
      Math.pow(electron.position.x - nextPoint.x, 2) +
        Math.pow(electron.position.y - nextPoint.y, 2)
    );

    if (distanceToNext < electron.speed) {
      electron.pathIndex++;
      if (electron.pathIndex >= electron.path.length - 1) {
        // Loop back to start
        electron.pathIndex = 0;
        electron.position = { ...electron.path[0] };
      }
    }
  }

  private createElectronGraphic(electron: ElectronParticle): PIXI.Graphics {
    const graphic = new PIXI.Graphics();
    graphic.beginFill(parseInt(electron.color.replace("#", ""), 16), 0.8);
    graphic.drawCircle(0, 0, electron.size);
    graphic.endFill();

    // Add glow effect
    graphic.filters = [new PIXI.filters.BlurFilter(1)];

    this.container.addChild(graphic);
    this.particleGraphics.set(electron.id, graphic);
    return graphic;
  }

  private updateElectronGraphic(electron: ElectronParticle) {
    const graphic = this.particleGraphics.get(electron.id);
    if (graphic) {
      graphic.position.set(electron.position.x, electron.position.y);
    }
  }
}
