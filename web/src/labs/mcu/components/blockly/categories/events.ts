import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";
const PY: any = pythonGenerator as any;

let timerCount = 0;

export function resetTimerCount() {
  timerCount = 0;
}

let eventsBlocksRegistered = false;

export let getCurrentInterruptPinPairs: () => [string, string][] = () => [
  ["GPIO 2", "2"],
];
export let getCurrentAnalogPinPairs: () => [string, string][] = () => [
  ["GPIO 34", "34"],
];
export let getCurrentTouchPinPairs: () => [string, string][] = () => [
  ["T0 (GPIO 4)", "4"],
];

export function setGetCurrentInterruptPinPairs(fn: () => [string, string][]) {
  getCurrentInterruptPinPairs = fn;
}

export function setGetCurrentAnalogPinPairs(fn: () => [string, string][]) {
  getCurrentAnalogPinPairs = fn;
}

export function setGetCurrentTouchPinPairs(fn: () => [string, string][]) {
  getCurrentTouchPinPairs = fn;
}

export function registerEventsBlocks() {
  if (eventsBlocksRegistered) return;
  eventsBlocksRegistered = true;

  Blockly.Blocks["mp_event_program_start"] = {
    init: function () {
      this.appendDummyInput().appendField("when program starts");
      this.appendStatementInput("DO").setCheck(null);
      this.setColour(30);
      this.setTooltip("Run code once when the program starts");
      this.setHelpUrl("");
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  pythonGenerator.forBlock["mp_event_program_start"] = function (block: any) {
    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "pass\n";
    }

    statements = statements.replace(/^  /gm, "");
    return `# === Program Start (runs once) ===\n${statements}\n`;
  };

  Blockly.Blocks["mp_event_button_pressed"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("when button")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentInterruptPinPairs()),
          "PIN"
        )
        .appendField("pressed");
      this.appendStatementInput("DO").setCheck(null);
      this.setColour(30);
      this.setTooltip(
        "Run code when a button is pressed (uses hardware interrupt)"
      );
      this.setHelpUrl("");
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  pythonGenerator.forBlock["mp_event_button_pressed"] = function (block: any) {
    PY.definitions_["import_machine_pin"] = "from machine import Pin";
    PY.definitions_["import_time"] = "import time";

    const pin = block.getFieldValue("PIN") || "2";
    const handlerName = `button_${pin}_handler`;

    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }

    // Define the handler function in definitions section
    PY.definitions_[`handler_${handlerName}`] = `
def ${handlerName}(pin):
${statements}`;

    // Define the pin and attach interrupt in setup section
    PY.definitions_[`setup_button_${pin}`] = `
button_${pin} = Pin(${pin}, Pin.IN, Pin.PULL_UP)
button_${pin}.irq(trigger=Pin.IRQ_FALLING, handler=${handlerName})`;

    return ""; // Event blocks don't generate inline code
  };

  Blockly.Blocks["mp_event_pin_change"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("when pin")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentInterruptPinPairs()),
          "PIN"
        )
        .appendField("goes")
        .appendField(
          new Blockly.FieldDropdown([
            ["HIGH", "HIGH"],
            ["LOW", "LOW"],
          ]),
          "STATE"
        );
      this.appendStatementInput("DO").setCheck(null);
      this.setColour(30);
      this.setTooltip(
        "Run code when a pin changes state (uses hardware interrupt)"
      );
      this.setHelpUrl("");
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  pythonGenerator.forBlock["mp_event_pin_change"] = function (block: any) {
    PY.definitions_["import_machine_pin"] = "from machine import Pin";

    const pin = block.getFieldValue("PIN") || "2";
    const state = block.getFieldValue("STATE") || "HIGH";
    const trigger = state === "HIGH" ? "Pin.IRQ_RISING" : "Pin.IRQ_FALLING";
    const handlerName = `pin_${pin}_${state.toLowerCase()}_handler`;

    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }

    // Define the handler function
    PY.definitions_[`handler_${handlerName}`] = `
def ${handlerName}(pin):
${statements}`;

    // Define the pin and attach interrupt
    PY.definitions_[`setup_pin_${pin}_${state.toLowerCase()}`] = `
pin_${pin}_event = Pin(${pin}, Pin.IN)
pin_${pin}_event.irq(trigger=${trigger}, handler=${handlerName})`;

    return ""; // Event blocks don't generate inline code
  };

  // Every N milliseconds
  Blockly.Blocks["mp_event_every_ms"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("every")
        .appendField(new Blockly.FieldNumber(1000, 1), "MS")
        .appendField("milliseconds");
      this.appendStatementInput("DO").setCheck(null);
      this.setColour(30);
      this.setTooltip("Run code repeatedly at a fixed interval (milliseconds)");
      this.setHelpUrl("");
      // Hat block - flat top like micro:bit
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  pythonGenerator.forBlock["mp_event_every_ms"] = function (block: any) {
    PY.definitions_["import_machine_timer"] = "from machine import Timer";

    const ms = block.getFieldValue("MS") || "1000";
    // Generate a unique ID for this timer
    const uniqueId = Math.floor(Math.random() * 10000);
    const timerId = `timer_${uniqueId}`;
    const handlerName = `timer_${uniqueId}_callback`;

    // Use valid ESP32 timer ID (0-3)
    const timerNum = timerCount % 4;
    timerCount++;

    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }

    // Define the callback function
    PY.definitions_[`handler_${timerId}`] = `
def ${handlerName}(t):
${statements}`;

    // Initialize the timer with a valid timer ID (0-3 for ESP32)
    PY.definitions_[`setup_${timerId}`] = `
${timerId} = Timer(${timerNum})
${timerId}.init(period=${ms}, mode=Timer.PERIODIC, callback=${handlerName})`;

    return ""; // Event blocks don't generate inline code
  };

  // Every N seconds
  Blockly.Blocks["mp_event_every_sec"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("every")
        .appendField(new Blockly.FieldNumber(1, 0.1), "SEC")
        .appendField("seconds");
      this.appendStatementInput("DO").setCheck(null);
      this.setColour(30);
      this.setTooltip("Run code repeatedly at a fixed interval (seconds)");
      this.setHelpUrl("");
      // Hat block - flat top like micro:bit
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  pythonGenerator.forBlock["mp_event_every_sec"] = function (block: any) {
    PY.definitions_["import_machine_timer"] = "from machine import Timer";

    const sec = block.getFieldValue("SEC") || "1";
    const ms = Math.round(parseFloat(sec) * 1000);
    // Generate a unique ID for this timer
    const uniqueId = Math.floor(Math.random() * 10000);
    const timerId = `timer_${uniqueId}`;
    const handlerName = `timer_${uniqueId}_callback`;

    // Use valid ESP32 timer ID (0-3)
    const timerNum = timerCount % 4;
    timerCount++;

    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }

    // Define the callback function
    PY.definitions_[`handler_${timerId}`] = `
def ${handlerName}(t):
${statements}`;

    // Initialize the timer with a valid timer ID (0-3 for ESP32)
    PY.definitions_[`setup_${timerId}`] = `
${timerId} = Timer(${timerNum})
${timerId}.init(period=${ms}, mode=Timer.PERIODIC, callback=${handlerName})`;

    return ""; // Event blocks don't generate inline code
  };

  // When message received (for event-driven communication)
  Blockly.Blocks["mp_event_message_received"] = {
    init: function () {
      this.appendDummyInput().appendField("when message received");
      this.appendStatementInput("DO").setCheck(null);
      this.setColour(30);
      this.setTooltip(
        "Run code when any message is received from serial. Use the 'message' block to access the message content."
      );
      this.setHelpUrl("");
      // Hat block - flat top like micro:bit
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  // Message variable block (only works inside message received blocks)
  Blockly.Blocks["mp_event_message_variable"] = {
    init: function () {
      this.appendDummyInput().appendField("message");
      this.setOutput(true, "String");
      this.setColour(30);
      this.setTooltip(
        "The content of the received message (only available in 'when any message received' blocks)"
      );
      this.setHelpUrl("");
    },
  };

  pythonGenerator.forBlock["mp_event_message_variable"] = function (
    block: any
  ) {
    // ORDER_ATOMIC is not exported in typings; cast to any for correct precedence
    return ["received_message", (pythonGenerator as any).ORDER_ATOMIC];
  };

  pythonGenerator.forBlock["mp_event_message_received"] = function (
    block: any
  ) {
    PY.definitions_["import_sys"] = "import sys";
    PY.definitions_["import_select"] = "import select";
    PY.definitions_["import_time"] = "import time";

    const blockId = block.id.replace(/[^a-zA-Z0-9]/g, "_");
    const handlerName = `on_any_message_${blockId}`;

    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "            ");
    }

    // Define the message handler function with 'received_message' parameter
    PY.definitions_[`handler_${handlerName}`] = `
def ${handlerName}(received_message):
${statements}`;

    // Define the handlers list and buffer globally if not exists
    if (!PY.definitions_[`global_message_handlers`]) {
      PY.definitions_[`global_message_handlers`] = `
# Global list of message handlers
message_handlers = []
# Buffer for incoming serial data
serial_buffer = bytearray()`;
    }

    // Register this handler
    PY.definitions_[`register_handler_${blockId}`] = `
message_handlers.append(${handlerName})`;

    // Define the serial interrupt handler (only once)
    // Note: This uses select polling instead of hardware UART interrupt
    // because UART 0 (USB serial) is used by MicroPython REPL
    if (!PY.definitions_[`serial_interrupt_handler`]) {
      PY.definitions_[`serial_interrupt_handler`] = `
def check_serial_messages():
    """Check for incoming serial messages in main loop"""
    global serial_buffer
    poll = select.poll()
    poll.register(sys.stdin, select.POLLIN)
    
    if poll.poll(0):  # Non-blocking check
        try:
            # Read available bytes
            while sys.stdin in select.select([sys.stdin], [], [], 0)[0]:
                char = sys.stdin.read(1)
                if char:
                    if char == '\\n' or char == '\\r':
                        if serial_buffer:
                            message = serial_buffer.decode().strip()
                            if message:
                                for handler in message_handlers:
                                    handler(message)
                            serial_buffer = bytearray()
                    else:
                        serial_buffer.extend(char.encode())
                else:
                    break
        except:
            pass`;
    }

    return ""; // Event blocks don't generate inline code
  };

  // Broadcast message (to trigger message events)
  Blockly.Blocks["mp_event_broadcast"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("broadcast")
        .appendField(new Blockly.FieldTextInput("start"), "MESSAGE");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(30);
      this.setTooltip("Send a message via serial");
      this.setHelpUrl("");
    },
  };

  pythonGenerator.forBlock["mp_event_broadcast"] = function (block: any) {
    const message = block.getFieldValue("MESSAGE") || "start";
    return `print('${message}')\n`;
  };

  // When touch pressed (ESP32 capacitive touch)
  Blockly.Blocks["mp_event_touch_pressed"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("when touch")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentTouchPinPairs()),
          "PIN"
        )
        .appendField("pressed");
      this.appendStatementInput("DO").setCheck(null);
      this.setColour(30);
      this.setTooltip(
        "Run code when a touch pin is touched (capacitive touch-enabled pins only)"
      );
      this.setHelpUrl("");
      // Hat block - flat top like micro:bit
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  pythonGenerator.forBlock["mp_event_touch_pressed"] = function (block: any) {
    PY.definitions_["import_machine_pin"] = "from machine import Pin";
    PY.definitions_["import_machine_touch"] = "from machine import TouchPad";
    PY.definitions_["import_time"] = "import time";
    PY.definitions_["import_thread"] = "import _thread";

    const pin = block.getFieldValue("PIN") || "4";
    const handlerName = `touch_${pin}_handler`;
    const threadName = `touch_${pin}_monitor`;

    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "        ");
    }

    // Define the handler function
    PY.definitions_[`handler_${handlerName}`] = `
def ${handlerName}():
${statements}`;

    // Define the monitoring thread
    PY.definitions_[`thread_${threadName}`] = `
def ${threadName}():
    touch_${pin} = TouchPad(Pin(${pin}))
    threshold = touch_${pin}.read() // 2  # Set threshold to half of untouched value
    last_state = False
    while True:
        value = touch_${pin}.read()
        is_touched = value < threshold
        if is_touched and not last_state:
            ${handlerName}()
        last_state = is_touched
        time.sleep_ms(50)`;

    // Start the monitoring thread
    PY.definitions_[`setup_${threadName}`] = `
_thread.start_new_thread(${threadName}, ())`;

    return ""; // Event blocks don't generate inline code
  };

  // When voltage above/below threshold
  Blockly.Blocks["mp_event_analog_threshold"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("when voltage on")
        .appendField(
          new Blockly.FieldDropdown(() => getCurrentAnalogPinPairs()),
          "PIN"
        )
        .appendField(
          new Blockly.FieldDropdown([
            ["above", "ABOVE"],
            ["below", "BELOW"],
          ]),
          "COMPARISON"
        )
        .appendField(new Blockly.FieldNumber(1.65, 0, 3.3, 0.01), "THRESHOLD")
        .appendField("V");
      this.appendStatementInput("DO").setCheck(null);
      this.setColour(30);
      this.setTooltip(
        "Run code when voltage crosses a threshold (0-3.3V).\n\n" +
          "Tip: Useful for detecting:\n" +
          "   • Battery low (below 2.5V)\n" +
          "   • Sensor triggered (above 2.0V)\n" +
          "   • Light level changes"
      );
      this.setHelpUrl("");
      // Hat block - flat top like micro:bit
      this.setPreviousStatement(false);
      this.setNextStatement(false);
    },
  };

  pythonGenerator.forBlock["mp_event_analog_threshold"] = function (
    block: any
  ) {
    PY.definitions_["import_machine_pin"] = "from machine import Pin";
    PY.definitions_["import_machine_adc"] = "from machine import ADC";
    PY.definitions_["import_time"] = "import time";
    PY.definitions_["import_thread"] = "import _thread";

    const pin = block.getFieldValue("PIN") || "34";
    const comparison = block.getFieldValue("COMPARISON") || "ABOVE";
    const voltage = block.getFieldValue("THRESHOLD") || "1.65";
    const handlerName = `voltage_${pin}_${comparison.toLowerCase()}_handler`;
    const threadName = `voltage_${pin}_${comparison.toLowerCase()}_monitor`;

    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "        ");
    }

    // Define the handler function
    PY.definitions_[`handler_${handlerName}`] = `
def ${handlerName}(voltage_value):
${statements}`;

    // Define the monitoring thread that reads voltage
    const conditionCheck =
      comparison === "ABOVE" ? `voltage > ${voltage}` : `voltage < ${voltage}`;

    PY.definitions_[`thread_${threadName}`] = `
def ${threadName}():
    adc_${pin} = ADC(Pin(${pin}))
    adc_${pin}.atten(ADC.ATTN_11DB)  # Full range: 0-3.3V
    last_state = False
    while True:
        raw = adc_${pin}.read()
        voltage = round(raw / 4095 * 3.3, 2)  # Convert to voltage
        condition_met = ${conditionCheck}
        if condition_met and not last_state:
            ${handlerName}(voltage)
        last_state = condition_met
        time.sleep_ms(100)`;

    // Start the monitoring thread
    PY.definitions_[`setup_${threadName}`] = `
_thread.start_new_thread(${threadName}, ())`;

    return ""; // Event blocks don't generate inline code
  };
}

export function getEventsCategory() {
  return {
    kind: "category",
    id: "cat_events",
    name: "Events",
    expanded: false,
    contents: [
      { kind: "label", text: "Digital Triggers" },
      {
        kind: "block",
        type: "mp_event_button_pressed",
      },
      {
        kind: "block",
        type: "mp_event_pin_change",
      },
      { kind: "label", text: "Analog Triggers" },
      {
        kind: "block",
        type: "mp_event_analog_threshold",
      },
      {
        kind: "block",
        type: "mp_event_touch_pressed",
      },
      { kind: "label", text: "Timing" },
      {
        kind: "block",
        type: "mp_event_every_ms",
      },
      {
        kind: "block",
        type: "mp_event_every_sec",
      },
      { kind: "label", text: "Messages" },
      {
        kind: "block",
        type: "mp_event_message_received",
      },
      {
        kind: "block",
        type: "mp_event_message_variable",
      },
      {
        kind: "block",
        type: "mp_event_broadcast",
      },
    ],
  };
}
