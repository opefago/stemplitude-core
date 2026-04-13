// Control category blocks for Blockly toolbox
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";
import { registerGrowableIfElseChainBlocks } from "../../../../../lib/blockly/growableIfElseChain";

let controlBlocksRegistered = false;

export function registerControlBlocks() {
  if (controlBlocksRegistered) return;
  controlBlocksRegistered = true;

  // mp_wait_seconds: Wait/delay in seconds (Scratch-style)
  Blockly.Blocks["mp_wait_seconds"] = {
    init: function init() {
      this.appendValueInput("SECONDS").setCheck("Number").appendField("wait");
      this.appendDummyInput().appendField("seconds");
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip("Wait for a number of seconds");
    },
  };

  pythonGenerator.forBlock["mp_wait_seconds"] = function (
    block: Blockly.Block
  ) {
    const seconds =
      pythonGenerator.valueToCode(
        block,
        "SECONDS",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "1";
    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_time"] = "import time";
    return `time.sleep(${seconds})\n`;
  };

  // mp_wait_ms: Wait/delay in milliseconds
  Blockly.Blocks["mp_wait_ms"] = {
    init: function init() {
      this.appendValueInput("MS").setCheck("Number").appendField("wait");
      this.appendDummyInput().appendField("milliseconds");
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip("Wait for a number of milliseconds");
    },
  };

  pythonGenerator.forBlock["mp_wait_ms"] = function (block: Blockly.Block) {
    const ms =
      pythonGenerator.valueToCode(
        block,
        "MS",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "1000";
    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_time"] = "import time";
    return `time.sleep_ms(${ms})\n`;
  };

  // mp_forever_loop: Infinite loop (Scratch-style hat block)
  Blockly.Blocks["mp_forever_loop"] = {
    init: function init() {
      this.appendDummyInput().appendField("forever                    ");
      this.appendStatementInput("DO").setCheck(null); // C-shaped valley inside
      // Hat block - square top like micro:bit, no connections on top or bottom
      // The C-shaped valley (statement input) is where blocks go
      this.setPreviousStatement(false); // No top notch
      this.setNextStatement(false); // No bottom notch
      this.setColour(20);
      this.setTooltip(
        "Run the blocks inside over and over forever. This block starts a new script that runs continuously in the background."
      );
      this.setHelpUrl("");
    },
  };

  pythonGenerator.forBlock["mp_forever_loop"] = function (block: any) {
    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }
    return `while True:\n${statements}`;
  };

  // mp_while: While loop with condition
  Blockly.Blocks["mp_while"] = {
    init: function init() {
      this.appendValueInput("CONDITION")
        .setCheck("Boolean")
        .appendField("while");
      this.appendDummyInput().appendField("do");
      this.appendStatementInput("DO").setCheck(null);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip("Repeat while condition is true");
    },
  };

  pythonGenerator.forBlock["mp_while"] = function (block: any) {
    const condition =
      pythonGenerator.valueToCode(
        block,
        "CONDITION",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "False";
    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }
    return `while ${condition}:\n${statements}`;
  };

  // Override controls_repeat_ext to use inline format like wait block
  Blockly.Blocks["mp_repeat"] = {
    init: function init() {
      this.appendValueInput("TIMES").setCheck("Number").appendField("repeat");
      this.appendDummyInput().appendField("times");
      this.appendStatementInput("DO").setCheck(null);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip("Repeat a number of times");
    },
  };

  pythonGenerator.forBlock["mp_repeat"] = function (block: Blockly.Block) {
    const times =
      pythonGenerator.valueToCode(
        block,
        "TIMES",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "10";
    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }
    return `for _i in range(int(${times})):\n${statements}`;
  };

  // mp_wait_until: Wait until a condition is true
  Blockly.Blocks["mp_wait_until"] = {
    init: function init() {
      this.appendValueInput("CONDITION")
        .setCheck("Boolean")
        .appendField("wait until");
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip("Wait until a condition becomes true");
    },
  };

  pythonGenerator.forBlock["mp_wait_until"] = function (block: Blockly.Block) {
    const condition =
      pythonGenerator.valueToCode(
        block,
        "CONDITION",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "False";
    return `while not (${condition}):\n    pass\n`;
  };

  // mp_repeat_until: Repeat until a condition is true
  Blockly.Blocks["mp_repeat_until"] = {
    init: function init() {
      this.appendValueInput("CONDITION")
        .setCheck("Boolean")
        .appendField("repeat until");
      this.appendStatementInput("DO").setCheck(null);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip("Repeat until a condition becomes true");
    },
  };

  pythonGenerator.forBlock["mp_repeat_until"] = function (
    block: Blockly.Block
  ) {
    const condition =
      pythonGenerator.valueToCode(
        block,
        "CONDITION",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "False";
    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }
    return `while not (${condition}):\n${statements}`;
  };

  // mp_break: Break out of a loop
  Blockly.Blocks["mp_break"] = {
    init: function init() {
      this.appendDummyInput().appendField("break");
      this.setPreviousStatement(true, null);
      this.setNextStatement(false, null);
      this.setColour(230);
      this.setTooltip("Exit the current loop immediately");
    },
  };

  pythonGenerator.forBlock["mp_break"] = function (block: Blockly.Block) {
    return "break\n";
  };

  // mp_continue: Continue to the next iteration of a loop
  Blockly.Blocks["mp_continue"] = {
    init: function init() {
      this.appendDummyInput().appendField("continue");
      this.setPreviousStatement(true, null);
      this.setNextStatement(false, null);
      this.setColour(230);
      this.setTooltip("Skip to the next iteration of the loop");
    },
  };

  pythonGenerator.forBlock["mp_continue"] = function (block: Blockly.Block) {
    return "continue\n";
  };

  registerGrowableIfElseChainBlocks({
    Blockly,
    pythonGenerator,
    baseType: "mp_if_chain",
    elseType: "mp_if_else_chain",
    color: 230,
    tooltip:
      "Growable if/else with a + button that adds else if and keeps a trailing else",
    orderNone: (pythonGenerator as any).ORDER_NONE || 0,
  });
}

export function getControlCategory() {
  return {
    kind: "category",
    id: "cat_control",
    name: "Control",
    expanded: true,
    contents: [
      {
        kind: "block",
        type: "mp_event_program_start",
      },
      {
        kind: "block",
        type: "mp_repeat",
        inputs: {
          TIMES: { shadow: { type: "math_number", fields: { NUM: 10 } } },
        },
      },
      {
        kind: "block",
        type: "mp_while",
        inputs: {
          CONDITION: {
            shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } },
          },
        },
      },
      { kind: "block", type: "mp_forever_loop" },
      {
        kind: "block",
        type: "mp_wait_seconds",
        inputs: {
          SECONDS: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        },
      },
      {
        kind: "block",
        type: "mp_wait_ms",
        inputs: {
          MS: { shadow: { type: "math_number", fields: { NUM: 1000 } } },
        },
      },
      {
        kind: "block",
        type: "mp_repeat_until",
        inputs: {
          CONDITION: {
            shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } },
          },
        },
      },
      {
        kind: "block",
        type: "mp_wait_until",
        inputs: {
          CONDITION: {
            shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } },
          },
        },
      },
      {
        kind: "block",
        type: "mp_break",
      },
      {
        kind: "block",
        type: "mp_continue",
      },
    ],
  };
}
