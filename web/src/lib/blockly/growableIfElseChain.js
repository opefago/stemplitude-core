const MINUS_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
      '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
      "</svg>",
  );

const PLUS_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
      '<rect x="11" y="7" width="2" height="10" fill="#ffffff" rx="1" />' +
      '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
      "</svg>",
  );

function makeShadowBool(Blockly, conn, val) {
  if (!conn) return;
  const shadow = Blockly.utils.xml.createElement("shadow");
  shadow.setAttribute("type", "logic_boolean");
  const field = Blockly.utils.xml.createElement("field");
  field.setAttribute("name", "BOOL");
  field.textContent = val;
  shadow.appendChild(field);
  conn.setShadowDom(shadow);
}

export function registerGrowableIfElseChainBlocks({
  Blockly,
  pythonGenerator,
  baseType,
  elseType,
  color = 210,
  tooltip = "If condition is true, run the blocks inside. Use + to add else.",
  orderNone = 0,
}) {
  if (!Blockly?.Blocks || !pythonGenerator || !baseType || !elseType) return;
  if (Blockly.Blocks[baseType] && Blockly.Blocks[elseType]) return;

  Blockly.Blocks[baseType] = {
    elseifCount_: 0,
    hasElse_: false,
    init() {
      this.elseifCount_ = 0;
      this.hasElse_ = false;
      this.appendValueInput("IF0").setCheck("Boolean").appendField("if");
      this.appendDummyInput("THEN0").appendField("then");
      this.appendStatementInput("DO0").setCheck(null);
      this.appendDummyInput("PLUS_ROW").setAlign(Blockly.inputs.Align.RIGHT);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(color);
      this.setTooltip(tooltip);
      makeShadowBool(Blockly, this.getInput("IF0")?.connection, "TRUE");
      this.updateShape_();
    },
    mutationToDom() {
      const c = document.createElement("mutation");
      c.setAttribute("elseif", String(this.elseifCount_));
      c.setAttribute("else", this.hasElse_ ? "1" : "0");
      return c;
    },
    domToMutation(xml) {
      this.elseifCount_ = parseInt(xml.getAttribute("elseif") || "0", 10);
      this.hasElse_ = (xml.getAttribute("else") || "0") === "1";
      this.updateShape_();
    },
    saveExtraState() {
      return { elseIfCount: this.elseifCount_, hasElse: this.hasElse_ };
    },
    loadExtraState(state) {
      this.elseifCount_ = state.elseIfCount || 0;
      this.hasElse_ = !!state.hasElse;
      this.updateShape_();
    },
    updateShape_() {
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

      for (let n = 1; n <= this.elseifCount_; n++) {
        this.appendValueInput("IF" + n).setCheck("Boolean").appendField("else if");
        makeShadowBool(Blockly, this.getInput("IF" + n)?.connection, "FALSE");
        const minusBtn = new Blockly.FieldImage(MINUS_SVG, 18, 18, "-");
        minusBtn.setOnClickHandler(((idx) => () => this.removeElseIfAt_(idx))(n));
        const hdr = this.appendDummyInput("THEN" + n);
        hdr.appendField("then");
        hdr.appendField(minusBtn, "MINUS_" + n);
        hdr.setAlign(Blockly.inputs.Align.RIGHT);
        this.appendStatementInput("DO" + n).setCheck(null);
      }

      if (this.hasElse_) {
        const minusBtn = new Blockly.FieldImage(MINUS_SVG, 18, 18, "-");
        minusBtn.setOnClickHandler(() => this.removeElse_());
        const hdr = this.appendDummyInput("ELSE_HDR");
        hdr.appendField("else");
        hdr.appendField(minusBtn, "MINUS_ELSE");
        hdr.setAlign(Blockly.inputs.Align.RIGHT);
        this.appendStatementInput("ELSE").setCheck(null);
      }

      const plus = new Blockly.FieldImage(PLUS_SVG, 20, 20, "+");
      plus.setOnClickHandler(() => this.addCase_());
      const plusRow = this.appendDummyInput("PLUS_ROW");
      plusRow.setAlign(Blockly.inputs.Align.RIGHT);
      plusRow.appendField(plus, "PLUS_BTN");
    },
    addCase_() {
      if (!this.hasElse_) {
        this.hasElse_ = true;
      } else {
        this.elseifCount_++;
      }
      this.updateShape_();
    },
    removeElseIfAt_(removeIdx) {
      const valConns = [];
      const stmtConns = [];
      for (let i = 1; i <= this.elseifCount_; i++) {
        if (i === removeIdx) continue;
        valConns[i] = this.getInput("IF" + i)?.connection?.targetConnection || null;
        stmtConns[i] = this.getInput("DO" + i)?.connection?.targetConnection || null;
      }
      this.elseifCount_ = Math.max(0, this.elseifCount_ - 1);
      this.updateShape_();
      let dest = 1;
      for (let i = 1; i <= this.elseifCount_ + 1; i++) {
        if (i === removeIdx) continue;
        if (valConns[i]) this.getInput("IF" + dest)?.connection?.connect(valConns[i]);
        if (stmtConns[i]) this.getInput("DO" + dest)?.connection?.connect(stmtConns[i]);
        dest++;
      }
    },
    removeElse_() {
      this.hasElse_ = false;
      this.updateShape_();
    },
  };

  pythonGenerator.forBlock[baseType] = function (block) {
    const cond0 = pythonGenerator.valueToCode(block, "IF0", orderNone) || "False";
    let code = `if ${cond0}:\n`;
    let branch = pythonGenerator.statementToCode(block, "DO0");
    code += branch || "  pass\n";
    let n = 1;
    while (block.getInput("IF" + n)) {
      const cond = pythonGenerator.valueToCode(block, "IF" + n, orderNone) || "False";
      code += `elif ${cond}:\n`;
      const doCode = pythonGenerator.statementToCode(block, "DO" + n);
      code += doCode || "  pass\n";
      n++;
    }
    if (block.getInput("ELSE")) {
      code += "else:\n";
      const elseCode = pythonGenerator.statementToCode(block, "ELSE");
      code += elseCode || "  pass\n";
    }
    return code;
  };

  Blockly.Blocks[elseType] = {
    elseifCount_: 0,
    hasElse_: true,
    init() {
      Blockly.Blocks[baseType].init.call(this);
      this.hasElse_ = true;
      this.updateShape_();
    },
    mutationToDom: Blockly.Blocks[baseType].mutationToDom,
    domToMutation: Blockly.Blocks[baseType].domToMutation,
    saveExtraState: Blockly.Blocks[baseType].saveExtraState,
    loadExtraState: Blockly.Blocks[baseType].loadExtraState,
    updateShape_: Blockly.Blocks[baseType].updateShape_,
    addCase_: Blockly.Blocks[baseType].addCase_,
    removeElseIfAt_: Blockly.Blocks[baseType].removeElseIfAt_,
    removeElse_: Blockly.Blocks[baseType].removeElse_,
  };

  pythonGenerator.forBlock[elseType] = pythonGenerator.forBlock[baseType];
}
