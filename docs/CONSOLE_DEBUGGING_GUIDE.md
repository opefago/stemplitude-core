# Console Debugging Guide - Filtering Out Extension Noise

## The Problem
Browser extensions inject scripts that clutter the console with irrelevant errors.

## How to See Only Your App's Errors

### Option 1: Filter Console Messages

1. Open Chrome DevTools (F12 or Cmd+Option+I)
2. Go to Console tab
3. In the filter box (top of console), type: `-inject -lockdown -content-script`
4. This will hide messages from extension files

### Option 2: Check Specific Files

Look for messages that reference YOUR files:
- ✅ `ElectronicsLab.jsx`
- ✅ `MCULab.jsx`
- ✅ `CircuitSimulatorPixi.tsx`
- ✅ `IntegratedPixiApp.ts`

Ignore messages from:
- ❌ `inject.js`
- ❌ `lockdown-install.js`
- ❌ `content-script.js`
- ❌ `extension-id` folders

### Option 3: Test in Incognito Mode (Extensions Disabled)

1. Open Chrome Incognito window (Cmd+Shift+N)
2. Navigate to `http://localhost:5173/playground/electronics`
3. Console will be clean without extension noise

## What Success Looks Like

When the Electronics Lab loads correctly, you should see:

```
✅ 🚀 Integrated PixiJS 8 Circuit Simulator initialized
```

When the MCU Lab loads correctly:

```
✅ 🚀 MCU Circuit Lab initialized
```

## Common Extension Messages (Safe to Ignore)

| Message | Source | Safe? |
|---------|--------|-------|
| `Port connected` | Browser extension | ✅ Ignore |
| `SES Removing unpermitted intrinsics` | MetaMask/crypto wallet | ✅ Ignore |
| `Permissions policy violation: unload` | Extension using deprecated API | ✅ Ignore |
| `MutationObserver` error in content-script | Extension DOM observer | ✅ Ignore |

## Real Errors to Watch For

These indicate actual problems with the labs:

❌ **Module Not Found:**
```
Uncaught TypeError: Cannot find module '../labs/electronics/...'
```
**Fix:** Check import paths

❌ **PixiJS Initialization Failed:**
```
Error: WebGL not supported
```
**Fix:** Browser doesn't support WebGL 2.0

❌ **Canvas Rendering Error:**
```
Error in CircuitSimulatorPixi initialization
```
**Fix:** Check PixiJS version compatibility

## Quick Test Checklist

Run through these to verify everything works:

### Electronics Lab Test:
1. Navigate to `/playground/electronics`
2. ✅ Page loads without white screen
3. ✅ Canvas renders (dark background)
4. ✅ Component toolbar visible
5. ✅ Can click component buttons
6. ✅ Info panel shows on right side

### MCU Lab Test:
1. Navigate to `/playground/mcu`
2. ✅ Page loads without white screen
3. ✅ Canvas renders (white/light background)
4. ✅ Grid visible
5. ✅ No "failed to initialize" errors

## Disabling Specific Extensions for Testing

If you want a completely clean console:

**Chrome:**
1. Go to `chrome://extensions`
2. Temporarily disable extensions
3. Reload your app

**Common Culprits:**
- MetaMask (crypto wallet)
- Grammarly (writing assistant)
- LastPass/1Password (password managers)
- React DevTools (sometimes buggy)

## Advanced: Network Tab Check

If you suspect missing files:

1. Open DevTools → Network tab
2. Reload page
3. Look for red (failed) requests
4. Check for 404 errors on `.js`, `.css`, or `.ts` files

Success = all files return 200 status

## Summary

**TL;DR:** 
- Extension errors = 👍 Ignore them
- Your app errors = 🔧 Fix them
- Use incognito mode = 🧹 Clean console
- Filter console = 🎯 Focus on your code

If you see the PixiJS initialization messages and the canvas renders, **your labs are working correctly!**
