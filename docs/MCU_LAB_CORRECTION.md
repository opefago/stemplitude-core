# MCU Lab Correction - ESP32 Blockly Editor

## Issue
The MCU Lab was initially integrated with the wrong component (CircuitScene) instead of the ESP32 Blockly Editor for MicroPython programming.

## Correction Made

### What Was Wrong
```javascript
// ❌ BEFORE: Using circuit builder (wrong component)
import { CircuitScene } from '../labs/mcu/lib/circuit/CircuitScene';
const circuitScene = new CircuitScene();
```

### What's Correct
```javascript
// ✅ AFTER: Using ESP32 Blockly Editor (correct component)
import { Esp32BlocklyEditor } from '../labs/mcu/components/blockly/Esp32BlocklyEditor';
<Esp32BlocklyEditor />
```

## What the MCU Lab Actually Is

### ESP32 Blockly Editor
A visual programming environment for MicroPython on ESP32/Arduino boards:

**Features:**
- 🧩 **Blockly Visual Programming** - Drag-and-drop code blocks
- 🐍 **MicroPython Code Generation** - Automatically converts blocks to Python
- 📝 **Code Editor** - Switch between blocks and text code
- 📡 **Web Serial API** - Upload code directly to ESP32/Arduino via USB
- 🎨 **Custom Block Categories**:
  - Logic & Control Flow
  - Numbers & Math
  - Strings
  - Variables
  - I/O (GPIO pins)
  - Functions
  - Events (interrupts, timers)
  - Communication (UART, I2C, SPI)
  - WiFi
  - OLED Display
  - And more!

### How It Works

1. **Visual Programming Mode**
   - Drag blocks from category toolbox
   - Snap blocks together
   - See Python code generated in real-time

2. **Code Editor Mode**
   - Edit generated Python code directly
   - Syntax highlighting with CodeMirror
   - One Dark theme

3. **Upload to Hardware**
   - Connect ESP32/Arduino via USB
   - Click "Upload" button
   - Uses Web Serial API for direct upload
   - No IDE installation needed!

## Files Updated

### 1. MCULab.jsx
```javascript
// Simplified to just render the Blockly Editor
import { Esp32BlocklyEditor } from '../labs/mcu/components/blockly/Esp32BlocklyEditor';

const MCULab = () => (
  <div className="lab-page mcu-lab-fullscreen">
    <Link to="/playground" className="lab-exit-btn">Exit Lab</Link>
    <Esp32BlocklyEditor />
  </div>
);
```

### 2. Playground.jsx
Updated description to reflect actual features:
```javascript
{
  title: 'MCU Lab',
  description: 'Microcontroller programming environment. Write, compile, and upload MicroPython code to ESP32/Arduino.',
  features: [
    'Blockly visual programming',
    'Python code editor',
    'ESP32/Arduino compatible',
    'Web Serial upload'
  ]
}
```

## Component Architecture

### Esp32BlocklyEditor.tsx
Located at: `src/labs/mcu/components/blockly/Esp32BlocklyEditor.tsx`

**Key Dependencies:**
- `blockly` - Google's visual programming library
- `@codemirror/*` - Code editor with Python syntax
- `pythonGenerator` - Converts Blockly blocks to Python code
- `WebSerialUploader` - Uploads code to hardware via USB

**Custom Block Categories:**
All in `src/labs/mcu/components/blockly/categories/`:
- `logic.ts` - If/else, comparisons, boolean logic
- `control.ts` - Loops, delays, wait conditions
- `numbers.ts` - Number operations
- `math.ts` - Advanced math functions
- `strings.ts` - String manipulation
- `variables.ts` - Variable creation and management
- `io.ts` - GPIO pin control (digital/analog)
- `functions.ts` - Function definitions
- `events.ts` - Interrupts, timers, analog reads
- `communication.ts` - UART, I2C, SPI protocols
- `wifi.ts` - WiFi connectivity
- `oled.ts` - OLED display control
- `pwm.ts` - PWM for motors/servos
- `time.ts` - Time and delay functions

## Web Serial API Integration

### WebSerialUploader.ts
Located at: `src/labs/mcu/lib/micropython/WebSerialUploader.ts`

**What it does:**
- Connects to ESP32/Arduino via browser's Web Serial API
- No drivers needed (Chrome/Edge only)
- Uploads MicroPython code directly
- Supports soft reboot after upload

**Browser Support:**
- ✅ Chrome 89+
- ✅ Edge 89+
- ❌ Firefox (no Web Serial support yet)
- ❌ Safari (no Web Serial support yet)

**User Flow:**
1. Write code in Blockly or editor
2. Click "Upload to ESP32" button
3. Browser prompts: "Select serial port"
4. User selects USB port (e.g., `/dev/ttyUSB0` or `COM3`)
5. Code uploads to board
6. Board automatically reboots with new code

## Educational Purpose

### Perfect for Kids Learning:
1. **Visual Programming First** - No syntax errors with blocks
2. **See the Code** - Understand what blocks generate
3. **Real Hardware** - Program actual ESP32 boards
4. **Immediate Feedback** - See results on physical device
5. **Progressive Learning** - Start with blocks, graduate to code

### Example Project Flow:
```
1. Drag "Set pin HIGH" block
2. Drag "Delay 1 second" block
3. Drag "Set pin LOW" block
4. Drag "Forever loop" block
5. Click Upload
6. See LED blink on ESP32!
```

## Circuit Lab vs. MCU Lab

### What Got Confused:

**Circuit Lab** (in `src/labs/mcu/lib/circuit/`):
- PixiJS-based visual circuit builder
- Drag components (resistors, LEDs, etc.)
- Wire routing
- Physics simulation
- **This is a separate feature** (could be a third lab!)

**MCU Lab** (in `src/labs/mcu/components/blockly/`):
- Blockly visual programming
- MicroPython code generation
- Upload to real hardware
- **This is what should be the MCU Lab** ✅

### Recommendation:
Create a **third lab** called "Circuit Builder Lab" for the PixiJS circuit simulator:
```
/playground/electronics  → Electronics simulator (ProjectX)
/playground/mcu         → ESP32 Blockly programmer ✅
/playground/circuits    → Circuit builder (future)
```

## Testing the MCU Lab

### Without Hardware:
1. Navigate to `/playground/mcu`
2. Drag blocks from categories
3. Build a simple program
4. See Python code generated
5. Try code editor mode

### With ESP32 Hardware:
1. Connect ESP32 via USB
2. Build program in Blockly
3. Click "Upload to ESP32"
4. Grant browser serial port permission
5. Watch code upload and execute

## Status
✅ **CORRECTED** - MCU Lab now uses the ESP32 Blockly Editor!

The lab is ready for students to:
- Learn visual programming
- Generate MicroPython code
- Upload to real ESP32/Arduino hardware

**Last Updated:** February 23, 2026  
**Correction:** MCU Lab Component
