export function registerSimpleIfElseBlock({
  Blockly,
  blockType,
  colour = 210,
  tooltip = "",
  conditionLabel = "if",
  buildConditionInput,
}) {
  if (!Blockly?.Blocks || !blockType || typeof buildConditionInput !== "function") return;
  if (Blockly.Blocks[blockType]) return;

  Blockly.Blocks[blockType] = {
    init() {
      const conditionInput = this.appendDummyInput();
      conditionInput.appendField(conditionLabel);
      buildConditionInput(conditionInput, Blockly);

      this.appendStatementInput("THEN").setCheck(null).appendField("then");
      this.appendStatementInput("ELSE").setCheck(null).appendField("else");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(colour);
      if (tooltip) this.setTooltip(tooltip);
    },
  };
}
