# Labs Integration Documentation

## Overview

Successfully integrated two interactive learning labs into the STEAMplitude website:

1. **Electronics Lab** - From ProjectX
2. **MCU Lab (Circuit Builder)** - From STEMplitude project

## Installation

### Dependencies Added

```bash
# Core PixiJS and utilities
pixi.js@^8.4.1          # High-performance 2D rendering
mathjs@^14.8.2          # Mathematical computations
uuid@^9.0.1             # Unique ID generation
zustand@^5.0.8          # State management

# Circuit and graph libraries
dagre@^0.8.5            # Graph layout algorithms
planck@^1.4.2           # 2D physics engine

# Code editor (for future MCU programming)
blockly@^12.3.1         # Visual programming blocks
@codemirror/lang-python@^6.2.1
@codemirror/state@^6.5.2
@codemirror/theme-one-dark@^6.1.3
@codemirror/view@^6.38.6
codemirror@^6.0.2       # Code editor component

# Additional utilities
js-base64@^3.7.8        # Base64 encoding/decoding
tippy.js@^6.3.7         # Tooltip library

# Dev dependencies
@types/uuid@^9.0.8
@types/dagre@^0.7.53
@types/w3c-web-serial@^1.0.8
@blockly/plugin-workspace-search@^10.1.2
```

## Project Structure

```
src/
├── labs/
│   ├── electronics/          # Electronics Lab (from ProjectX)
│   │   ├── components/       # React components
│   │   │   ├── CircuitSimulatorPixi.tsx
│   │   │   ├── ChallengeMode.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── InfoPanel.tsx
│   │   │   └── Toolbar.tsx
│   │   ├── core/            # Core PixiJS application
│   │   │   ├── IntegratedPixiApp.ts
│   │   │   ├── components/
│   │   │   ├── managers/
│   │   │   └── renderers/
│   │   ├── engine/          # Circuit simulation engine
│   │   ├── store/           # Zustand state management
│   │   ├── types/           # TypeScript definitions
│   │   ├── utils/           # Helper functions
│   │   └── electronics.css  # Lab-specific styles
│   │
│   └── mcu/                 # MCU Lab (from STEMplitude)
│       ├── components/      # React components
│       │   ├── CircuitLabContainer.tsx
│       │   ├── Navbar.tsx
│       │   ├── MainMenu.tsx
│       │   ├── GearsMenu.tsx
│       │   ├── GearDemo.tsx
│       │   └── blockly/     # Blockly editor components
│       ├── lib/             # Core libraries
│       │   ├── circuit/     # Circuit scene and components
│       │   │   ├── CircuitScene.ts
│       │   │   ├── CircuitComponent.ts
│       │   │   ├── CircuitSolver.ts
│       │   │   ├── WireSystem.ts
│       │   │   └── components/
│       │   ├── shared/      # Shared game engine
│       │   │   └── GameManager.ts
│       │   └── scenes/      # Other scenes (gears, etc.)
│       └── mcu.css          # Lab-specific styles
│
├── pages/
│   ├── ElectronicsLab.jsx   # Electronics lab page
│   ├── MCULab.jsx           # MCU lab page
│   ├── Playground.jsx       # Labs overview page
│   └── Labs.css             # Shared lab page styles
```

## Features

### Electronics Lab (ProjectX)

**What it does:**
- Interactive electronics circuit simulator
- Drag-and-drop component placement
- Real-time circuit simulation using Modified Nodal Analysis (MNA)
- Animated electron flow visualization
- Educational challenge mode

**Components Available:**
- Battery (power source)
- Resistor (current limiting)
- LED (light emission with realistic glow)
- Switch (circuit control)
- Capacitor (energy storage)
- Ground (reference point)
- Voltmeter (voltage measurement)

**Key Technologies:**
- PixiJS 8 for GPU-accelerated rendering
- Custom circuit solver (MNA algorithm)
- Zustand for state management
- Challenge system with progressive difficulty

### MCU Lab (STEMplitude - Circuit Builder)

**What it does:**
- Visual circuit building environment
- Drag-and-drop mechanical and electrical components
- Physics-based simulation using Planck.js
- Wire routing with multiple algorithms (orthogonal, Dagre-based)
- Support for gears, motors, and mechanical systems

**Components Available:**
- Circuit components (similar to Electronics Lab)
- Mechanical components (gears, motors, belts)
- Microcontroller blocks (ESP32, Arduino)
- Blockly-based programming interface (ready for integration)

**Key Technologies:**
- PixiJS 8 for rendering
- Planck.js for 2D physics
- Dagre for graph-based wire routing
- GameManager architecture for scene management

## Routes

New routes added to the application:

```javascript
/playground              → Playground overview page
/playground/electronics  → Electronics Lab
/playground/mcu          → MCU Lab (Circuit Builder)
```

## Navigation

- Added "Playground" link to main navbar
- Added "Playground" link to footer
- Each lab has a "Back to Playground" link
- Labs are showcased on the Playground page with descriptions

## Integration Details

### Electronics Lab Integration

The Electronics Lab is integrated as a full-screen application:

```jsx
<ElectronicsLab>
  - Slim header with back link
  - Full-screen PixiJS canvas
  - Challenge mode overlay
  - Error boundary for safe loading
</ElectronicsLab>
```

**Rendering:**
- Top: 60px header with back button and title
- Main: Full viewport canvas for circuit simulation
- Overlay: Challenge mode modal when activated

### MCU Lab Integration

The MCU Lab uses the GameManager architecture:

```jsx
<MCULab>
  - Slim header with back link
  - PixiJS canvas with GameManager
  - CircuitScene for circuit building
</MCULab>
```

**Architecture:**
- Application → GameManager → CircuitScene
- Scene-based architecture allows future expansion
- Clean lifecycle management (init/destroy)

## Styling

### Shared Styles (Labs.css)

```css
.lab-page              → Base lab page container
.lab-header-slim       → Compact header for embedded labs
.lab-title-slim        → Title with icon
.electronics-lab-page  → Electronics lab specific styles
.mcu-lab-page          → MCU lab specific styles
```

### Lab-Specific Styles

- `electronics.css` - Original ProjectX styles
- `mcu.css` - Original STEMplitude styles

## TypeScript Support

Both labs are written in TypeScript and use `.tsx`/`.ts` files. Vite automatically handles TypeScript compilation.

**Type Definitions:**
- Circuit types
- Component types
- Animation types
- PixiJS extensions

## Future Enhancements

### Planned Features:

1. **LMS Integration**
   - User authentication
   - Progress tracking
   - Saved projects
   - Achievement system

2. **ESP32/Arduino Programming**
   - Blockly visual programming (already integrated in MCU lab)
   - Code editor with syntax highlighting (CodeMirror ready)
   - Virtual serial monitor
   - Upload to real hardware via Web Serial API

3. **Additional Labs**
   - Coding Playground (Python, JavaScript)
   - 3D Modeling viewer
   - Robotics simulator

4. **Social Features**
   - Share circuits/projects
   - Community challenges
   - Leaderboards

## Development

### Running Locally

```bash
npm install
npm run dev
```

The labs will be available at:
- http://localhost:5173/playground/electronics
- http://localhost:5173/playground/mcu

### Building for Production

```bash
npm run build
```

### Testing the Labs

1. Navigate to `/playground`
2. Click "Launch Lab" on Electronics Lab or MCU Lab
3. For Electronics Lab:
   - Click component buttons to select
   - Click canvas to place components
   - Drag from golden pins to create wires
   - Press "Simulate" to run the circuit
   - Click "Challenges" for guided tutorials

4. For MCU Lab:
   - Drag components from toolbar
   - Connect with wires
   - Test circuits (full features being integrated)

## Known Issues & Solutions

### Issue: PixiJS Canvas Not Rendering
**Solution:** Check browser console for WebGL support. Labs require WebGL 2.0.

### Issue: TypeScript Compilation Errors
**Solution:** Ensure all type definitions are installed (`@types/*` packages).

### Issue: Lab Not Loading
**Solution:** Check that all files were copied correctly from source projects.

## File Origins

### From ProjectX (`../ProjectX/src/`)
```
components/ → src/labs/electronics/components/
core/       → src/labs/electronics/core/
engine/     → src/labs/electronics/engine/
store/      → src/labs/electronics/store/
types/      → src/labs/electronics/types/
utils/      → src/labs/electronics/utils/
index.css   → src/labs/electronics/electronics.css
```

### From STEMplitude (`../steam_project/STEMplitude/src/`)
```
components/ → src/labs/mcu/components/
lib/        → src/labs/mcu/lib/
App.css     → src/labs/mcu/mcu.css
```

## Credits

- **Electronics Lab:** Adapted from ProjectX
- **MCU Lab:** Adapted from STEMplitude project
- **Integration:** STEAMplitude website

## License

These labs are part of the STEAMplitude educational platform.

---

**Last Updated:** February 21, 2026
**Status:** ✅ Integration Complete
