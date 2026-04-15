import type {
  RoboticsSimulatorBridge,
  SimulatorContactMode,
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

function dot2(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
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
  private static readonly DEFAULT_MAX_CLIMB_SLOPE_DEG = 16;
  private static readonly RAMP_ENTRY_ALIGNMENT_MIN = 0.45;

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

    const poseBeforeStep = { position: { ...this.pose.position }, heading_deg: this.pose.heading_deg };
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
    this.lastCollisions = this.computeRobotCollisions(poseBeforeStep, this.pose);
    if (dtSeconds > 0 && this.lastCollisions.length > 0) {
      this.pose = {
        position: { ...poseBeforeStep.position },
        heading_deg: this.pose.heading_deg,
      };
      const halfHeight = this.robotHeightCm() / 2;
      this.robotBody.setTranslation({ x: this.pose.position.x, y: halfHeight, z: this.pose.position.y }, true);
      this.robotBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

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
    const contactMode = this.getContactMode(object);
    if (contactMode === "pass_through") return;
    const dynamic = contactMode === "solid" && metadata.physics_body === "dynamic" && object.type !== "wall";
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
    const friction = Number(metadata.friction_coefficient ?? metadata.friction);
    if (Number.isFinite(friction)) {
      colliderDesc.setFriction(clamp(friction, 0, 5));
    }
    const restitution = Number(metadata.restitution_coefficient ?? metadata.restitution);
    if (Number.isFinite(restitution)) {
      colliderDesc.setRestitution(clamp(restitution, 0, 1));
    }
    if (contactMode === "sensor_only" || this.getSurfaceType(object) === "ramp") {
      colliderDesc.setSensor(true);
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

  private computeRobotCollisions(previousPose: SimulatorPose2D, currentPose: SimulatorPose2D): string[] {
    if (!this.robotCollider) return [];
    const collisions = new Set<string>();
    try {
      this.rapierWorld.intersectionsWith(this.robotCollider, (otherCollider: any) => {
        const id = this.colliderToObjectId.get(otherCollider.handle);
        if (!id) return true;
        if (id.startsWith("world_bounds_")) {
          collisions.add("world_bounds");
          return true;
        }
        const object = this.findSceneObjectById(id);
        if (object && this.shouldObjectBlockRobot(object, previousPose, currentPose)) {
          collisions.add(id);
        }
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

  private isBaseCollidableType(object: SimulatorSceneObject): boolean {
    return object.type === "obstacle" || object.type === "wall";
  }

  private getContactMode(object: SimulatorSceneObject): SimulatorContactMode {
    const value = object.metadata?.contact_mode;
    if (value === "pass_through" || value === "sensor_only" || value === "solid") return value;
    return "solid";
  }

  private getSurfaceType(object: SimulatorSceneObject): string {
    const surface = object.metadata?.surface_type;
    if (typeof surface === "string" && surface.trim()) return surface;
    if (object.metadata?.render_shape === "ramp") return "ramp";
    return "default";
  }

  private robotMaxClimbSlopeDeg(): number {
    const raw = Number(this.robot.max_climb_slope_deg);
    if (!Number.isFinite(raw)) return RapierRuntimeSimulator.DEFAULT_MAX_CLIMB_SLOPE_DEG;
    return clamp(raw, 0, 89);
  }

  private requiredSlopeToTraverseDeg(object: SimulatorSceneObject): number {
    const overrideRequired = Number(object.metadata?.max_climb_slope_deg);
    if (Number.isFinite(overrideRequired)) return clamp(overrideRequired, 0, 89);
    const slopeDeg = Number(object.metadata?.slope_deg);
    if (Number.isFinite(slopeDeg)) return clamp(slopeDeg, 0, 89);
    return 14;
  }

  private isRampTraversable(object: SimulatorSceneObject): boolean {
    if (this.getSurfaceType(object) !== "ramp") return false;
    if (object.metadata?.is_ramp_entry_blocking === true) return false;
    return this.robotMaxClimbSlopeDeg() + 1e-6 >= this.requiredSlopeToTraverseDeg(object);
  }

  private shouldObjectBlockRobot(
    object: SimulatorSceneObject,
    previousPose: SimulatorPose2D,
    currentPose: SimulatorPose2D,
  ): boolean {
    if (!this.isBaseCollidableType(object)) return false;
    const contactMode = this.getContactMode(object);
    if (contactMode === "pass_through" || contactMode === "sensor_only") return false;
    if (this.getSurfaceType(object) === "ramp") {
      return !this.canTraverseRampForMotion(object, previousPose, currentPose);
    }
    return true;
  }

  private toObjectLocal(pointX: number, pointY: number, object: SimulatorSceneObject): { x: number; z: number } {
    const yawDeg = Number(object.rotation_deg?.y) || 0;
    const yawRad = toRadians(yawDeg);
    const cos = Math.cos(-yawRad);
    const sin = Math.sin(-yawRad);
    return {
      x: (pointX - object.position.x) * cos - (pointY - object.position.z) * sin,
      z: (pointX - object.position.x) * sin + (pointY - object.position.z) * cos,
    };
  }

  private rampUphillDirection(object: SimulatorSceneObject): { x: number; y: number } {
    const yawDeg = Number(object.rotation_deg?.y) || 0;
    const yawRad = toRadians(yawDeg);
    const entrySide = object.metadata?.ramp_entry_side === "negative_x" ? -1 : 1;
    const axisSign = entrySide === 1 ? -1 : 1;
    return { x: axisSign * Math.cos(yawRad), y: axisSign * Math.sin(yawRad) };
  }

  private canTraverseRampForMotion(
    object: SimulatorSceneObject,
    previousPose: SimulatorPose2D,
    currentPose: SimulatorPose2D,
  ): boolean {
    if (!this.isRampTraversable(object)) return false;
    const dx = currentPose.position.x - previousPose.position.x;
    const dy = currentPose.position.y - previousPose.position.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude <= RapierRuntimeSimulator.EPS) return true;
    const dirX = dx / magnitude;
    const dirY = dy / magnitude;
    const uphill = this.rampUphillDirection(object);
    const headingDot = dot2(dirX, dirY, uphill.x, uphill.y);
    const sideBlocking = object.metadata?.ramp_side_blocking !== false;
    if (sideBlocking && Math.abs(headingDot) < RapierRuntimeSimulator.RAMP_ENTRY_ALIGNMENT_MIN) return false;

    const halfW = Math.max(1, Number(object.size_cm?.x) || 0) / 2;
    const halfD = Math.max(1, Number(object.size_cm?.z) || 0) / 2;
    const radius = Math.hypot(this.robot.length_cm, this.robot.width_cm) * 0.4;
    const entryBand = Math.max(radius, halfW * 0.24);
    const localPrevious = this.toObjectLocal(previousPose.position.x, previousPose.position.y, object);
    const localCurrent = this.toObjectLocal(currentPose.position.x, currentPose.position.y, object);
    const startsInside =
      Math.abs(localPrevious.x) <= halfW + radius && Math.abs(localPrevious.z) <= halfD + radius;

    if (headingDot > 0) {
      const tractionGate = clamp(this.wheelProfile.tractionLongitudinal, 0.25, 1.2);
      const effectiveCapability = this.robotMaxClimbSlopeDeg() * tractionGate;
      if (effectiveCapability + 1e-6 < this.requiredSlopeToTraverseDeg(object)) return false;
      if (!startsInside) {
        const entrySide = object.metadata?.ramp_entry_side === "negative_x" ? -1 : 1;
        if (entrySide === 1 && localPrevious.x < halfW - entryBand) return false;
        if (entrySide === -1 && localPrevious.x > -halfW + entryBand) return false;
      }
      return Math.abs(localCurrent.z) <= halfD + radius * 0.35;
    }

    if (!startsInside) {
      const entrySide = object.metadata?.ramp_entry_side === "negative_x" ? -1 : 1;
      if (entrySide === 1 && localPrevious.x > -halfW + entryBand) return false;
      if (entrySide === -1 && localPrevious.x < halfW - entryBand) return false;
    }
    return Math.abs(localCurrent.z) <= halfD + radius * 0.35;
  }

  private findSceneObjectById(objectId: string): SimulatorSceneObject | null {
    if (!this.world?.world_scene?.objects) return null;
    return this.world.world_scene.objects.find((item) => item.id === objectId) || null;
  }
}

