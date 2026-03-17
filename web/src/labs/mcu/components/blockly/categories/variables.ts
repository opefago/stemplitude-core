// Variables category blocks for Blockly toolbox
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

let variablesCustomDialogRegistered = false;
let variableChangeBlockRegistered = false;

// Custom prompt dialog function
function showCustomPrompt(
  message: string,
  defaultValue: string,
  callback: (result: string | null) => void
) {
  // Create custom modal dialog
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    min-width: 450px;
    max-width: 90%;
    overflow: hidden;
  `;

  // Header bar like Scratch (with app theme colors)
  const header = document.createElement("div");
  header.style.cssText = `
    background: linear-gradient(135deg, #ff9f1c 0%, #ffb84d 100%);
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  `;

  const title = document.createElement("h3");
  title.textContent = "New Variable";
  title.style.cssText = `
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: white;
    text-align: center;
  `;

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "✕";
  closeBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    position: absolute;
    right: 20px;
  `;
  closeBtn.onmouseover = () =>
    (closeBtn.style.background = "rgba(255, 255, 255, 0.3)");
  closeBtn.onmouseout = () =>
    (closeBtn.style.background = "rgba(255, 255, 255, 0.2)");

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Content container
  const content = document.createElement("div");
  content.style.cssText = `
    padding: 24px;
  `;

  const inputLabel = document.createElement("label");
  inputLabel.textContent = "New variable name:";
  inputLabel.style.cssText = `
    display: block;
    margin-bottom: 12px;
    font-size: 16px;
    color: #5c3d2e;
    font-weight: 500;
  `;

  const input = document.createElement("input");
  input.type = "text";
  input.value = defaultValue;
  input.placeholder = "";
  input.style.cssText = `
    width: 100%;
    padding: 12px 14px;
    border: 2px solid #ffe8cc;
    border-radius: 8px;
    font-size: 15px;
    box-sizing: border-box;
    margin-bottom: 20px;
    font-family: inherit;
  `;
  input.onfocus = () => (input.style.borderColor = "#ff9f1c");
  input.onblur = () => (input.style.borderColor = "#ffe8cc");

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  `;

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText = `
    padding: 12px 28px;
    border: 2px solid #ffe8cc;
    background: white;
    color: #5c3d2e;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  `;
  cancelBtn.onmouseover = () => (cancelBtn.style.background = "#fefaf5");
  cancelBtn.onmouseout = () => (cancelBtn.style.background = "white");

  const okBtn = document.createElement("button");
  okBtn.textContent = "OK";
  okBtn.style.cssText = `
    padding: 12px 32px;
    border: none;
    background: #ff9f1c;
    color: white;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  `;
  okBtn.onmouseover = () => (okBtn.style.background = "#ff8800");
  okBtn.onmouseout = () => (okBtn.style.background = "#ff9f1c");

  const closeDialog = (result: string | null) => {
    document.body.removeChild(modal);
    console.log("Custom dialog closing with result:", result);
    callback(result);
  };

  const submitValue = () => {
    const value = input.value.trim();
    closeDialog(value || null);
  };

  closeBtn.onclick = () => closeDialog(null);
  cancelBtn.onclick = () => closeDialog(null);
  okBtn.onclick = submitValue;

  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      submitValue();
    } else if (e.key === "Escape") {
      closeDialog(null);
    }
  };

  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(okBtn);

  content.appendChild(inputLabel);
  content.appendChild(input);
  content.appendChild(buttonContainer);

  dialog.appendChild(header);
  dialog.appendChild(content);

  modal.appendChild(dialog);
  document.body.appendChild(modal);

  // Prevent clicks on the dialog from closing the modal
  dialog.onclick = (e) => e.stopPropagation();

  // Close when clicking outside the dialog
  modal.onclick = () => closeDialog(null);

  // Auto-focus and select the input
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

export function registerVariablesCustomDialog() {
  if (variablesCustomDialogRegistered) return;
  variablesCustomDialogRegistered = true;

  console.log("Registering custom variables dialog");

  // Override Blockly.dialog.setPrompt with our custom dialog
  if (Blockly.dialog) {
    Blockly.dialog.setPrompt(
      (
        message: string,
        defaultValue: string,
        callback: (result: string | null) => void
      ) => {
        console.log("Custom prompt called with:", message, defaultValue);
        showCustomPrompt(message, defaultValue, callback);
      }
    );
  }
}

export function registerVariableChangeBlock() {
  if (variableChangeBlockRegistered) return;
  variableChangeBlockRegistered = true;

  // Register the "change variable by" block
  Blockly.Blocks["variables_change"] = {
    init: function () {
      this.appendValueInput("DELTA")
        .setCheck("Number")
        .appendField("change")
        .appendField(new Blockly.FieldVariable("item"), "VAR")
        .appendField("by");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(330);
      this.setTooltip("Change a variable by a specified amount");
      this.setHelpUrl("");
    },
  };

  // Python generator for variables_change
  pythonGenerator.forBlock["variables_change"] = function (block: any) {
    const varName =
      pythonGenerator.nameDB_?.getName(
        block.getFieldValue("VAR"),
        "VARIABLE"
      ) || "item";
    const delta =
      pythonGenerator.valueToCode(
        block,
        "DELTA",
        (pythonGenerator as any).ORDER_ADDITIVE || 0
      ) || "1";
    return `${varName} = ${varName} + ${delta}\n`;
  };
}

export function getVariablesCategory() {
  return {
    kind: "category",
    id: "cat_variables",
    name: "Variables",
    custom: "VARIABLE_DYNAMIC",
    expanded: true,
  };
}
