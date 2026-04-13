import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly";
import { registerGrowableIfElseChainBlocks } from "../../lib/blockly/growableIfElseChain";

let roboticsBlocksRegistered = false;
let roboticsSensorOptions = [
  ["distance", "distance"],
  ["line", "line"],
  ["color", "color"],
  ["bumper", "bumper"],
  ["gyro", "gyro"],
];
let roboticsActuatorOptions = [
  ["left_motor", "left_motor"],
  ["right_motor", "right_motor"],
  ["arm_motor", "arm_motor"],
];

function normalizeSensorOptions(sensorKinds) {
  if (!Array.isArray(sensorKinds) || sensorKinds.length === 0) return roboticsSensorOptions;
  const next = sensorKinds
    .map((sensor) => String(sensor || "").trim().toLowerCase())
    .filter(Boolean)
    .map((sensor) => [sensor, sensor]);
  const deduped = [];
  const seen = new Set();
  for (const [label, value] of next) {
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push([label, value]);
  }
  if (!seen.has("gyro")) deduped.push(["gyro", "gyro"]);
  return deduped.length > 0 ? deduped : roboticsSensorOptions;
}

function normalizeActuatorOptions(actuatorKinds) {
  if (!Array.isArray(actuatorKinds) || actuatorKinds.length === 0) return roboticsActuatorOptions;
  const next = actuatorKinds
    .map((actuator) => String(actuator || "").trim().toLowerCase())
    .filter(Boolean)
    .map((actuator) => [actuator, actuator]);
  const deduped = [];
  const seen = new Set();
  for (const [label, value] of next) {
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push([label, value]);
  }
  return deduped.length > 0 ? deduped : roboticsActuatorOptions;
}

function setSensorFieldOptions(workspace, nextOptions) {
  if (!workspace) return;
  const allowed = new Set(nextOptions.map(([, value]) => value));
  const defaultValue = nextOptions[0]?.[1] || "distance";
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type !== "robotics_read_sensor" && block.type !== "robotics_sensor_condition") continue;
    const field = block.getField("SENSOR");
    if (!field) continue;
    field.menuGenerator_ = nextOptions;
    const currentValue = String(field.getValue() || "");
    if (!allowed.has(currentValue)) {
      field.setValue(defaultValue);
    }
    block.render?.();
  }
}

function setActuatorFieldOptions(workspace, nextOptions) {
  if (!workspace) return;
  const allowed = new Set(nextOptions.map(([, value]) => value));
  const defaultValue = nextOptions[0]?.[1] || "left_motor";
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type !== "robotics_set_motor") continue;
    const field = block.getField("MOTOR");
    if (!field) continue;
    field.menuGenerator_ = nextOptions;
    const currentValue = String(field.getValue() || "");
    if (!allowed.has(currentValue)) {
      field.setValue(defaultValue);
    }
    block.render?.();
  }
}

function registerRoboticsBlocks() {
  if (roboticsBlocksRegistered) return;
  roboticsBlocksRegistered = true;

  Blockly.Blocks.robotics_start = {
    init() {
      this.appendDummyInput().appendField("when run");
      this.appendStatementInput("DO").setCheck(null).appendField("do");
      this.setColour(200);
      this.setMovable(false);
      this.setDeletable(false);
    },
  };

  Blockly.Blocks.robotics_move = {
    init() {
      this.appendDummyInput()
        .appendField("move")
        .appendField(
          new Blockly.FieldDropdown([
            ["forward", "forward"],
            ["backward", "backward"],
          ]),
          "DIR",
        )
        .appendField(new Blockly.FieldNumber(80, 1, 1000, 1), "VALUE")
        .appendField(
          new Blockly.FieldDropdown([
            ["cm", "distance_cm"],
            ["mm", "distance_mm"],
            ["inches", "distance_in"],
            ["seconds", "seconds"],
          ]),
          "UNIT",
        )
        .appendField("speed")
        .appendField(new Blockly.FieldNumber(70, 1, 100, 1), "SPEED")
        .appendField("%");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(210);
    },
  };

  Blockly.Blocks.robotics_turn = {
    init() {
      this.appendDummyInput()
        .appendField("turn")
        .appendField(
          new Blockly.FieldDropdown([
            ["left", "left"],
            ["right", "right"],
          ]),
          "DIR",
        )
        .appendField(new Blockly.FieldNumber(90, 1, 360, 1), "ANGLE")
        .appendField("deg speed")
        .appendField(new Blockly.FieldNumber(75, 1, 100, 1), "SPEED")
        .appendField("%");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(210);
    },
  };

  Blockly.Blocks.robotics_wait = {
    init() {
      this.appendDummyInput()
        .appendField("wait")
        .appendField(new Blockly.FieldNumber(0.5, 0.1, 30, 0.1), "SECONDS")
        .appendField("seconds");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(46);
    },
  };

  Blockly.Blocks.robotics_read_sensor = {
    init() {
      this.appendDummyInput()
        .appendField("read sensor")
        .appendField(
          new Blockly.FieldDropdown(() => roboticsSensorOptions),
          "SENSOR",
        )
        .appendField("as")
        .appendField(new Blockly.FieldTextInput("sensor_value"), "OUT");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(270);
    },
  };

  Blockly.Blocks.robotics_set_motor = {
    init() {
      this.appendDummyInput()
        .appendField("set motor")
        .appendField(new Blockly.FieldDropdown(() => roboticsActuatorOptions), "MOTOR")
        .appendField("speed")
        .appendField(new Blockly.FieldNumber(60, -100, 100, 1), "SPEED")
        .appendField("% for")
        .appendField(new Blockly.FieldNumber(0.8, 0, 10, 0.1), "DURATION")
        .appendField("s");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(25);
    },
  };

  Blockly.Blocks.robotics_repeat_times = {
    init() {
      this.appendDummyInput()
        .appendField("repeat")
        .appendField(new Blockly.FieldNumber(3, 1, 100, 1), "TIMES")
        .appendField("times");
      this.appendStatementInput("DO").setCheck(null).appendField("do");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(120);
    },
  };

  Blockly.Blocks.robotics_sensor_condition = {
    init() {
      this.appendDummyInput()
        .appendField("sensor")
        .appendField(
          new Blockly.FieldDropdown(() => roboticsSensorOptions),
          "SENSOR",
        )
        .appendField(
          new Blockly.FieldDropdown([
            [">", "sensor_gt"],
            ["<", "sensor_lt"],
          ]),
          "OP",
        )
        .appendField(new Blockly.FieldNumber(20, 0, 1000, 1), "VALUE");
      this.setOutput(true, "Boolean");
      this.setColour(270);
      this.setTooltip("Boolean sensor comparison");
    },
  };

  registerGrowableIfElseChainBlocks({
    Blockly,
    pythonGenerator: { forBlock: {}, valueToCode: () => "", statementToCode: () => "" },
    baseType: "robotics_if_chain",
    elseType: "robotics_if_else_chain",
    color: 210,
    tooltip: "If/else branch based on sensor comparisons",
    orderNone: 0,
  });

  Blockly.Blocks.robotics_emit_event = {
    init() {
      this.appendDummyInput()
        .appendField("emit event")
        .appendField(new Blockly.FieldTextInput("milestone_reached"), "EVENT");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(300);
    },
  };
}

function parseSensorCondition(block) {
  const fallbackSensor = roboticsSensorOptions[0]?.[1] || "distance";
  if (!block) {
    return { op: "sensor_gt", sensor: fallbackSensor, value: 20 };
  }
  if (block.type === "robotics_sensor_condition") {
    return {
      op: block.getFieldValue("OP") || "sensor_gt",
      sensor: block.getFieldValue("SENSOR") || fallbackSensor,
      value: Number(block.getFieldValue("VALUE") || 20),
    };
  }
  return { op: "sensor_gt", sensor: fallbackSensor, value: 20 };
}

function defaultActuatorValue() {
  return roboticsActuatorOptions[0]?.[1] || "left_motor";
}

function buildIfNodeFromChain(cursor, index = 0) {
  const condition = parseSensorCondition(cursor.getInputTargetBlock(`IF${index}`));
  const thenNodes = parseStatementChain(cursor.getInputTargetBlock(`DO${index}`));
  const nextHasElseIf = Boolean(cursor.getInput(`IF${index + 1}`));
  if (nextHasElseIf) {
    return {
      id: cursor.id,
      kind: "if",
      condition,
      then_nodes: thenNodes,
      else_nodes: [buildIfNodeFromChain(cursor, index + 1)],
    };
  }
  return {
    id: cursor.id,
    kind: "if",
    condition,
    then_nodes: thenNodes,
    else_nodes: parseStatementChain(cursor.getInputTargetBlock("ELSE")),
  };
}

function flattenIfNode(node) {
  const chain = [];
  let cursor = node;
  while (cursor?.kind === "if") {
    chain.push({
      condition: cursor.condition || { op: "sensor_gt", sensor: "distance", value: 20 },
      body: cursor.then_nodes || [],
    });
    if (cursor.else_nodes?.length === 1 && cursor.else_nodes[0]?.kind === "if") {
      cursor = cursor.else_nodes[0];
    } else {
      break;
    }
  }
  const elseNodes = cursor?.else_nodes?.length === 1 && cursor.else_nodes[0]?.kind === "if" ? [] : cursor?.else_nodes || [];
  return { chain, elseNodes };
}

function parseStatementChain(firstBlock) {
  const nodes = [];
  let cursor = firstBlock;
  while (cursor) {
    if (cursor.type === "robotics_move") {
      nodes.push({
        id: cursor.id,
        kind: "move",
        direction: cursor.getFieldValue("DIR") || "forward",
        value: Number(cursor.getFieldValue("VALUE") || 80),
        unit: cursor.getFieldValue("UNIT") || "distance_cm",
        speed_pct: Number(cursor.getFieldValue("SPEED") || 70),
      });
    } else if (cursor.type === "robotics_turn") {
      nodes.push({
        id: cursor.id,
        kind: "turn",
        direction: cursor.getFieldValue("DIR") || "right",
        angle_deg: Number(cursor.getFieldValue("ANGLE") || 90),
        speed_pct: Number(cursor.getFieldValue("SPEED") || 75),
      });
    } else if (cursor.type === "robotics_wait") {
      nodes.push({
        id: cursor.id,
        kind: "wait",
        seconds: Number(cursor.getFieldValue("SECONDS") || 0.5),
      });
    } else if (cursor.type === "robotics_read_sensor") {
      nodes.push({
        id: cursor.id,
        kind: "read_sensor",
        sensor: cursor.getFieldValue("SENSOR") || "distance",
        output_var: (cursor.getFieldValue("OUT") || "sensor_value").slice(0, 40),
      });
    } else if (cursor.type === "robotics_set_motor") {
      nodes.push({
        id: cursor.id,
        kind: "set_motor",
        motor_id: cursor.getFieldValue("MOTOR") || defaultActuatorValue(),
        speed_pct: Number(cursor.getFieldValue("SPEED") || 60),
        duration_sec: Number(cursor.getFieldValue("DURATION") || 0.8),
      });
    } else if (cursor.type === "robotics_repeat_times") {
      nodes.push({
        id: cursor.id,
        kind: "repeat",
        times: Number(cursor.getFieldValue("TIMES") || 1),
        body: parseStatementChain(cursor.getInputTargetBlock("DO")),
      });
    } else if (cursor.type === "robotics_if_chain" || cursor.type === "robotics_if_else_chain") {
      nodes.push(buildIfNodeFromChain(cursor, 0));
    } else if (cursor.type === "robotics_if_sensor") {
      nodes.push({
        id: cursor.id,
        kind: "if",
        condition: {
          op: cursor.getFieldValue("OP") || "sensor_gt",
          sensor: cursor.getFieldValue("SENSOR") || "distance",
          value: Number(cursor.getFieldValue("VALUE") || 20),
        },
        then_nodes: parseStatementChain(cursor.getInputTargetBlock("THEN")),
        else_nodes: parseStatementChain(cursor.getInputTargetBlock("ELSE")),
      });
    } else if (cursor.type === "robotics_emit_event") {
      nodes.push({
        id: cursor.id,
        kind: "emit_event",
        event_name: (cursor.getFieldValue("EVENT") || "milestone_reached").slice(0, 64),
      });
    }
    cursor = cursor.getNextBlock();
  }
  return nodes;
}

function toProgram(workspace) {
  const topBlocks = workspace.getTopBlocks(true);
  const start = topBlocks.find((block) => block.type === "robotics_start");
  if (start) {
    return {
      version: 1,
      entrypoint: "main",
      nodes: parseStatementChain(start.getInputTargetBlock("DO")),
    };
  }
  const statementRoots = topBlocks.filter(
    (block) => block.type !== "robotics_sensor_condition" && Boolean(block.previousConnection) && !block.outputConnection,
  );
  const nodes = [];
  for (const root of statementRoots) {
    nodes.push(...parseStatementChain(root));
  }
  return {
    version: 1,
    entrypoint: "main",
    nodes,
  };
}

function createBlockForNode(workspace, node) {
  let blockType = null;
  if (node.kind === "move") blockType = "robotics_move";
  else if (node.kind === "turn") blockType = "robotics_turn";
  else if (node.kind === "wait") blockType = "robotics_wait";
  else if (node.kind === "read_sensor") blockType = "robotics_read_sensor";
  else if (node.kind === "set_motor") blockType = "robotics_set_motor";
  else if (node.kind === "repeat") blockType = "robotics_repeat_times";
  else if (node.kind === "if") blockType = "robotics_if_chain";
  else if (node.kind === "emit_event") blockType = "robotics_emit_event";
  if (!blockType) return null;

  const block = workspace.newBlock(blockType);
  if (node.kind === "move") {
    block.setFieldValue(String(node.direction || "forward"), "DIR");
    block.setFieldValue(String(node.value ?? 80), "VALUE");
    block.setFieldValue(String(node.unit || "distance_cm"), "UNIT");
    block.setFieldValue(String(node.speed_pct ?? 70), "SPEED");
  } else if (node.kind === "turn") {
    block.setFieldValue(String(node.direction || "right"), "DIR");
    block.setFieldValue(String(node.angle_deg ?? 90), "ANGLE");
    block.setFieldValue(String(node.speed_pct ?? 75), "SPEED");
  } else if (node.kind === "wait") {
    block.setFieldValue(String(node.seconds ?? 0.5), "SECONDS");
  } else if (node.kind === "read_sensor") {
    block.setFieldValue(String(node.sensor || "distance"), "SENSOR");
    block.setFieldValue(String(node.output_var || "sensor_value"), "OUT");
  } else if (node.kind === "set_motor") {
    block.setFieldValue(String(node.motor_id || defaultActuatorValue()), "MOTOR");
    block.setFieldValue(String(node.speed_pct ?? 60), "SPEED");
    block.setFieldValue(String(node.duration_sec ?? 0.8), "DURATION");
  } else if (node.kind === "repeat") {
    block.setFieldValue(String(node.times ?? 1), "TIMES");
    connectChain(workspace, block.getInput("DO")?.connection, node.body || []);
  } else if (node.kind === "if") {
    const { chain, elseNodes } = flattenIfNode(node);
    const targetElseIfCount = Math.max(0, chain.length - 1);
    while ((block.elseifCount_ || 0) < targetElseIfCount) {
      block.addCase_?.();
    }
    if (elseNodes.length > 0 && !block.hasElse_) {
      block.addCase_?.();
    }
    for (let i = 0; i < chain.length; i += 1) {
      const conditionBlock = workspace.newBlock("robotics_sensor_condition");
      conditionBlock.setFieldValue(String(chain[i].condition.sensor || "distance"), "SENSOR");
      conditionBlock.setFieldValue(String(chain[i].condition.op || "sensor_gt"), "OP");
      conditionBlock.setFieldValue(String(chain[i].condition.value ?? 20), "VALUE");
      conditionBlock.initSvg?.();
      conditionBlock.render?.();
      block.getInput(`IF${i}`)?.connection?.connect(conditionBlock.outputConnection);
      connectChain(workspace, block.getInput(`DO${i}`)?.connection, chain[i].body || []);
    }
    connectChain(workspace, block.getInput("ELSE")?.connection, elseNodes);
  } else if (node.kind === "emit_event") {
    block.setFieldValue(String(node.event_name || "milestone_reached"), "EVENT");
  }
  block.initSvg?.();
  block.render?.();
  return block;
}

function connectChain(workspace, inputConnection, nodes) {
  if (!inputConnection || !Array.isArray(nodes)) return;
  let prev = null;
  for (const node of nodes) {
    const block = createBlockForNode(workspace, node);
    if (!block) continue;
    if (!prev) inputConnection.connect(block.previousConnection);
    else prev.nextConnection?.connect(block.previousConnection);
    prev = block;
  }
}

function applyProgram(workspace, program) {
  workspace.clear();
  const nodes = Array.isArray(program?.nodes) ? program.nodes : [];
  let previousBlock = null;
  for (const node of nodes) {
    const block = createBlockForNode(workspace, node);
    if (!block) continue;
    if (!previousBlock) {
      block.moveBy(42, 36);
    } else {
      previousBlock.nextConnection?.connect(block.previousConnection);
    }
    previousBlock = block;
  }
  if (nodes.length > 0) {
    workspace.scrollCenter();
  }
}

export function RoboticsBlocklyEditor({ program, onProgramChange, onProgramCommit, sensorKinds, actuatorKinds }) {
  const divRef = useRef(null);
  const workspaceRef = useRef(null);
  const applyingRef = useRef(false);
  const skipExternalSyncRef = useRef(false);
  const onProgramChangeRef = useRef(onProgramChange);
  const onProgramCommitRef = useRef(onProgramCommit);
  const signatureRef = useRef("");
  const [mountError, setMountError] = useState("");

  useEffect(() => {
    roboticsSensorOptions = normalizeSensorOptions(sensorKinds);
    setSensorFieldOptions(workspaceRef.current, roboticsSensorOptions);
  }, [sensorKinds]);

  useEffect(() => {
    roboticsActuatorOptions = normalizeActuatorOptions(actuatorKinds);
    setActuatorFieldOptions(workspaceRef.current, roboticsActuatorOptions);
  }, [actuatorKinds]);

  useEffect(() => {
    onProgramChangeRef.current = onProgramChange;
    onProgramCommitRef.current = onProgramCommit;
  }, [onProgramChange, onProgramCommit]);

  useEffect(() => {
    if (!divRef.current || workspaceRef.current) return;
    registerRoboticsBlocks();
    try {
      const ws = Blockly.inject(divRef.current, {
      toolbox: {
        kind: "categoryToolbox",
        contents: [
          {
            kind: "category",
            name: "Motion",
            colour: "#3b82f6",
            contents: [
              { kind: "block", type: "robotics_move" },
              { kind: "block", type: "robotics_turn" },
            ],
          },
          {
            kind: "category",
            name: "Sensors",
            colour: "#a855f7",
            contents: [
              { kind: "block", type: "robotics_read_sensor" },
              { kind: "block", type: "robotics_sensor_condition" },
            ],
          },
          {
            kind: "category",
            name: "Control",
            colour: "#22c55e",
            contents: [
              { kind: "block", type: "robotics_wait" },
              { kind: "block", type: "robotics_repeat_times" },
              { kind: "block", type: "robotics_if_chain" },
            ],
          },
          {
            kind: "category",
            name: "Actuators",
            colour: "#f59e0b",
            contents: [{ kind: "block", type: "robotics_set_motor" }],
          },
          {
            kind: "category",
            name: "Events",
            colour: "#ec4899",
            contents: [{ kind: "block", type: "robotics_emit_event" }],
          },
        ],
      },
      renderer: "zelos",
      grid: { spacing: 24, length: 3, colour: "#233247", snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.95, maxScale: 1.8, minScale: 0.45 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
      theme: Blockly.Themes.Modern,
      toolboxPosition: "start",
      horizontalLayout: false,
    });
      workspaceRef.current = ws;
      const flyout = ws.getFlyout?.();
      if (flyout?.setAutoClose) {
        // Keep category drawer open after selecting/placing blocks.
        flyout.setAutoClose(false);
      }
      applyProgram(ws, program);
      signatureRef.current = JSON.stringify(program?.nodes || []);
      requestAnimationFrame(() => {
        if (!workspaceRef.current) return;
        Blockly.svgResize(workspaceRef.current);
        workspaceRef.current.scrollCenter();
      });

      let timeoutId = null;
      const listener = (event) => {
        if (applyingRef.current) return;
        if (event.type === Blockly.Events.UI) return;
        if (timeoutId) window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          const nextProgram = toProgram(ws);
          const nextSig = JSON.stringify(nextProgram.nodes || []);
          if (nextSig === signatureRef.current) return;
          signatureRef.current = nextSig;
          // Local edits should not trigger a full re-apply in the [program] effect,
          // otherwise Blockly flyouts/toolbox state can close unexpectedly.
          skipExternalSyncRef.current = true;
          onProgramChangeRef.current?.(nextProgram);
          onProgramCommitRef.current?.(nextProgram);
        }, 120);
      };
      ws.addChangeListener(listener);

      return () => {
        if (timeoutId) window.clearTimeout(timeoutId);
        ws.removeChangeListener(listener);
        ws.dispose();
        workspaceRef.current = null;
      };
    } catch (error) {
      setMountError(error instanceof Error ? error.message : "Unknown Blockly mount error");
      return undefined;
    }
  }, []);

  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    const nextSig = JSON.stringify(program?.nodes || []);
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      signatureRef.current = nextSig;
      return;
    }
    if (nextSig === signatureRef.current) return;
    applyingRef.current = true;
    applyProgram(ws, program);
    signatureRef.current = nextSig;
    applyingRef.current = false;
    requestAnimationFrame(() => {
      if (!workspaceRef.current) return;
      Blockly.svgResize(workspaceRef.current);
    });
  }, [program]);

  useEffect(() => {
    const onResize = () => {
      if (!workspaceRef.current) return;
      Blockly.svgResize(workspaceRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const host = divRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!workspaceRef.current) return;
      Blockly.svgResize(workspaceRef.current);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="robotics-blockly-shell">
      <div className="robotics-blockly-stage" ref={divRef} />
      {mountError ? <div className="robotics-blockly-error">Blockly failed to render: {mountError}</div> : null}
    </div>
  );
}
