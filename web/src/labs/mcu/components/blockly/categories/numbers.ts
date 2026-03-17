// Numbers category blocks for Blockly toolbox
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

let numbersBlocksRegistered = false;

export function registerNumbersBlocks() {
  if (numbersBlocksRegistered) return;
  numbersBlocksRegistered = true;

  // Override math_arithmetic to remove the numbers.Number import (not available in MicroPython)
  pythonGenerator.forBlock["math_arithmetic"] = function (block: any) {
    const OPERATORS: Record<string, [string, number]> = {
      ADD: [" + ", (pythonGenerator as any).ORDER_ADDITIVE],
      MINUS: [" - ", (pythonGenerator as any).ORDER_ADDITIVE],
      MULTIPLY: [" * ", (pythonGenerator as any).ORDER_MULTIPLICATIVE],
      DIVIDE: [" / ", (pythonGenerator as any).ORDER_MULTIPLICATIVE],
      POWER: [" ** ", (pythonGenerator as any).ORDER_EXPONENTIATION],
    };
    const tuple = OPERATORS[block.getFieldValue("OP")];
    const operator = tuple[0];
    const order = tuple[1];
    const argument0 = pythonGenerator.valueToCode(block, "A", order) || "0";
    const argument1 = pythonGenerator.valueToCode(block, "B", order) || "0";
    const code = argument0 + operator + argument1;
    return [code, order];
  };

  // Random number generator: random from [min] to [max]
  Blockly.Blocks["mp_random"] = {
    init: function init() {
      this.appendValueInput("FROM")
        .setCheck("Number")
        .appendField("random from");
      this.appendDummyInput().appendField("to");
      this.appendValueInput("TO").setCheck("Number");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(290);
      this.setTooltip("Generate a random number between two values");
    },
  };

  pythonGenerator.forBlock["mp_random"] = function (block: any) {
    const fromValue =
      pythonGenerator.valueToCode(
        block,
        "FROM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "1";
    const toValue =
      pythonGenerator.valueToCode(
        block,
        "TO",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "10";

    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_random"] = "import random";

    const code = `random.randint(${fromValue}, ${toValue})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // toNumber - convert string to number
  Blockly.Blocks["mp_to_number"] = {
    init: function init() {
      this.appendValueInput("VALUE")
        .setCheck("String")
        .appendField("To Number");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(290);
      this.setTooltip("Convert a string to a number");
    },
  };

  pythonGenerator.forBlock["mp_to_number"] = function (block: any) {
    const value =
      pythonGenerator.valueToCode(
        block,
        "VALUE",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `float(${value})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Increment block: value + 1
  Blockly.Blocks["mp_increment"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number");
      this.appendDummyInput().appendField("++");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(290);
      this.setTooltip("Increment a value by 1");
    },
  };

  pythonGenerator.forBlock["mp_increment"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_ADDITIVE || 0
      ) || "0";
    const code = `(${num} + 1)`;
    return [code, (pythonGenerator as any).ORDER_ADDITIVE || 0];
  };

  // Decrement block: value - 1
  Blockly.Blocks["mp_decrement"] = {
    init: function init() {
      this.appendValueInput("NUM").setCheck("Number");
      this.appendDummyInput().appendField("--");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(290);
      this.setTooltip("Decrement a value by 1");
    },
  };

  pythonGenerator.forBlock["mp_decrement"] = function (block: any) {
    const num =
      pythonGenerator.valueToCode(
        block,
        "NUM",
        (pythonGenerator as any).ORDER_ADDITIVE || 0
      ) || "0";
    const code = `(${num} - 1)`;
    return [code, (pythonGenerator as any).ORDER_ADDITIVE || 0];
  };
}

export function getNumbersCategory() {
  return {
    kind: "category",
    id: "cat_numbers",
    name: "Numbers",
    expanded: false,
    contents: [
      { kind: "block", type: "math_number" },
      { kind: "block", type: "math_arithmetic" },
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
    ],
  };
}
