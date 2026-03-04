// Communication category blocks for Blockly toolbox
//
// This category provides advanced communication protocols:
// - I2C: Inter-Integrated Circuit (sensors, displays, etc.)
// - SPI: Serial Peripheral Interface (high-speed devices)
// - Bluetooth: Wireless communication
// - WiFi/Network: Internet connectivity
//
import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

const ICON_SIZE = 16;
function svgIcon(paths: string, viewBox = "0 0 24 24"): typeof Blockly.FieldImage {
  const uri = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${viewBox}" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
  return new (Blockly as any).FieldImage(uri, ICON_SIZE, ICON_SIZE);
}

const SETUP_SVG = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>';

let communicationBlocksRegistered = false;

export function registerCommunicationBlocks() {
  if (communicationBlocksRegistered) return;
  communicationBlocksRegistered = true;

  // ============================================================================
  // I2C BLOCKS
  // ============================================================================

  // Initialize I2C (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_i2c_init"] = {
    init: function () {
      this.appendDummyInput()
        .appendField(svgIcon(SETUP_SVG))
        .appendField("connect sensor wires");
      this.appendDummyInput()
        .appendField("    DATA:")
        .appendField(new Blockly.FieldNumber(21, 0, 40), "SDA")
        .appendField("CLOCK:")
        .appendField(new Blockly.FieldNumber(22, 0, 40), "SCL");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(270); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Connect multiple sensors using 2 wires.\n\n" +
          "Tip: Like a shared phone line:\n" +
          "   • DATA wire = Messages go here\n" +
          "   • CLOCK wire = Keeps everyone in sync\n" +
          "   • Use with temperature sensors, displays, etc."
      );
    },
  };

  pythonGenerator.forBlock["mp_i2c_init"] = function (block: any) {
    const sda = block.getFieldValue("SDA") || "21";
    const scl = block.getFieldValue("SCL") || "22";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_machine_i2c"] =
      "from machine import I2C, Pin";
    (pythonGenerator as any).definitions_["i2c_init"] =
      `i2c = I2C(0, scl=Pin(${scl}), sda=Pin(${sda}), freq=400000)`;

    return "";
  };

  // I2C Scan
  Blockly.Blocks["mp_i2c_scan"] = {
    init: function () {
      this.appendDummyInput().appendField("find connected sensors");
      this.setOutput(true, "Array");
      this.setColour(290);
      this.setTooltip(
        "Search for sensors connected to your board.\n\n" +
          "Tip: Returns a list of sensor IDs (like #60, #104)\n" +
          "   • Use this to check if sensors are connected\n" +
          "   • Each sensor has a unique ID number"
      );
    },
  };

  pythonGenerator.forBlock["mp_i2c_scan"] = function (block: any) {
    const code = "i2c.scan()";
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // I2C Write
  Blockly.Blocks["mp_i2c_write"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("send to sensor #")
        .appendField(new Blockly.FieldNumber(60, 0, 127), "ADDRESS");
      this.appendValueInput("DATA").setCheck(null).appendField("message");
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(290);
      this.setTooltip(
        "Send a message to a sensor.\n\n" +
          "Tip: Each sensor has an ID (0-127)\n" +
          "   • Common IDs: #60 (displays), #104 (gyroscope)\n" +
          "   • Use 'find connected sensors' to discover IDs"
      );
    },
  };

  pythonGenerator.forBlock["mp_i2c_write"] = function (block: any) {
    const address = block.getFieldValue("ADDRESS") || "60";
    const data =
      pythonGenerator.valueToCode(
        block,
        "DATA",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "b''";

    return `i2c.writeto(${address}, ${data})\n`;
  };

  // I2C Read
  Blockly.Blocks["mp_i2c_read"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("read from sensor #")
        .appendField(new Blockly.FieldNumber(60, 0, 127), "ADDRESS")
        .appendField("get")
        .appendField(new Blockly.FieldNumber(1, 1, 256), "LENGTH")
        .appendField("bytes");
      this.setOutput(true, "String");
      this.setColour(290);
      this.setTooltip(
        "Read data from a sensor.\n\n" +
          "Tip: Bytes = small pieces of data\n" +
          "   • 1 byte = a number or letter\n" +
          "   • Temperature sensor: usually 2 bytes"
      );
    },
  };

  pythonGenerator.forBlock["mp_i2c_read"] = function (block: any) {
    const address = block.getFieldValue("ADDRESS") || "60";
    const length = block.getFieldValue("LENGTH") || "1";

    const code = `i2c.readfrom(${address}, ${length})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // ============================================================================
  // SPI BLOCKS
  // ============================================================================

  // Initialize SPI (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_spi_init"] = {
    init: function () {
      this.appendDummyInput()
        .appendField(svgIcon(SETUP_SVG))
        .appendField("connect fast device");
      this.appendDummyInput()
        .appendField("    CLOCK:")
        .appendField(new Blockly.FieldNumber(18, 0, 40), "SCK")
        .appendField("SEND:")
        .appendField(new Blockly.FieldNumber(23, 0, 40), "MOSI")
        .appendField("RECEIVE:")
        .appendField(new Blockly.FieldNumber(19, 0, 40), "MISO");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(180); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Connect super-fast devices like SD cards or displays.\n\n" +
          "Tip: Uses 3 wires for speed:\n" +
          "   • CLOCK = Timing signal\n" +
          "   • SEND = Data going out\n" +
          "   • RECEIVE = Data coming in"
      );
    },
  };

  pythonGenerator.forBlock["mp_spi_init"] = function (block: any) {
    const sck = block.getFieldValue("SCK") || "18";
    const mosi = block.getFieldValue("MOSI") || "23";
    const miso = block.getFieldValue("MISO") || "19";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_machine_spi"] =
      "from machine import SPI, Pin";
    (pythonGenerator as any).definitions_["spi_init"] =
      `spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(${sck}), mosi=Pin(${mosi}), miso=Pin(${miso}))`;

    return "";
  };

  // SPI Write
  Blockly.Blocks["mp_spi_write"] = {
    init: function () {
      this.appendValueInput("DATA")
        .setCheck(null)
        .appendField("send fast data");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
      this.setTooltip(
        "Send data at high speed.\n\n" +
          "Tip: Use for:\n" +
          "   • Writing to SD cards\n" +
          "   • Controlling displays\n" +
          "   • Fast sensor communication"
      );
    },
  };

  pythonGenerator.forBlock["mp_spi_write"] = function (block: any) {
    const data =
      pythonGenerator.valueToCode(
        block,
        "DATA",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "b''";

    return `spi.write(${data})\n`;
  };

  // SPI Read
  Blockly.Blocks["mp_spi_read"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("receive fast data, get")
        .appendField(new Blockly.FieldNumber(1, 1, 256), "LENGTH")
        .appendField("bytes");
      this.setOutput(true, "String");
      this.setColour(200);
      this.setTooltip(
        "Read data at high speed.\n\n" +
          "Tip: Perfect for:\n" +
          "   • Reading from SD cards\n" +
          "   • Getting display info"
      );
    },
  };

  pythonGenerator.forBlock["mp_spi_read"] = function (block: any) {
    const length = block.getFieldValue("LENGTH") || "1";

    const code = `spi.read(${length})`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // ============================================================================
  // BLUETOOTH BLOCKS
  // ============================================================================

  // Initialize Bluetooth (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_bluetooth_init"] = {
    init: function () {
      this.appendDummyInput().appendField(svgIcon(SETUP_SVG)).appendField("start Bluetooth");
      this.appendDummyInput()
        .appendField("    name:")
        .appendField(new Blockly.FieldTextInput("MyDevice"), "NAME");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(210); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Turn on wireless Bluetooth.\n\n" +
          "Tip: Like making your device visible:\n" +
          "   • Choose a cool name!\n" +
          "   • Other devices can find you\n" +
          "   • Works like wireless earbuds"
      );
    },
  };

  pythonGenerator.forBlock["mp_bluetooth_init"] = function (block: any) {
    const name = block.getFieldValue("NAME") || "ESP32-BT";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_bluetooth"] =
      "import bluetooth";
    (pythonGenerator as any).definitions_["import_struct"] = "import struct";
    (pythonGenerator as any).definitions_["bluetooth_init"] = `
# Initialize Bluetooth Low Energy with GATT Server
print("Starting Bluetooth...")
ble = bluetooth.BLE()
ble.active(True)
print("BLE active:", ble.active())

# UUIDs for GATT service and characteristic
# Service UUID: Custom ESP32 service
_SERVICE_UUID = bluetooth.UUID('6E400001-B5A3-F393-E0A9-E50E24DCCA9E')
# TX Characteristic (ESP32 sends data)
_TX_UUID = bluetooth.UUID('6E400003-B5A3-F393-E0A9-E50E24DCCA9E')
# RX Characteristic (ESP32 receives data)
_RX_UUID = bluetooth.UUID('6E400002-B5A3-F393-E0A9-E50E24DCCA9E')

# Register GATT server
_TX_CHAR = (_TX_UUID, bluetooth.FLAG_NOTIFY | bluetooth.FLAG_READ,)
_RX_CHAR = (_RX_UUID, bluetooth.FLAG_WRITE,)
_SERVICE = (_SERVICE_UUID, (_TX_CHAR, _RX_CHAR,),)
((tx_handle, rx_handle,),) = ble.gatts_register_services((_SERVICE,))

# Global variables for BLE communication
ble_connected = False
ble_rx_callback = None
ble_message = ""

# BLE event handler (connection management only)
def ble_irq(event, data):
    global ble_connected, ble_message
    if event == 1:  # _IRQ_CENTRAL_CONNECT
        ble_connected = True
        print("BLE: Client connected")
    elif event == 2:  # _IRQ_CENTRAL_DISCONNECT
        ble_connected = False
        print("BLE: Client disconnected")
        # Restart advertising
        ble.gap_advertise(100000, adv_data)
    elif event == 3:  # _IRQ_GATTS_WRITE
        # Message received - only process if handler is registered
        if ble_rx_callback and data[-1] == rx_handle:
            ble_message = ble.gatts_read(rx_handle).decode('utf-8').strip()
            print("BLE received:", ble_message)
            ble_rx_callback(ble_message)

# Register interrupt handler
ble.irq(ble_irq)

# Function to send BLE notification
def ble_send(message):
    if ble_connected:
        try:
            ble.gatts_notify(0, tx_handle, message.encode('utf-8'))
            print("BLE sent:", message)
            return True
        except:
            return False
    return False

# Create advertising payload with device name
device_name = '${name}'
def create_adv_payload(name):
    payload = bytearray()
    payload.extend(b'\\x02\\x01\\x06')  # Flags
    name_bytes = name.encode('utf-8')
    payload.extend(struct.pack('B', len(name_bytes) + 1))
    payload.extend(b'\\x09')  # Complete Local Name
    payload.extend(name_bytes)
    # Add Service UUID to advertising
    payload.extend(b'\\x11\\x07')  # Length and type for 128-bit UUID
    payload.extend(bytes(reversed(_SERVICE_UUID.bytes)))
    return bytes(payload)

# Start advertising
adv_data = create_adv_payload(device_name)
ble.gap_advertise(100000, adv_data)
print("BLE Server ready! Advertising as:", device_name)
print("Service UUID:", _SERVICE_UUID)`;

    return "";
  };

  // Bluetooth Send
  Blockly.Blocks["mp_bluetooth_send"] = {
    init: function () {
      this.appendValueInput("DATA")
        .setCheck(null)
        .appendField("send wireless message");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip(
        "Send a message wirelessly via Bluetooth.\n\n" +
          "Tip: Like texting:\n" +
          "   • Send to nearby devices\n" +
          "   • No cables needed!\n" +
          "   • Works up to 30 feet away"
      );
    },
  };

  pythonGenerator.forBlock["mp_bluetooth_send"] = function (block: any) {
    const data =
      pythonGenerator.valueToCode(
        block,
        "DATA",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "''";

    return `ble_send(str(${data}))\n`;
  };

  // When BLE receives message (Event block)
  Blockly.Blocks["mp_ble_on_receive"] = {
    init: function () {
      this.appendDummyInput().appendField("when BLE receives message");
      this.appendStatementInput("DO").setCheck(null);
      this.setPreviousStatement(false);
      this.setNextStatement(false);
      this.setColour(30);
      this.setTooltip(
        "Run code when a BLE message is received.\n\n" +
          "Tip: React to commands:\n" +
          "   • Phone sends command\n" +
          "   • ESP32 responds instantly\n" +
          "   • Use 'BLE message' block to get text"
      );
    },
  };

  pythonGenerator.forBlock["mp_ble_on_receive"] = function (block: any) {
    let statements = pythonGenerator.statementToCode(block, "DO");
    if (!statements.trim()) {
      statements = "    pass\n";
    } else {
      statements = statements.replace(/^/gm, "    ");
    }

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["ble_rx_handler"] = `
# BLE receive handler
def handle_ble_message(message):
${statements}

# Register the handler
ble_rx_callback = handle_ble_message`;

    return "";
  };

  // BLE received message variable
  Blockly.Blocks["mp_ble_message"] = {
    init: function () {
      this.appendDummyInput().appendField("BLE message");
      this.setOutput(true, "String");
      this.setColour(30);
      this.setTooltip(
        "Get the text of the received BLE message.\n\n" +
          "Tip: Use inside 'when BLE receives' block:\n" +
          "   • Get command from phone\n" +
          "   • Check message contents\n" +
          "   • Respond accordingly"
      );
    },
  };

  pythonGenerator.forBlock["mp_ble_message"] = function (block: any) {
    return ["ble_message", (pythonGenerator as any).ORDER_ATOMIC || 0];
  };

  // Bluetooth Available (renamed for clarity)
  Blockly.Blocks["mp_bluetooth_available"] = {
    init: function () {
      this.appendDummyInput().appendField("BLE client connected?");
      this.setOutput(true, "Boolean");
      this.setColour(230);
      this.setTooltip(
        "Check if a BLE client is connected.\n\n" +
          "Tip: Returns true or false:\n" +
          "   • true = Device connected\n" +
          "   • false = No connection"
      );
    },
  };

  pythonGenerator.forBlock["mp_bluetooth_available"] = function (block: any) {
    const code = "ble_connected";
    return [code, (pythonGenerator as any).ORDER_ATOMIC || 0];
  };

  // ============================================================================
  // WIFI/NETWORK BLOCKS
  // ============================================================================

  // Connect to WiFi
  Blockly.Blocks["mp_wifi_connect"] = {
    init: function () {
      this.appendDummyInput().appendField("join WiFi network");
      this.appendValueInput("SSID").setCheck("String").appendField("name");
      this.appendValueInput("PASSWORD")
        .setCheck("String")
        .appendField("password");
      this.setInputsInline(false);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(120);
      this.setTooltip(
        "Connect to the internet via WiFi.\n\n" +
          "Tip: Like connecting your phone:\n" +
          "   • Network name = Your WiFi's name\n" +
          "   • Password = Your WiFi password\n" +
          "   • Takes a few seconds to connect"
      );
    },
  };

  pythonGenerator.forBlock["mp_wifi_connect"] = function (block: any) {
    const ssid =
      pythonGenerator.valueToCode(
        block,
        "SSID",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "''";
    const password =
      pythonGenerator.valueToCode(
        block,
        "PASSWORD",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "''";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_network"] = "import network";
    (pythonGenerator as any).definitions_["wifi_init"] =
      "wlan = network.WLAN(network.STA_IF)\nwlan.active(True)";

    return `wlan.connect(${ssid}, ${password})\n`;
  };

  // WiFi Disconnect
  Blockly.Blocks["mp_wifi_disconnect"] = {
    init: function () {
      this.appendDummyInput().appendField("leave WiFi network");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(120);
      this.setTooltip(
        "Disconnect from WiFi.\n\n" +
          "Tip: Turns off internet connection\n" +
          "   • Saves battery power\n" +
          "   • Use when you don't need internet"
      );
    },
  };

  pythonGenerator.forBlock["mp_wifi_disconnect"] = function (block: any) {
    return "wlan.disconnect()\n";
  };

  // WiFi Connected
  Blockly.Blocks["mp_wifi_connected"] = {
    init: function () {
      this.appendDummyInput().appendField("WiFi is connected?");
      this.setOutput(true, "Boolean");
      this.setColour(120);
      this.setTooltip(
        "Check if you're connected to internet.\n\n" +
          "Tip: Returns true or false:\n" +
          "   • true = Online and ready!\n" +
          "   • false = Not connected yet"
      );
    },
  };

  pythonGenerator.forBlock["mp_wifi_connected"] = function (block: any) {
    const code = "wlan.isconnected()";
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Get IP Address
  Blockly.Blocks["mp_wifi_ip"] = {
    init: function () {
      this.appendDummyInput().appendField("my internet address");
      this.setOutput(true, "String");
      this.setColour(120);
      this.setTooltip(
        "Get your device's internet address (IP).\n\n" +
          "Tip: Like a phone number for devices:\n" +
          "   • Format: 192.168.1.100\n" +
          "   • Unique on your network\n" +
          "   • Use for finding your device"
      );
    },
  };

  pythonGenerator.forBlock["mp_wifi_ip"] = function (block: any) {
    const code = "wlan.ifconfig()[0]";
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // HTTP GET Request
  Blockly.Blocks["mp_http_get"] = {
    init: function () {
      this.appendValueInput("URL")
        .setCheck("String")
        .appendField("get data from website");
      this.setOutput(true, "String");
      this.setColour(120);
      this.setTooltip(
        "Fetch information from a website.\n\n" +
          "Tip: Like opening a webpage:\n" +
          "   • Returns text/data from the site\n" +
          "   • Perfect for weather, news, APIs\n" +
          "   • Example: Get temperature from weather site"
      );
    },
  };

  pythonGenerator.forBlock["mp_http_get"] = function (block: any) {
    const url =
      pythonGenerator.valueToCode(
        block,
        "URL",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "''";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_urequests"] =
      "import urequests";

    const code = `urequests.get(${url}).text`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // HTTP POST Request
  Blockly.Blocks["mp_http_post"] = {
    init: function () {
      this.appendValueInput("URL")
        .setCheck("String")
        .appendField("send data to website");
      this.appendValueInput("DATA").setCheck("String").appendField("data");
      this.setInputsInline(false);
      this.setOutput(true, "String");
      this.setColour(120);
      this.setTooltip(
        "Upload information to a website.\n\n" +
          "Tip: Like submitting a form:\n" +
          "   • Send sensor readings\n" +
          "   • Log temperature data\n" +
          "   • Upload to cloud services"
      );
    },
  };

  pythonGenerator.forBlock["mp_http_post"] = function (block: any) {
    const url =
      pythonGenerator.valueToCode(
        block,
        "URL",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "''";
    const data =
      pythonGenerator.valueToCode(
        block,
        "DATA",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "''";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_urequests"] =
      "import urequests";

    const code = `urequests.post(${url}, data=${data}).text`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };
}

export function getCommunicationCategory() {
  return {
    kind: "category",
    id: "cat_communication",
    name: "Communication",
    colour: "#16a085",
    contents: [
      // === I2C Communication ===
      {
        kind: "label",
        text: "I2C (Connect Sensors - 2 wires)",
        "web-class": "comm-section-label",
      },
      { kind: "block", type: "mp_i2c_init" },
      { kind: "block", type: "mp_i2c_scan" },
      {
        kind: "block",
        type: "mp_i2c_write",
        inputs: {
          DATA: { shadow: { type: "text", fields: { TEXT: "hello" } } },
        },
      },
      { kind: "block", type: "mp_i2c_read" },

      // === SPI Communication ===
      {
        kind: "label",
        text: "SPI (Fast Devices - 3+ wires)",
        "web-class": "comm-section-label",
      },
      { kind: "block", type: "mp_spi_init" },
      {
        kind: "block",
        type: "mp_spi_write",
        inputs: {
          DATA: { shadow: { type: "text", fields: { TEXT: "data" } } },
        },
      },
      { kind: "block", type: "mp_spi_read" },

      // === Bluetooth Communication ===
      {
        kind: "label",
        text: "Bluetooth (Wireless - No cables!)",
        "web-class": "comm-section-label",
      },
      { kind: "block", type: "mp_bluetooth_init" },
      { kind: "block", type: "mp_ble_on_receive" },
      { kind: "block", type: "mp_ble_message" },
      {
        kind: "block",
        type: "mp_bluetooth_send",
        inputs: {
          DATA: { shadow: { type: "text", fields: { TEXT: "hello" } } },
        },
      },
      { kind: "block", type: "mp_bluetooth_available" },

      // === WiFi/Internet ===
      {
        kind: "label",
        text: "WiFi & Internet",
        "web-class": "comm-section-label",
      },
      {
        kind: "block",
        type: "mp_wifi_connect",
        inputs: {
          SSID: { shadow: { type: "text", fields: { TEXT: "MyWiFi" } } },
          PASSWORD: { shadow: { type: "text", fields: { TEXT: "password" } } },
        },
      },
      { kind: "block", type: "mp_wifi_disconnect" },
      { kind: "block", type: "mp_wifi_connected" },
      { kind: "block", type: "mp_wifi_ip" },
      {
        kind: "block",
        type: "mp_http_get",
        inputs: {
          URL: {
            shadow: { type: "text", fields: { TEXT: "http://example.com" } },
          },
        },
      },
      {
        kind: "block",
        type: "mp_http_post",
        inputs: {
          URL: {
            shadow: {
              type: "text",
              fields: { TEXT: "http://example.com/api" },
            },
          },
          DATA: { shadow: { type: "text", fields: { TEXT: "{}" } } },
        },
      },
    ],
  };
}
