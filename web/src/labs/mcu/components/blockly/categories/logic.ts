// Logic category blocks for Blockly toolbox
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

let logicBlocksRegistered = false;

export function registerLogicBlocks() {
  if (logicBlocksRegistered) return;
  logicBlocksRegistered = true;

  // Replace inline if/if-else with shared growable if-chain

  // Comparison operator block: [input] [operator] [input]
  Blockly.Blocks["mp_compare"] = {
    init: function init() {
      this.appendValueInput("A").setCheck("Number");
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown([
          [">", ">"],
          ["<", "<"],
          ["=", "=="],
          ["≠", "!="],
          ["≥", ">="],
          ["≤", "<="],
        ]),
        "OP"
      );
      this.appendValueInput("B").setCheck("Number");
      this.setInputsInline(true);
      this.setOutput(true, "Boolean");
      this.setColour(210);
      this.setTooltip("Compare two numbers");
    },
  };

  pythonGenerator.forBlock["mp_compare"] = function (block: any) {
    const operator = block.getFieldValue("OP");
    const valueA =
      pythonGenerator.valueToCode(
        block,
        "A",
        (pythonGenerator as any).ORDER_RELATIONAL || 0
      ) || "0";
    const valueB =
      pythonGenerator.valueToCode(
        block,
        "B",
        (pythonGenerator as any).ORDER_RELATIONAL || 0
      ) || "0";
    const code = `(${valueA} ${operator} ${valueB})`;
    return [code, (pythonGenerator as any).ORDER_RELATIONAL || 0];
  };
}

export function getLogicCategory() {
  return {
    kind: "category",
    id: "cat_logic",
    name: "Logic",
    expanded: false,
    contents: [
      {
        kind: "block",
        type: "mp_if_chain",
      },
      {
        kind: "block",
        type: "mp_if_else_chain",
      },
      {
        kind: "block",
        type: "mp_compare",
        inputs: {
          A: { shadow: { type: "math_number", fields: { NUM: 5 } } },
          B: { shadow: { type: "math_number", fields: { NUM: 10 } } },
        },
      },
      { kind: "block", type: "logic_boolean" },
      { kind: "block", type: "logic_null" },
      {
        kind: "block",
        type: "logic_negate",
        inputs: {
          BOOL: { shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
        },
      },
      {
        kind: "block",
        type: "logic_operation",
        fields: { OP: "AND" },
        inputs: {
          A: { shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
          B: { shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
        },
      },
      {
        kind: "block",
        type: "logic_operation",
        fields: { OP: "OR" },
        inputs: {
          A: { shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
          B: { shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } } },
        },
      },
    ],
  };
}
