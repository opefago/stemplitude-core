# 🧪 Scene Testing Guide

## Quick Start

### 1. Initialize the Testing System

Add this to your main application entry point (e.g., `main.ts`):

```typescript
import { SceneTester } from "./lib/scenes/SceneTester";

// Initialize the scene tester
const sceneTester = new SceneTester();

// The tester automatically sets up global functions and UI
```

### 2. Open Browser Console

Press `F12` → `Console` tab to access testing commands.

### 3. Basic Testing Commands

```javascript
// Test individual scenes
testMotorBasics(); // Test Motor Basics level
testGearIntroduction(); // Test Gear Introduction level
testBeltSystems(); // Test Belt Systems level
testForkliftChallenge(); // Test Forklift Challenge level

// Utilities
unlockAllLevels(); // Unlock all levels for testing
resetProgress(); // Reset all progress
showLevelMenu(); // Show level selection menu

// Debug helpers
completeCurrentObjective(); // Force complete current objective
skipToNextLevel(); // Skip to next level
```

## Testing Workflows

### Workflow 1: Test Individual Scene

```javascript
// 1. Unlock all levels (so you can access any scene)
unlockAllLevels();

// 2. Test a specific scene
testMotorBasics();

// 3. Complete objectives manually or use debug helper
completeCurrentObjective(); // Repeat as needed

// 4. Skip to next level when done
skipToNextLevel();
```

### Workflow 2: Test Scene Progression

```javascript
// 1. Reset progress to start fresh
resetProgress();

// 2. Start from first level
testMotorBasics();

// 3. Complete all objectives (manually or with helper)
completeCurrentObjective(); // Repeat until level complete

// 4. Level will auto-advance to next scene
// 5. Repeat for each level
```

### Workflow 3: Test Specific Features

```javascript
// Test component restrictions
testMotorBasics(); // Should only show Motor in toolbar
testBeltSystems(); // Should show Motor, Pulley, Gear + Belt tool

// Test objective validation
testGearIntroduction();
// Place components and see objectives update in real-time

// Test level completion flow
skipToNextLevel(); // See completion modal and progression
```

## Visual Testing Panel

Press `F1` to toggle the visual testing panel in the top-left corner.

The panel provides:

- **Quick Test Buttons** - One-click scene testing
- **Utility Buttons** - Level menu, unlock all, reset
- **Debug Buttons** - Complete objectives, skip levels

## Testing Each Scene Type

### Motor Basics Scene

```javascript
testMotorBasics();

// What to test:
// ✅ Only motor component in toolbar
// ✅ No tools available
// ✅ Place motor objective updates
// ✅ Start simulation objective works
// ✅ Level completion flow
// ✅ Hints appear at right times
```

### Gear Introduction Scene

```javascript
testGearIntroduction();

// What to test:
// ✅ Motor + Gear components available
// ✅ No tools (gears auto-mesh)
// ✅ Place motor objective
// ✅ Place 2 gears objective
// ✅ Gear meshing objective (drag gears close)
// ✅ Contextual hints for each step
```

### Belt Systems Scene

```javascript
testBeltSystems();

// What to test:
// ✅ Motor + Pulley + Gear components
// ✅ Belt tool available
// ✅ Place motor objective
// ✅ Place 2 pulleys objective
// ✅ Create belt connection objective
// ✅ Start simulation objective
// ✅ Belt tool functionality
```

### Forklift Challenge Scene

```javascript
testForkliftChallenge();

// What to test:
// ✅ All components available
// ✅ Belt tool available
// ✅ Place forklift objective
// ✅ Place motor objective
// ✅ Connect motor to forklift objective
// ✅ Test simulation objective
// ✅ Save design objective
// ✅ Engineering tips display
// ✅ Final completion celebration
```

## Advanced Testing

### Test Scene Status

```javascript
// Get current scene information
sceneTester.getSceneStatus();

// Returns:
// {
//   active: true,
//   title: "Motor Basics",
//   difficulty: "beginner",
//   objectives: 2,
//   completed: 1,
//   progress: 50,
//   enabledComponents: ["motor"],
//   enabledTools: []
// }
```

### Auto-Test All Scenes

```javascript
// Automatically test all scenes in sequence
sceneTester.autoTestAll();

// This will:
// 1. Unlock all levels
// 2. Test each scene for 3 seconds
// 3. Move to next scene automatically
// 4. Useful for quick smoke testing
```

### Direct Scene Creation

```javascript
// Create scenes directly (bypasses level manager)
sceneTester.createSceneDirect("motor"); // MotorBasicsScene
sceneTester.createSceneDirect("gear"); // GearIntroductionScene
sceneTester.createSceneDirect("belt"); // BeltSystemsScene
sceneTester.createSceneDirect("forklift"); // ForkliftChallengeScene
```

## Testing Checklist

### For Each Scene:

- [ ] **Scene Loads** - No console errors
- [ ] **Toolbar Correct** - Only expected components/tools show
- [ ] **Introduction Modal** - Shows objectives and components
- [ ] **Objectives Update** - Real-time progress tracking works
- [ ] **Hints Display** - Contextual hints appear at right times
- [ ] **Objective Completion** - Notifications show when objectives complete
- [ ] **Level Completion** - Modal shows with correct stats and buttons
- [ ] **Progression** - Next level unlocks and loads correctly
- [ ] **Visual Elements** - Header, progress bar, notifications look good
- [ ] **Cleanup** - Previous scene elements removed when switching

### For Level Manager:

- [ ] **Level Unlocking** - Prerequisites work correctly
- [ ] **Progress Persistence** - Progress saves and loads correctly
- [ ] **Level Selection** - Menu shows correct status for each level
- [ ] **Completion Tracking** - Statistics update correctly
- [ ] **Reset Functionality** - Reset clears all progress

## Common Issues & Solutions

### Scene Won't Load

```javascript
// Check if level is unlocked
unlockAllLevels();
testMotorBasics();
```

### Objectives Not Updating

```javascript
// Check scene status
sceneTester.getSceneStatus();

// Force complete for testing
completeCurrentObjective();
```

### UI Elements Overlapping

```javascript
// Reset and try again
resetProgress();
testMotorBasics();
```

### Console Errors

- Check browser console for specific error messages
- Make sure all scene files are properly imported
- Verify EditorScene base class is available

## Performance Testing

### Memory Leaks

```javascript
// Test scene switching multiple times
for (let i = 0; i < 10; i++) {
  testMotorBasics();
  setTimeout(() => testGearIntroduction(), 1000);
}

// Check browser memory usage in DevTools
```

### Rapid Scene Switching

```javascript
// Test rapid switching
testMotorBasics();
testGearIntroduction();
testBeltSystems();
testForkliftChallenge();

// Should handle gracefully without errors
```

## Integration with Your App

### In your main.ts:

```typescript
import { SceneTester } from "./lib/scenes/SceneTester";

// Only initialize in development
if (process.env.NODE_ENV === "development") {
  new SceneTester();
}
```

### Production Build:

The testing system should be excluded from production builds to avoid exposing debug functionality to users.

---

Happy Testing! 🧪✨
