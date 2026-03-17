// Control category blocks for Blockly toolbox
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

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

  // mp_if_chain: Growable if/else-if/else with + / - buttons
  Blockly.Blocks["mp_if_chain"] = {
    elseifCount_: 0 as number,
    hasElse_: false as boolean,
    init: function init() {
      this.elseifCount_ = 0;
      this.hasElse_ = false;

      this.appendValueInput("IF0").setCheck("Boolean").appendField("if");
      this.appendDummyInput("THEN0").appendField("then");
      this.appendStatementInput("DO0").setCheck(null);

      // Reserve a bottom row for the + button (will be rebuilt each time)
      this.appendDummyInput("PLUS_ROW").setAlign((Blockly as any).ALIGN_RIGHT);

      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip(
        "Growable if/else with a + button that adds else if and keeps a trailing else"
      );

      // Optional: keep mutator support if the renderer shows it
      try {
        this.setMutator(
          new (Blockly as any).Mutator([
            "controls_if_elseif",
            "controls_if_else",
          ])
        );
      } catch {}

      // Default shadow TRUE on IF0 using shadow DOM (replaceable by user)
      const if0Conn = this.getInput("IF0")?.connection as any;
      if (if0Conn) {
        const shadow = (Blockly.utils as any).xml.createElement("shadow");
        shadow.setAttribute("type", "logic_boolean");
        const field = (Blockly.utils as any).xml.createElement("field");
        field.setAttribute("name", "BOOL");
        field.textContent = "TRUE";
        shadow.appendChild(field);
        if0Conn.setShadowDom(shadow);
      }

      // Ensure the bottom plus button is present on first render
      (this as any).updateShape_();
    },
    // Mutator UI: break block into container + parts
    decompose: function (workspace: any) {
      const containerBlock = workspace.newBlock("controls_if_if");
      containerBlock.initSvg();
      let connection = containerBlock.nextConnection;
      for (let n = 1; n <= (this as any).elseifCount_; n++) {
        const elseifBlock = workspace.newBlock("controls_if_elseif");
        elseifBlock.initSvg();
        connection.connect(elseifBlock.previousConnection);
        connection = elseifBlock.nextConnection;
      }
      if ((this as any).hasElse_) {
        const elseBlock = workspace.newBlock("controls_if_else");
        elseBlock.initSvg();
        connection.connect(elseBlock.previousConnection);
      }
      return containerBlock;
    },
    // Save existing connections from real inputs onto mutator blocks
    saveConnections: function (containerBlock: any) {
      let elseifBlock =
        containerBlock.nextConnection &&
        containerBlock.nextConnection.targetBlock();
      let n = 1;
      while (elseifBlock) {
        if (elseifBlock.type === "controls_if_elseif") {
          (elseifBlock as any).valueConnection_ =
            this.getInput("IF" + n)?.connection?.targetConnection || null;
          (elseifBlock as any).statementConnection_ =
            this.getInput("DO" + n)?.connection?.targetConnection || null;
          n++;
        } else if (elseifBlock.type === "controls_if_else") {
          (elseifBlock as any).statementConnection_ =
            this.getInput("ELSE")?.connection?.targetConnection || null;
        }
        elseifBlock =
          elseifBlock.nextConnection &&
          elseifBlock.nextConnection.targetBlock();
      }
    },
    // Rebuild block from mutator UI
    compose: function (containerBlock: any) {
      // Count parts
      let elseifBlock =
        containerBlock.nextConnection &&
        containerBlock.nextConnection.targetBlock();
      let newElseIf = 0;
      let newHasElse = false;
      const elseifConns: any[] = [];
      let elseConn: any = null;

      while (elseifBlock) {
        if (elseifBlock.type === "controls_if_elseif") {
          newElseIf++;
          elseifConns.push({
            valueConnection_: (elseifBlock as any).valueConnection_,
            statementConnection_: (elseifBlock as any).statementConnection_,
          });
        } else if (elseifBlock.type === "controls_if_else") {
          newHasElse = true;
          elseConn = (elseifBlock as any).statementConnection_ || null;
        }
        elseifBlock =
          elseifBlock.nextConnection &&
          elseifBlock.nextConnection.targetBlock();
      }

      (this as any).elseifCount_ = newElseIf;
      (this as any).hasElse_ = newHasElse;
      (this as any).updateShape_();

      // Reconnect saved connections
      for (let i = 1; i <= newElseIf; i++) {
        const data = elseifConns[i - 1];
        if (data?.valueConnection_) {
          this.getInput("IF" + i)?.connection?.connect(data.valueConnection_);
        }
        if (data?.statementConnection_) {
          this.getInput("DO" + i)?.connection?.connect(
            data.statementConnection_
          );
        }
      }
      if (newHasElse && elseConn) {
        this.getInput("ELSE")?.connection?.connect(elseConn);
      }
    },
    mutationToDom: function () {
      const container = document.createElement("mutation");
      container.setAttribute("elseif", String(this.elseifCount_));
      container.setAttribute("else", this.hasElse_ ? "1" : "0");
      return container;
    },
    domToMutation: function (xmlElement: Element) {
      this.elseifCount_ = parseInt(
        xmlElement.getAttribute("elseif") || "0",
        10
      );
      this.hasElse_ = (xmlElement.getAttribute("else") || "1") === "1";
      this.updateShape_();
    },
    updateShape_: function () {
      // Remove all dynamic inputs first (ELSEIF/THEN headers/ELSE/PLUS_ROW)
      let i = 1;
      while (this.getInput("IF" + i)) {
        this.removeInput("IF" + i);
        this.removeInput("DO" + i);
        if (this.getInput("THEN" + i)) this.removeInput("THEN" + i);
        i++;
      }
      if (this.getInput("ELSE")) this.removeInput("ELSE");
      if (this.getInput("ELSE_HDR")) this.removeInput("ELSE_HDR");
      if (this.getInput("PLUS_ROW")) this.removeInput("PLUS_ROW");

      // Rebuild else-if headers inline; minus on header; body below
      for (let n = 1; n <= this.elseifCount_; n++) {
        this.appendValueInput("IF" + n)
          .setCheck("Boolean")
          .appendField(n === 1 ? "else if" : "else if");
        // Default FALSE shadow via shadow DOM (replaceable)
        const c = this.getInput("IF" + n)?.connection as any;
        if (c) {
          const shadow = (Blockly.utils as any).xml.createElement("shadow");
          shadow.setAttribute("type", "logic_boolean");
          const field = (Blockly.utils as any).xml.createElement("field");
          field.setAttribute("name", "BOOL");
          field.textContent = "FALSE";
          shadow.appendChild(field);
          c.setShadowDom(shadow);
        }
        const minusSvg =
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
              '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
              '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
              "</svg>"
          );
        const minusBtn = new (Blockly as any).FieldImage(minusSvg, 18, 18, "-");
        if ((minusBtn as any).setOnClickHandler) {
          (minusBtn as any).setOnClickHandler(
            (
              (idx: number) => () =>
                (this as any).removeElseIfAt_(idx)
            )(n)
          );
        }
        const thenHdr = this.appendDummyInput("THEN" + n);
        thenHdr.appendField("then");
        thenHdr.appendField(minusBtn, "MINUS_" + n);
        thenHdr.setAlign((Blockly as any).ALIGN_RIGHT);
        this.appendStatementInput("DO" + n).setCheck(null);
      }

      // Trailing else header inline + body below
      if (this.hasElse_) {
        const minusSvg =
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
              '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
              '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
              "</svg>"
          );
        const minusBtn = new (Blockly as any).FieldImage(minusSvg, 18, 18, "-");
        if ((minusBtn as any).setOnClickHandler) {
          (minusBtn as any).setOnClickHandler(() =>
            (this as any).removeElse_()
          );
        }
        const elseHdr = this.appendDummyInput("ELSE_HDR");
        elseHdr.appendField("else");
        elseHdr.appendField(minusBtn, "MINUS_ELSE");
        elseHdr.setAlign((Blockly as any).ALIGN_RIGHT);
        this.appendStatementInput("ELSE").setCheck(null);
      }

      // Bottom plus row
      const mkSvgBottom = (type: "plus" | "minus") =>
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">' +
            '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
            (type === "plus"
              ? '<rect x="11" y="7" width="2" height="10" fill="#ffffff" rx="1" />'
              : "") +
            '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
            "</svg>"
        );

      const mkSvg = (type: "plus" | "minus") =>
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">' +
            '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
            (type === "plus"
              ? '<rect x="11" y="7" width="2" height="10" fill="#ffffff" rx="1" />'
              : "") +
            '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
            "</svg>"
        );

      const plus = new (Blockly as any).FieldImage(
        mkSvgBottom("plus"),
        20,
        20,
        "+"
      );
      if ((plus as any).setOnClickHandler) {
        (plus as any).setOnClickHandler(() => (this as any).addCase_());
      } else {
        (plus as any).clickHandler_ = () => (this as any).addCase_();
      }
      const plusRow = this.appendDummyInput("PLUS_ROW");
      plusRow.setAlign((Blockly as any).ALIGN_RIGHT);
      plusRow.appendField(plus, "PLUS_BTN");
    },
    removeElseIfAt_: function (removeIdx: number) {
      const valueConns: any[] = [];
      const stmtConns: any[] = [];
      for (let i = 1; i <= this.elseifCount_; i++) {
        if (i === removeIdx) continue;
        valueConns[i] =
          this.getInput("IF" + i)?.connection?.targetConnection || null;
        stmtConns[i] =
          this.getInput("DO" + i)?.connection?.targetConnection || null;
      }
      this.elseifCount_ = Math.max(0, this.elseifCount_ - 1);
      (this as any).updateShape_();
      let dest = 1;
      for (let i = 1; i <= this.elseifCount_ + 1; i++) {
        if (i === removeIdx) continue;
        if (valueConns[i])
          this.getInput("IF" + dest)?.connection?.connect(valueConns[i]);
        if (stmtConns[i])
          this.getInput("DO" + dest)?.connection?.connect(stmtConns[i]);
        dest++;
      }
    },
    removeElse_: function () {
      this.hasElse_ = false;
      (this as any).updateShape_();
    },
    addCase_: function () {
      if (!this.hasElse_) {
        this.hasElse_ = true; // First click adds else
      } else {
        this.elseifCount_++; // Subsequent clicks add else if
      }
      this.updateShape_();
    },
    removeCase_: function () {
      if (this.elseifCount_ > 0) {
        this.elseifCount_--;
      } else if (this.hasElse_) {
        this.hasElse_ = false;
      }
      this.updateShape_();
    },
    // Back-compat alias used earlier
    addElseIf_: function () {
      (this as any).addCase_();
    },
  } as any;

  pythonGenerator.forBlock["mp_if_chain"] = function (block: any) {
    // Build main if
    const orderNone = (pythonGenerator as any).ORDER_NONE || 0;
    const cond0 =
      pythonGenerator.valueToCode(block, "IF0", orderNone) || "False";
    let code = `if ${cond0}:\n`;
    let branch = pythonGenerator.statementToCode(block, "DO0");
    code += branch ? branch : "    pass\n";

    // Else-ifs
    let n = 1;
    while (block.getInput("IF" + n)) {
      const cond =
        pythonGenerator.valueToCode(block, "IF" + n, orderNone) || "False";
      code += `elif ${cond}:\n`;
      const doCode = pythonGenerator.statementToCode(block, "DO" + n);
      code += doCode ? doCode : "    pass\n";
      n++;
    }

    // Else
    if (block.getInput("ELSE")) {
      code += "else:\n";
      const elseCode = pythonGenerator.statementToCode(block, "ELSE");
      code += elseCode ? elseCode : "    pass\n";
    }
    return code;
  };

  // mp_if_else_chain: preset of mp_if_chain that starts with an else already visible
  const __chainBase: any = (Blockly.Blocks as any)["mp_if_chain"]; // runtime reference
  Blockly.Blocks["mp_if_else_chain"] = {
    elseifCount_: 0 as number,
    hasElse_: true as boolean,
    init: function () {
      __chainBase.init.call(this);
      (this as any).hasElse_ = true; // ensure else is present initially
      (this as any).updateShape_();
    },
    decompose: function (workspace: any) {
      return __chainBase.decompose.call(this, workspace);
    },
    saveConnections: function (containerBlock: any) {
      return __chainBase.saveConnections.call(this, containerBlock);
    },
    compose: function (containerBlock: any) {
      return __chainBase.compose.call(this, containerBlock);
    },
    mutationToDom: function () {
      return __chainBase.mutationToDom.call(this);
    },
    domToMutation: function (xmlElement: Element) {
      return __chainBase.domToMutation.call(this, xmlElement);
    },
    updateShape_: function () {
      return __chainBase.updateShape_.call(this);
    },
    removeElseIfAt_: function (idx: number) {
      return __chainBase.removeElseIfAt_.call(this, idx);
    },
    removeElse_: function () {
      return __chainBase.removeElse_.call(this);
    },
    addCase_: function () {
      return __chainBase.addCase_.call(this);
    },
    removeCase_: function () {
      return __chainBase.removeCase_.call(this);
    },
    addElseIf_: function () {
      return __chainBase.addElseIf_.call(this);
    },
  } as any;

  // Reuse the same generator
  (pythonGenerator as any).forBlock["mp_if_else_chain"] = (
    pythonGenerator as any
  ).forBlock["mp_if_chain"];
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
