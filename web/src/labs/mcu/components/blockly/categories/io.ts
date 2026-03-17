// IO category blocks for Blockly toolbox
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

let ioBlocksRegistered = false;

// This will be set by the main editor to provide current pin configuration
export let getCurrentPinPairs: () => [string, string][] = () => [];

export function setGetCurrentPinPairs(fn: () => [string, string][]) {
  getCurrentPinPairs = fn;
}

export function registerIOBlocks() {
  if (ioBlocksRegistered) return;
  ioBlocksRegistered = true;

  // mp_pin_write: Write digital value to a GPIO pin
  Blockly.Blocks["mp_pin_write"] = {
    init: function init() {
      this.appendDummyInput()
        .appendField("pin")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentPinPairs()),
          "PIN"
        )
        .appendField("state")
        .appendField(
          new Blockly.FieldDropdown([
            ["HIGH", "1"],
            ["LOW", "0"],
          ]),
          "STATE"
        );
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(160);
      this.setTooltip("Write a digital value to a GPIO pin");
    },
  };

  pythonGenerator.forBlock["mp_pin_write"] = function (block: Blockly.Block) {
    const pinNum = Number(block.getFieldValue("PIN"));
    const state = block.getFieldValue("STATE") === "1" ? 1 : 0;
    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_machine_pin"] =
      "from machine import Pin";
    return `Pin(${pinNum}, Pin.OUT).value(${state})\n`;
  };

  // mp_pin_toggle: Toggle digital pin state
  Blockly.Blocks["mp_pin_toggle"] = {
    init: function init() {
      this.appendDummyInput()
        .appendField("toggle pin")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentPinPairs()),
          "PIN"
        );
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(160);
      this.setTooltip("Toggle a GPIO pin (flip between HIGH and LOW)");
    },
  };

  pythonGenerator.forBlock["mp_pin_toggle"] = function (block: Blockly.Block) {
    const pinNum = Number(block.getFieldValue("PIN"));
    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_machine_pin"] =
      "from machine import Pin";
    // Generate code to toggle the pin
    return `_pin_${pinNum} = Pin(${pinNum}, Pin.OUT)\n_pin_${pinNum}.value(not _pin_${pinNum}.value())\n`;
  };

  // mp_pin_read: Read digital value from a GPIO pin
  Blockly.Blocks["mp_pin_read"] = {
    init: function init() {
      this.appendDummyInput()
        .appendField("read pin")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentPinPairs()),
          "PIN"
        )
        .appendField("pull")
        .appendField(
          new Blockly.FieldDropdown([
            ["none", "NONE"],
            ["pull-up", "PULL_UP"],
            ["pull-down", "PULL_DOWN"],
          ]),
          "PULL"
        );
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Read a digital value from a GPIO pin");
    },
  };

  pythonGenerator.forBlock["mp_pin_read"] = function (block: any) {
    const pinNum = Number(block.getFieldValue("PIN"));
    const pull = block.getFieldValue("PULL");
    const pullArg =
      pull === "PULL_UP"
        ? ", Pin.PULL_UP"
        : pull === "PULL_DOWN"
          ? ", Pin.PULL_DOWN"
          : "";
    // Ensure 'from machine import Pin' is emitted once at the top
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_machine_pin"] =
      "from machine import Pin";
    const code = `bool(Pin(${pinNum}, Pin.IN${pullArg}).value())`;
    return [code, (pythonGenerator as any).ORDER_ATOMIC || 0];
  };

  // mp_level: Digital level constant (HIGH/LOW)
  Blockly.Blocks["mp_level"] = {
    init: function init() {
      this.appendDummyInput()
        .appendField("level")
        .appendField(
          new Blockly.FieldDropdown([
            ["HIGH", "1"],
            ["LOW", "0"],
          ]),
          "LEVEL"
        );
      this.setOutput(true, "Number");
      this.setColour(20);
      this.setTooltip("Digital level constant (1 or 0)");
    },
  };

  pythonGenerator.forBlock["mp_level"] = function (block: any) {
    const value = block.getFieldValue("LEVEL") === "1" ? "1" : "0";
    return [value, (pythonGenerator as any).ORDER_ATOMIC || 0];
  };

  // mp_analog_read: Read voltage from a pin (ADC)
  Blockly.Blocks["mp_analog_read"] = {
    init: function init() {
      this.appendDummyInput()
        .appendField("read voltage on")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentPinPairs()),
          "PIN"
        );
      this.setOutput(true, "Number");
      this.setColour(160);
      this.setTooltip(
        "Read voltage (0-3.3V) from an analog pin.\n\n" +
          "Tip: Voltage is like electrical 'pressure':\n" +
          "   • 0V = No electricity\n" +
          "   • 3.3V = Maximum for ESP32\n" +
          "   • Use with sensors, batteries, potentiometers"
      );
    },
  };

  pythonGenerator.forBlock["mp_analog_read"] = function (block: any) {
    const pinNum = Number(block.getFieldValue("PIN"));
    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_machine_adc"] =
      "from machine import ADC, Pin";

    // Add helper function to convert ADC reading to voltage
    (pythonGenerator as any).definitions_["adc_to_voltage"] = `
def adc_to_voltage(pin_num):
    """Convert ADC reading to voltage (0-3.3V)"""
    adc = ADC(Pin(pin_num))
    adc.atten(ADC.ATTN_11DB)  # Full range 0-3.3V
    raw = adc.read()
    return round(raw / 4095 * 3.3, 2)`;

    const code = `adc_to_voltage(${pinNum})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // mp_analog_write: Set power level on a pin (PWM)
  Blockly.Blocks["mp_analog_write"] = {
    init: function init() {
      this.appendDummyInput()
        .appendField("set")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentPinPairs()),
          "PIN"
        )
        .appendField("power to");
      this.appendValueInput("VALUE").setCheck("Number");
      this.appendDummyInput().appendField("%");
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(160);
      this.setTooltip(
        "Set pin power level (0-100%).\n\n" +
          "Tip: Power percentage controls:\n" +
          "   • 0% = Off (no power)\n" +
          "   • 50% = Half power\n" +
          "   • 100% = Full power\n" +
          "   • Use for LED brightness, motor speed, etc."
      );
    },
  };

  pythonGenerator.forBlock["mp_analog_write"] = function (block: any) {
    const pinNum = Number(block.getFieldValue("PIN"));
    const value =
      pythonGenerator.valueToCode(
        block,
        "VALUE",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "50";
    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_machine_pwm"] =
      "from machine import PWM, Pin";

    // Convert percentage (0-100) to duty cycle (0-1023)
    return `PWM(Pin(${pinNum})).duty(int(${value} / 100 * 1023))\n`;
  };

  // mp_serial_println: Print line to serial
  Blockly.Blocks["mp_serial_println"] = {
    init: function init() {
      this.appendValueInput("TEXT").setCheck(null).appendField("serial print");
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(160);
      this.setTooltip("Print a line to the serial port");
    },
  };

  pythonGenerator.forBlock["mp_serial_println"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || '""';
    return `print(${text})\n`;
  };

  // mp_serial_read: Read from serial
  Blockly.Blocks["mp_serial_read"] = {
    init: function init() {
      this.appendDummyInput().appendField("serial read line");
      this.setOutput(true, "String");
      this.setColour(160);
      this.setTooltip("Read a line from the serial port");
    },
  };

  pythonGenerator.forBlock["mp_serial_read"] = function (block: any) {
    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_sys"] = "import sys";
    const code = `sys.stdin.readline().strip()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // mp_serial_available: Check if serial data is available
  Blockly.Blocks["mp_serial_available"] = {
    init: function init() {
      this.appendDummyInput().appendField("serial available");
      this.setOutput(true, "Boolean");
      this.setColour(160);
      this.setTooltip("Check if data is available to read from serial");
    },
  };

  pythonGenerator.forBlock["mp_serial_available"] = function (block: any) {
    // Add import to definitions
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_select"] = "import select";
    (pythonGenerator as any).definitions_["import_sys"] = "import sys";
    const code = `select.select([sys.stdin], [], [], 0)[0]`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };
}

export function getIOCategory(boardLabel: string) {
  return {
    kind: "category",
    id: "cat_io",
    name: "Input/Output",
    expanded: true,
    contents: [
      { kind: "label", text: "Digital I/O" },
      { kind: "block", type: "mp_pin_write" },
      { kind: "block", type: "mp_pin_toggle" },
      { kind: "block", type: "mp_pin_read" },
      { kind: "block", type: "mp_level" },

      { kind: "label", text: "Analog I/O" },
      { kind: "block", type: "mp_analog_read" },
      {
        kind: "block",
        type: "mp_analog_write",
        inputs: {
          VALUE: { shadow: { type: "math_number", fields: { NUM: 50 } } },
        },
      },

      { kind: "label", text: "Serial" },
      {
        kind: "block",
        type: "mp_serial_println",
        inputs: {
          TEXT: { shadow: { type: "text", fields: { TEXT: "hello" } } },
        },
      },
      { kind: "block", type: "mp_serial_read" },
      { kind: "block", type: "mp_serial_available" },
    ],
  };
}
