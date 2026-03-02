// Arrays (Python lists) category
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

let arraysBlocksRegistered = false;

export function registerArraysBlocks() {
  if (arraysBlocksRegistered) return;
  arraysBlocksRegistered = true;

  function ensureFindIndexDef() {
    const defs =
      (pythonGenerator as any).definitions_ ||
      ((pythonGenerator as any).definitions_ = {});
    if (!defs["def_find_index"]) {
      defs["def_find_index"] = [
        "def __find_index(arr, item):",
        "    try:",
        "        return arr.index(item)",
        "    except ValueError:",
        "        return -1",
      ].join("\n");
    }
  }

  // Helper to map FieldVariable to a sanitized Python variable name
  function getVarName(block: any, fieldName: string = "VAR"): string {
    const fld = block.getField(fieldName) as any;
    const variable = fld && fld.getVariable ? fld.getVariable() : null;
    const id = variable ? variable.getId() : block.getFieldValue(fieldName);
    const nameDB = (pythonGenerator as any).nameDB_;
    if (nameDB && id) {
      return nameDB.getName(id, (Blockly as any).VARIABLE_CATEGORY_NAME);
    }
    return (
      (variable && variable.name) || block.getFieldValue(fieldName) || "list"
    );
  }

  // Utility: replace one statement block with another, preserving prev/next links and position
  function replaceStatementBlock(
    oldBlock: any,
    newType: string,
    initFn?: (b: any) => void
  ) {
    const ws = oldBlock.workspace as Blockly.WorkspaceSvg;
    const xy = (oldBlock as any).getRelativeToSurfaceXY();
    const prevTarget = oldBlock.previousConnection?.targetConnection || null;
    const nextTarget = oldBlock.nextConnection?.targetConnection || null;

    const nb = ws.newBlock(newType) as any;
    if (initFn) initFn(nb);
    nb.initSvg();
    nb.render();
    nb.moveBy(xy.x, xy.y);

    if (prevTarget && nb.previousConnection) {
      prevTarget.connect(nb.previousConnection);
    }
    if (nextTarget && nb.nextConnection) {
      nb.nextConnection && nb.nextConnection.connect(nextTarget);
    }

    oldBlock.dispose(false);
    return nb;
  }

  Blockly.Blocks["mp_array_create"] = {
    count_: 3 as number,
    init: function () {
      this.count_ = 3;
      this.appendDummyInput("HDR")
        .appendField("set")
        .appendField(
          new (Blockly as any).FieldVariable("list", undefined, [""], ""),
          "VAR"
        )
        .appendField("to array of");
      for (let i = 0; i < this.count_; i++) {
        this.appendValueInput("V" + i).setCheck(null);
      }
      this.appendDummyInput("PLUS_ROW");
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
      this.setTooltip("Create an array and assign it to a variable");
      (this as any).updateShape_();
    },
    mutationToDom: function () {
      const m = document.createElement("mutation");
      m.setAttribute("count", String((this as any).count_));
      return m;
    },
    domToMutation: function (xml: Element) {
      (this as any).count_ = parseInt(xml.getAttribute("count") || "3", 10);
      let i = 0;
      while (this.getInput("V" + i)) {
        this.removeInput("V" + i);
        i++;
      }
      for (let n = 0; n < (this as any).count_; n++) {
        this.appendValueInput("V" + n).setCheck(null);
      }
      (this as any).updateShape_();
    },
    updateShape_: function () {
      const plusSvg =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
            '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
            '<rect x="11" y="7" width="2" height="10" fill="#ffffff" rx="1" />' +
            '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
            "</svg>"
        );
      const minusSvg =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
            '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
            '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
            "</svg>"
        );
      const row =
        this.getInput("PLUS_ROW") || this.appendDummyInput("PLUS_ROW");
      try {
        (row as any).removeField("MINUS");
      } catch {}
      try {
        (row as any).removeField("PLUS");
      } catch {}
      const minus = new (Blockly as any).FieldImage(minusSvg, 18, 18, "-");
      const plus = new (Blockly as any).FieldImage(plusSvg, 18, 18, "+");
      if ((minus as any).setOnClickHandler) {
        (minus as any).setOnClickHandler(() => {
          if ((this as any).count_ > 0) {
            const idx = (this as any).count_ - 1;
            this.removeInput("V" + idx);
            (this as any).count_--;
            if ((this as any).count_ === 0) {
              // Convert to empty list block
              replaceStatementBlock(this, "mp_array_empty", (nb: any) => {
                nb.setFieldValue((this as any).getFieldValue("VAR"), "VAR");
              });
            } else {
              (this as any).updateShape_();
            }
          }
        });
      }
      if ((plus as any).setOnClickHandler) {
        (plus as any).setOnClickHandler(() => {
          this.appendValueInput("V" + (this as any).count_).setCheck(null);
          (this as any).count_++;
          (this as any).updateShape_();
        });
      }
      row.setAlign((Blockly as any).ALIGN_RIGHT);
      row.appendField(minus, "MINUS");
      row.appendField(plus, "PLUS");
    },
  } as any;

  pythonGenerator.forBlock["mp_array_create"] = function (block: any) {
    const varName = getVarName(block, "VAR");
    const count = (block as any).count_ || 0;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const v =
        pythonGenerator.valueToCode(
          block,
          "V" + i,
          (pythonGenerator as any).ORDER_NONE || 0
        ) || "0";
      parts.push(v);
    }
    return `${varName} = [${parts.join(", ")}]\n`;
  };

  // set <var> to empty list, with a + that upgrades to mp_array_create
  Blockly.Blocks["mp_array_empty"] = {
    init: function () {
      this.appendDummyInput("HDR")
        .appendField("set")
        .appendField(
          new (Blockly as any).FieldVariable("list", undefined, [""], ""),
          "VAR"
        )
        .appendField("to empty list");
      const plusSvg =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
            '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
            '<rect x="11" y="7" width="2" height="10" fill="#ffffff" rx="1" />' +
            '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
            "</svg>"
        );
      const plus = new (Blockly as any).FieldImage(plusSvg, 18, 18, "+");
      if ((plus as any).setOnClickHandler) {
        (plus as any).setOnClickHandler(() => {
          // Replace with create-list and show exactly one item slot
          const nb: any = replaceStatementBlock(
            this,
            "mp_array_create",
            (created: any) => {
              created.setFieldValue((this as any).getFieldValue("VAR"), "VAR");
            }
          );
          // Rebuild inputs to exactly one value input
          let i = 0;
          while (nb.getInput && nb.getInput("V" + i)) {
            nb.removeInput("V" + i);
            i++;
          }
          nb.count_ = 1;
          nb.appendValueInput("V0").setCheck(null);
          if (typeof nb.updateShape_ === "function") nb.updateShape_();
        });
      }
      this.appendDummyInput("PLUS").appendField(plus);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
      this.setTooltip("Create an empty list");
    },
  } as any;
  pythonGenerator.forBlock["mp_array_empty"] = function (block: any) {
    const varName = getVarName(block, "VAR");
    return `${varName} = []\n`;
  };

  Blockly.Blocks["mp_array_length"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("length of list")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.setOutput(true, "Number");
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_length"] = (block: any) => {
    const v = getVarName(block, "VAR");
    return [`len(${v})`, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  Blockly.Blocks["mp_array_get_index"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("item at position")
        .appendField(new Blockly.FieldVariable("list"), "VAR")
        .appendField("[");
      this.appendValueInput("INDEX").setCheck("Number");
      this.appendDummyInput().appendField("]");
      this.setInputsInline(true);
      this.setOutput(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_get_index"] = (block: any) => {
    const v = getVarName(block, "VAR");
    const idx =
      pythonGenerator.valueToCode(
        block,
        "INDEX",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    return [`${v}[int(${idx})]`, (pythonGenerator as any).ORDER_MEMBER || 0];
  };

  Blockly.Blocks["mp_array_first"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("first item of")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.setOutput(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_first"] = (block: any) => {
    const v = getVarName(block, "VAR");
    return [`${v}[0]`, (pythonGenerator as any).ORDER_MEMBER || 0];
  };
  Blockly.Blocks["mp_array_last"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("last item of")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.setOutput(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_last"] = (block: any) => {
    const v = getVarName(block, "VAR");
    return [`${v}[-1]`, (pythonGenerator as any).ORDER_MEMBER || 0];
  };

  Blockly.Blocks["mp_array_set_index"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("change item at position")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.appendDummyInput().appendField("[");
      this.appendValueInput("INDEX").setCheck("Number");
      this.appendDummyInput().appendField("] to");
      this.appendValueInput("VALUE").setCheck(null);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_set_index"] = (block: any) => {
    const v = getVarName(block, "VAR");
    const idx =
      pythonGenerator.valueToCode(
        block,
        "INDEX",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    const val =
      pythonGenerator.valueToCode(
        block,
        "VALUE",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    return `${v}[int(${idx})] = ${val}\n`;
  };

  Blockly.Blocks["mp_array_push"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("add to end of")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.appendValueInput("VALUE").setCheck(null);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_push"] = (block: any) => {
    const v = getVarName(block, "VAR");
    const val =
      pythonGenerator.valueToCode(
        block,
        "VALUE",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    return `${v}.append(${val})\n`;
  };

  Blockly.Blocks["mp_array_unshift"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("add to start of")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.appendValueInput("VALUE").setCheck(null);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_unshift"] = (block: any) => {
    const v = getVarName(block, "VAR");
    const val =
      pythonGenerator.valueToCode(
        block,
        "VALUE",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    return `${v}.insert(0, ${val})\n`;
  };

  Blockly.Blocks["mp_array_remove_first"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("remove first item from")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_remove_first"] = (block: any) =>
    `${getVarName(block, "VAR")}.pop(0)\n`;

  Blockly.Blocks["mp_array_remove_last"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("remove last item from")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_remove_last"] = (block: any) =>
    `${getVarName(block, "VAR")}.pop()\n`;

  Blockly.Blocks["mp_array_remove_index"] = {
    init: function () {
      this.appendDummyInput().appendField("remove item at position");
      this.appendValueInput("INDEX").setCheck("Number");
      this.appendDummyInput()
        .appendField("from")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_remove_index"] = (block: any) => {
    const v = getVarName(block, "VAR");
    const idx =
      pythonGenerator.valueToCode(
        block,
        "INDEX",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    return `${v}.pop(int(${idx}))\n`;
  };

  Blockly.Blocks["mp_array_reverse"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("reverse items in")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_reverse"] = (block: any) =>
    `${getVarName(block, "VAR")}.reverse()\n`;

  Blockly.Blocks["mp_array_find"] = {
    init: function () {
      this.appendDummyInput().appendField("position of");
      this.appendValueInput("ITEM").setCheck(null);
      this.appendDummyInput()
        .appendField("in")
        .appendField(new Blockly.FieldVariable("list"), "VAR");
      this.setInputsInline(true);
      this.setOutput(true, "Number");
      this.setColour(200);
    },
  };
  pythonGenerator.forBlock["mp_array_find"] = (block: any) => {
    ensureFindIndexDef();
    const v = getVarName(block, "VAR");
    const item =
      pythonGenerator.valueToCode(
        block,
        "ITEM",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "0";
    return [
      `__find_index(${v}, ${item})`,
      (pythonGenerator as any).ORDER_FUNCTION_CALL || 0,
    ];
  };
}

export function getArraysCategory() {
  return {
    kind: "category",
    id: "cat_arrays",
    name: "List",
    expanded: false,
    contents: [
      { kind: "block", type: "mp_array_empty" },
      { kind: "block", type: "mp_array_create" },
      { kind: "label", text: "Read" },
      { kind: "block", type: "mp_array_length" },
      { kind: "block", type: "mp_array_get_index" },
      { kind: "block", type: "mp_array_first" },
      { kind: "block", type: "mp_array_last" },
      { kind: "block", type: "mp_array_find" },
      { kind: "label", text: "Write" },
      { kind: "block", type: "mp_array_set_index" },
      { kind: "block", type: "mp_array_push" },
      { kind: "block", type: "mp_array_unshift" },
      { kind: "block", type: "mp_array_remove_first" },
      { kind: "block", type: "mp_array_remove_last" },
      { kind: "block", type: "mp_array_remove_index" },
      { kind: "block", type: "mp_array_reverse" },
    ],
  } as any;
}
