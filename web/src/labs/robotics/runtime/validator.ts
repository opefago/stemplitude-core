import type { RoboticsCondition, RoboticsExpression, RoboticsIRNode, RoboticsProgram } from "../../../lib/robotics";
import type { KitActuatorActionHandler } from "../adapters/kitActuatorActionFactory";
import type { KitCapabilities } from "../adapters/kitCapabilitiesFactory";
import type { KitRuntimeBehaviorProfile } from "../adapters/kitRuntimeBehaviorFactory";
import { ISSUE_CODES } from "./issueCodes";
import type { IssueCode } from "./issueCodes";
import type { RuntimeIssue } from "./types";

export interface ValidateProgramForKitInput {
  program: RoboticsProgram;
  capabilities: KitCapabilities;
  runtimeBehavior: KitRuntimeBehaviorProfile;
  resolveActuatorAction?: ((actuatorId: string, action: string) => KitActuatorActionHandler | null) | null;
}

export interface ValidateProgramForKitResult {
  ok: boolean;
  diagnostics: string[];
  issues: RuntimeIssue[];
}

function nodeRef(node: RoboticsIRNode) {
  return `node ${node.id}`;
}

interface ValidationCollector {
  diagnostics: string[];
  issues: RuntimeIssue[];
}

function reportValidationIssue(collector: ValidationCollector, code: IssueCode, message: string) {
  collector.diagnostics.push(message);
  collector.issues.push({
    code,
    severity: "error",
    category: "semantic",
    message,
  });
}

function validateExpression(
  expression: RoboticsExpression,
  allowedSensors: Set<string>,
  collector: ValidationCollector,
  context: string,
) {
  if (expression.type === "sensor") {
    if (!allowedSensors.has(expression.sensor)) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.KIT_CAPABILITY_MISMATCH,
        `${context}: sensor "${expression.sensor}" is not available for the selected kit`,
      );
    }
    return;
  }
  if (expression.type === "binary") {
    validateExpression(expression.left, allowedSensors, collector, context);
    validateExpression(expression.right, allowedSensors, collector, context);
  }
}

function validateCondition(
  condition: RoboticsCondition,
  allowedSensors: Set<string>,
  collector: ValidationCollector,
  context: string,
) {
  if (condition.op === "sensor_gt" || condition.op === "sensor_lt") {
    if (!allowedSensors.has(condition.sensor)) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.KIT_CAPABILITY_MISMATCH,
        `${context}: sensor "${condition.sensor}" is not available for the selected kit`,
      );
    }
    return;
  }
  if (condition.op === "eq") {
    validateExpression(condition.left, allowedSensors, collector, context);
    validateExpression(condition.right, allowedSensors, collector, context);
    return;
  }
  if (condition.op === "and" || condition.op === "or") {
    condition.conditions.forEach((child) => validateCondition(child, allowedSensors, collector, context));
    return;
  }
  if (condition.op === "not") {
    validateCondition(condition.condition, allowedSensors, collector, context);
  }
}

function validateNode(
  node: RoboticsIRNode,
  allowedSensors: Set<string>,
  allowedActuators: Set<string>,
  runtimeBehavior: KitRuntimeBehaviorProfile,
  resolveActuatorAction: ((actuatorId: string, action: string) => KitActuatorActionHandler | null) | null | undefined,
  collector: ValidationCollector,
) {
  if (node.kind === "move") {
    if (!Number.isFinite(node.value) || Number(node.value) < 0) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.NUMERIC_RANGE_INVALID,
        `${nodeRef(node)}: move value must be a non-negative number`,
      );
    }
    return;
  }
  if (node.kind === "turn") {
    if (!Number.isFinite(node.angle_deg) || Number(node.angle_deg) < 0) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.NUMERIC_RANGE_INVALID,
        `${nodeRef(node)}: turn angle must be a non-negative number`,
      );
    }
    return;
  }
  if (node.kind === "set_motor") {
    const motorId = String(node.motor_id || "").trim().toLowerCase();
    if (!allowedActuators.has(motorId)) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.KIT_CAPABILITY_MISMATCH,
        `${nodeRef(node)}: actuator "${node.motor_id}" is not available for the selected kit`,
      );
      return;
    }
    const behavior = runtimeBehavior.motorBehaviors[motorId];
    const hasHandler = Boolean(resolveActuatorAction?.(motorId, "set_speed"));
    if (!behavior && !hasHandler) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.KIT_RUNTIME_MAPPING_MISSING,
        `${nodeRef(node)}: actuator "${node.motor_id}" has no runtime mapping or action handler`,
      );
    }
    if (!Number.isFinite(node.speed_pct)) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.NUMERIC_INVALID,
        `${nodeRef(node)}: speed_pct must be a finite number`,
      );
    }
    return;
  }
  if (node.kind === "actuator_action") {
    const actuatorId = String(node.actuator_id || "").trim().toLowerCase();
    if (!allowedActuators.has(actuatorId)) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.KIT_CAPABILITY_MISMATCH,
        `${nodeRef(node)}: actuator "${node.actuator_id}" is not available for the selected kit`,
      );
      return;
    }
    const action = String(node.action || "").trim().toLowerCase();
    if (!action) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.ACTION_REQUIRED,
        `${nodeRef(node)}: action is required for actuator_action`,
      );
      return;
    }
    const handler = resolveActuatorAction?.(actuatorId, action);
    if (!handler) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.KIT_ACTION_UNREGISTERED,
        `${nodeRef(node)}: action "${node.actuator_id}.${node.action}" is not registered for this kit`,
      );
    }
    return;
  }
  if (node.kind === "read_sensor") {
    if (!allowedSensors.has(node.sensor)) {
      reportValidationIssue(
        collector,
        ISSUE_CODES.KIT_CAPABILITY_MISMATCH,
        `${nodeRef(node)}: sensor "${node.sensor}" is not available for the selected kit`,
      );
    }
    return;
  }
  if (node.kind === "if") {
    validateCondition(node.condition, allowedSensors, collector, nodeRef(node));
    node.then_nodes.forEach((child) =>
      validateNode(child, allowedSensors, allowedActuators, runtimeBehavior, resolveActuatorAction, collector));
    (node.else_nodes || []).forEach((child) =>
      validateNode(child, allowedSensors, allowedActuators, runtimeBehavior, resolveActuatorAction, collector));
    return;
  }
  if (node.kind === "repeat") {
    if (node.while) validateCondition(node.while, allowedSensors, collector, nodeRef(node));
    node.body.forEach((child) =>
      validateNode(child, allowedSensors, allowedActuators, runtimeBehavior, resolveActuatorAction, collector));
    return;
  }
  if (node.kind === "assign") {
    validateExpression(node.value, allowedSensors, collector, nodeRef(node));
    return;
  }
  if (node.kind === "return") {
    if (node.value) {
      validateExpression(node.value, allowedSensors, collector, nodeRef(node));
    }
    return;
  }
  if (node.kind === "call") {
    (node.args || []).forEach((arg) => validateExpression(arg, allowedSensors, collector, nodeRef(node)));
    return;
  }
  if (node.kind === "wait" || node.kind === "emit_event") {
    return;
  }
}

export function validateProgramForKit(input: ValidateProgramForKitInput): ValidateProgramForKitResult {
  const collector: ValidationCollector = { diagnostics: [], issues: [] };
  const allowedSensors = new Set(input.capabilities.sensors.map((sensor) => sensor.kind));
  const allowedActuators = new Set(input.capabilities.actuators.map((actuator) => actuator.kind));

  input.program.nodes.forEach((node) =>
    validateNode(node, allowedSensors, allowedActuators, input.runtimeBehavior, input.resolveActuatorAction, collector));
  (input.program.functions || []).forEach((fn) => {
    fn.body.forEach((node) =>
      validateNode(node, allowedSensors, allowedActuators, input.runtimeBehavior, input.resolveActuatorAction, collector));
  });

  return {
    ok: collector.diagnostics.length === 0,
    diagnostics: collector.diagnostics,
    issues: collector.issues,
  };
}

