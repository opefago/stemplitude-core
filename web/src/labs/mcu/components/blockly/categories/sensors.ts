// Sensors category blocks for Blockly toolbox
//
// This category provides blocks for common sensors and displays:
// - LCD Displays
// - Rotary Encoders
// - IR Sensors
// - Temperature & Humidity Sensors (DHT11/DHT22)
// - Temperature Sensors (DS18B20)
// - Ultrasonic Distance Sensors (HC-SR04)
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
const LCD_SVG = '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>';
const GEAR_SVG = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z"/>';
const THERMO_SVG = '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>';
const RULER_SVG = '<path d="M1 3h22v18H1z" fill="none"/><line x1="4" y1="3" x2="4" y2="9"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="12" y1="3" x2="12" y2="9"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="20" y1="3" x2="20" y2="9"/>';

let sensorsBlocksRegistered = false;

export function registerSensorsBlocks() {
  if (sensorsBlocksRegistered) return;
  sensorsBlocksRegistered = true;

  // ============================================================================
  // LCD DISPLAY BLOCKS
  // ============================================================================

  // Initialize LCD Display (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_lcd_init"] = {
    init: function () {
      this.appendDummyInput().appendField(svgIcon(SETUP_SVG)).appendField("setup LCD screen");
      this.appendDummyInput()
        .appendField("    rows:")
        .appendField(new Blockly.FieldNumber(2, 1, 4), "ROWS")
        .appendField("columns:")
        .appendField(new Blockly.FieldNumber(16, 8, 20), "COLS");
      this.appendDummyInput()
        .appendField("    DATA:")
        .appendField(new Blockly.FieldNumber(21, 0, 40), "SDA")
        .appendField("CLOCK:")
        .appendField(new Blockly.FieldNumber(22, 0, 40), "SCL");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(180); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Setup an LCD screen to show messages.\n\n" +
          "Tip: Like a tiny computer screen:\n" +
          "   • 2 rows = 2 lines of text\n" +
          "   • 16 columns = 16 letters per line\n" +
          "   • Connect using DATA and CLOCK wires"
      );
    },
  };

  pythonGenerator.forBlock["mp_lcd_init"] = function (block: any) {
    const rows = block.getFieldValue("ROWS") || "2";
    const cols = block.getFieldValue("COLS") || "16";
    const sda = block.getFieldValue("SDA") || "21";
    const scl = block.getFieldValue("SCL") || "22";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_lcd"] =
      "from machine import I2C, Pin\nfrom esp8266_i2c_lcd import I2cLcd";
    (pythonGenerator as any).definitions_["lcd_init"] =
      `i2c_lcd = I2C(0, scl=Pin(${scl}), sda=Pin(${sda}), freq=400000)\nlcd = I2cLcd(i2c_lcd, 0x27, ${rows}, ${cols})`;

    return "";
  };

  // LCD Print
  Blockly.Blocks["mp_lcd_print"] = {
    init: function () {
      this.appendValueInput("TEXT")
        .setCheck(null)
        .appendField("show on LCD screen");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
      this.setTooltip(
        "Display a message on the LCD screen.\n\n" +
          "Tip: Show text, numbers, or sensor readings!"
      );
    },
  };

  pythonGenerator.forBlock["mp_lcd_print"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "''";

    return `lcd.putstr(str(${text}))\n`;
  };

  // LCD Clear
  Blockly.Blocks["mp_lcd_clear"] = {
    init: function () {
      this.appendDummyInput().appendField("clear LCD screen");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
      this.setTooltip("Erase everything from the LCD screen.");
    },
  };

  pythonGenerator.forBlock["mp_lcd_clear"] = function (block: any) {
    return "lcd.clear()\n";
  };

  // ============================================================================
  // LCD DISPLAY BLOCKS - SIMPLE MODE (Auto-initialization)
  // ============================================================================

  // Simple LCD Print (auto-init with collapsible config)
  Blockly.Blocks["mp_lcd_print_simple"] = {
    init: function () {
      this.appendValueInput("TEXT")
        .setCheck(null)
        .appendField(svgIcon(LCD_SVG))
        .appendField("show on LCD");
      this.appendDummyInput()
        .appendField(svgIcon(GEAR_SVG))
        .appendField("pins:")
        .appendField("DATA:")
        .appendField(new Blockly.FieldNumber(21, 0, 40), "SDA")
        .appendField("CLK:")
        .appendField(new Blockly.FieldNumber(22, 0, 40), "SCL");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
      this.setInputsInline(false);
      this.setTooltip(
        "QUICK START - Show text on LCD (auto-setup!)\n\n" +
          "This block sets up the LCD automatically\n" +
          "   • No setup block needed!\n" +
          "   • Change pins if yours are different\n" +
          "   • Default: DATA=21, CLOCK=22"
      );
    },
  };

  pythonGenerator.forBlock["mp_lcd_print_simple"] = function (block: any) {
    const text =
      pythonGenerator.valueToCode(
        block,
        "TEXT",
        (pythonGenerator as any).ORDER_NONE || 0
      ) || "''";
    const sda = block.getFieldValue("SDA") || "21";
    const scl = block.getFieldValue("SCL") || "22";

    // Auto-generate setup code (runs once via definitions)
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_lcd"] =
      "from machine import I2C, Pin\nfrom esp8266_i2c_lcd import I2cLcd";
    (pythonGenerator as any).definitions_[`lcd_init_${sda}_${scl}`] =
      `i2c_lcd = I2C(0, scl=Pin(${scl}), sda=Pin(${sda}), freq=400000)\nlcd = I2cLcd(i2c_lcd, 0x27, 2, 16)`;

    return `lcd.putstr(str(${text}))\n`;
  };

  // LCD Set Cursor
  Blockly.Blocks["mp_lcd_cursor"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("move LCD cursor to row:")
        .appendField(new Blockly.FieldNumber(0, 0, 3), "ROW")
        .appendField("column:")
        .appendField(new Blockly.FieldNumber(0, 0, 19), "COL");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
      this.setTooltip(
        "Move to a specific position on the screen.\n\n" +
          "Tip: Like moving your typing cursor:\n" +
          "   • Row 0 = top line\n" +
          "   • Column 0 = leftmost position"
      );
    },
  };

  pythonGenerator.forBlock["mp_lcd_cursor"] = function (block: any) {
    const row = block.getFieldValue("ROW") || "0";
    const col = block.getFieldValue("COL") || "0";

    return `lcd.move_to(${col}, ${row})\n`;
  };

  // ============================================================================
  // ROTARY ENCODER BLOCKS
  // ============================================================================

  // Initialize Rotary Encoder (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_encoder_init"] = {
    init: function () {
      this.appendDummyInput()
        .appendField(svgIcon(SETUP_SVG))
        .appendField("setup rotary knob");
      this.appendDummyInput()
        .appendField("    CLK:")
        .appendField(new Blockly.FieldNumber(25, 0, 40), "CLK")
        .appendField("DT:")
        .appendField(new Blockly.FieldNumber(26, 0, 40), "DT")
        .appendField("SW:")
        .appendField(new Blockly.FieldNumber(27, 0, 40), "SW");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(270); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Setup a rotary encoder (twist knob).\n\n" +
          "Tip: Like a volume knob:\n" +
          "   • Turn to count up or down\n" +
          "   • Press to trigger button"
      );
    },
  };

  pythonGenerator.forBlock["mp_encoder_init"] = function (block: any) {
    const clk = block.getFieldValue("CLK") || "25";
    const dt = block.getFieldValue("DT") || "26";
    const sw = block.getFieldValue("SW") || "27";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_encoder"] =
      "from machine import Pin\nfrom rotary_irq_esp import RotaryIRQ";
    (pythonGenerator as any).definitions_["encoder_init"] =
      `encoder = RotaryIRQ(pin_num_clk=${clk}, pin_num_dt=${dt}, min_val=0, max_val=100, reverse=False)\nencoder_button = Pin(${sw}, Pin.IN, Pin.PULL_UP)\nencoder_value = 0`;

    return "";
  };

  // Read Encoder Position
  Blockly.Blocks["mp_encoder_read"] = {
    init: function () {
      this.appendDummyInput().appendField("rotary knob position");
      this.setOutput(true, "Number");
      this.setColour(290);
      this.setTooltip(
        "Get the current position of the rotary knob.\n\n" +
          "Tip: Returns a number:\n" +
          "   • Turn right = number goes up\n" +
          "   • Turn left = number goes down"
      );
    },
  };

  pythonGenerator.forBlock["mp_encoder_read"] = function (block: any) {
    const code = "encoder.value()";
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Read Encoder Button
  Blockly.Blocks["mp_encoder_button"] = {
    init: function () {
      this.appendDummyInput().appendField("rotary knob button pressed?");
      this.setOutput(true, "Boolean");
      this.setColour(290);
      this.setTooltip(
        "Check if the rotary knob is pressed.\n\n" +
          "Tip: Returns true when button is pushed down"
      );
    },
  };

  pythonGenerator.forBlock["mp_encoder_button"] = function (block: any) {
    const code = "encoder_button.value() == 0";
    return [code, (pythonGenerator as any).ORDER_EQUALITY || 0];
  };

  // ============================================================================
  // IR SENSOR BLOCKS
  // ============================================================================

  // Initialize IR Sensor (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_ir_init"] = {
    init: function () {
      this.appendDummyInput().appendField(svgIcon(SETUP_SVG)).appendField("setup IR sensor");
      this.appendDummyInput()
        .appendField("    pin:")
        .appendField(new Blockly.FieldNumber(23, 0, 40), "PIN");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(310); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Setup an infrared sensor to detect objects.\n\n" +
          "Tip: Uses invisible light:\n" +
          "   • Detect nearby objects\n" +
          "   • Read remote control signals\n" +
          "   • Works like TV remotes!"
      );
    },
  };

  pythonGenerator.forBlock["mp_ir_init"] = function (block: any) {
    const pin = block.getFieldValue("PIN") || "23";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_ir"] =
      "from machine import Pin\nimport time";
    (pythonGenerator as any).definitions_["ir_init"] =
      `ir_sensor = Pin(${pin}, Pin.IN)`;

    return "";
  };

  // Read IR Sensor
  Blockly.Blocks["mp_ir_read"] = {
    init: function () {
      this.appendDummyInput().appendField("IR sensor detects object?");
      this.setOutput(true, "Boolean");
      this.setColour(330);
      this.setTooltip(
        "Check if something is in front of the IR sensor.\n\n" +
          "Tip: Returns true when object is detected"
      );
    },
  };

  pythonGenerator.forBlock["mp_ir_read"] = function (block: any) {
    const code = "ir_sensor.value() == 0";
    return [code, (pythonGenerator as any).ORDER_EQUALITY || 0];
  };

  // ============================================================================
  // DHT TEMPERATURE & HUMIDITY SENSOR BLOCKS
  // ============================================================================

  // Initialize DHT Sensor (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_dht_init"] = {
    init: function () {
      this.appendDummyInput()
        .appendField(svgIcon(SETUP_SVG))
        .appendField("setup temp & humidity sensor");
      this.appendDummyInput()
        .appendField("    type:")
        .appendField(
          new Blockly.FieldDropdown([
            ["DHT11", "DHT11"],
            ["DHT22", "DHT22"],
          ]),
          "TYPE"
        )
        .appendField("pin:")
        .appendField(new Blockly.FieldNumber(23, 0, 40), "PIN");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(40); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Setup a DHT sensor to measure temperature and humidity.\n\n" +
          "Tip: Two sensors in one:\n" +
          "   • DHT11 = Good for beginners\n" +
          "   • DHT22 = More accurate\n" +
          "   • Measures both temp and moisture"
      );
    },
  };

  pythonGenerator.forBlock["mp_dht_init"] = function (block: any) {
    const type = block.getFieldValue("TYPE") || "DHT11";
    const pin = block.getFieldValue("PIN") || "23";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_dht"] =
      "from machine import Pin\nimport dht";
    (pythonGenerator as any).definitions_["dht_init"] =
      type === "DHT11"
        ? `dht_sensor = dht.DHT11(Pin(${pin}))`
        : `dht_sensor = dht.DHT22(Pin(${pin}))`;

    return "";
  };

  // Read DHT Temperature
  Blockly.Blocks["mp_dht_temp"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("temperature")
        .appendField(
          new Blockly.FieldDropdown([
            ["°C (Celsius)", "C"],
            ["°F (Fahrenheit)", "F"],
          ]),
          "UNIT"
        );
      this.setOutput(true, "Number");
      this.setColour(60);
      this.setTooltip(
        "Read the temperature from DHT sensor.\n\n" +
          "Tip: Choose your unit:\n" +
          "   • Celsius (°C) = Used in most countries\n" +
          "   • Fahrenheit (°F) = Used in USA"
      );
    },
  };

  pythonGenerator.forBlock["mp_dht_temp"] = function (block: any) {
    const unit = block.getFieldValue("UNIT") || "C";

    const measureCode = "dht_sensor.measure()";
    const tempCode =
      unit === "F"
        ? "dht_sensor.temperature() * 9 / 5 + 32"
        : "dht_sensor.temperature()";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["dht_measure_func"] = `
def read_dht_temp_${unit.toLowerCase()}():
    try:
        ${measureCode}
        return ${tempCode}
    except:
        return 0`;

    const code = `read_dht_temp_${unit.toLowerCase()}()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Read DHT Humidity
  Blockly.Blocks["mp_dht_humidity"] = {
    init: function () {
      this.appendDummyInput().appendField("humidity %");
      this.setOutput(true, "Number");
      this.setColour(60);
      this.setTooltip(
        "Read the humidity from DHT sensor.\n\n" +
          "Tip: Measures moisture in air:\n" +
          "   • 0% = Very dry\n" +
          "   • 100% = Very humid\n" +
          "   • Comfortable range: 30-60%"
      );
    },
  };

  pythonGenerator.forBlock["mp_dht_humidity"] = function (block: any) {
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["dht_measure_humidity"] = `
def read_dht_humidity():
    try:
        dht_sensor.measure()
        return dht_sensor.humidity()
    except:
        return 0`;

    const code = "read_dht_humidity()";
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // ============================================================================
  // DS18B20 TEMPERATURE SENSOR BLOCKS
  // ============================================================================

  // Initialize DS18B20 (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_ds18b20_init"] = {
    init: function () {
      this.appendDummyInput()
        .appendField(svgIcon(SETUP_SVG))
        .appendField("setup waterproof temp sensor");
      this.appendDummyInput()
        .appendField("    pin:")
        .appendField(new Blockly.FieldNumber(23, 0, 40), "PIN");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(10); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Setup a DS18B20 waterproof temperature sensor.\n\n" +
          "Tip: Special features:\n" +
          "   • Can measure water temperature\n" +
          "   • Very accurate\n" +
          "   • Chain multiple sensors on one wire!"
      );
    },
  };

  pythonGenerator.forBlock["mp_ds18b20_init"] = function (block: any) {
    const pin = block.getFieldValue("PIN") || "23";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_ds18b20"] =
      "from machine import Pin\nimport onewire, ds18x20\nimport time";
    (pythonGenerator as any).definitions_["ds18b20_init"] = `
ds_pin = Pin(${pin})
ds_sensor = ds18x20.DS18X20(onewire.OneWire(ds_pin))
ds_roms = ds_sensor.scan()`;

    return "";
  };

  // Read DS18B20 Temperature
  Blockly.Blocks["mp_ds18b20_temp"] = {
    init: function () {
      this.appendDummyInput()
        .appendField("waterproof temp")
        .appendField(
          new Blockly.FieldDropdown([
            ["°C (Celsius)", "C"],
            ["°F (Fahrenheit)", "F"],
          ]),
          "UNIT"
        );
      this.setOutput(true, "Number");
      this.setColour(20);
      this.setTooltip(
        "Read temperature from DS18B20 sensor.\n\n" +
          "Tip: Perfect for:\n" +
          "   • Water temperature\n" +
          "   • Outdoor weather stations\n" +
          "   • Precise measurements"
      );
    },
  };

  pythonGenerator.forBlock["mp_ds18b20_temp"] = function (block: any) {
    const unit = block.getFieldValue("UNIT") || "C";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["ds18b20_read_func"] = `
def read_ds18b20_temp_${unit.toLowerCase()}():
    try:
        ds_sensor.convert_temp()
        time.sleep_ms(750)
        temp_c = ds_sensor.read_temp(ds_roms[0])
        ${unit === "F" ? "return temp_c * 9 / 5 + 32" : "return temp_c"}
    except:
        return 0`;

    const code = `read_ds18b20_temp_${unit.toLowerCase()}()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // ============================================================================
  // HC-SR04 ULTRASONIC DISTANCE SENSOR BLOCKS
  // ============================================================================

  // Initialize Ultrasonic Sensor (ADVANCED MODE - with visual distinction)
  Blockly.Blocks["mp_ultrasonic_init"] = {
    init: function () {
      this.appendDummyInput()
        .appendField(svgIcon(SETUP_SVG))
        .appendField("setup ultrasonic sensor");
      this.appendDummyInput()
        .appendField("    TRIGGER:")
        .appendField(new Blockly.FieldNumber(23, 0, 40), "TRIG")
        .appendField("ECHO:")
        .appendField(new Blockly.FieldNumber(22, 0, 40), "ECHO");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(140); // Darker shade for setup blocks
      this.setTooltip(
        "SETUP BLOCK - Run this first!\n\n" +
          "Setup an ultrasonic distance sensor (HC-SR04).\n\n" +
          "Tip: Uses sound waves like a bat:\n" +
          "   • Sends out high-pitched beep\n" +
          "   • Listens for echo bounce back\n" +
          "   • Measures how far away things are"
      );
    },
  };

  pythonGenerator.forBlock["mp_ultrasonic_init"] = function (block: any) {
    const trig = block.getFieldValue("TRIG") || "23";
    const echo = block.getFieldValue("ECHO") || "22";

    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_ultrasonic"] =
      "from machine import Pin\nimport time";
    (pythonGenerator as any).definitions_["ultrasonic_init"] = `
ultrasonic_trig = Pin(${trig}, Pin.OUT)
ultrasonic_echo = Pin(${echo}, Pin.IN)`;
    (pythonGenerator as any).definitions_["ultrasonic_func"] = `
def read_ultrasonic_cm():
    ultrasonic_trig.value(0)
    time.sleep_us(2)
    ultrasonic_trig.value(1)
    time.sleep_us(10)
    ultrasonic_trig.value(0)
    while ultrasonic_echo.value() == 0:
        pulse_start = time.ticks_us()
    while ultrasonic_echo.value() == 1:
        pulse_end = time.ticks_us()
    pulse_duration = time.ticks_diff(pulse_end, pulse_start)
    distance = pulse_duration * 0.034 / 2
    return distance`;

    return "";
  };

  // Read Distance in cm
  Blockly.Blocks["mp_ultrasonic_distance_cm"] = {
    init: function () {
      this.appendDummyInput().appendField("distance in cm");
      this.setOutput(true, "Number");
      this.setColour(160);
      this.setTooltip(
        "Measure distance in centimeters.\n\n" +
          "Tip: Returns distance:\n" +
          "   • Range: 2cm to 400cm\n" +
          "   • 100cm = 1 meter\n" +
          "   • Perfect for obstacle detection"
      );
    },
  };

  pythonGenerator.forBlock["mp_ultrasonic_distance_cm"] = function (
    block: any
  ) {
    const code = "read_ultrasonic_cm()";
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Read Distance in inches
  Blockly.Blocks["mp_ultrasonic_distance_in"] = {
    init: function () {
      this.appendDummyInput().appendField("distance in inches");
      this.setOutput(true, "Number");
      this.setColour(160);
      this.setTooltip(
        "Measure distance in inches.\n\n" +
          "Tip: Returns distance:\n" +
          "   • Range: 1 to 160 inches\n" +
          "   • 12 inches = 1 foot"
      );
    },
  };

  pythonGenerator.forBlock["mp_ultrasonic_distance_in"] = function (
    block: any
  ) {
    const code = "read_ultrasonic_cm() / 2.54";
    return [code, (pythonGenerator as any).ORDER_MULTIPLICATIVE || 0];
  };

  // ============================================================================
  // SIMPLE AUTO-INIT BLOCKS - Quick Start Mode
  // ============================================================================

  // Simple DHT Temperature (auto-init)
  Blockly.Blocks["mp_dht_temp_simple"] = {
    init: function () {
      this.appendDummyInput()
        .appendField(svgIcon(THERMO_SVG))
        .appendField("temperature")
        .appendField(
          new Blockly.FieldDropdown([
            ["°C", "C"],
            ["°F", "F"],
          ]),
          "UNIT"
        );
      this.appendDummyInput()
        .appendField(svgIcon(GEAR_SVG))
        .appendField(
          new Blockly.FieldDropdown([
            ["DHT11", "DHT11"],
            ["DHT22", "DHT22"],
          ]),
          "TYPE"
        )
        .appendField("pin:")
        .appendField(new Blockly.FieldNumber(23, 0, 40), "PIN");
      this.setOutput(true, "Number");
      this.setColour(60);
      this.setInputsInline(false);
      this.setTooltip(
        "QUICK START - Read temperature (auto-setup!)\n\n" +
          "This block sets up DHT sensor automatically\n" +
          "   • No setup block needed!\n" +
          "   • DHT11 for beginners, DHT22 for accuracy\n" +
          "   • Change pin if yours is different"
      );
    },
  };

  pythonGenerator.forBlock["mp_dht_temp_simple"] = function (block: any) {
    const unit = block.getFieldValue("UNIT") || "C";
    const type = block.getFieldValue("TYPE") || "DHT11";
    const pin = block.getFieldValue("PIN") || "23";

    // Auto-generate setup code
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_dht"] =
      "from machine import Pin\nimport dht";
    (pythonGenerator as any).definitions_[`dht_init_${pin}`] =
      type === "DHT11"
        ? `dht_sensor = dht.DHT11(Pin(${pin}))`
        : `dht_sensor = dht.DHT22(Pin(${pin}))`;

    const measureCode = "dht_sensor.measure()";
    const tempCode =
      unit === "F"
        ? "dht_sensor.temperature() * 9 / 5 + 32"
        : "dht_sensor.temperature()";

    (pythonGenerator as any).definitions_[
      `dht_measure_func_${unit.toLowerCase()}_${pin}`
    ] = `
def read_dht_temp_${unit.toLowerCase()}_${pin}():
    try:
        ${measureCode}
        return ${tempCode}
    except:
        return 0`;

    const code = `read_dht_temp_${unit.toLowerCase()}_${pin}()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };

  // Simple Ultrasonic Distance (auto-init)
  Blockly.Blocks["mp_ultrasonic_distance_simple"] = {
    init: function () {
      this.appendDummyInput()
        .appendField(svgIcon(RULER_SVG))
        .appendField("distance in")
        .appendField(
          new Blockly.FieldDropdown([
            ["cm", "CM"],
            ["inches", "IN"],
          ]),
          "UNIT"
        );
      this.appendDummyInput()
        .appendField(svgIcon(GEAR_SVG))
        .appendField("pins:")
        .appendField("TRIG:")
        .appendField(new Blockly.FieldNumber(23, 0, 40), "TRIG")
        .appendField("ECHO:")
        .appendField(new Blockly.FieldNumber(22, 0, 40), "ECHO");
      this.setOutput(true, "Number");
      this.setColour(160);
      this.setInputsInline(false);
      this.setTooltip(
        "QUICK START - Measure distance (auto-setup!)\n\n" +
          "This block sets up ultrasonic sensor automatically\n" +
          "   • No setup block needed!\n" +
          "   • Works like bat echolocation\n" +
          "   • Range: 2cm to 400cm"
      );
    },
  };

  pythonGenerator.forBlock["mp_ultrasonic_distance_simple"] = function (
    block: any
  ) {
    const unit = block.getFieldValue("UNIT") || "CM";
    const trig = block.getFieldValue("TRIG") || "23";
    const echo = block.getFieldValue("ECHO") || "22";

    // Auto-generate setup code
    (pythonGenerator as any).definitions_ =
      (pythonGenerator as any).definitions_ || {};
    (pythonGenerator as any).definitions_["import_ultrasonic"] =
      "from machine import Pin\nimport time";
    (pythonGenerator as any).definitions_[`ultrasonic_init_${trig}_${echo}`] = `
ultrasonic_trig_${trig} = Pin(${trig}, Pin.OUT)
ultrasonic_echo_${echo} = Pin(${echo}, Pin.IN)`;
    (pythonGenerator as any).definitions_[`ultrasonic_func_${trig}_${echo}`] = `
def read_ultrasonic_${trig}_${echo}():
    ultrasonic_trig_${trig}.value(0)
    time.sleep_us(2)
    ultrasonic_trig_${trig}.value(1)
    time.sleep_us(10)
    ultrasonic_trig_${trig}.value(0)
    while ultrasonic_echo_${echo}.value() == 0:
        pulse_start = time.ticks_us()
    while ultrasonic_echo_${echo}.value() == 1:
        pulse_end = time.ticks_us()
    pulse_duration = time.ticks_diff(pulse_end, pulse_start)
    distance = pulse_duration * 0.034 / 2
    return distance`;

    const code =
      unit === "IN"
        ? `(read_ultrasonic_${trig}_${echo}() / 2.54)`
        : `read_ultrasonic_${trig}_${echo}()`;
    return [code, (pythonGenerator as any).ORDER_FUNCTION_CALL || 0];
  };
}

// Quick Start Sensors - Simple, no setup required
export function getSensorsQuickStartCategory() {
  return {
    kind: "category",
    id: "cat_sensors_quick",
    name: "⚡ Sensors - Quick Start",
    colour: "#27ae60",
    contents: [
      {
        kind: "block",
        type: "mp_lcd_print_simple",
        inputs: {
          TEXT: { shadow: { type: "text", fields: { TEXT: "Hello!" } } },
        },
      },
      { kind: "block", type: "mp_dht_temp_simple" },
      { kind: "block", type: "mp_ultrasonic_distance_simple" },
    ],
  };
}

// Advanced Sensors - Require setup
export function getSensorsAdvancedCategory() {
  return {
    kind: "category",
    id: "cat_sensors_advanced",
    name: "Sensors",
    colour: "#27ae60",
    contents: [
      // === LCD Display ===
      {
        kind: "label",
        text: "LCD Display (Show text on screen)",
        "web-class": "sensor-section-label",
      },
      { kind: "block", type: "mp_lcd_init" },
      {
        kind: "block",
        type: "mp_lcd_print",
        inputs: {
          TEXT: { shadow: { type: "text", fields: { TEXT: "Hello!" } } },
        },
      },
      { kind: "block", type: "mp_lcd_clear" },
      { kind: "block", type: "mp_lcd_cursor" },

      // === Rotary Encoder ===
      {
        kind: "label",
        text: "Rotary Encoder (Knob control)",
        "web-class": "sensor-section-label",
      },
      { kind: "block", type: "mp_encoder_init" },
      { kind: "block", type: "mp_encoder_read" },
      { kind: "block", type: "mp_encoder_button" },

      // === IR Sensor ===
      {
        kind: "label",
        text: "IR Sensor (Remote control)",
        "web-class": "sensor-section-label",
      },
      { kind: "block", type: "mp_ir_init" },
      { kind: "block", type: "mp_ir_read" },

      // === DHT Sensor ===
      {
        kind: "label",
        text: "DHT Sensor (Temperature & Humidity)",
        "web-class": "sensor-section-label",
      },
      { kind: "block", type: "mp_dht_init" },
      { kind: "block", type: "mp_dht_temp" },
      { kind: "block", type: "mp_dht_humidity" },

      // === DS18B20 ===
      {
        kind: "label",
        text: "DS18B20 (Waterproof temperature)",
        "web-class": "sensor-section-label",
      },
      { kind: "block", type: "mp_ds18b20_init" },
      { kind: "block", type: "mp_ds18b20_temp" },

      // === Ultrasonic Distance ===
      {
        kind: "label",
        text: "Ultrasonic (Distance sensor)",
        "web-class": "sensor-section-label",
      },
      { kind: "block", type: "mp_ultrasonic_init" },
      { kind: "block", type: "mp_ultrasonic_distance_cm" },
      { kind: "block", type: "mp_ultrasonic_distance_in" },
    ],
  };
}

// Consolidated Sensors Category (kept for backward compatibility)
export function getSensorsCategory() {
  return getSensorsAdvancedCategory();
}
