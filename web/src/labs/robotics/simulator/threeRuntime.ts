import type {
  RoboticsSimulatorBridge,
  SimulatorPose2D,
  SimulatorRobotModel,
  SimulatorSceneObject,
  SimulatorTickInput,
  SimulatorTickOutput,
  SimulatorWorldMap,
} from "./types";
import { resolveWheelProfile, type ResolvedWheelProfile } from "./wheelProfile";

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function normalizeHeading(heading: number) {
  let next = heading % 360;
  if (next < 0) next += 360;
  return next;
}

function normalizeSignedAngle(delta: number) {
  return ((delta + 540) % 360) - 180;
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
  private readonly wheelProfile: ResolvedWheelProfile;
  private leftWheelVelocityCmS = 0;
  private rightWheelVelocityCmS = 0;
  private lastCollisions: string[] = [];
  private sensorOverrides: Record<string, number | boolean | string | null | undefined> = {};

  private static readonly EPS = 0.01;
  private static readonly MIN_SENSOR_RANGE_CM = 2;
  private static readonly PUSH_STEP_MULTIPLIERS = [1, 1.25, 1.5, 1.75, 2];
  private static readonly MIN_SWEEP_STEP_CM = 2;
  private static readonly MAX_SWEEP_SAMPLES = 12;

  constructor(robot: SimulatorRobotModel) {
    this.robot = robot;
    this.wheelProfile = resolveWheelProfile(robot);
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
    this.leftWheelVelocityCmS = 0;
    this.rightWheelVelocityCmS = 0;
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

      const adjustedLinearTarget =
        Math.abs(targetAngularDegS) > ThreeRuntimeSimulator.EPS &&
        Math.abs(targetLinearCmS) < this.wheelProfile.wheelRadiusCm * 1.5
          ? this.wheelProfile.wheelRadiusCm * 1.5
          : targetLinearCmS;
      const trackWidthCm = this.wheelProfile.trackWidthCm;
      const targetAngularRadS = toRadians(targetAngularDegS);
      const tractionLinear = this.wheelProfile.tractionLongitudinal;
      const targetLeftWheelCmS =
        (adjustedLinearTarget - (targetAngularRadS * trackWidthCm) / 2) * tractionLinear;
      const targetRightWheelCmS =
        (adjustedLinearTarget + (targetAngularRadS * trackWidthCm) / 2) * tractionLinear;
      this.leftWheelVelocityCmS = this.approachVelocity(
        this.leftWheelVelocityCmS,
        targetLeftWheelCmS,
        this.wheelProfile.maxWheelAccelCmS2 * this.wheelProfile.tractionLongitudinal,
        this.wheelProfile.rollingResistance,
        subDt,
      );
      this.rightWheelVelocityCmS = this.approachVelocity(
        this.rightWheelVelocityCmS,
        targetRightWheelCmS,
        this.wheelProfile.maxWheelAccelCmS2 * this.wheelProfile.tractionLongitudinal,
        this.wheelProfile.rollingResistance,
        subDt,
      );
      const linearVelocityCmS = (this.leftWheelVelocityCmS + this.rightWheelVelocityCmS) / 2;
      const trackGripFactor = clamp(18 / Math.max(8, this.wheelProfile.trackWidthCm), 0.68, 1.08);
      const angularVelocityDegS =
        toDegrees(
        (this.rightWheelVelocityCmS - this.leftWheelVelocityCmS) / Math.max(1, trackWidthCm),
      ) *
        this.wheelProfile.tractionLateral *
        trackGripFactor;

      this.integrateDynamicObjectGravity(subDt);
      this.integrateDynamicObjectMomentum(subDt);

      const headingRad = toRadians(this.pose.heading_deg);
      const nextPose: SimulatorPose2D = {
        position: {
          x: this.pose.position.x + Math.cos(headingRad) * linearVelocityCmS * subDt,
          y: this.pose.position.y + Math.sin(headingRad) * linearVelocityCmS * subDt,
        },
        heading_deg: normalizeHeading(this.pose.heading_deg + angularVelocityDegS * subDt),
      };

      const collisions = this.detectCollisionsSwept(this.pose, nextPose);
      if (collisions.length > 0) {
        const blockedCollisions = this.resolveDynamicCollisions(nextPose, collisions, subDt);
        if (blockedCollisions.length === 0) {
          this.pose = nextPose;
          this.lastCollisions = [];
          continue;
        }
        // Keep rotation but block translational penetration into world bounds/obstacles.
        this.pose = {
          ...this.pose,
          heading_deg: nextPose.heading_deg,
        };
        this.leftWheelVelocityCmS = 0;
        this.rightWheelVelocityCmS = 0;
        this.lastCollisions = blockedCollisions;
      } else {
        this.pose = nextPose;
        this.lastCollisions = [];
      }
    }
  }

  private integrateDynamicObjectGravity(subDt: number): void {
    if (!this.world?.world_scene || subDt <= 0) return;
    const gravityCmS2 = Math.max(0, Number(this.world.world_scene.gravity_m_s2) || 9.81) * 100;
    for (const object of this.world.world_scene.objects) {
      if (!this.isDynamicObject(object)) continue;
      if (!this.isGravityEnabledForObject(object)) continue;
      const metadata = object.metadata || {};
      const y = Number(object.position?.y) || 0;
      const vy = Number(metadata.vy_cm_s) || 0;
      const nextVy = vy - gravityCmS2 * subDt;
      let nextY = y + nextVy * subDt;
      let resolvedVy = nextVy;
      const restitution = clamp(Number(metadata.restitution ?? 0.22), 0, 0.95);
      if (nextY < 0) {
        nextY = 0;
        resolvedVy = Math.abs(nextVy) > 20 ? -nextVy * restitution : 0;
      }
      object.position = {
        ...object.position,
        y: nextY,
      };
      object.metadata = {
        ...metadata,
        vy_cm_s: resolvedVy,
      };
    }
  }

  private integrateDynamicObjectMomentum(subDt: number): void {
    if (!this.world?.world_scene || subDt <= 0) return;
    for (const object of this.world.world_scene.objects) {
      if (!this.isDynamicObject(object)) continue;
      const metadata = object.metadata || {};
      const vx = Number(metadata.vx_cm_s) || 0;
      const vz = Number(metadata.vz_cm_s) || 0;
      const damping = clamp(Number(metadata.linear_damping ?? 3.2), 0, 25);
      const dampFactor = Math.max(0, 1 - damping * subDt);
      const nextVx = Math.abs(vx * dampFactor) < ThreeRuntimeSimulator.EPS ? 0 : vx * dampFactor;
      const nextVz = Math.abs(vz * dampFactor) < ThreeRuntimeSimulator.EPS ? 0 : vz * dampFactor;
      const nextX = object.position.x + nextVx * subDt;
      const nextZ = object.position.z + nextVz * subDt;
      if (this.canPlaceObject(object, nextX, nextZ, this.pose)) {
        object.position = {
          ...object.position,
          x: nextX,
          z: nextZ,
        };
        this.applyRollingForSphere(object, nextVx * subDt, nextVz * subDt);
      }
      object.metadata = {
        ...metadata,
        vx_cm_s: nextVx,
        vz_cm_s: nextVz,
      };
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
    const halfWidth = this.robot.width_cm / 2;
    const halfLength = this.robot.length_cm / 2;
    const footprintRadius = Math.hypot(halfWidth, halfLength) * 0.85;
    return Math.max(6, footprintRadius);
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
      if (!this.isCollidableObject(object)) continue;
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

  private detectCollisionsSwept(startPose: SimulatorPose2D, endPose: SimulatorPose2D): string[] {
    const direct = this.detectCollisions(endPose);
    if (direct.length > 0) return direct;
    const dx = endPose.position.x - startPose.position.x;
    const dy = endPose.position.y - startPose.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= ThreeRuntimeSimulator.MIN_SWEEP_STEP_CM) return [];
    const samples = Math.min(
      ThreeRuntimeSimulator.MAX_SWEEP_SAMPLES,
      Math.max(2, Math.ceil(distance / ThreeRuntimeSimulator.MIN_SWEEP_STEP_CM)),
    );
    for (let i = 1; i < samples; i += 1) {
      const t = i / samples;
      const samplePose: SimulatorPose2D = {
        position: {
          x: startPose.position.x + dx * t,
          y: startPose.position.y + dy * t,
        },
        heading_deg: normalizeHeading(startPose.heading_deg + normalizeSignedAngle(endPose.heading_deg - startPose.heading_deg) * t),
      };
      const sampled = this.detectCollisions(samplePose);
      if (sampled.length > 0) return sampled;
    }
    return [];
  }

  private resolveDynamicCollisions(candidate: SimulatorPose2D, collisions: string[], subDtS: number): string[] {
    if (!this.world?.world_scene) return collisions;
    const collidingObjects = this.world.world_scene.objects.filter((obj) => collisions.includes(obj.id));
    if (collidingObjects.length === 0) return collisions;

    const moveDx = candidate.position.x - this.pose.position.x;
    const moveDy = candidate.position.y - this.pose.position.y;
    const moveMagnitude = Math.hypot(moveDx, moveDy);
    const fallbackHeading = toRadians(this.pose.heading_deg);
    const dirX = moveMagnitude > ThreeRuntimeSimulator.EPS ? moveDx / moveMagnitude : Math.cos(fallbackHeading);
    const dirY = moveMagnitude > ThreeRuntimeSimulator.EPS ? moveDy / moveMagnitude : Math.sin(fallbackHeading);
    const basePushDistance = Math.max(0.5, moveMagnitude);
    const blocked: string[] = [];

    for (const object of collidingObjects) {
      if (!this.isDynamicObject(object)) {
        blocked.push(object.id);
        continue;
      }
      let moved = false;
      for (const multiplier of ThreeRuntimeSimulator.PUSH_STEP_MULTIPLIERS) {
        const candidateX = object.position.x + dirX * basePushDistance * multiplier;
        const candidateZ = object.position.z + dirY * basePushDistance * multiplier;
        if (!this.canPlaceObject(object, candidateX, candidateZ, candidate)) continue;
        const dx = candidateX - object.position.x;
        const dz = candidateZ - object.position.z;
        object.position = { ...object.position, x: candidateX, z: candidateZ };
        this.applyDynamicObjectRotation(object, dx, dz);
        this.applyDynamicObjectImpulse(object, dx, dz, subDtS);
        this.applyRollingForSphere(object, dx, dz);
        moved = true;
        break;
      }
      if (!moved) {
        blocked.push(object.id);
      }
    }

    if (blocked.length > 0) return blocked;
    return this.detectCollisions(candidate);
  }

  private applyDynamicObjectRotation(object: SimulatorSceneObject, dx: number, dz: number): void {
    const renderShape = typeof object?.metadata?.render_shape === "string" ? object.metadata.render_shape : "";
    if (renderShape === "sphere") return;
    const turnDeltaDeg = clamp((dz - dx) * 0.8, -6, 6);
    const currentYaw = Number(object.rotation_deg?.y) || 0;
    object.rotation_deg = {
      ...(object.rotation_deg || {}),
      y: normalizeHeading(currentYaw + turnDeltaDeg),
    };
  }

  private applyDynamicObjectImpulse(object: SimulatorSceneObject, dx: number, dz: number, subDtS: number): void {
    if (subDtS <= 0) return;
    const metadata = object.metadata || {};
    const vx = Number(metadata.vx_cm_s) || 0;
    const vz = Number(metadata.vz_cm_s) || 0;
    const impulseScale = clamp(Number(metadata.impulse_scale ?? 0.9), 0.1, 3);
    const nextVx = vx + (dx / subDtS) * impulseScale;
    const nextVz = vz + (dz / subDtS) * impulseScale;
    object.metadata = {
      ...metadata,
      vx_cm_s: nextVx,
      vz_cm_s: nextVz,
    };
  }

  private applyRollingForSphere(object: SimulatorSceneObject, dx: number, dz: number): void {
    const renderShape = typeof object?.metadata?.render_shape === "string" ? object.metadata.render_shape : "";
    if (renderShape !== "sphere") return;
    const radiusCm = Math.max(1, Math.min(object.size_cm.x, object.size_cm.z) / 2);
    const rollFromXDeg = (-dx / radiusCm) * (180 / Math.PI);
    const rollFromZDeg = (dz / radiusCm) * (180 / Math.PI);
    const metadata = object.metadata || {};
    const prevRollX = Number(metadata.roll_x_deg) || 0;
    const prevRollZ = Number(metadata.roll_z_deg) || 0;
    object.metadata = {
      ...metadata,
      roll_x_deg: prevRollX + rollFromZDeg,
      roll_z_deg: prevRollZ + rollFromXDeg,
    };
  }

  private canPlaceObject(
    object: SimulatorSceneObject,
    centerX: number,
    centerZ: number,
    candidateRobotPose: SimulatorPose2D,
  ): boolean {
    if (!this.world?.world_scene) return false;
    const worldWidthCm = this.world.width_cells * this.world.grid_cell_cm;
    const worldDepthCm = this.world.height_cells * this.world.grid_cell_cm;
    const halfW = Math.max(1, (Number(object.size_cm?.x) || 0) / 2);
    const halfD = Math.max(1, (Number(object.size_cm?.z) || 0) / 2);

    if (centerX - halfW < 0 || centerZ - halfD < 0 || centerX + halfW > worldWidthCm || centerZ + halfD > worldDepthCm) {
      return false;
    }

    const objectYaw = Number(object.rotation_deg?.y) || 0;
    const robotRadius = this.robotCollisionRadiusCm();
    if (
      circleIntersectsOrientedBox2d(
        candidateRobotPose.position.x,
        candidateRobotPose.position.y,
        robotRadius,
        centerX,
        centerZ,
        object.size_cm.x,
        object.size_cm.z,
        objectYaw,
      )
    ) {
      return false;
    }

    const movingRadius = Math.hypot(object.size_cm.x / 2, object.size_cm.z / 2) * 0.9;
    for (const other of this.world.world_scene.objects) {
      if (!other || other.id === object.id) continue;
      if (other?.metadata?.hidden) continue;
      if (!this.isCollidableObject(other)) continue;
      const otherYaw = Number(other.rotation_deg?.y) || 0;
      if (
        circleIntersectsOrientedBox2d(
          centerX,
          centerZ,
          movingRadius,
          other.position.x,
          other.position.z,
          other.size_cm.x,
          other.size_cm.z,
          otherYaw,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private isCollidableObject(object: SimulatorSceneObject): boolean {
    return object.type === "obstacle" || object.type === "wall";
  }

  private isDynamicObject(object: SimulatorSceneObject): boolean {
    if (!this.isCollidableObject(object)) return false;
    if (object.type === "wall") return false;
    const metadata = object.metadata || {};
    if (metadata.physics_body === "dynamic") return true;
    if (metadata.physics_body === "static") return false;
    if (typeof metadata.dynamic === "boolean") return metadata.dynamic;
    return object.type === "obstacle";
  }

  private isGravityEnabledForObject(object: SimulatorSceneObject): boolean {
    const metadata = object.metadata || {};
    if (typeof metadata.use_gravity === "boolean") return metadata.use_gravity;
    const renderShape = typeof metadata.render_shape === "string" ? metadata.render_shape : "";
    return renderShape === "sphere";
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
        if (!this.isCollidableObject(obj)) return false;
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
