# Quick Start Guide - Testing the Labs

## Starting the Development Server

```bash
cd /Users/d0m1n8/Documents/projects/steamplitude
npm run dev
```

The application will start on `http://localhost:5173`

## Accessing the Labs

### Option 1: Through the Playground Page

1. Navigate to http://localhost:5173/playground
2. You'll see three lab cards:
   - **Electronics Lab** (Available - green "Launch Lab" button)
   - **MCU Lab** (Available - green "Launch Lab" button)
   - **Coding Playground** (Coming Soon - disabled)

### Option 2: Direct URLs

- **Electronics Lab:** http://localhost:5173/playground/electronics
- **MCU Lab:** http://localhost:5173/playground/mcu

## Testing the Electronics Lab

### Quick Test Steps:

1. **Navigate** to the Electronics Lab
2. **Select Components:**
   - Click "Battery" button in toolbar
   - Click on canvas to place battery
   - Click "Resistor" button
   - Click on canvas to place resistor
   - Click "LED" button
   - Click on canvas to place LED
   
3. **Wire Components:**
   - Click and drag from golden pin on battery positive terminal
   - Drag to resistor pin
   - Release to create wire
   - Repeat to connect resistor → LED → battery (complete circuit)

4. **Run Simulation:**
   - Click "▶️ Simulate" button
   - Watch electrons flow through wires
   - See LED glow based on current

5. **Try Challenges:**
   - Click "🎮 Challenges" button
   - Follow guided tutorials
   - Complete progressive challenges

### Expected Behavior:

- ✅ Components should be draggable
- ✅ Wires should connect between pins
- ✅ Simulation shows electron animation
- ✅ LED glows with realistic brightness
- ✅ Info panel shows voltage/current measurements
- ✅ Challenges modal opens and provides instructions

## Testing the MCU Lab

### Quick Test Steps:

1. **Navigate** to the MCU Lab
2. **Circuit Building:**
   - The lab should load with a blank canvas
   - Components toolbar should be visible
   - Grid should be rendered

3. **Expected Features:**
   - Drag-and-drop components
   - Wire routing system
   - Circuit simulation
   - Save/load functionality

### Current Status:

The MCU Lab is integrated and should load without errors. Full feature testing will require:
- Verifying component toolbar renders correctly
- Testing wire creation
- Checking circuit simulation accuracy

## Common Issues & Fixes

### Issue: White/Blank Screen

**Possible Causes:**
- JavaScript error in console
- Missing dependencies
- PixiJS not loading

**Solution:**
```bash
# Check console for errors
# Reinstall dependencies if needed
npm install
```

### Issue: "Cannot find module" Error

**Solution:**
```bash
# Check that TypeScript files are being handled by Vite
# Verify tsconfig.json is present (should be auto-generated)
```

### Issue: Components Not Clickable

**Possible Cause:** Z-index or event handling issue

**Solution:**
- Check browser console for errors
- Verify PixiJS canvas is rendering (right-click inspect element)

### Issue: Slow Performance

**Possible Cause:** WebGL not enabled or too many animated elements

**Solution:**
- Check `chrome://gpu` to verify WebGL support
- Try a different browser (Chrome recommended)

## Browser Compatibility

**Recommended Browsers:**
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

**Requirements:**
- WebGL 2.0 support
- ES6+ JavaScript support
- Canvas API support

## Performance Notes

### Electronics Lab:
- Handles 20+ components smoothly
- Electron animation is GPU-accelerated
- Challenge mode adds minimal overhead

### MCU Lab:
- Can handle complex circuits with 50+ components
- Physics simulation (Planck.js) is CPU-bound
- Wire routing algorithms optimize automatically

## Development Tips

### Hot Module Replacement (HMR)

Vite supports HMR, so changes to `.jsx` files will update without full reload. However:
- Changes to PixiJS canvas may require manual refresh
- TypeScript `.ts`/`.tsx` files are compiled on the fly

### Debugging

**Enable PixiJS Inspector:**
```javascript
// In browser console
window.__PIXI_INSPECTOR_GLOBAL_HOOK__ = true;
```

**Console Logs:**
- Electronics Lab: Look for "🚀 Integrated PixiJS 8 Circuit Simulator initialized"
- MCU Lab: Look for "🚀 MCU Circuit Lab initialized"

### Checking Loaded Modules

```javascript
// In browser console
console.log(Object.keys(window));
// Should see PIXI and other globals
```

## Next Steps After Successful Testing

1. **Connect to LMS**
   - Implement user authentication
   - Add project save/load to backend

2. **Add More Features**
   - ESP32 programming interface
   - Code upload via Web Serial API
   - More component types

3. **Enhance UI**
   - Add tutorial overlays
   - Improve mobile responsiveness
   - Add keyboard shortcuts

## Need Help?

**Check logs in:**
1. Browser Developer Console (F12)
2. Terminal where `npm run dev` is running
3. Network tab (for failed asset loads)

**Common Log Messages:**

✅ **Success:**
```
🚀 Integrated PixiJS 8 Circuit Simulator initialized
🚀 MCU Circuit Lab initialized
```

❌ **Error:**
```
Error: Cannot find module '../core/IntegratedPixiApp'
Error: WebGL not supported
```

---

**Ready to test!** Start with `npm run dev` and navigate to `/playground` 🚀
