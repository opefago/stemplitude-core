// Functions category blocks for Blockly toolbox
//
// This category provides Scratch-like function blocks that allow users to:
// 1. Define custom functions (with or without parameters)
// 2. Call functions (as statements or expressions)
// 3. Return values from functions
//
// Example usage:
// - Define a function: "define myFunction" + code blocks inside
// - Call a function: "call myFunction"
// - With parameters: "define myFunction with params: x, y" and "call myFunction with: 5"
// - Return values: "return [value]" inside a function definition
//
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

let functionsBlocksRegistered = false;

// Store function definitions for call blocks to reference
const functionDefinitions = new Map<
  string,
  {
    params: string[];
    hasReturn: boolean;
  }
>();

// Helper to check if a function has a return block
function functionHasReturn(block: Blockly.Block): boolean {
  const descendants = block.getDescendants(false);
  for (const descendant of descendants) {
    if (descendant.type === "mp_function_return") {
      return true;
    }
  }
  return false;
}

// Helper to get function definition by name
function getFunctionDefinition(workspace: Blockly.Workspace, funcName: string) {
  const allBlocks = workspace.getAllBlocks(false);
  for (const block of allBlocks) {
    if (
      (block.type === "mp_function_define" ||
        block.type === "mp_function_define_params") &&
      block.getFieldValue("NAME") === funcName
    ) {
      return block;
    }
  }
  return null;
}

export function registerFunctionsBlocks() {
  if (functionsBlocksRegistered) return;
  functionsBlocksRegistered = true;

  // Define function block
  Blockly.Blocks["mp_function_define"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("define")
        .appendField(new Blockly.FieldTextInput("myFunction"), "NAME");
      this.appendStatementInput("STACK").setCheck(null);
      this.setColour(290);
      this.setTooltip("Define a custom function");
      this.setHelpUrl("");
      // Hat block - flat top like micro:bit
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  pythonGenerator.forBlock["mp_function_define"] = function (block: any) {
    const funcName = block.getFieldValue("NAME") || "myFunction";
    // Sanitize function name (remove spaces, special chars)
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    let statements = pythonGenerator.statementToCode(block, "STACK");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }
    return `def ${sanitizedName}():\n${statements}\n`;
  };

  // Call function block
  Blockly.Blocks["mp_function_call"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("call")
        .appendField(new Blockly.FieldTextInput("myFunction"), "NAME");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(290);
      this.setTooltip("Call a custom function");
      this.setHelpUrl("");
    },
  };

  pythonGenerator.forBlock["mp_function_call"] = function (block: any) {
    const funcName = block.getFieldValue("NAME") || "myFunction";
    // Sanitize function name
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    return `${sanitizedName}()\n`;
  };

  // Function with parameters - define (with mutator for inputs)
  Blockly.Blocks["mp_function_define_params"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("define")
        .appendField(new Blockly.FieldTextInput("myFunction"), "NAME");
      this.appendStatementInput("STACK").setCheck(null);
      this.setColour(290);
      this.setTooltip("Define a function with input parameters");
      this.setHelpUrl("");
      this.setMutator(
        new (Blockly as any).icons.MutatorIcon(["mp_function_input_item"], this)
      );
      this.arguments_ = [];
      this.paramIds_ = [];
      // Hat block - flat top like micro:bit
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
    mutationToDom: function () {
      const container = Blockly.utils.xml.createElement("mutation");
      for (let i = 0; i < this.arguments_.length; i++) {
        const parameter = Blockly.utils.xml.createElement("arg");
        parameter.setAttribute("name", this.arguments_[i]);
        parameter.setAttribute("varid", this.paramIds_[i]);
        container.appendChild(parameter);
      }
      return container;
    },
    domToMutation: function (xmlElement: any) {
      this.arguments_ = [];
      this.paramIds_ = [];
      for (let i = 0, childNode; (childNode = xmlElement.childNodes[i]); i++) {
        if (childNode.nodeName.toLowerCase() === "arg") {
          const varName = childNode.getAttribute("name");
          this.arguments_.push(varName);
          this.paramIds_.push(childNode.getAttribute("varid"));
        }
      }
      this.updateParams_();
    },
    decompose: function (workspace: Blockly.Workspace) {
      const containerBlock = workspace.newBlock(
        "mp_function_input_container"
      ) as Blockly.BlockSvg;
      containerBlock.initSvg();
      let connection = containerBlock.getInput("STACK")!.connection;
      for (let i = 0; i < this.arguments_.length; i++) {
        const inputBlock = workspace.newBlock(
          "mp_function_input_item"
        ) as Blockly.BlockSvg;
        inputBlock.initSvg();
        inputBlock.setFieldValue(this.arguments_[i], "NAME");
        connection!.connect(inputBlock.previousConnection!);
        connection = inputBlock.nextConnection;
      }
      return containerBlock;
    },
    compose: function (containerBlock: Blockly.Block) {
      // Store old parameters for cleanup
      const oldParamIds = this.paramIds_ ? [...this.paramIds_] : [];
      const oldArguments = this.arguments_ ? [...this.arguments_] : [];

      let inputBlock = containerBlock.getInputTargetBlock("STACK");
      const arguments_: string[] = [];
      const paramIds: string[] = [];
      while (inputBlock) {
        const varName = inputBlock.getFieldValue("NAME");
        arguments_.push(varName);
        // Get or create variable for this parameter
        const variable =
          this.workspace.getVariable(varName, "") ||
          this.workspace.createVariable(varName, "");
        paramIds.push(variable.getId());
        inputBlock =
          inputBlock.nextConnection && inputBlock.nextConnection.targetBlock();
      }
      this.arguments_ = arguments_;
      this.paramIds_ = paramIds;

      // Clean up removed parameters
      for (let i = 0; i < oldParamIds.length; i++) {
        const oldVarId = oldParamIds[i];
        const oldVarName = oldArguments[i];

        // If this parameter was removed (not in new list)
        if (!paramIds.includes(oldVarId)) {
          const shouldDelete = this.shouldDeleteVariable_(oldVarName, oldVarId);
          if (shouldDelete) {
            try {
              this.workspace.deleteVariableById(oldVarId);
            } catch (e) {
              console.debug("Could not delete removed parameter:", oldVarName);
            }
          }
        }
      }

      this.updateParams_();
    },
    updateParams_: function () {
      // Remove old parameter displays
      for (let i = 0; this.getInput("PARAM" + i); i++) {
        this.removeInput("PARAM" + i);
      }
      // Add new parameter displays
      for (let i = 0; i < this.arguments_.length; i++) {
        this.appendDummyInput("PARAM" + i)
          .appendField("📥")
          .appendField(this.arguments_[i])
          .setAlign(Blockly.inputs.Align.RIGHT);
        this.moveInputBefore("PARAM" + i, "STACK");
      }
      // Update function definition cache
      this.updateFunctionDefinitionCache_();
    },
    updateFunctionDefinitionCache_: function () {
      const funcName = this.getFieldValue("NAME");
      if (funcName && this.workspace) {
        functionDefinitions.set(funcName, {
          params: this.arguments_ || [],
          hasReturn: functionHasReturn(this),
        });
        // Update all call blocks for this function
        this.workspace.getAllBlocks(false).forEach((block: Blockly.Block) => {
          if (
            (block.type === "mp_function_call_auto" ||
              block.type === "mp_function_call_auto_return") &&
            block.getFieldValue &&
            block.getFieldValue("NAME") === funcName
          ) {
            if ((block as any).updateFromDefinition_) {
              (block as any).updateFromDefinition_();
            }
          }
        });
      }
    },
    getVars: function () {
      return this.arguments_;
    },
    getVarModels: function () {
      const models = [];
      for (let i = 0; i < this.arguments_.length; i++) {
        const model = this.workspace.getVariableById(this.paramIds_[i]);
        if (model) {
          models.push(model);
        }
      }
      return models;
    },
    onchange: function (event: any) {
      // When this block is deleted, clean up its parameter variables
      if (
        event.type === Blockly.Events.BLOCK_DELETE &&
        event.blockId === this.id
      ) {
        if (this.workspace && this.paramIds_) {
          this.cleanupParameterVariables_();
        }
      }
    },
    cleanupParameterVariables_: function () {
      if (!this.workspace || !this.paramIds_) return;

      for (let i = 0; i < this.paramIds_.length; i++) {
        const varId = this.paramIds_[i];
        const varName = this.arguments_[i];

        // Check if this variable is still used
        const shouldDelete = this.shouldDeleteVariable_(varName, varId);

        if (shouldDelete) {
          try {
            this.workspace.deleteVariableById(varId);
          } catch (e) {
            // Variable might already be deleted or in use
            console.debug("Could not delete parameter variable:", varName);
          }
        }
      }
    },
    shouldDeleteVariable_: function (varName: string, varId: string) {
      if (!this.workspace) return false;

      // Check if any other function definition uses this parameter name
      const allBlocks = this.workspace.getAllBlocks(false);
      for (const block of allBlocks) {
        if (block.id === this.id) continue; // Skip self

        if (
          block.type === "mp_function_define_params" &&
          (block as any).arguments_
        ) {
          const otherArgs = (block as any).arguments_;
          if (otherArgs.includes(varName)) {
            return false; // Another function uses this parameter name
          }
        }
      }

      // Check if any variable blocks reference this variable
      for (const block of allBlocks) {
        if (
          block.type === "variables_get" ||
          block.type === "variables_set" ||
          block.type === "variables_change"
        ) {
          const blockVarId = block.getFieldValue && block.getFieldValue("VAR");
          if (blockVarId === varId) {
            return false; // Variable is being used
          }
        }
      }

      return true; // Safe to delete
    },
  };

  pythonGenerator.forBlock["mp_function_define_params"] = function (
    block: any
  ) {
    const funcName = block.getFieldValue("NAME") || "myFunction";
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    const args = block.arguments_ || [];
    const sanitizedArgs = args
      .map((arg: string) => arg.replace(/[^a-zA-Z0-9_]/g, "_"))
      .join(", ");

    let statements = pythonGenerator.statementToCode(block, "STACK");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }
    return `def ${sanitizedName}(${sanitizedArgs}):\n${statements}\n`;
  };

  // Custom function call block (statement version) - no name editing
  Blockly.Blocks["mp_function_call_custom"] = {
    init: function () {
      this.funcName_ = "myFunction";
      this.params_ = [];
      this.appendDummyInput("FUNC_NAME")
        .appendField("call")
        .appendField(this.funcName_);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(false); // Stack vertically
      this.setColour(290);
      this.setTooltip("Call a function");
      this.setHelpUrl("");
    },
    saveExtraState: function () {
      return {
        name: this.funcName_,
        params: this.params_,
      };
    },
    loadExtraState: function (state: any) {
      this.funcName_ = state.name || "myFunction";
      this.params_ = state.params || [];
      this.updateShape_();
    },
    updateShape_: function () {
      // Update function name display
      if (this.getInput("FUNC_NAME")) {
        this.removeInput("FUNC_NAME");
      }
      this.appendDummyInput("FUNC_NAME")
        .appendField("call")
        .appendField(this.funcName_);
      this.moveInputBefore("FUNC_NAME", null);

      // Remove old parameter inputs
      let i = 0;
      while (this.getInput("ARG" + i)) {
        this.removeInput("ARG" + i);
        i++;
      }

      // Add parameter inputs (external/vertical layout)
      for (let i = 0; i < this.params_.length; i++) {
        this.appendValueInput("ARG" + i)
          .setCheck(null)
          .appendField(this.params_[i]);
      }
    },
  };

  pythonGenerator.forBlock["mp_function_call_custom"] = function (block: any) {
    const funcName = block.funcName_ || "myFunction";
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    const params = block.params_ || [];
    const args: string[] = [];
    for (let i = 0; i < params.length; i++) {
      const arg =
        pythonGenerator.valueToCode(
          block,
          "ARG" + i,
          (pythonGenerator as any).ORDER_NONE || 0
        ) || "0";
      args.push(arg);
    }
    return `${sanitizedName}(${args.join(", ")})\n`;
  };

  // Custom function call block (return value version) - no name editing
  Blockly.Blocks["mp_function_call_custom_return"] = {
    init: function () {
      this.funcName_ = "myFunction";
      this.params_ = [];
      this.appendDummyInput("FUNC_NAME")
        .appendField("call")
        .appendField(this.funcName_);
      this.setOutput(true, null);
      this.setInputsInline(false); // Stack vertically
      this.setColour(290);
      this.setTooltip("Call a function that returns a value");
      this.setHelpUrl("");
    },
    saveExtraState: function () {
      return {
        name: this.funcName_,
        params: this.params_,
      };
    },
    loadExtraState: function (state: any) {
      this.funcName_ = state.name || "myFunction";
      this.params_ = state.params || [];
      this.updateShape_();
    },
    updateShape_: function () {
      // Update function name display
      if (this.getInput("FUNC_NAME")) {
        this.removeInput("FUNC_NAME");
      }
      this.appendDummyInput("FUNC_NAME")
        .appendField("call")
        .appendField(this.funcName_);
      this.moveInputBefore("FUNC_NAME", null);

      // Remove old parameter inputs
      let i = 0;
      while (this.getInput("ARG" + i)) {
        this.removeInput("ARG" + i);
        i++;
      }

      // Add parameter inputs (external/vertical layout)
      for (let i = 0; i < this.params_.length; i++) {
        this.appendValueInput("ARG" + i)
          .setCheck(null)
          .appendField(this.params_[i]);
      }
    },
  };

  pythonGenerator.forBlock["mp_function_call_custom_return"] = function (
    block: any
  ) {
    const funcName = block.funcName_ || "myFunction";
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    const params = block.params_ || [];
    const args: string[] = [];
    for (let i = 0; i < params.length; i++) {
      const arg =
        pythonGenerator.valueToCode(
          block,
          "ARG" + i,
          (pythonGenerator as any).ORDER_NONE || 0
        ) || "0";
      args.push(arg);
    }
    const code = `${sanitizedName}(${args.join(", ")})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Auto-updating function call block (statement version)
  Blockly.Blocks["mp_function_call_auto"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("call")
        .appendField(new Blockly.FieldTextInput("myFunction"), "NAME");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setColour(290);
      this.setTooltip("Call a function");
      this.setHelpUrl("");
      this.params_ = [];
    },
    onchange: function (event: any) {
      if (!this.workspace || this.workspace.isDragging()) return;
      // Update when function name changes or blocks are moved/created
      if (
        event.type === Blockly.Events.BLOCK_CHANGE ||
        event.type === Blockly.Events.BLOCK_MOVE ||
        event.type === Blockly.Events.BLOCK_CREATE
      ) {
        this.updateFromDefinition_();
      }
    },
    updateFromDefinition_: function () {
      const funcName = this.getFieldValue("NAME");
      if (!funcName || !this.workspace) return;

      const funcDef = getFunctionDefinition(this.workspace, funcName);
      const newParams =
        funcDef && (funcDef as any).arguments_
          ? (funcDef as any).arguments_
          : [];

      // Check if parameters changed
      if (JSON.stringify(this.params_) !== JSON.stringify(newParams)) {
        // Remove old inputs
        for (let i = 0; i < this.params_.length; i++) {
          if (this.getInput("ARG" + i)) {
            this.removeInput("ARG" + i);
          }
        }
        // Add new inputs
        this.params_ = newParams;
        for (let i = 0; i < newParams.length; i++) {
          this.appendValueInput("ARG" + i)
            .setCheck(null)
            .appendField(newParams[i] + ":");
        }
      }
    },
  };

  pythonGenerator.forBlock["mp_function_call_auto"] = function (block: any) {
    const funcName = block.getFieldValue("NAME") || "myFunction";
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    const params = block.params_ || [];
    const args: string[] = [];
    for (let i = 0; i < params.length; i++) {
      const arg =
        pythonGenerator.valueToCode(
          block,
          "ARG" + i,
          (pythonGenerator as any).ORDER_NONE || 0
        ) || "0";
      args.push(arg);
    }
    return `${sanitizedName}(${args.join(", ")})\n`;
  };

  // Auto-updating function call block (return value version)
  Blockly.Blocks["mp_function_call_auto_return"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("call")
        .appendField(new Blockly.FieldTextInput("myFunction"), "NAME");
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setColour(290);
      this.setTooltip("Call a function that returns a value");
      this.setHelpUrl("");
      this.params_ = [];
    },
    onchange: function (event: any) {
      if (!this.workspace || this.workspace.isDragging()) return;
      // Update when function name changes or blocks are moved/created
      if (
        event.type === Blockly.Events.BLOCK_CHANGE ||
        event.type === Blockly.Events.BLOCK_MOVE ||
        event.type === Blockly.Events.BLOCK_CREATE
      ) {
        this.updateFromDefinition_();
      }
    },
    updateFromDefinition_: function () {
      const funcName = this.getFieldValue("NAME");
      if (!funcName || !this.workspace) return;

      const funcDef = getFunctionDefinition(this.workspace, funcName);
      const newParams =
        funcDef && (funcDef as any).arguments_
          ? (funcDef as any).arguments_
          : [];

      // Check if parameters changed
      if (JSON.stringify(this.params_) !== JSON.stringify(newParams)) {
        // Remove old inputs
        for (let i = 0; i < this.params_.length; i++) {
          if (this.getInput("ARG" + i)) {
            this.removeInput("ARG" + i);
          }
        }
        // Add new inputs
        this.params_ = newParams;
        for (let i = 0; i < newParams.length; i++) {
          this.appendValueInput("ARG" + i)
            .setCheck(null)
            .appendField(newParams[i] + ":");
        }
      }
    },
  };

  pythonGenerator.forBlock["mp_function_call_auto_return"] = function (
    block: any
  ) {
    const funcName = block.getFieldValue("NAME") || "myFunction";
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    const params = block.params_ || [];
    const args: string[] = [];
    for (let i = 0; i < params.length; i++) {
      const arg =
        pythonGenerator.valueToCode(
          block,
          "ARG" + i,
          (pythonGenerator as any).ORDER_NONE || 0
        ) || "0";
      args.push(arg);
    }
    const code = `${sanitizedName}(${args.join(", ")})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Mutator helper blocks for function definition
  Blockly.Blocks["mp_function_input_container"] = {
    init: function () {
      this.appendDummyInput().appendField("inputs");
      this.appendStatementInput("STACK");
      this.setColour(290);
      this.setTooltip("Add input parameters to the function");
      this.contextMenu = false;
    },
  };

  Blockly.Blocks["mp_function_input_item"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("input name:")
        .appendField(new Blockly.FieldTextInput("x"), "NAME");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(290);
      this.setTooltip("An input parameter for the function");
      this.contextMenu = false;
    },
  };

  // Call function with dynamic parameters (with mutator)
  Blockly.Blocks["mp_function_call_params"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("call")
        .appendField(new Blockly.FieldTextInput("myFunction"), "NAME");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setColour(290);
      this.setTooltip("Call a function with parameters");
      this.setHelpUrl("");
      // Use the correct mutator extension
      this.setMutator(
        new (Blockly as any).icons.MutatorIcon(["mp_function_param_item"], this)
      );
      this.paramCount_ = 0;
    },
    mutationToDom: function () {
      const container = Blockly.utils.xml.createElement("mutation");
      container.setAttribute("params", String(this.paramCount_));
      return container;
    },
    domToMutation: function (xmlElement: any) {
      const params = parseInt(xmlElement.getAttribute("params") || "0", 10);
      this.updateShape_(params);
    },
    decompose: function (workspace: Blockly.Workspace) {
      const containerBlock = workspace.newBlock(
        "mp_function_param_container"
      ) as Blockly.BlockSvg;
      containerBlock.initSvg();
      let connection = containerBlock.getInput("STACK")!.connection;
      for (let i = 0; i < this.paramCount_; i++) {
        const paramBlock = workspace.newBlock(
          "mp_function_param_item"
        ) as Blockly.BlockSvg;
        paramBlock.initSvg();
        connection!.connect(paramBlock.previousConnection!);
        connection = paramBlock.nextConnection;
      }
      return containerBlock;
    },
    compose: function (containerBlock: Blockly.Block) {
      let paramBlock = containerBlock.getInputTargetBlock("STACK");
      const connections: any[] = [];
      while (paramBlock) {
        connections.push((paramBlock as any).valueConnection_);
        paramBlock =
          paramBlock.nextConnection && paramBlock.nextConnection.targetBlock();
      }
      this.updateShape_(connections.length);
      for (let i = 0; i < connections.length; i++) {
        if (connections[i]) {
          const input = this.getInput("ARG" + i);
          if (input) {
            (Blockly as any).Mutator.reconnect(connections[i], this, "ARG" + i);
          }
        }
      }
    },
    saveConnections: function (containerBlock: Blockly.Block) {
      let paramBlock = containerBlock.getInputTargetBlock("STACK");
      let i = 0;
      while (paramBlock) {
        const input = this.getInput("ARG" + i);
        (paramBlock as any).valueConnection_ =
          input && input.connection!.targetConnection;
        i++;
        paramBlock =
          paramBlock.nextConnection && paramBlock.nextConnection.targetBlock();
      }
    },
    updateShape_: function (paramCount: number) {
      // Remove old inputs
      for (let i = 0; i < this.paramCount_; i++) {
        if (this.getInput("ARG" + i)) {
          this.removeInput("ARG" + i);
        }
      }
      // Add new inputs
      this.paramCount_ = paramCount;
      for (let i = 0; i < paramCount; i++) {
        this.appendValueInput("ARG" + i)
          .setCheck(null)
          .appendField("param" + (i + 1) + ":");
      }
    },
  };

  pythonGenerator.forBlock["mp_function_call_params"] = function (block: any) {
    const funcName = block.getFieldValue("NAME") || "myFunction";
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    const paramCount = block.paramCount_ || 0;
    const args: string[] = [];
    for (let i = 0; i < paramCount; i++) {
      const arg =
        pythonGenerator.valueToCode(
          block,
          "ARG" + i,
          (pythonGenerator as any).ORDER_NONE || 0
        ) || "0";
      args.push(arg);
    }
    return `${sanitizedName}(${args.join(", ")})\n`;
  };

  // Mutator helper blocks
  Blockly.Blocks["mp_function_param_container"] = {
    init: function () {
      this.appendDummyInput().appendField("parameters");
      this.appendStatementInput("STACK");
      this.setColour(290);
      this.setTooltip("Add parameters to the function call");
      this.contextMenu = false;
    },
  };

  Blockly.Blocks["mp_function_param_item"] = {
    init: function () {
      this.appendDummyInput().appendField("parameter");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(290);
      this.setTooltip("A parameter for the function");
      this.contextMenu = false;
    },
  };

  // Return value block
  Blockly.Blocks["mp_function_return"] = {
    init: function () {
      this.appendValueInput("VALUE").setCheck(null).appendField("return");
      this.setPreviousStatement(true, null);
      this.setInputsInline(true);
      this.setColour(290);
      this.setTooltip("Return a value from a function");
      this.setHelpUrl("");
    },
  };

  pythonGenerator.forBlock["mp_function_return"] = function (block: any) {
    const value =
      pythonGenerator.valueToCode(
        block,
        "VALUE",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "None";
    return `return ${value}\n`;
  };

  // Function call that returns a value (for use in expressions)
  Blockly.Blocks["mp_function_call_return"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("call")
        .appendField(new Blockly.FieldTextInput("myFunction"), "NAME");
      this.setOutput(true, null);
      this.setColour(290);
      this.setTooltip("Call a function that returns a value");
      this.setHelpUrl("");
    },
  };

  pythonGenerator.forBlock["mp_function_call_return"] = function (block: any) {
    const funcName = block.getFieldValue("NAME") || "myFunction";
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    const code = `${sanitizedName}()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Function call with dynamic parameters that returns a value (with mutator)
  Blockly.Blocks["mp_function_call_params_return"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("call")
        .appendField(new Blockly.FieldTextInput("myFunction"), "NAME");
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setColour(290);
      this.setTooltip("Call a function with parameters that returns a value");
      this.setHelpUrl("");
      // Use the correct mutator extension
      this.setMutator(
        new (Blockly as any).icons.MutatorIcon(["mp_function_param_item"], this)
      );
      this.paramCount_ = 0;
    },
    mutationToDom: function () {
      const container = Blockly.utils.xml.createElement("mutation");
      container.setAttribute("params", String(this.paramCount_));
      return container;
    },
    domToMutation: function (xmlElement: any) {
      const params = parseInt(xmlElement.getAttribute("params") || "0", 10);
      this.updateShape_(params);
    },
    decompose: function (workspace: Blockly.Workspace) {
      const containerBlock = workspace.newBlock(
        "mp_function_param_container"
      ) as Blockly.BlockSvg;
      containerBlock.initSvg();
      let connection = containerBlock.getInput("STACK")!.connection;
      for (let i = 0; i < this.paramCount_; i++) {
        const paramBlock = workspace.newBlock(
          "mp_function_param_item"
        ) as Blockly.BlockSvg;
        paramBlock.initSvg();
        connection!.connect(paramBlock.previousConnection!);
        connection = paramBlock.nextConnection;
      }
      return containerBlock;
    },
    compose: function (containerBlock: Blockly.Block) {
      let paramBlock = containerBlock.getInputTargetBlock("STACK");
      const connections: any[] = [];
      while (paramBlock) {
        connections.push((paramBlock as any).valueConnection_);
        paramBlock =
          paramBlock.nextConnection && paramBlock.nextConnection.targetBlock();
      }
      this.updateShape_(connections.length);
      for (let i = 0; i < connections.length; i++) {
        if (connections[i]) {
          const input = this.getInput("ARG" + i);
          if (input) {
            (Blockly as any).Mutator.reconnect(connections[i], this, "ARG" + i);
          }
        }
      }
    },
    saveConnections: function (containerBlock: Blockly.Block) {
      let paramBlock = containerBlock.getInputTargetBlock("STACK");
      let i = 0;
      while (paramBlock) {
        const input = this.getInput("ARG" + i);
        (paramBlock as any).valueConnection_ =
          input && input.connection!.targetConnection;
        i++;
        paramBlock =
          paramBlock.nextConnection && paramBlock.nextConnection.targetBlock();
      }
    },
    updateShape_: function (paramCount: number) {
      // Remove old inputs
      for (let i = 0; i < this.paramCount_; i++) {
        if (this.getInput("ARG" + i)) {
          this.removeInput("ARG" + i);
        }
      }
      // Add new inputs
      this.paramCount_ = paramCount;
      for (let i = 0; i < paramCount; i++) {
        this.appendValueInput("ARG" + i)
          .setCheck(null)
          .appendField("param" + (i + 1) + ":");
      }
    },
  };

  pythonGenerator.forBlock["mp_function_call_params_return"] = function (
    block: any
  ) {
    const funcName = block.getFieldValue("NAME") || "myFunction";
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, "_");
    const paramCount = block.paramCount_ || 0;
    const args: string[] = [];
    for (let i = 0; i < paramCount; i++) {
      const arg =
        pythonGenerator.valueToCode(
          block,
          "ARG" + i,
          (pythonGenerator as any).ORDER_NONE || 0
        ) || "0";
      args.push(arg);
    }
    const code = `${sanitizedName}(${args.join(", ")})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };
}

export function getFunctionsCategory() {
  return {
    kind: "category",
    id: "cat_functions",
    name: "Functions",
    expanded: false,
    custom: "PROCEDURE", // Use dynamic category
  };
}

// Register dynamic category callback for functions
export function registerFunctionsProcedureCategory(
  workspace: Blockly.WorkspaceSvg
) {
  workspace.registerToolboxCategoryCallback(
    "PROCEDURE",
    (workspace: Blockly.WorkspaceSvg) => {
      const xmlList: any[] = [];

      // Add "Define" label
      xmlList.push({
        kind: "label",
        text: "Define",
      });

      // Add function definition block
      xmlList.push({
        kind: "block",
        type: "mp_function_define_params",
      });

      // Add return block
      xmlList.push({
        kind: "block",
        type: "mp_function_return",
        inputs: {
          VALUE: { shadow: { type: "math_number", fields: { NUM: 0 } } },
        },
      });

      // Get all function definitions
      const allBlocks = workspace.getAllBlocks(false);
      const functionDefs = allBlocks.filter(
        (block) =>
          block.type === "mp_function_define" ||
          block.type === "mp_function_define_params"
      );

      // If there are functions, add a "Call" label
      if (functionDefs.length > 0) {
        xmlList.push({
          kind: "label",
          text: "Call Functions",
        });
      }

      // For each function definition, create a custom call block
      functionDefs.forEach((funcDef) => {
        const funcName = funcDef.getFieldValue("NAME");
        const params = (funcDef as any).arguments_ || [];
        const hasReturn = functionHasReturn(funcDef);

        // Create a call block spec
        const callBlock: any = {
          kind: "block",
          type: hasReturn
            ? "mp_function_call_custom_return"
            : "mp_function_call_custom",
          extraState: {
            name: funcName,
            params: params,
          },
        };

        xmlList.push(callBlock);
      });

      return xmlList;
    }
  );
}
