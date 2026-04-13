import type {
  RoboticsSimulatorBridge,
  SimulatorPose2D,
  SimulatorRobotModel,
  SimulatorTickInput,
  SimulatorTickOutput,
  SimulatorWorldMap,
} from "./types";

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function normalizeHeading(heading: number) {
  let next = heading % 360;
  if (next < 0) next += 360;
  return next;
}

function pointInBox2d(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  width: number,
  depth: number,
) {
  return (
    x >= centerX - width / 2 &&
    x <= centerX + width / 2 &&
    y >= centerY - depth / 2 &&
    y <= centerY + depth / 2
  );
}

function pointInOrientedBox2d(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  width: number,
  depth: number,
  yawDeg = 0,
) {
  const yawRad = toRadians(yawDeg);
  const cos = Math.cos(-yawRad);
  const sin = Math.sin(-yawRad);
  const localX = (x - centerX) * cos - (y - centerY) * sin;
  const localY = (x - centerX) * sin + (y - centerY) * cos;
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= depth / 2;
}

function circleIntersectsBox2d(
  centerX: number,
  centerY: number,
  radius: number,
  boxCenterX: number,
  boxCenterY: number,
  width: number,
  depth: number,
) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const nearestX = Math.max(boxCenterX - halfW, Math.min(centerX, boxCenterX + halfW));
  const nearestY = Math.max(boxCenterY - halfD, Math.min(centerY, boxCenterY + halfD));
  const dx = centerX - nearestX;
  const dy = centerY - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function circleIntersectsOrientedBox2d(
  centerX: number,
  centerY: number,
  radius: number,
  boxCenterX: number,
  boxCenterY: number,
  width: number,
  depth: number,
  yawDeg = 0,
) {
  const yawRad = toRadians(yawDeg);
  const cos = Math.cos(-yawRad);
  const sin = Math.sin(-yawRad);
  const localX = (centerX - boxCenterX) * cos - (centerY - boxCenterY) * sin;
  const localY = (centerX - boxCenterX) * sin + (centerY - boxCenterY) * cos;
  return circleIntersectsBox2d(localX, localY, radius, 0, 0, width, depth);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function deterministicNoise(seed: number, amplitude: number) {
  const normalized = Math.sin(seed) * 43758.5453;
  const fract = normalized - Math.floor(normalized);
  return (fract - 0.5) * 2 * amplitude;
}

export class ThreeRuntimeSimulator implements RoboticsSimulatorBridge {
  private world: SimulatorWorldMap | null = null;
  private pose: SimulatorPose2D = { position: { x: 0, y: 0 }, heading_deg: 0 };
  private readonly robot: SimulatorRobotModel;
  private linearVelocityCmS = 0;
  private angularVelocityDegS = 0;
  private lastCollisions: string[] = [];
  private sensorOverrides: Record<string, number | boolean | string | null | undefined> = {};

  private static readonly LINEAR_ACCEL_CM_S2 = 140;
  private static readonly LINEAR_FRICTION_COEFF = 4.2;
  private static readonly ANGULAR_ACCEL_DEG_S2 = 420;
  private static readonly ANGULAR_FRICTION_COEFF = 5.2;
  private static readonly EPS = 0.01;
  private static readonly MIN_SENSOR_RANGE_CM = 2;

  constructor(robot: SimulatorRobotModel) {
    this.robot = robot;
  }

  setWorld(map: SimulatorWorldMap): void {
    this.world = map;
    if (!map.world_scene) {
      map.world_scene = {
        version: 1,
        gravity_m_s2: 9.81,
        objects: map.objects.map((item) => ({
          id: item.id,
          type: item.type,
          position: { x: item.pose.position.x, y: 0, z: item.pose.position.y },
          size_cm: { x: item.dimensions_cm.width, y: 20, z: item.dimensions_cm.height },
          metadata: item.metadata ?? {},
        })),
      };
    }
  }

  reset(pose: SimulatorPose2D): void {
    const clamped = this.clampPoseToWorld(pose);
    this.pose = {
      position: { ...clamped.position },
      heading_deg: normalizeHeading(clamped.heading_deg),
    };
    this.linearVelocityCmS = 0;
    this.angularVelocityDegS = 0;
    this.lastCollisions = [];
  }

  setSensorOverrides(overrides: Record<string, number | boolean | string | null | undefined>): void {
    this.sensorOverrides = { ...overrides };
  }

  tick(input: SimulatorTickInput): SimulatorTickOutput {
    if (!this.world) {
      return { pose: this.pose, collisions: [], sensor_values: {} };
    }
    const dtS = Math.max(0, input.dt_ms) / 1000;
    if (dtS > 0) {
      this.stepPhysics(dtS, input.linear_velocity_cm_s, input.angular_velocity_deg_s);
    }
    const collisions = this.lastCollisions.slice();

    return {
      pose: { ...this.pose, position: { ...this.pose.position } },
      collisions,
      sensor_values: this.readSensors(collisions),
    };
  }

  private stepPhysics(dtS: number, targetLinearCmS: number, targetAngularDegS: number): void {
    let remaining = dtS;
    // Substeps improve stability and avoid tunneling through thin obstacles at high speed.
    while (remaining > 0) {
      const subDt = Math.min(0.02, remaining);
      remaining -= subDt;

      this.linearVelocityCmS = this.approachVelocity(
        this.linearVelocityCmS,
        targetLinearCmS,
        ThreeRuntimeSimulator.LINEAR_ACCEL_CM_S2,
        ThreeRuntimeSimulator.LINEAR_FRICTION_COEFF,
        subDt,
      );
      this.angularVelocityDegS = this.approachVelocity(
        this.angularVelocityDegS,
        targetAngularDegS,
        ThreeRuntimeSimulator.ANGULAR_ACCEL_DEG_S2,
        ThreeRuntimeSimulator.ANGULAR_FRICTION_COEFF,
        subDt,
      );

      const headingRad = toRadians(this.pose.heading_deg);
      const nextPose: SimulatorPose2D = {
        position: {
          x: this.pose.position.x + Math.cos(headingRad) * this.linearVelocityCmS * subDt,
          y: this.pose.position.y + Math.sin(headingRad) * this.linearVelocityCmS * subDt,
        },
        heading_deg: normalizeHeading(this.pose.heading_deg + this.angularVelocityDegS * subDt),
      };

      const collisions = this.detectCollisions(nextPose);
      if (collisions.length > 0) {
        // Keep rotation but block translational penetration into world bounds/obstacles.
        this.pose = {
          ...this.pose,
          heading_deg: nextPose.heading_deg,
        };
        this.linearVelocityCmS = 0;
        this.lastCollisions = collisions;
      } else {
        this.pose = nextPose;
        this.lastCollisions = [];
      }
    }
  }

  private approachVelocity(current: number, target: number, accelLimit: number, frictionCoeff: number, dtS: number): number {
    const delta = target - current;
    const maxStep = accelLimit * dtS;
    const towardTarget = Math.abs(delta) <= maxStep ? target : current + Math.sign(delta) * maxStep;
    const friction = Math.max(0, 1 - frictionCoeff * dtS);
    const withFriction = towardTarget * friction;
    return Math.abs(withFriction) < ThreeRuntimeSimulator.EPS ? 0 : withFriction;
  }

  private robotCollisionRadiusCm(): number {
    return Math.max(4, Math.min(this.robot.width_cm, this.robot.length_cm) * 0.45);
  }

  private clampPoseToWorld(pose: SimulatorPose2D): SimulatorPose2D {
    if (!this.world) return pose;
    const radius = this.robotCollisionRadiusCm();
    const worldWidthCm = this.world.width_cells * this.world.grid_cell_cm;
    const worldDepthCm = this.world.height_cells * this.world.grid_cell_cm;
    if (worldWidthCm <= radius * 2 || worldDepthCm <= radius * 2) {
      return {
        position: { x: worldWidthCm / 2, y: worldDepthCm / 2 },
        heading_deg: normalizeHeading(pose.heading_deg),
      };
    }
    return {
      position: {
        x: clamp(pose.position.x, radius, worldWidthCm - radius),
        y: clamp(pose.position.y, radius, worldDepthCm - radius),
      },
      heading_deg: normalizeHeading(pose.heading_deg),
    };
  }

  private detectCollisions(candidate: SimulatorPose2D): string[] {
    if (!this.world?.world_scene) return [];
    const { x, y } = candidate.position;
    const radius = this.robotCollisionRadiusCm();
    const worldWidthCm = this.world.width_cells * this.world.grid_cell_cm;
    const worldDepthCm = this.world.height_cells * this.world.grid_cell_cm;
    const collisions: string[] = [];

    if (x - radius < 0 || y - radius < 0 || x + radius > worldWidthCm || y + radius > worldDepthCm) {
      collisions.push("world_bounds");
    }

    for (const object of this.world.world_scene.objects) {
      if (object?.metadata?.hidden) continue;
      if (object.type !== "obstacle" && object.type !== "wall") continue;
      const objectYaw = Number(object.rotation_deg?.y) || 0;
      if (
        circleIntersectsOrientedBox2d(
          x,
          y,
          radius,
          object.position.x,
          object.position.z,
          object.size_cm.x,
          object.size_cm.z,
          objectYaw,
        )
      ) {
        collisions.push(object.id);
      }
    }
    return collisions;
  }

  private readSensors(collisions: string[]): Record<string, string | number | boolean> {
    const readings: Record<string, string | number | boolean> = {};
    for (const sensor of this.robot.sensors) {
      if (sensor.kind === "gyro") readings[sensor.id] = this.pose.heading_deg;
      else if (sensor.kind === "bumper" || sensor.kind === "touch") readings[sensor.id] = collisions.length > 0;
      else if (sensor.kind === "distance") readings[sensor.id] = this.distanceAheadCm(sensor.id);
      else if (sensor.kind === "line") readings[sensor.id] = this.isLineDetected(sensor.id);
      else if (sensor.kind === "color") readings[sensor.id] = this.floorColor(sensor.id);

      const byId = this.sensorOverrides[sensor.id];
      const byKind = this.sensorOverrides[sensor.kind];
      const override = byId ?? byKind;
      if (override !== undefined && override !== null) {
        readings[sensor.id] = override;
      }
    }
    return readings;
  }

  private sensorPose(sensorId: string): { x: number; y: number; heading_deg: number } {
    const sensor = this.robot.sensors.find((item) => item.id === sensorId);
    if (!sensor) {
      return { x: this.pose.position.x, y: this.pose.position.y, heading_deg: this.pose.heading_deg };
    }
    const headingRad = toRadians(this.pose.heading_deg);
    const localX = sensor.mount.offset_cm.x;
    const localY = sensor.mount.offset_cm.y;
    const worldX = this.pose.position.x + localX * Math.cos(headingRad) - localY * Math.sin(headingRad);
    const worldY = this.pose.position.y + localX * Math.sin(headingRad) + localY * Math.cos(headingRad);
    return {
      x: worldX,
      y: worldY,
      heading_deg: normalizeHeading(this.pose.heading_deg + sensor.mount.heading_offset_deg),
    };
  }

  private distanceAheadCm(sensorId: string): number {
    if (!this.world?.world_scene) return 0;
    const sensor = this.robot.sensors.find((item) => item.id === sensorId);
    const sensorPose = this.sensorPose(sensorId);
    const headingRad = toRadians(sensorPose.heading_deg);
    const configuredMax = Number(sensor?.config?.max_range_cm);
    const maxRange = Number.isFinite(configuredMax) ? Math.max(20, configuredMax) : 240;
    for (let d = 0; d <= maxRange; d += 1) {
      const px = sensorPose.x + Math.cos(headingRad) * d;
      const py = sensorPose.y + Math.sin(headingRad) * d;
      const hit = this.world.world_scene.objects.some((obj) => {
        if (obj?.metadata?.hidden) return false;
        if (obj.type !== "obstacle" && obj.type !== "wall") return false;
        const objectYaw = Number(obj.rotation_deg?.y) || 0;
        return pointInOrientedBox2d(px, py, obj.position.x, obj.position.z, obj.size_cm.x, obj.size_cm.z, objectYaw);
      });
      if (hit) {
        const noisy = d + deterministicNoise(sensorPose.x * 0.03 + sensorPose.y * 0.05 + this.pose.heading_deg * 0.01, 0.8);
        return clamp(noisy, ThreeRuntimeSimulator.MIN_SENSOR_RANGE_CM, maxRange);
      }
    }
    return maxRange + deterministicNoise(sensorPose.x * 0.01 + sensorPose.y * 0.01, 0.5);
  }

  private isLineDetected(sensorId: string): boolean {
    if (!this.world?.world_scene) return false;
    const sensorPose = this.sensorPose(sensorId);
    return this.world.world_scene.objects.some((obj) => {
      if (obj?.metadata?.hidden) return false;
      if (obj.type !== "line_segment") return false;
      const objectYaw = Number(obj.rotation_deg?.y) || 0;
      return pointInOrientedBox2d(
        sensorPose.x,
        sensorPose.y,
        obj.position.x,
        obj.position.z,
        obj.size_cm.x,
        obj.size_cm.z,
        objectYaw,
      );
    });
  }

  private floorColor(sensorId: string): string {
    if (!this.world?.world_scene) return "default";
    const sensorPose = this.sensorPose(sensorId);
    const colorZone = this.world.world_scene.objects.find((obj) => {
      if (obj?.metadata?.hidden) return false;
      if (obj.type !== "color_zone" && obj.type !== "target_zone") return false;
      const objectYaw = Number(obj.rotation_deg?.y) || 0;
      return pointInOrientedBox2d(
        sensorPose.x,
        sensorPose.y,
        obj.position.x,
        obj.position.z,
        obj.size_cm.x,
        obj.size_cm.z,
        objectYaw,
      );
    });
    if (!colorZone) return "default";
    const metadataColor = colorZone.metadata?.color;
    if (typeof metadataColor === "string" && metadataColor.trim()) return metadataColor;
    return colorZone.type === "target_zone" ? "goal" : "zone";
  }
}
