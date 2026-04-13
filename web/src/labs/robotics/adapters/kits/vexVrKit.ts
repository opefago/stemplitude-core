import { registerKitCapabilities } from "../kitCapabilitiesFactory";
import { registerKitActuatorAction } from "../kitActuatorActionFactory";
import { registerKitRuntimeBehavior } from "../kitRuntimeBehaviorFactory";

let isRegistered = false;

export function registerVexVrKit() {
  if (isRegistered) return;
  isRegistered = true;
  registerKitCapabilities("vex", "vex_vr", {
    sensorKinds: ["distance", "line", "color", "bumper", "gyro"],
    actuatorKinds: ["left_motor", "right_motor", "arm_motor"],
  });
  registerKitRuntimeBehavior("vex", "vex_vr", {
    maxLinearSpeedCmS: 26,
    maxTurnSpeedDegS: 135,
    motorBehaviors: {
      drive: { mode: "linear", axisSign: 1, maxSpeed: 26 },
      left_motor: { mode: "turn", axisSign: -1, maxSpeed: 135, defaultDurationSec: 0.7 },
      right_motor: { mode: "turn", axisSign: 1, maxSpeed: 135, defaultDurationSec: 0.7 },
      arm_motor: { mode: "none" },
    },
  });
  registerKitActuatorAction("vex", "vex_vr", "arm_motor", "set_speed", (request) => ({
    handled: true,
    diagnostics: [
      `Actuator ${request.actuatorId} simulated without kinematics (${request.action})`,
    ],
  }));
}

