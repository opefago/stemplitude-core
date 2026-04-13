import type {
  RoboticsSimulatorBridge,
  SimulatorPose2D,
  SimulatorRobotModel,
  SimulatorTickInput,
  SimulatorTickOutput,
  SimulatorWorldMap,
  SimulatorWorldObject,
} from "./types";

function normalizeHeading(heading: number): number {
  let next = heading % 360;
  if (next < 0) next += 360;
  return next;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function pointInRect(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
): boolean {
  const halfW = width / 2;
  const halfH = height / 2;
  return x >= centerX - halfW && x <= centerX + halfW && y >= centerY - halfH && y <= centerY + halfH;
}

export class GridWorldSimulator implements RoboticsSimulatorBridge {
  private world: SimulatorWorldMap | null = null;
  private robot: SimulatorRobotModel;
  private pose: SimulatorPose2D = {
    position: { x: 0, y: 0 },
    heading_deg: 0,
  };

  constructor(robot: SimulatorRobotModel) {
    this.robot = robot;
  }

  setWorld(map: SimulatorWorldMap): void {
    this.world = map;
  }

  reset(pose: SimulatorPose2D): void {
    this.pose = {
      position: { ...pose.position },
      heading_deg: normalizeHeading(pose.heading_deg),
    };
  }

  tick(input: SimulatorTickInput): SimulatorTickOutput {
    if (!this.world) {
      return {
        pose: { ...this.pose, position: { ...this.pose.position } },
        collisions: [],
        sensor_values: {},
      };
    }

    const dtSeconds = input.dt_ms / 1000;
    const headingRad = toRadians(this.pose.heading_deg);
    const deltaX = Math.cos(headingRad) * input.linear_velocity_cm_s * dtSeconds;
    const deltaY = Math.sin(headingRad) * input.linear_velocity_cm_s * dtSeconds;
    const nextHeading = normalizeHeading(this.pose.heading_deg + input.angular_velocity_deg_s * dtSeconds);
    const candidatePose: SimulatorPose2D = {
      position: {
        x: this.pose.position.x + deltaX,
        y: this.pose.position.y + deltaY,
      },
      heading_deg: nextHeading,
    };

    const collisions = this.detectCollisions(candidatePose);
    if (collisions.length === 0) {
      this.pose = candidatePose;
    } else {
      this.pose = { ...this.pose, heading_deg: nextHeading };
    }

    return {
      pose: { ...this.pose, position: { ...this.pose.position } },
      collisions,
      sensor_values: this.readSensors(collisions),
    };
  }

  private detectCollisions(candidatePose: SimulatorPose2D): string[] {
    if (!this.world) return [];

    const collisions: string[] = [];
    const { x, y } = candidatePose.position;
    const widthCm = this.world.width_cells * this.world.grid_cell_cm;
    const heightCm = this.world.height_cells * this.world.grid_cell_cm;

    if (x < 0 || y < 0 || x > widthCm || y > heightCm) {
      collisions.push("world_bounds");
    }

    const obstacleLike = this.world.objects.filter((obj) => obj.type === "obstacle");
    for (const object of obstacleLike) {
      if (
        pointInRect(
          x,
          y,
          object.pose.position.x,
          object.pose.position.y,
          object.dimensions_cm.width,
          object.dimensions_cm.height,
        )
      ) {
        collisions.push(object.id);
      }
    }

    return collisions;
  }

  private readSensors(collisions: string[]): Record<string, number | boolean | string> {
    const readings: Record<string, number | boolean | string> = {};
    const sensors = this.robot.sensors || [];

    for (const sensor of sensors) {
      if (sensor.kind === "gyro") {
        readings[sensor.id] = this.pose.heading_deg;
        continue;
      }
      if (sensor.kind === "bumper" || sensor.kind === "touch") {
        readings[sensor.id] = collisions.length > 0;
        continue;
      }
      if (sensor.kind === "distance") {
        readings[sensor.id] = this.distanceAheadCm(sensor.config.max_range_cm as number | undefined);
        continue;
      }
      if (sensor.kind === "line") {
        readings[sensor.id] = this.readSurfaceType("line_segment");
        continue;
      }
      if (sensor.kind === "color") {
        readings[sensor.id] = this.readSurfaceType("color_zone");
      }
    }
    return readings;
  }

  private readSurfaceType(expectedType: SimulatorWorldObject["type"]): string | boolean {
    if (!this.world) return false;
    const { x, y } = this.pose.position;
    const area = this.world.objects.find((object) => {
      if (object.type !== expectedType) return false;
      return pointInRect(
        x,
        y,
        object.pose.position.x,
        object.pose.position.y,
        object.dimensions_cm.width,
        object.dimensions_cm.height,
      );
    });
    if (!area) return false;
    return String(area.metadata?.value ?? area.id);
  }

  private distanceAheadCm(maxRangeCm?: number): number {
    if (!this.world) return 0;
    const range = typeof maxRangeCm === "number" ? maxRangeCm : 200;
    const headingRad = toRadians(this.pose.heading_deg);
    const step = 2;
    const widthCm = this.world.width_cells * this.world.grid_cell_cm;
    const heightCm = this.world.height_cells * this.world.grid_cell_cm;
    const obstacles = this.world.objects.filter((object) => object.type === "obstacle");

    for (let distance = 0; distance <= range; distance += step) {
      const x = this.pose.position.x + Math.cos(headingRad) * distance;
      const y = this.pose.position.y + Math.sin(headingRad) * distance;
      if (x < 0 || y < 0 || x > widthCm || y > heightCm) {
        return distance;
      }
      const hit = obstacles.some((object) =>
        pointInRect(
          x,
          y,
          object.pose.position.x,
          object.pose.position.y,
          object.dimensions_cm.width,
          object.dimensions_cm.height,
        ),
      );
      if (hit) return distance;
    }
    return range;
  }
}

