// Math category blocks for Blockly toolbox
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

let mathBlocksRegistered = false;

export function registerMathBlocks() {
  if (mathBlocksRegistered) return;
  mathBlocksRegistered = true;

  // Round block
  Blockly.Blocks["mp_round"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("round");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Round a number to the nearest integer");
    },
  };

  pythonGenerator.forBlock["mp_round"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const code = `round(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Floor block
  Blockly.Blocks["mp_floor"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("floor");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Round down to the nearest integer");
    },
  };

  pythonGenerator.forBlock["mp_floor"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    const code = `math.floor(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Ceil block
  Blockly.Blocks["mp_ceil"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("ceil");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Round up to the nearest integer");
    },
  };

  pythonGenerator.forBlock["mp_ceil"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    const code = `math.ceil(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Abs block
  Blockly.Blocks["mp_abs"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("abs");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Absolute value");
    },
  };

  pythonGenerator.forBlock["mp_abs"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const code = `abs(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Mod block
  Blockly.Blocks["mp_mod"] = {
    init: function init() {
      this.appendValueInput("A").setCheck("Number");
      this.appendDummyInput().appendField(" mod ");
      this.appendValueInput("B").setCheck("Number");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Modulo operation (remainder)");
    },
  };

  pythonGenerator.forBlock["mp_mod"] = function (block: any) {
    const a =
      pythonGenerator.valueToCode(
        block,
        "A",
        (pythonGenerator as any).ORDER_MULTIPLICATIVE || 0
      ) || "0";
    const b =
      pythonGenerator.valueToCode(
        block,
        "B",
        (pythonGenerator as any).ORDER_MULTIPLICATIVE || 0
      ) || "1";
    const code = `(${a} % ${b})`;
    return [code, (pythonGenerator as any).ORDER_MULTIPLICATIVE || 0];
  };

  // Sin block
  Blockly.Blocks["mp_sin"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("sin");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Sine (radians)");
    },
  };

  pythonGenerator.forBlock["mp_sin"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    const code = `math.sin(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Cos block
  Blockly.Blocks["mp_cos"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("cos");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Cosine (radians)");
    },
  };

  pythonGenerator.forBlock["mp_cos"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    const code = `math.cos(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Tan block
  Blockly.Blocks["mp_tan"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("tan");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Tangent (radians)");
    },
  };

  pythonGenerator.forBlock["mp_tan"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    const code = `math.tan(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Min block
  Blockly.Blocks["mp_min"] = {
    init: function init() {
      this.appendValueInput("A").setCheck("Number").appendField("min");
      this.appendDummyInput().appendField(" ");
      this.appendValueInput("B").setCheck("Number");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Minimum of two numbers");
    },
  };

  pythonGenerator.forBlock["mp_min"] = function (block: any) {
    const a =
      pythonGenerator.valueToCode(
        block,
        "A",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const b =
      pythonGenerator.valueToCode(
        block,
        "B",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const code = `min(${a}, ${b})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Max block
  Blockly.Blocks["mp_max"] = {
    init: function init() {
      this.appendValueInput("A").setCheck("Number").appendField("max");
      this.appendDummyInput().appendField(" ");
      this.appendValueInput("B").setCheck("Number");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Maximum of two numbers");
    },
  };

  pythonGenerator.forBlock["mp_max"] = function (block: any) {
    const a =
      pythonGenerator.valueToCode(
        block,
        "A",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const b =
      pythonGenerator.valueToCode(
        block,
        "B",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const code = `max(${a}, ${b})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Degrees block (radians to degrees)
  Blockly.Blocks["mp_degrees"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("degrees");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Convert radians to degrees");
    },
  };

  pythonGenerator.forBlock["mp_degrees"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    const code = `math.degrees(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Radians block (degrees to radians)
  Blockly.Blocks["mp_radians"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number").appendField("radians");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Convert degrees to radians");
    },
  };

  pythonGenerator.forBlock["mp_radians"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    const code = `math.radians(${num})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // PI constant
  Blockly.Blocks["mp_pi"] = {
    init: function init() {
      this.appendDummyInput().appendField("π");
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Pi constant (3.14159...)");
    },
  };

  pythonGenerator.forBlock["mp_pi"] = function (block: any) {
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    return ["math.pi", (pythonGenerator as any).ORDER_ATOMIC || 0];
  };

  // Euler's number constant
  Blockly.Blocks["mp_e"] = {
    init: function init() {
      this.appendDummyInput().appendField("e");
      this.setOutput(true, "Number");
      this.setColour(230);
      this.setTooltip("Euler's number (2.71828...)");
    },
  };

  pythonGenerator.forBlock["mp_e"] = function (block: any) {
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_math"] = "import math";
    return ["math.e", (pythonGenerator as any).ORDER_ATOMIC || 0];
  };
}

export function getMathCategory() {
  return {
    kind: "category",
    id: "cat_math",
    name: "Math",
    expanded: false,
    contents: [
      { kind: "label", text: "Numbers" },
      { kind: "block", type: "math_number" },
      {
        kind: "block",
        type: "math_arithmetic",
        inputs: {
          A: { shadow: { type: "math_number", fields: { NUM: 1 } } },
          B: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        },
      },
      {
        kind: "block",
        type: "mp_increment",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        },
      },
      {
        kind: "block",
        type: "mp_decrement",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        },
      },
      {
        kind: "block",
        type: "mp_random",
        inputs: {
          FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
          TO: { shadow: { type: "math_number", fields: { NUM: 10 } } },
        },
      },
      {
        kind: "block",
        type: "mp_to_number",
        inputs: {
          VALUE: { shadow: { type: "mp_string", fields: { TEXT: "123" } } },
        },
      },

      { kind: "label", text: "Min/Max" },
      {
        kind: "block",
        type: "mp_min",
        inputs: {
          A: { shadow: { type: "math_number", fields: { NUM: 5 } } },
          B: { shadow: { type: "math_number", fields: { NUM: 10 } } },
        },
      },
      {
        kind: "block",
        type: "mp_max",
        inputs: {
          A: { shadow: { type: "math_number", fields: { NUM: 5 } } },
          B: { shadow: { type: "math_number", fields: { NUM: 10 } } },
        },
      },
      { kind: "label", text: "Constants" },
      { kind: "block", type: "mp_pi" },
      { kind: "block", type: "mp_e" },

      { kind: "label", text: "Trigonometry" },
      {
        kind: "block",
        type: "mp_sin",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 0 } } },
        },
      },
      {
        kind: "block",
        type: "mp_cos",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 0 } } },
        },
      },
      {
        kind: "block",
        type: "mp_tan",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 0 } } },
        },
      },

      { kind: "label", text: "Rounding" },
      {
        kind: "block",
        type: "mp_round",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 3.7 } } },
        },
      },
      {
        kind: "block",
        type: "mp_floor",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 3.7 } } },
        },
      },
      {
        kind: "block",
        type: "mp_ceil",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 3.2 } } },
        },
      },
      {
        kind: "block",
        type: "mp_abs",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: -5 } } },
        },
      },
      {
        kind: "block",
        type: "mp_mod",
        inputs: {
          A: { shadow: { type: "math_number", fields: { NUM: 10 } } },
          B: { shadow: { type: "math_number", fields: { NUM: 3 } } },
        },
      },
      { kind: "label", text: "Conversion" },
      {
        kind: "block",
        type: "mp_degrees",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 3.14 } } },
        },
      },
      {
        kind: "block",
        type: "mp_radians",
        inputs: {
          NUM: { shadow: { type: "math_number", fields: { NUM: 180 } } },
        },
      },
    ],
  };
}
