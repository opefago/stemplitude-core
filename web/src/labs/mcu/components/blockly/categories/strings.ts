// Strings category blocks for Blockly toolbox
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

let stringsBlocksRegistered = false;

export function registerStringsBlocks() {
  if (stringsBlocksRegistered) return;
  stringsBlocksRegistered = true;

  // String constant/input block
  Blockly.Blocks["mp_string"] = {
    init: function init() {
      this.appendDummyInput().appendField(
        new Blockly.FieldTextInput("text"),
        "TEXT"
      );
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip("A text string");
    },
  };

  pythonGenerator.forBlock["mp_string"] = function (block: any) {
    const text = block.getFieldValue("TEXT");
    const code = `"${text.replace(/"/g, '\\"')}"`;
    return [code, (pythonGenerator as any).ORDER_ATOMIC || 0];
  };

  // Concatenate (cat/join) strings
  Blockly.Blocks["mp_string_concat"] = {
    init: function init() {
      this.appendValueInput("A").setCheck("String").appendField("concat");
      this.appendDummyInput().appendField(" ");
      this.appendValueInput("B").setCheck("String");
      this.setInputsInline(true);
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip("Concatenate two strings together");
    },
  };

  pythonGenerator.forBlock["mp_string_concat"] = function (block: any) {
    const a =
      pythonGenerator.valueToCode(
        block,
        "A",
        (pythonGenerator as any).ORDER_ADDITIVE || 0
      ) || '""';
    const b =
      pythonGenerator.valueToCode(
        block,
        "B",
        (pythonGenerator as any).ORDER_ADDITIVE || 0
      ) || '""';
    const code = `(${a} + ${b})`;
    return [code, (pythonGenerator as any).ORDER_ADDITIVE || 0];
  };

  // Join strings with separator
  Blockly.Blocks["mp_string_join"] = {
    init: function init() {
      this.appendValueInput("SEPARATOR").setCheck("String").appendField("join");
      this.appendDummyInput().appendField(" with ");
      this.appendValueInput("TEXT").setCheck("String");
      this.setInputsInline(true);
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip(
        "Join strings with a separator (for lists, use comma-separated values)"
      );
    },
  };

  pythonGenerator.forBlock["mp_string_join"] = function (block: any) {
    const separator =
      pythonGenerator.valueToCode(
        block,
        "SEPARATOR",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${separator}.join(str(${text}).split(','))`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Strip (trim whitespace)
  Blockly.Blocks["mp_string_strip"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String").appendField("strip");
      this.setInputsInline(true);
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip("Remove leading and trailing whitespace");
    },
  };

  pythonGenerator.forBlock["mp_string_strip"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.strip()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Length
  Blockly.Blocks["mp_string_length"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String").appendField("length of");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(160);
      this.setTooltip("Get the length of a string");
    },
  };

  pythonGenerator.forBlock["mp_string_length"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `len(${text})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // toUpperCase
  Blockly.Blocks["mp_string_upper"] = {
    init: function init() {
      this.appendValueInput("TEXT")
        .setCheck("String")
        .appendField("toUpperCase");
      this.setInputsInline(true);
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip("Convert string to uppercase");
    },
  };

  pythonGenerator.forBlock["mp_string_upper"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.upper()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // toLowerCase
  Blockly.Blocks["mp_string_lower"] = {
    init: function init() {
      this.appendValueInput("TEXT")
        .setCheck("String")
        .appendField("toLowerCase");
      this.setInputsInline(true);
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip("Convert string to lowercase");
    },
  };

  pythonGenerator.forBlock["mp_string_lower"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.lower()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Contains (check if substring exists)
  Blockly.Blocks["mp_string_contains"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String");
      this.appendDummyInput().appendField(" contains ");
      this.appendValueInput("SEARCH").setCheck("String");
      this.setInputsInline(true);
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Check if string contains a substring");
    },
  };

  pythonGenerator.forBlock["mp_string_contains"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const search =
      pythonGenerator.valueToCode(
        block,
        "SEARCH",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `(${search} in ${text})`;
    return [code, (pythonGenerator as any).ORDER_RELATIONAL || 0];
  };

  // Find (index of substring)
  Blockly.Blocks["mp_string_find"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String").appendField("find");
      this.appendDummyInput().appendField(" in ");
      this.appendValueInput("SEARCH").setCheck("String");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(160);
      this.setTooltip("Find the position of substring in string");
    },
  };

  pythonGenerator.forBlock["mp_string_find"] = function (block: any) {
    const search =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const text =
      pythonGenerator.valueToCode(
        block,
        "SEARCH",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.find(${search})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // startsWith
  Blockly.Blocks["mp_string_startswith"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String");
      this.appendDummyInput().appendField(" starts with ");
      this.appendValueInput("PREFIX").setCheck("String");
      this.setInputsInline(true);
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Check if string starts with prefix");
    },
  };

  pythonGenerator.forBlock["mp_string_startswith"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const prefix =
      pythonGenerator.valueToCode(
        block,
        "PREFIX",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.startswith(${prefix})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // endsWith
  Blockly.Blocks["mp_string_endswith"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String");
      this.appendDummyInput().appendField(" ends with ");
      this.appendValueInput("SUFFIX").setCheck("String");
      this.setInputsInline(true);
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Check if string ends with suffix");
    },
  };

  pythonGenerator.forBlock["mp_string_endswith"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const suffix =
      pythonGenerator.valueToCode(
        block,
        "SUFFIX",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.endswith(${suffix})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // isDigit
  Blockly.Blocks["mp_string_isdigit"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String");
      this.appendDummyInput().appendField(" is digit");
      this.setInputsInline(true);
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Check if string contains only digits");
    },
  };

  pythonGenerator.forBlock["mp_string_isdigit"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.isdigit()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // isAlpha
  Blockly.Blocks["mp_string_isalpha"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String");
      this.appendDummyInput().appendField(" is alpha");
      this.setInputsInline(true);
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Check if string contains only letters");
    },
  };

  pythonGenerator.forBlock["mp_string_isalpha"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.isalpha()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // isSpace
  Blockly.Blocks["mp_string_isspace"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String");
      this.appendDummyInput().appendField(" is space");
      this.setInputsInline(true);
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Check if string contains only whitespace");
    },
  };

  pythonGenerator.forBlock["mp_string_isspace"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.isspace()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // isAlnum
  Blockly.Blocks["mp_string_isalnum"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck("String");
      this.appendDummyInput().appendField(" is alphanumeric");
      this.setInputsInline(true);
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Check if string contains only letters and numbers");
    },
  };

  pythonGenerator.forBlock["mp_string_isalnum"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}.isalnum()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // toString - convert number to string
  Blockly.Blocks["mp_to_string"] = {
    init: function init() {
      this.appendValueInput("VALUE")
        .setCheck("Number")
        .appendField("To String");
      this.setInputsInline(true);
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip("Convert a number to a string");
    },
  };

  pythonGenerator.forBlock["mp_to_string"] = function (block: any) {
    const value =
      pythonGenerator.valueToCode(
        block,
        "VALUE",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const code = `str(${value})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Text index read: get character at index
  Blockly.Blocks["mp_string_char_at"] = {
    init: function init() {
      this.appendValueInput("INDEX").setCheck("Number").appendField("letter");
      this.appendDummyInput().appendField("of");
      this.appendValueInput("TEXT").setCheck("String");
      this.setInputsInline(true);
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip("Get character at index position (0-based)");
    },
  };

  pythonGenerator.forBlock["mp_string_char_at"] = function (block: any) {
    const index =
      pythonGenerator.valueToCode(
        block,
        "INDEX",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    const code = `${text}[int(${index})]`;
    return [code, (pythonGenerator as any).ORDER_MEMBER || 0];
  };
}

export function getStringsCategory() {
  return {
    kind: "category",
    id: "cat_strings",
    name: "Text",
    expanded: false,
    contents: [
      { kind: "label", text: "Basic" },
      { kind: "block", type: "mp_string" },
      {
        kind: "block",
        type: "mp_string_concat",
        inputs: {
          A: { shadow: { type: "mp_string", fields: { TEXT: "hello" } } },
          B: { shadow: { type: "mp_string", fields: { TEXT: "world" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_join",
        inputs: {
          SEPARATOR: { shadow: { type: "mp_string", fields: { TEXT: ", " } } },
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "a,b,c" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_length",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "hello" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_char_at",
        inputs: {
          INDEX: { shadow: { type: "math_number", fields: { NUM: 1 } } },
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "hello" } } },
        },
      },
      { kind: "label", text: "Case & Trim" },
      {
        kind: "block",
        type: "mp_string_upper",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "hello" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_lower",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "HELLO" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_strip",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "  text  " } } },
        },
      },
      { kind: "label", text: "Search" },
      {
        kind: "block",
        type: "mp_string_contains",
        inputs: {
          TEXT: {
            shadow: { type: "mp_string", fields: { TEXT: "hello world" } },
          },
          SEARCH: { shadow: { type: "mp_string", fields: { TEXT: "world" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_find",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "o" } } },
          SEARCH: { shadow: { type: "mp_string", fields: { TEXT: "hello" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_startswith",
        inputs: {
          TEXT: {
            shadow: { type: "mp_string", fields: { TEXT: "hello world" } },
          },
          PREFIX: { shadow: { type: "mp_string", fields: { TEXT: "hello" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_endswith",
        inputs: {
          TEXT: {
            shadow: { type: "mp_string", fields: { TEXT: "hello world" } },
          },
          SUFFIX: { shadow: { type: "mp_string", fields: { TEXT: "world" } } },
        },
      },
      { kind: "label", text: "Type Checking" },
      {
        kind: "block",
        type: "mp_string_isdigit",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "123" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_isalpha",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "abc" } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_isspace",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "   " } } },
        },
      },
      {
        kind: "block",
        type: "mp_string_isalnum",
        inputs: {
          TEXT: { shadow: { type: "mp_string", fields: { TEXT: "abc123" } } },
        },
      },
      { kind: "label", text: "Conversion" },
      {
        kind: "block",
        type: "mp_to_string",
        inputs: {
          VALUE: { shadow: { type: "math_number", fields: { NUM: 42 } } },
        },
      },
    ],
  };
}
