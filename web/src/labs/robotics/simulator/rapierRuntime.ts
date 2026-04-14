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
import { ThreeRuntimeSimulator } from "./threeRuntime";

type RapierModule = any;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeHeading(heading: number): number {
  let next = heading % 360;
  if (next < 0) next += 360;
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quaternionToYawDeg(rotation: { x: number; y: number; z: number; w: number }): number {
  const sinyCosp = 2 * (rotation.w * rotation.y + rotation.x * rotation.z);
  const cosyCosp = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
  return normalizeHeading((Math.atan2(sinyCosp, cosyCosp) * 180) / Math.PI);
}

function pointInOrientedBox2d(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  width: number,
  depth: number,
  yawDeg = 0,
): boolean {
  const yawRad = toRadians(yawDeg);
  const cos = Math.cos(-yawRad);
  const sin = Math.sin(-yawRad);
  const localX = (x - centerX) * cos - (y - centerY) * sin;
  const localY = (x - centerX) * sin + (y - centerY) * cos;
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= depth / 2;
}

export class RapierRuntimeSimulator implements RoboticsSimulatorBridge {
  private static rapierPromise: Promise<RapierModule> | null = null;

  private world: SimulatorWorldMap | null = null;
  private pose: SimulatorPose2D = { position: { x: 0, y: 0 }, heading_deg: 0 };
  private readonly robot: SimulatorRobotModel;
  private readonly wheelProfile: ResolvedWheelProfile;
  private readonly fallback: ThreeRuntimeSimulator;
  private sensorOverrides: Record<string, number | boolean | string | null | undefined> = {};

  private rapier: RapierModule | null = null;
  private rapierWorld: any = null;
  private robotBody: any = null;
  private robotCollider: any = null;
  private objectBodies = new Map<string, any>();
  private colliderToObjectId = new Map<number, string>();
  private lastCollisions: string[] = [];
  private ready = false;
  private failed = false;
  private worldDirty = true;
  private leftWheelVelocityCmS = 0;
  private rightWheelVelocityCmS = 0;

  private static readonly EPS = 0.01;

  constructor(robot: SimulatorRobotModel) {
    this.robot = robot;
    this.wheelProfile = resolveWheelProfile(robot);
    this.fallback = new ThreeRuntimeSimulator(robot);
    void this.initializeRapier();
  }

  setWorld(map: SimulatorWorldMap): void {
    this.world = map;
    this.worldDirty = true;
    this.fallback.setWorld(map);
  }

  reset(pose: SimulatorPose2D): void {
    this.pose = {
      position: { ...pose.position },
      heading_deg: normalizeHeading(pose.heading_deg),
    };
    this.lastCollisions = [];
    this.leftWheelVelocityCmS = 0;
    this.rightWheelVelocityCmS = 0;
    this.fallback.reset(pose);
    if (this.ready && this.robotBody) {
      const halfHeight = this.robotHeightCm() / 2;
      this.robotBody.setTranslation({ x: this.pose.position.x, y: halfHeight, z: this.pose.position.y }, true);
      this.robotBody.setRotation(this.yawToQuaternion(this.pose.heading_deg), true);
      this.robotBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.robotBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  setSensorOverrides(overrides: Record<string, number | boolean | string | null | undefined>): void {
    this.sensorOverrides = { ...overrides };
    this.fallback.setSensorOverrides?.(overrides);
  }

  tick(input: SimulatorTickInput): SimulatorTickOutput {
    if (!this.ready || this.failed) {
      return this.fallback.tick(input);
    }
    if (!this.ensureWorldInitialized()) {
      return this.fallback.tick(input);
    }

    const dtSeconds = Math.max(0, Number(input.dt_ms) || 0) / 1000;
    if (dtSeconds > 0) {
      this.rapierWorld.integrationParameters.dt = dtSeconds;
      const headingRad = toRadians(this.pose.heading_deg);
      const inputLinear = Number(input.linear_velocity_cm_s) || 0;
      const angularDeg = Number(input.angular_velocity_deg_s) || 0;
      const adjustedLinear =
        Math.abs(angularDeg) > RapierRuntimeSimulator.EPS &&
        Math.abs(inputLinear) < this.wheelProfile.wheelRadiusCm * 1.5
          ? this.wheelProfile.wheelRadiusCm * 1.5
          : inputLinear;
      const trackWidthCm = this.wheelProfile.trackWidthCm;
      const angularRadS = toRadians(angularDeg);
      const tractionLinear = this.wheelProfile.tractionLongitudinal;
      const targetLeftWheel = (adjustedLinear - (angularRadS * trackWidthCm) / 2) * tractionLinear;
      const targetRightWheel = (adjustedLinear + (angularRadS * trackWidthCm) / 2) * tractionLinear;
      this.leftWheelVelocityCmS = this.approachVelocity(
        this.leftWheelVelocityCmS,
        targetLeftWheel,
        this.wheelProfile.maxWheelAccelCmS2 * this.wheelProfile.tractionLongitudinal,
        this.wheelProfile.rollingResistance,
        dtSeconds,
      );
      this.rightWheelVelocityCmS = this.approachVelocity(
        this.rightWheelVelocityCmS,
        targetRightWheel,
        this.wheelProfile.maxWheelAccelCmS2 * this.wheelProfile.tractionLongitudinal,
        this.wheelProfile.rollingResistance,
        dtSeconds,
      );
      const bodyLinear = (this.leftWheelVelocityCmS + this.rightWheelVelocityCmS) / 2;
      const trackGripFactor = clamp(18 / Math.max(8, this.wheelProfile.trackWidthCm), 0.68, 1.08);
      const bodyAngularRadS =
        ((this.rightWheelVelocityCmS - this.leftWheelVelocityCmS) / Math.max(1, trackWidthCm)) *
        this.wheelProfile.tractionLateral *
        trackGripFactor;
      this.robotBody.setLinvel(
        { x: Math.cos(headingRad) * bodyLinear, y: 0, z: Math.sin(headingRad) * bodyLinear },
        true,
      );
      this.robotBody.setAngvel({ x: 0, y: bodyAngularRadS, z: 0 }, true);
      this.rapierWorld.step();
    }

    const t = this.robotBody.translation();
    const r = this.robotBody.rotation();
    this.pose = {
      position: { x: t.x, y: t.z },
      heading_deg: quaternionToYawDeg(r),
    };
    this.syncDynamicObjectTransforms();
    this.lastCollisions = this.computeRobotCollisions();

    return {
      pose: { ...this.pose, position: { ...this.pose.position } },
      collisions: this.lastCollisions.slice(),
      sensor_values: this.readSensors(),
    };
  }

  private approachVelocity(current: number, target: number, accelLimit: number, frictionCoeff: number, dtS: number): number {
    const delta = target - current;
    const maxStep = accelLimit * dtS;
    const towardTarget = Math.abs(delta) <= maxStep ? target : current + Math.sign(delta) * maxStep;
    const friction = Math.max(0, 1 - frictionCoeff * dtS);
    const withFriction = towardTarget * friction;
    return Math.abs(withFriction) < RapierRuntimeSimulator.EPS ? 0 : withFriction;
  }

  private async initializeRapier(): Promise<void> {
    try {
      if (!RapierRuntimeSimulator.rapierPromise) {
        RapierRuntimeSimulator.rapierPromise = import("@dimforge/rapier3d-compat").then(async (module) => {
          const rapier = module.default || module;
          await rapier.init();
          return rapier;
        });
      }
      this.rapier = await RapierRuntimeSimulator.rapierPromise;
      this.ready = Boolean(this.rapier);
      this.worldDirty = true;
    } catch {
      this.failed = true;
    }
  }

  private ensureWorldInitialized(): boolean {
    if (!this.ready || !this.rapier || !this.world) return false;
    if (!this.worldDirty && this.rapierWorld && this.robotBody) return true;
    const R = this.rapier;
    const gravity = Math.max(0, Number(this.world.world_scene?.gravity_m_s2) || 9.81) * 100;
    this.rapierWorld = new R.World({ x: 0, y: -gravity, z: 0 });
    this.objectBodies.clear();
    this.colliderToObjectId.clear();

    const worldWidth = this.world.width_cells * this.world.grid_cell_cm;
    const worldDepth = this.world.height_cells * this.world.grid_cell_cm;
    const halfHeight = this.robotHeightCm() / 2;
    const robotBodyDesc = R.RigidBodyDesc.kinematicVelocityBased().setTranslation(
      this.pose.position.x,
      halfHeight,
      this.pose.position.y,
    );
    this.robotBody = this.rapierWorld.createRigidBody(robotBodyDesc);
    this.robotBody.setRotation(this.yawToQuaternion(this.pose.heading_deg), true);
    const robotColliderDesc = R.ColliderDesc.cuboid(
      this.robot.length_cm / 2,
      this.robotHeightCm() / 2,
      this.robot.width_cm / 2,
    );
    this.robotCollider = this.rapierWorld.createCollider(robotColliderDesc, this.robotBody);

    this.createWorldBounds(worldWidth, worldDepth);
    for (const object of this.world.world_scene?.objects || []) {
      if (object?.metadata?.hidden) continue;
      if (object.type !== "obstacle" && object.type !== "wall") continue;
      this.createSceneObjectBody(object);
    }

    this.worldDirty = false;
    return true;
  }

  private createWorldBounds(worldWidth: number, worldDepth: number): void {
    const R = this.rapier;
    const thickness = 5;
    const wallHeight = 40;
    const walls = [
      { id: "world_bounds_left", x: -thickness / 2, z: worldDepth / 2, sx: thickness, sz: worldDepth + thickness * 2 },
      { id: "world_bounds_right", x: worldWidth + thickness / 2, z: worldDepth / 2, sx: thickness, sz: worldDepth + thickness * 2 },
      { id: "world_bounds_top", x: worldWidth / 2, z: -thickness / 2, sx: worldWidth + thickness * 2, sz: thickness },
      { id: "world_bounds_bottom", x: worldWidth / 2, z: worldDepth + thickness / 2, sx: worldWidth + thickness * 2, sz: thickness },
    ];
    for (const wall of walls) {
      const rb = this.rapierWorld.createRigidBody(
        R.RigidBodyDesc.fixed().setTranslation(wall.x, wallHeight / 2, wall.z),
      );
      const collider = this.rapierWorld.createCollider(
        R.ColliderDesc.cuboid(wall.sx / 2, wallHeight / 2, wall.sz / 2),
        rb,
      );
      this.colliderToObjectId.set(collider.handle, wall.id);
    }
  }

  private createSceneObjectBody(object: SimulatorSceneObject): void {
    const R = this.rapier;
    const metadata = object.metadata || {};
    const dynamic = metadata.physics_body === "dynamic" && object.type !== "wall";
    const bodyDesc = dynamic ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed();
    const halfY = Math.max(1, Number(object.size_cm?.y) || 20) / 2;
    const body = this.rapierWorld.createRigidBody(
      bodyDesc.setTranslation(object.position.x, (Number(object.position?.y) || 0) + halfY, object.position.z),
    );
    body.setRotation(this.yawToQuaternion(Number(object.rotation_deg?.y) || 0), true);

    const renderShape = typeof metadata.render_shape === "string" ? metadata.render_shape : "";
    let colliderDesc: any;
    if (renderShape === "sphere") {
      colliderDesc = R.ColliderDesc.ball(Math.max(2, Math.min(object.size_cm.x, object.size_cm.z) / 2));
    } else {
      colliderDesc = R.ColliderDesc.cuboid(
        Math.max(1, object.size_cm.x / 2),
        Math.max(1, object.size_cm.y / 2),
        Math.max(1, object.size_cm.z / 2),
      );
    }
    const collider = this.rapierWorld.createCollider(colliderDesc, body);
    this.colliderToObjectId.set(collider.handle, object.id);
    this.objectBodies.set(object.id, body);
  }

  private syncDynamicObjectTransforms(): void {
    if (!this.world?.world_scene) return;
    for (const object of this.world.world_scene.objects) {
      const body = this.objectBodies.get(object.id);
      if (!body) continue;
      if (object.metadata?.physics_body !== "dynamic") continue;
      const t = body.translation();
      const q = body.rotation();
      const halfY = Math.max(1, Number(object.size_cm?.y) || 20) / 2;
      object.position = {
        ...object.position,
        x: t.x,
        y: Math.max(0, t.y - halfY),
        z: t.z,
      };
      object.rotation_deg = {
        ...(object.rotation_deg || {}),
        y: quaternionToYawDeg(q),
      };
    }
  }

  private computeRobotCollisions(): string[] {
    if (!this.robotCollider) return [];
    const collisions = new Set<string>();
    try {
      this.rapierWorld.intersectionsWith(this.robotCollider, (otherCollider: any) => {
        const id = this.colliderToObjectId.get(otherCollider.handle);
        if (id) collisions.add(id);
        return true;
      });
    } catch {
      // Keep collision list best-effort; fallback path already exists.
    }
    return Array.from(collisions);
  }

  private readSensors(): Record<string, string | number | boolean> {
    const readings: Record<string, string | number | boolean> = {};
    for (const sensor of this.robot.sensors || []) {
      if (sensor.kind === "gyro") readings[sensor.id] = this.pose.heading_deg;
      else if (sensor.kind === "bumper" || sensor.kind === "touch") readings[sensor.id] = this.lastCollisions.length > 0;
      else if (sensor.kind === "distance") readings[sensor.id] = this.distanceAheadCm(sensor.id);
      else if (sensor.kind === "line") readings[sensor.id] = this.isLineDetected(sensor.id);
      else if (sensor.kind === "color") readings[sensor.id] = this.floorColor(sensor.id);

      const byId = this.sensorOverrides[sensor.id];
      const byKind = this.sensorOverrides[sensor.kind];
      const override = byId ?? byKind;
      if (override !== undefined && override !== null) readings[sensor.id] = override;
    }
    return readings;
  }

  private sensorPose(sensorId: string): { x: number; y: number; heading_deg: number } {
    const sensor = this.robot.sensors.find((item) => item.id === sensorId);
    if (!sensor) return { x: this.pose.position.x, y: this.pose.position.y, heading_deg: this.pose.heading_deg };
    const headingRad = toRadians(this.pose.heading_deg);
    const localX = sensor.mount.offset_cm.x;
    const localY = sensor.mount.offset_cm.y;
    return {
      x: this.pose.position.x + localX * Math.cos(headingRad) - localY * Math.sin(headingRad),
      y: this.pose.position.y + localX * Math.sin(headingRad) + localY * Math.cos(headingRad),
      heading_deg: normalizeHeading(this.pose.heading_deg + sensor.mount.heading_offset_deg),
    };
  }

  private distanceAheadCm(sensorId: string): number {
    if (!this.rapierWorld) return 0;
    const sensor = this.robot.sensors.find((item) => item.id === sensorId);
    const sensorPose = this.sensorPose(sensorId);
    const headingRad = toRadians(sensorPose.heading_deg);
    const maxRange = Math.max(20, Number(sensor?.config?.max_range_cm) || 240);
    const direction = { x: Math.cos(headingRad), y: 0, z: Math.sin(headingRad) };
    const origin = { x: sensorPose.x, y: this.robotHeightCm() / 2, z: sensorPose.y };
    try {
      const ray = new this.rapier.Ray(origin, direction);
      const hit =
        this.rapierWorld.castRay(ray, maxRange, true, undefined, undefined, this.robotCollider) ||
        this.rapierWorld.castRay(ray, maxRange, true);
      if (!hit) return maxRange;
      return clamp(Number(hit.toi) || maxRange, 0, maxRange);
    } catch {
      return maxRange;
    }
  }

  private isLineDetected(sensorId: string): boolean {
    if (!this.world?.world_scene) return false;
    const sensorPose = this.sensorPose(sensorId);
    return this.world.world_scene.objects.some((obj) => {
      if (obj?.metadata?.hidden) return false;
      if (obj.type !== "line_segment") return false;
      return pointInOrientedBox2d(
        sensorPose.x,
        sensorPose.y,
        obj.position.x,
        obj.position.z,
        obj.size_cm.x,
        obj.size_cm.z,
        Number(obj.rotation_deg?.y) || 0,
      );
    });
  }

  private floorColor(sensorId: string): string {
    if (!this.world?.world_scene) return "default";
    const sensorPose = this.sensorPose(sensorId);
    const zone = this.world.world_scene.objects.find((obj) => {
      if (obj?.metadata?.hidden) return false;
      if (obj.type !== "color_zone" && obj.type !== "target_zone") return false;
      return pointInOrientedBox2d(
        sensorPose.x,
        sensorPose.y,
        obj.position.x,
        obj.position.z,
        obj.size_cm.x,
        obj.size_cm.z,
        Number(obj.rotation_deg?.y) || 0,
      );
    });
    if (!zone) return "default";
    const metadataColor = zone.metadata?.color;
    if (typeof metadataColor === "string" && metadataColor.trim()) return metadataColor;
    return zone.type === "target_zone" ? "goal" : "zone";
  }

  private robotHeightCm(): number {
    return Math.max(8, Math.min(this.robot.width_cm, this.robot.length_cm) * 0.5);
  }

  private yawToQuaternion(yawDeg: number): { x: number; y: number; z: number; w: number } {
    const yawRad = toRadians(yawDeg);
    return {
      x: 0,
      y: Math.sin(yawRad / 2),
      z: 0,
      w: Math.cos(yawRad / 2),
    };
  }
}

