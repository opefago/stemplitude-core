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
import {
  detectContactsAtPose,
  type ContactCandidate,
  type ContactManifold,
  sweepCircleContacts,
} from "./contactKernel";
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dot2(ax: number, ay: number, bx: number, by: number) {
  return ax * bx + ay * by;
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
  private robotElevationCm = 0;
  private robotVerticalVelocityCmS = 0;
  private robotGrounded = true;
  private supportSurfaceId: string | null = null;

  private static readonly EPS = 0.01;
  private static readonly MIN_SENSOR_RANGE_CM = 2;
  private static readonly PUSH_STEP_MULTIPLIERS = [1, 1.25, 1.5, 1.75, 2];
  private static readonly MIN_SWEEP_STEP_CM = 2;
  private static readonly MAX_SWEEP_SAMPLES = 12;
  private static readonly DEFAULT_MAX_CLIMB_SLOPE_DEG = 16;
  private static readonly RAMP_ENTRY_ALIGNMENT_MIN = 0.45;
  private lastSweepToi = 1;

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
    this.robotElevationCm = 0;
    this.robotVerticalVelocityCmS = 0;
    this.robotGrounded = true;
    this.supportSurfaceId = null;
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
      const rampAdjustedLinearTarget = this.applyRampGradeEffect(adjustedLinearTarget);
      const trackWidthCm = this.wheelProfile.trackWidthCm;
      const targetAngularRadS = toRadians(targetAngularDegS);
      const tractionLinear = this.wheelProfile.tractionLongitudinal;
      const targetLeftWheelCmS =
        (rampAdjustedLinearTarget - (targetAngularRadS * trackWidthCm) / 2) * tractionLinear;
      const targetRightWheelCmS =
        (rampAdjustedLinearTarget + (targetAngularRadS * trackWidthCm) / 2) * tractionLinear;
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
        const collisionPose =
          this.lastSweepToi < 1
            ? {
                position: {
                  x: this.pose.position.x + (nextPose.position.x - this.pose.position.x) * this.lastSweepToi,
                  y: this.pose.position.y + (nextPose.position.y - this.pose.position.y) * this.lastSweepToi,
                },
                heading_deg: normalizeHeading(
                  this.pose.heading_deg +
                    normalizeSignedAngle(nextPose.heading_deg - this.pose.heading_deg) * this.lastSweepToi,
                ),
              }
            : nextPose;
        const blockedCollisions = this.resolveDynamicCollisions(collisionPose, collisions, subDt);
        if (blockedCollisions.length === 0) {
          const priorPose = this.pose;
          this.pose = collisionPose;
          const moveDx = collisionPose.position.x - priorPose.position.x;
          const moveDy = collisionPose.position.y - priorPose.position.y;
          const moveMagnitude = Math.hypot(moveDx, moveDy);
          const fallbackHeading = toRadians(this.pose.heading_deg);
          const dirX = moveMagnitude > ThreeRuntimeSimulator.EPS ? moveDx / moveMagnitude : Math.cos(fallbackHeading);
          const dirY = moveMagnitude > ThreeRuntimeSimulator.EPS ? moveDy / moveMagnitude : Math.sin(fallbackHeading);
          this.lastCollisions = collisions.filter((collisionId) => {
            if (collisionId === "world_bounds") return true;
            const object = this.findSceneObjectById(collisionId);
            if (!object) return false;
            return this.shouldObjectBlockRobot(object, priorPose, collisionPose, dirX, dirY);
          });
          this.updateGroundingState(subDt);
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
        this.lastSweepToi = 1;
        this.pose = nextPose;
        this.lastCollisions = [];
      }
      this.updateGroundingState(subDt);
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

  private buildContactCandidates(
    predicate: (object: SimulatorSceneObject) => boolean,
  ): ContactCandidate[] {
    if (!this.world?.world_scene?.objects) return [];
    const candidates: ContactCandidate[] = [];
    for (const object of this.world.world_scene.objects) {
      if (!object || object.metadata?.hidden) continue;
      if (!predicate(object)) continue;
      candidates.push({
        object,
        centerX: object.position.x,
        centerY: object.position.z,
        width: Math.max(1, object.size_cm.x),
        depth: Math.max(1, object.size_cm.z),
        yawDeg: Number(object.rotation_deg?.y) || 0,
      });
    }
    return candidates;
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

    const candidates = this.buildContactCandidates((object) => this.isRobotCollisionCandidate(object));
    const contacts = detectContactsAtPose(x, y, radius, candidates);
    for (const contact of contacts) {
      collisions.push(contact.objectId);
    }
    return collisions;
  }

  private detectCollisionsSwept(startPose: SimulatorPose2D, endPose: SimulatorPose2D): string[] {
    const radius = this.robotCollisionRadiusCm();
    const candidates = this.buildContactCandidates((object) => this.isRobotCollisionCandidate(object));
    const sweptContacts = sweepCircleContacts({
      startX: startPose.position.x,
      startY: startPose.position.y,
      endX: endPose.position.x,
      endY: endPose.position.y,
      radius,
      candidates,
      minStepCm: ThreeRuntimeSimulator.MIN_SWEEP_STEP_CM,
      maxSamples: ThreeRuntimeSimulator.MAX_SWEEP_SAMPLES,
    });
    if (sweptContacts.length === 0) {
      this.lastSweepToi = 1;
      return [];
    }
    const toi = Math.min(...sweptContacts.map((entry) => entry.toi));
    this.lastSweepToi = clamp(toi, 0, 1);
    return sweptContacts.map((entry) => entry.objectId);
  }

  private supportHeightForPose(object: SimulatorSceneObject, pose: SimulatorPose2D): number {
    if (this.getSurfaceType(object) === "ramp") {
      const local = this.toObjectLocal(pose.position.x, pose.position.y, object);
      const halfW = Math.max(1, Number(object.size_cm?.x) || 0) / 2;
      const entrySide = object.metadata?.ramp_entry_side === "negative_x" ? -1 : 1;
      const normalized =
        entrySide === 1 ? clamp((halfW - local.x) / (halfW * 2), 0, 1) : clamp((local.x + halfW) / (halfW * 2), 0, 1);
      return Math.max(0, Number(object.size_cm?.y) || 0) * normalized;
    }
    return Number(object.size_cm?.y) || 0;
  }

  private findSupportSurface(pose: SimulatorPose2D): { id: string; height: number } | null {
    if (!this.world?.world_scene?.objects) return null;
    let best: { id: string; height: number } | null = null;
    for (const object of this.world.world_scene.objects) {
      if (!object || object.metadata?.hidden) continue;
      const isSupport =
        this.getSurfaceType(object) === "ramp" ||
        object.metadata?.support_surface === true ||
        object.type === "wall";
      if (!isSupport) continue;
      const local = this.toObjectLocal(pose.position.x, pose.position.y, object);
      const halfW = Math.max(1, Number(object.size_cm?.x) || 0) / 2;
      const halfD = Math.max(1, Number(object.size_cm?.z) || 0) / 2;
      if (Math.abs(local.x) > halfW || Math.abs(local.z) > halfD) continue;
      const height = this.supportHeightForPose(object, pose);
      if (!best || height > best.height) {
        best = { id: object.id, height };
      }
    }
    return best;
  }

  private updateGroundingState(subDtS: number): void {
    const support = this.findSupportSurface(this.pose);
    const gravityCmS2 = Math.max(0, Number(this.world?.world_scene?.gravity_m_s2) || 9.81) * 100;
    if (support) {
      this.supportSurfaceId = support.id;
      if (this.robotElevationCm > support.height + 0.1) {
        this.robotGrounded = false;
        this.robotVerticalVelocityCmS -= gravityCmS2 * subDtS;
        this.robotElevationCm += this.robotVerticalVelocityCmS * subDtS;
        if (this.robotElevationCm <= support.height) {
          this.robotElevationCm = support.height;
          this.robotVerticalVelocityCmS = 0;
          this.robotGrounded = true;
        }
      } else {
        this.robotGrounded = true;
        this.robotVerticalVelocityCmS = 0;
        this.robotElevationCm = support.height;
      }
      return;
    }
    this.supportSurfaceId = null;
    this.robotGrounded = false;
    this.robotVerticalVelocityCmS -= gravityCmS2 * subDtS;
    this.robotElevationCm += this.robotVerticalVelocityCmS * subDtS;
    if (this.robotElevationCm <= 0) {
      this.robotElevationCm = 0;
      this.robotVerticalVelocityCmS = 0;
      this.robotGrounded = true;
    }
  }

  private computeRobotTiltDiagnosticsDeg(): { pitchDeg: number; rollDeg: number } {
    if (!this.robotGrounded || !this.supportSurfaceId) return { pitchDeg: 0, rollDeg: 0 };
    const support = this.findSceneObjectById(this.supportSurfaceId);
    if (!support || this.getSurfaceType(support) !== "ramp") return { pitchDeg: 0, rollDeg: 0 };
    const slopeDeg = this.requiredSlopeToTraverseDeg(support);
    const uphill = this.rampUphillDirection(support);
    const headingRad = toRadians(this.pose.heading_deg);
    const headingX = Math.cos(headingRad);
    const headingY = Math.sin(headingRad);
    const forwardAlongSlope = dot2(headingX, headingY, uphill.x, uphill.y);
    const crossSlope = headingX * uphill.y - headingY * uphill.x;
    const pitchDeg = clamp(slopeDeg * forwardAlongSlope, -35, 35);
    const rollDeg = clamp(slopeDeg * crossSlope * 0.35, -15, 15);
    return { pitchDeg, rollDeg };
  }

  private detectContactManifoldsForPose(
    pose: SimulatorPose2D,
    predicate: (object: SimulatorSceneObject) => boolean,
  ): ContactManifold[] {
    const radius = this.robotCollisionRadiusCm();
    const candidates = this.buildContactCandidates(predicate);
    return detectContactsAtPose(pose.position.x, pose.position.y, radius, candidates);
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
      if (!this.shouldObjectBlockRobot(object, this.pose, candidate, dirX, dirY)) {
        continue;
      }
      if (!this.isDynamicObject(object)) {
        blocked.push(object.id);
        continue;
      }
      const pushResistance = clamp(Number(object.metadata?.push_resistance ?? 1), 0.2, 5);
      let moved = false;
      for (const multiplier of ThreeRuntimeSimulator.PUSH_STEP_MULTIPLIERS) {
        const candidateX = object.position.x + (dirX * basePushDistance * multiplier) / pushResistance;
        const candidateZ = object.position.z + (dirY * basePushDistance * multiplier) / pushResistance;
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

    if (blocked.length > 0) {
      const blockingSet = new Set(blocked);
      const manifolds = this.detectContactManifoldsForPose(
        candidate,
        (object) => blockingSet.has(object.id) && this.shouldObjectBlockRobot(object, this.pose, candidate, dirX, dirY),
      );
      if (manifolds.length > 0) {
        let correctedX = candidate.position.x;
        let correctedY = candidate.position.y;
        let slideX = moveDx;
        let slideY = moveDy;
        for (const manifold of manifolds) {
          const pushOut = Math.max(0, manifold.penetration + 0.1);
          correctedX += manifold.normalX * pushOut;
          correctedY += manifold.normalY * pushOut;
          const motionInto = dot2(slideX, slideY, manifold.normalX, manifold.normalY);
          if (motionInto > 0) {
            slideX -= manifold.normalX * motionInto;
            slideY -= manifold.normalY * motionInto;
          }
        }
        correctedX += slideX * 0.15;
        correctedY += slideY * 0.15;
        candidate.position = { x: correctedX, y: correctedY };
        const residualBlocking = this.detectContactManifoldsForPose(
          candidate,
          (object) => this.shouldObjectBlockRobot(object, this.pose, candidate, dirX, dirY),
        );
        if (residualBlocking.length === 0) {
          return [];
        }
        return Array.from(new Set(residualBlocking.map((entry) => entry.objectId)));
      }
      return blocked;
    }
    const residual = this.detectCollisions(candidate);
    if (residual.length === 0) return residual;
    return residual.filter((collisionId) => {
      if (collisionId === "world_bounds") return true;
      const object = this.findSceneObjectById(collisionId);
      if (!object) return true;
      return this.shouldObjectBlockRobot(object, this.pose, candidate, dirX, dirY);
    });
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
    const robotOverlap = detectContactsAtPose(candidateRobotPose.position.x, candidateRobotPose.position.y, robotRadius, [
      {
        object,
        centerX,
        centerY: centerZ,
        width: Math.max(1, object.size_cm.x),
        depth: Math.max(1, object.size_cm.z),
        yawDeg: objectYaw,
      },
    ]);
    if (robotOverlap.length > 0) {
      return false;
    }

    const movingRadius = Math.hypot(object.size_cm.x / 2, object.size_cm.z / 2) * 0.9;
    for (const other of this.world.world_scene.objects) {
      if (!other || other.id === object.id) continue;
      if (other?.metadata?.hidden) continue;
      if (!this.isSolidCollisionObject(other)) continue;
      const otherYaw = Number(other.rotation_deg?.y) || 0;
      const contact = detectContactsAtPose(centerX, centerZ, movingRadius, [
        {
          object: other,
          centerX: other.position.x,
          centerY: other.position.z,
          width: Math.max(1, other.size_cm.x),
          depth: Math.max(1, other.size_cm.z),
          yawDeg: otherYaw,
        },
      ]);
      if (contact.length > 0) {
        return false;
      }
    }
    return true;
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
    const metadataSurface = object.metadata?.surface_type;
    if (typeof metadataSurface === "string" && metadataSurface.trim()) return metadataSurface;
    if (object.metadata?.render_shape === "ramp") return "ramp";
    return "default";
  }

  private robotMaxClimbSlopeDeg(): number {
    const raw = Number(this.robot.max_climb_slope_deg);
    if (!Number.isFinite(raw)) return ThreeRuntimeSimulator.DEFAULT_MAX_CLIMB_SLOPE_DEG;
    return clamp(raw, 0, 89);
  }

  private requiredSlopeToTraverseDeg(object: SimulatorSceneObject): number {
    const overrideRequired = Number(object.metadata?.max_climb_slope_deg);
    if (Number.isFinite(overrideRequired)) return clamp(overrideRequired, 0, 89);
    const rawSlope = Number(object.metadata?.slope_deg);
    if (Number.isFinite(rawSlope)) return clamp(rawSlope, 0, 89);
    return 14;
  }

  private isRampTraversable(object: SimulatorSceneObject): boolean {
    if (this.getSurfaceType(object) !== "ramp") return false;
    if (object.metadata?.is_ramp_entry_blocking === true) return false;
    return this.robotMaxClimbSlopeDeg() + 1e-6 >= this.requiredSlopeToTraverseDeg(object);
  }

  private shouldObjectBlockRobot(
    object: SimulatorSceneObject,
    currentPose?: SimulatorPose2D,
    candidatePose?: SimulatorPose2D,
    moveDirX?: number,
    moveDirY?: number,
  ): boolean {
    if (!this.isBaseCollidableType(object)) return false;
    const contactMode = this.getContactMode(object);
    if (contactMode === "pass_through" || contactMode === "sensor_only") return false;
    if (this.getSurfaceType(object) === "ramp") {
      return !this.canTraverseRampForMotion(object, currentPose, candidatePose, moveDirX, moveDirY);
    }
    return true;
  }

  private isRobotCollisionCandidate(object: SimulatorSceneObject): boolean {
    if (!this.isBaseCollidableType(object)) return false;
    const contactMode = this.getContactMode(object);
    if (contactMode === "pass_through" || contactMode === "sensor_only") return false;
    return this.isBaseCollidableType(object);
  }

  private isSolidCollisionObject(object: SimulatorSceneObject): boolean {
    return this.shouldObjectBlockRobot(object, this.pose, this.pose);
  }

  private findSceneObjectById(objectId: string): SimulatorSceneObject | null {
    if (!this.world?.world_scene?.objects) return null;
    return this.world.world_scene.objects.find((item) => item.id === objectId) || null;
  }

  private toObjectLocal(
    pointX: number,
    pointY: number,
    object: SimulatorSceneObject,
  ): { x: number; z: number } {
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

  private isPoseInsideRampFootprint(pose: SimulatorPose2D, object: SimulatorSceneObject): boolean {
    const local = this.toObjectLocal(pose.position.x, pose.position.y, object);
    const radius = this.robotCollisionRadiusCm();
    const halfW = Math.max(1, Number(object.size_cm?.x) || 0) / 2;
    const halfD = Math.max(1, Number(object.size_cm?.z) || 0) / 2;
    return Math.abs(local.x) <= halfW + radius && Math.abs(local.z) <= halfD + radius;
  }

  private activeRampUnderRobot(): SimulatorSceneObject | null {
    if (!this.world?.world_scene?.objects) return null;
    for (const object of this.world.world_scene.objects) {
      if (!object || object.metadata?.hidden) continue;
      if (this.getSurfaceType(object) !== "ramp") continue;
      if (!this.isPoseInsideRampFootprint(this.pose, object)) continue;
      return object;
    }
    return null;
  }

  private applyRampGradeEffect(targetLinearCmS: number): number {
    const ramp = this.activeRampUnderRobot();
    if (!ramp) return targetLinearCmS;
    const uphill = this.rampUphillDirection(ramp);
    const headingRad = toRadians(this.pose.heading_deg);
    const headingX = Math.cos(headingRad);
    const headingY = Math.sin(headingRad);
    const headingDot = dot2(headingX, headingY, uphill.x, uphill.y);
    const slopeRatio = clamp(this.requiredSlopeToTraverseDeg(ramp) / 45, 0, 1);
    const traction = clamp(this.wheelProfile.tractionLongitudinal, 0.2, 1.2);
    if (headingDot > 0.12) {
      // Uphill: reduce effective wheel command by grade and available traction.
      const uphillPenalty = clamp(slopeRatio * (1.08 - traction) * Math.abs(headingDot), 0, 0.55);
      return targetLinearCmS * (1 - uphillPenalty);
    }
    if (headingDot < -0.12) {
      // Downhill: mild gravity-assisted gain.
      const descentAssist = clamp(Number(ramp.metadata?.ramp_descent_assist ?? 0.18), 0, 0.5);
      const downhillBoost = clamp(slopeRatio * descentAssist * Math.abs(headingDot), 0, 0.35);
      return targetLinearCmS * (1 + downhillBoost);
    }
    // Cross-slope movement loses traction and behaves as edge-slip tendency.
    const sidePenalty = clamp(slopeRatio * 0.28, 0, 0.25);
    return targetLinearCmS * (1 - sidePenalty);
  }

  private canTraverseRampForMotion(
    object: SimulatorSceneObject,
    currentPose?: SimulatorPose2D,
    candidatePose?: SimulatorPose2D,
    moveDirX?: number,
    moveDirY?: number,
  ): boolean {
    if (!this.isRampTraversable(object)) return false;
    if (!currentPose || !candidatePose) return true;

    const dx = candidatePose.position.x - currentPose.position.x;
    const dy = candidatePose.position.y - currentPose.position.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude <= ThreeRuntimeSimulator.EPS) return true;
    const dirX = moveDirX ?? dx / magnitude;
    const dirY = moveDirY ?? dy / magnitude;

    const uphill = this.rampUphillDirection(object);
    const headingDot = dot2(dirX, dirY, uphill.x, uphill.y);
    const sideBlocking = object.metadata?.ramp_side_blocking !== false;
    if (sideBlocking && Math.abs(headingDot) < ThreeRuntimeSimulator.RAMP_ENTRY_ALIGNMENT_MIN) {
      // Side approach should not ghost through ramp walls.
      return false;
    }

    const localCurrent = this.toObjectLocal(currentPose.position.x, currentPose.position.y, object);
    const localCandidate = this.toObjectLocal(candidatePose.position.x, candidatePose.position.y, object);
    const halfW = Math.max(1, Number(object.size_cm?.x) || 0) / 2;
    const halfD = Math.max(1, Number(object.size_cm?.z) || 0) / 2;
    const radius = this.robotCollisionRadiusCm();
    const entryBand = Math.max(radius * 1.25, halfW * 0.24);
    const startsInside = this.isPoseInsideRampFootprint(currentPose, object);

    // Entering climb from low edge only (local +X side).
    if (headingDot > 0) {
      const tractionGate = clamp(this.wheelProfile.tractionLongitudinal, 0.25, 1.2);
      const effectiveCapability = this.robotMaxClimbSlopeDeg() * tractionGate;
      if (effectiveCapability + 1e-6 < this.requiredSlopeToTraverseDeg(object)) {
        return false;
      }
      if (!startsInside) {
        const entrySide = object.metadata?.ramp_entry_side === "negative_x" ? -1 : 1;
        if (entrySide === 1 && localCurrent.x < halfW - entryBand) return false;
        if (entrySide === -1 && localCurrent.x > -halfW + entryBand) return false;
      }
      // Must stay within ramp width while climbing.
      return Math.abs(localCandidate.z) <= halfD + radius * 0.35;
    }

    // Descending is allowed from upper side if aligned, but still blocks side-entry.
    if (!startsInside) {
      const entrySide = object.metadata?.ramp_entry_side === "negative_x" ? -1 : 1;
      if (entrySide === 1 && localCurrent.x > -halfW + entryBand) return false;
      if (entrySide === -1 && localCurrent.x < halfW - entryBand) return false;
    }
    return Math.abs(localCandidate.z) <= halfD + radius * 0.35;
  }

  private isDynamicObject(object: SimulatorSceneObject): boolean {
    if (!this.isBaseCollidableType(object)) return false;
    if (this.getContactMode(object) !== "solid") return false;
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
    readings.__physics_grounded = this.robotGrounded;
    readings.__physics_elevation_cm = Number(this.robotElevationCm.toFixed(3));
    readings.__physics_support = this.supportSurfaceId || "";
    const tilt = this.computeRobotTiltDiagnosticsDeg();
    readings.__physics_pitch_deg = Number(tilt.pitchDeg.toFixed(3));
    readings.__physics_roll_deg = Number(tilt.rollDeg.toFixed(3));
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
        if (!this.isRobotCollisionCandidate(obj)) return false;
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
