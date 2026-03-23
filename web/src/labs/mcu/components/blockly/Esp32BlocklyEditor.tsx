import React, { useEffect, useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { Save, FolderOpen, HelpCircle, Cpu, X } from "lucide-react";
import * as Blockly from "blockly";
import "blockly/blocks"; // register core blocks (logic, loops, math, variables, etc.)
import "@blockly/plugin-workspace-search";
import { pythonGenerator } from "blockly/python";
import { uploadToMicroPython } from "../../lib/micropython/WebSerialUploader";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { python as pythonLang } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import { getLogicCategory, registerLogicBlocks } from "./categories/logic";
import {
  getControlCategory,
  registerControlBlocks,
} from "./categories/control";
import {
  getNumbersCategory,
  registerNumbersBlocks,
} from "./categories/numbers";
import { getMathCategory, registerMathBlocks } from "./categories/math";
import {
  getStringsCategory,
  registerStringsBlocks,
} from "./categories/strings";
import {
  getVariablesCategory,
  registerVariablesCustomDialog,
  registerVariableChangeBlock,
} from "./categories/variables";
import {
  getIOCategory,
  registerIOBlocks,
  setGetCurrentPinPairs,
} from "./categories/io";
import {
  getFunctionsCategory,
  registerFunctionsBlocks,
  registerFunctionsProcedureCategory,
} from "./categories/functions";
import {
  getEventsCategory,
  registerEventsBlocks,
  resetTimerCount,
  setGetCurrentInterruptPinPairs,
  setGetCurrentAnalogPinPairs,
  setGetCurrentTouchPinPairs,
} from "./categories/events";
import {
  getCommunicationCategory,
  registerCommunicationBlocks,
} from "./categories/communication";
import {
  getSensorsCategory,
  registerSensorsBlocks,
} from "./categories/sensors";

type Props = {
  title?: string;
  exitPath?: string;
  onExit?: () => void;
  ydoc?: Y.Doc;
  yjsProvider?: WebsocketProvider;
};

// Board configuration map for dynamic GPIO options
type BoardConfig = {
  id: string;
  label: string;
  digitalPins: number[];
  interruptPins: number[]; // Pins that support hardware interrupts
  analogPins: number[]; // ADC-capable pins
  touchPins: number[]; // Touch-capable pins (ESP32 only)
};

const BOARD_CONFIGS: Record<string, BoardConfig> = {
  "esp32-devkit-v1": {
    id: "esp32-devkit-v1",
    label: "ESP32 DevKit V1",
    digitalPins: [
      2, 4, 5, 12, 13, 14, 15, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33,
    ],
    // Most GPIO pins support interrupts (avoid 6-11 which are flash pins)
    interruptPins: [
      0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32,
      33, 34, 35, 36, 39,
    ],
    // ADC1: GPIO 32-39, ADC2: GPIO 0, 2, 4, 12-15, 25-27
    analogPins: [32, 33, 34, 35, 36, 39],
    // Touch pins T0-T9
    touchPins: [4, 0, 2, 15, 13, 12, 14, 27, 33, 32],
  },
  "esp32-s2": {
    id: "esp32-s2",
    label: "ESP32-S2",
    digitalPins: [
      1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21,
    ],
    interruptPins: [
      1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21,
    ],
    analogPins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    touchPins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], // T1-T14
  },
  "esp32-c3": {
    id: "esp32-c3",
    label: "ESP32-C3",
    digitalPins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    interruptPins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    analogPins: [0, 1, 2, 3, 4],
    touchPins: [], // ESP32-C3 doesn't have touch pins
  },
};

let currentBoardId: string = "esp32-devkit-v1";

function getCurrentPinPairs(): [string, string][] {
  const cfg = BOARD_CONFIGS[currentBoardId] ?? BOARD_CONFIGS["esp32-devkit-v1"];
  return cfg.digitalPins.map((p) => ["GPIO " + p, String(p)]);
}

function getCurrentInterruptPinPairs(): [string, string][] {
  const cfg = BOARD_CONFIGS[currentBoardId] ?? BOARD_CONFIGS["esp32-devkit-v1"];
  return cfg.interruptPins.map((p) => ["GPIO " + p, String(p)]);
}

function getCurrentAnalogPinPairs(): [string, string][] {
  const cfg = BOARD_CONFIGS[currentBoardId] ?? BOARD_CONFIGS["esp32-devkit-v1"];
  return cfg.analogPins.map((p) => ["GPIO " + p, String(p)]);
}

function getCurrentTouchPinPairs(): [string, string][] {
  const cfg = BOARD_CONFIGS[currentBoardId] ?? BOARD_CONFIGS["esp32-devkit-v1"];
  // Map touch pins to their Touch channel names
  const touchMap: Record<number, string> = {
    4: "T0",
    0: "T1",
    2: "T2",
    15: "T3",
    13: "T4",
    12: "T5",
    14: "T6",
    27: "T7",
    33: "T8",
    32: "T9",
  };
  return cfg.touchPins.map((p) => [
    `${touchMap[p] || "T?"} (GPIO ${p})`,
    String(p),
  ]);
}

function buildToolboxJson(boardLabel: string) {
  return {
    kind: "categoryToolbox",
    contents: [
      getNumbersCategory(),
      getMathCategory(),
      getStringsCategory(),
      getVariablesCategory(),
      getLogicCategory(),
      getControlCategory(),
      getFunctionsCategory(),
      getIOCategory(boardLabel),
      {
        kind: "sep",
        id: "sep_advanced",
      },
      getEventsCategory(),
      getCommunicationCategory(),
      getSensorsCategory(),
    ],
  } as any;
}

// Register all custom blocks from category files
function registerCustomBlocks() {
  if (esp32BlocksRegistered) return;
  esp32BlocksRegistered = true;

  // Set up the pin pairs callback for IO blocks
  setGetCurrentPinPairs(getCurrentPinPairs);

  // Set up specialized pin callbacks for Events blocks
  setGetCurrentInterruptPinPairs(getCurrentInterruptPinPairs);
  setGetCurrentAnalogPinPairs(getCurrentAnalogPinPairs);
  setGetCurrentTouchPinPairs(getCurrentTouchPinPairs);

  // Register blocks from each category
  registerEventsBlocks();
  registerLogicBlocks();
  registerControlBlocks();
  registerNumbersBlocks();
  registerMathBlocks();
  registerStringsBlocks();
  registerFunctionsBlocks();
  registerIOBlocks();
  registerCommunicationBlocks();
  registerSensorsBlocks();

  // Register custom variable creation dialog and change block
  registerVariablesCustomDialog();
  registerVariableChangeBlock();
}

// Add custom block styling for wider control and logic blocks
function applyCustomBlockStyles() {
  const style = document.createElement("style");
  style.id = "blockly-custom-styles";
  if (document.getElementById("blockly-custom-styles")) return;

  // SVG styling - Note: Most SVG properties are set directly by Blockly's renderer
  // The custom renderer constants (NOTCH_WIDTH, NOTCH_HEIGHT, CORNER_RADIUS) are the primary way to style
  style.textContent = `
    /* Smooth rendering for better appearance */
    svg.blocklySvg {
      shape-rendering: auto;
      -webkit-font-smoothing: antialiased;
    }
  `;
  document.head.appendChild(style);
}

// Module-scoped registration flag
let esp32BlocksRegistered = false;

function applyToolboxIcons(ws: Blockly.WorkspaceSvg) {
  const toolbox: any = (ws as any).getToolbox ? (ws as any).getToolbox() : null;
  if (!toolbox || !toolbox.getToolboxItems) {
    return;
  }

  // Map category names to their icons
  const ICON_MAP: Record<string, string> = {
    Logic: "/assets/blockly/logic.svg",
    Control: "/assets/blockly/control.svg",
    Numbers: "/assets/blockly/number.svg",
    Math: "/assets/blockly/maths.svg",
    Text: "/assets/blockly/strings.svg",
    Variables: "/assets/blockly/variable.svg",
    Functions: "/assets/blockly/functions.svg",
    "Input/Output": "/assets/blockly/input-output.svg",
    Events: "/assets/blockly/events.svg",
    Communication: "/assets/blockly/communication.svg",
    Sensors: "/assets/blockly/sensors.svg",
    "⚡ Sensors - Quick Start": "/assets/blockly/sensors.svg",
    "🔧 Sensors - Advanced": "/assets/blockly/sensors.svg",
  };

  const items = toolbox.getToolboxItems();

  items.forEach((item: any) => {
    if (!item || !item.getName || !item.getDiv) return;
    const name = item.getName();

    // Match icon by category name
    const iconSrc = ICON_MAP[name];

    if (!iconSrc) {
      return;
    }
    const div: HTMLElement | null = item.getDiv();
    if (!div) {
      return;
    }
    // Style the row container
    div.style.display = "flex";
    div.style.flexDirection = "row";
    div.style.alignItems = "center";
    div.style.justifyContent = "flex-start";
    div.style.gap = "8px";
    div.style.padding = "6px 12px";
    div.style.margin = "1px 0";
    div.style.borderRadius = "6px";
    div.style.cursor = "pointer";
    div.style.position = "relative";
    div.style.minHeight = "36px";
    div.style.transition = "background-color 0.15s ease";

    // Style the label
    const label = div.querySelector(".blocklyTreeLabel") as HTMLElement | null;
    if (label) {
      label.style.textAlign = "left";
      label.style.pointerEvents = "none";
      label.style.fontSize = "13px";
      label.style.fontWeight = "600";
      label.style.flex = "1";
    }

    // Hide default tree icon
    const treeIcon = div.querySelector(
      ".blocklyTreeIcon"
    ) as HTMLElement | null;
    if (treeIcon) treeIcon.style.display = "none";

    // Add hover and selection handlers
    const updateTextColor = () => {
      if (div.classList.contains("blocklyTreeSelected")) {
        if (label) label.style.color = "#ff9f1c"; // Highlighted color
        const icon = div.querySelector(
          "img.__catIcon"
        ) as HTMLImageElement | null;
        if (icon)
          icon.style.filter =
            "brightness(0) saturate(100%) invert(64%) sepia(94%) saturate(1817%) hue-rotate(359deg) brightness(102%) contrast(101%)"; // Orange tint
        div.style.backgroundColor = "rgba(0, 0, 0, 0.15)"; // Background for selected
      } else {
        if (label) label.style.color = "#5c3d2e"; // Default color
        const icon = div.querySelector(
          "img.__catIcon"
        ) as HTMLImageElement | null;
        if (icon) icon.style.filter = "none";
        div.style.backgroundColor = "transparent";
      }
    };

    // Make the entire div clickable and hoverable
    const handleMouseEnter = () => {
      if (!div.classList.contains("blocklyTreeSelected")) {
        if (label) label.style.color = "#3d2817"; // Darker text on hover
        div.style.backgroundColor = "rgba(0, 0, 0, 0.05)"; // Slight background on hover
      }
    };

    const handleMouseLeave = () => {
      if (!div.classList.contains("blocklyTreeSelected")) {
        if (label) label.style.color = "#5c3d2e"; // Reset to default
        div.style.backgroundColor = "transparent";
      }
    };

    div.addEventListener("mouseenter", handleMouseEnter);
    div.addEventListener("mouseleave", handleMouseLeave);

    // Watch for selection changes
    const observer = new MutationObserver(() => {
      updateTextColor();
    });
    observer.observe(div, { attributes: true, attributeFilter: ["class"] });

    // Initial color update
    updateTextColor();
    const existing = div.querySelector(
      "img.__catIcon"
    ) as HTMLImageElement | null;
    if (!existing) {
      const img = document.createElement("img");
      img.src = iconSrc;
      img.alt = name;
      img.width = 20;
      img.height = 20;
      img.className = "__catIcon";
      div.insertBefore(img, div.firstChild);
    } else if (existing.src !== iconSrc) {
      existing.src = iconSrc;
    }
  });
}

let toolboxIconStylesInjected = false;
function injectToolboxIconStyles() {
  if (toolboxIconStylesInjected) return;
  const style = document.createElement("style");
  style.textContent = `
    /* Allow SVG elements to render outside the injection div */
    .injectionDiv {
      overflow: visible !important;
    }
    
    svg.blocklySvg {
      overflow: visible !important;
    }
    
    /* Make toolbox scrollable but allow flyout to overflow */
    .blocklyToolboxDiv {
      overflow-y: auto !important;
      overflow-x: visible !important;
    }
    
    /* Ensure flyout is properly layered on top and not clipped */
    .blocklyFlyout {
      z-index: 50 !important;
      position: relative !important;
    }
    
    .blocklyFlyoutBackground {
      position: relative !important;
    }
    
    /* Add padding to toolbox container to prevent cramping */
    .blocklyToolboxDiv .blocklyToolboxContents {
      padding: 4px 6px 8px 6px !important;
    }
    
    /* Hide default tree icon */
    .blocklyToolboxDiv .blocklyTreeIcon { 
      display: none !important; 
    }
    
    /* Style the Advanced section label */
    .blocklyToolboxDiv .advanced-section-label {
      text-align: center !important;
      font-weight: 700 !important;
      font-size: 11px !important;
      color: #7f8c8d !important;
      padding: 12px 6px 6px 6px !important;
      margin: 8px 0 4px 0 !important;
      letter-spacing: 0.5px !important;
      opacity: 0.8 !important;
    }
    
    /* Separator line */
    .blocklyToolboxDiv .blocklyTreeSeparator {
      margin: 12px 8px !important;
      border-top: 2px solid rgba(127, 140, 141, 0.5) !important;
      height: 0 !important;
    }
    
    /* Custom category icons */
    .blocklyToolboxDiv img.__catIcon { 
      width: 20px !important;
      height: 20px !important;
      display: block !important;
      margin: 0 auto !important;
      pointer-events: none !important;
    }
    
    
    /* Sub-category labels (Digital I/O, Analog I/O, Serial, etc.) in flyout */
    .blocklyFlyout .blocklyFlyoutLabel {
      margin-top: 32px !important;
      margin-bottom: 8px !important;
    }
    
    .blocklyFlyout .blocklyFlyoutLabel:first-child {
      margin-top: 4px !important;
    }
    
    .blocklyFlyout .blocklyFlyoutLabelText {
      fill: #5c3d2e !important;
      font-weight: 700 !important;
      font-size: 13px !important;
    }
    
    .blocklyFlyout .blocklyFlyoutLabelBackground {
      fill: rgba(255, 159, 28, 0.15) !important;
      fill-opacity: 1 !important;
      rx: 6 !important;
      ry: 6 !important;
    }
    
    /* Communication category section labels - more prominent */
    .blocklyFlyout .comm-section-label {
      margin-top: 40px !important;
      margin-bottom: 12px !important;
    }
    
    .blocklyFlyout .comm-section-label:first-child {
      margin-top: 8px !important;
    }
    
    .blocklyFlyout .comm-section-label .blocklyFlyoutLabelText {
      fill: #16a085 !important;
      font-weight: 800 !important;
      font-size: 14px !important;
    }
    
    .blocklyFlyout .comm-section-label .blocklyFlyoutLabelBackground {
      fill: rgba(22, 160, 133, 0.12) !important;
      rx: 6 !important;
      ry: 6 !important;
    }
    
    /* Sensor category section labels - green themed */
    .blocklyFlyout .sensor-section-label {
      margin-top: 40px !important;
      margin-bottom: 12px !important;
    }
    
    .blocklyFlyout .sensor-section-label:first-child {
      margin-top: 8px !important;
    }
    
    .blocklyFlyout .sensor-section-label .blocklyFlyoutLabelText {
      fill: #27ae60 !important;
      font-weight: 800 !important;
      font-size: 14px !important;
    }
    
    .blocklyFlyout .sensor-section-label .blocklyFlyoutLabelBackground {
      fill: rgba(39, 174, 96, 0.12) !important;
      rx: 6 !important;
      ry: 6 !important;
    }
    
    /* Reduce spacing between blocks in flyout - Scratch-like tight spacing */
    .blocklyFlyout .blocklyBlockCanvas > g:not(.blocklyFlyoutLabel):not(.blocklyFlyoutButton) {
      margin-top: -4px;
    }
  `;
  document.head.appendChild(style);
  toolboxIconStylesInjected = true;
}

// Track if spacing was already applied to avoid duplicate applications
let spacingApplied = false;
// Store the original Y positions and calculated offsets
const elementOffsets = new Map<Element, { baseY: number; offset: number }>();

// Apply spacing to sub-category labels in the flyout
function applyFlyoutLabelSpacing() {
  // Target the TOOLBOX flyout (not the regular flyout)
  const toolboxFlyout = document.querySelector(".blocklyToolboxFlyout");
  if (!toolboxFlyout) {
    return false;
  }

  // Get the block canvas inside the toolbox flyout
  const blockCanvas = toolboxFlyout.querySelector(".blocklyBlockCanvas");
  if (!blockCanvas) {
    return false;
  }

  // Get direct children of the block canvas (these are the blocks and labels)
  const allElements = Array.from(blockCanvas.children) as SVGGElement[];

  if (allElements.length === 0) {
    return false; // No blocks yet
  }

  // TEMPORARILY DISABLED - spacing modifications may interfere with scrolling
  // TODO: Re-enable after fixing scroll issue
  spacingApplied = true;
  return true;

  /* 
  if (spacingApplied) {
    return true;
  }

  // Clear previous offsets
  elementOffsets.clear();
  */

  // Count different types
  const separators = allElements.filter((el) =>
    el.classList.contains("blocklyFlyoutButton")
  );
  const labels = allElements.filter((el) =>
    el.querySelector(".blocklyFlyoutLabelText")
  );
  const blocks = allElements.filter(
    (el) =>
      !el.classList.contains("blocklyFlyoutButton") &&
      !el.querySelector(".blocklyFlyoutLabelText")
  );

  let cumulativeOffset = 0;
  let prevWasLabel = false;
  let isFirstItem = true;

  allElements.forEach((element, index) => {
    // Identify if this is a label or separator
    const labelText = element.querySelector(".blocklyFlyoutLabelText");
    const isLabel = labelText !== null;
    const isSeparator = element.classList.contains("blocklyFlyoutButton");

    // Get the current transform - handle different formats and negative numbers
    const transform = element.getAttribute("transform") || "";
    const match = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);

    if (!match) {
      return;
    }

    const x = parseFloat(match[1]);
    const baseY = parseFloat(match[2]);

    if (isSeparator) {
      // Treat separators like labels - add spacing before them
      if (!isFirstItem) {
        cumulativeOffset += 25; // Gap before separators
      }
      prevWasLabel = true; // Next block should be close to separator
    } else if (isLabel) {
      // Before a sub-category label (except the very first one)
      if (!isFirstItem) {
        cumulativeOffset += 30; // Gap before labels
      }
      prevWasLabel = true;
    } else {
      // This is a block
      if (prevWasLabel) {
        // First block right after a label/separator - reduce gap slightly
        cumulativeOffset -= 8; // Bring closer to label
        prevWasLabel = false;
      } else if (!isFirstItem) {
        // Reduce spacing between consecutive blocks (Scratch-like)
        cumulativeOffset -= 12; // Even tighter spacing between blocks
      }
    }

    // Apply the modified position
    const newY = baseY + cumulativeOffset;
    element.setAttribute("transform", `translate(${x}, ${newY})`);

    isFirstItem = false;
  });

  spacingApplied = true;
  return true;
}

// Clean up Python code: remove duplicate imports and move them to the top
function cleanupPythonCode(code: string): string {
  const lines = code.split("\n");
  const imports = new Set<string>();
  const programStartLines: string[] = [];
  const otherLines: string[] = [];
  let hasEventHandlers = false;
  let hasForeverLoop = false;
  let inProgramStart = false;

  // Separate imports, program start code, and other code
  for (const line of lines) {
    const trimmed = line.trim();

    // Check for program start marker
    if (trimmed === "# Program start") {
      inProgramStart = true;
      continue;
    }

    if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
      // Deduplicate imports
      imports.add(trimmed);
    } else if (trimmed !== "") {
      // If we're in program start section, collect those lines separately
      if (inProgramStart && trimmed !== "") {
        programStartLines.push(line);
        // Program start section ends when we hit another comment or empty line pattern
        if (trimmed.startsWith("#") && !trimmed.includes("Program start")) {
          inProgramStart = false;
        }
      } else {
        // Keep non-empty, non-import lines
        otherLines.push(line);
        // Check if we have event handlers (interrupts or timers)
        if (
          trimmed.includes(".irq(") ||
          trimmed.includes("Timer(") ||
          trimmed.includes("_thread.start_new_thread") ||
          trimmed.includes("check_serial_messages")
        ) {
          hasEventHandlers = true;
        }
        // Check if user already has a forever loop
        if (trimmed === "while True:") {
          hasForeverLoop = true;
        }
      }
    }
  }

  // Build final code with imports at top
  const result: string[] = [];

  // Add imports first (sorted for consistency)
  if (imports.size > 0) {
    const sortedImports = Array.from(imports).sort();
    result.push(...sortedImports);
    result.push(""); // Empty line after imports
  }

  // Add program start code BEFORE setup code
  if (programStartLines.length > 0) {
    result.push("# === Program Start (runs once) ===");
    result.push(...programStartLines);
    result.push(""); // Empty line after program start
  }

  // If we have message handlers and an existing forever loop, inject check into it
  const hasMessageHandlers = otherLines.some((line) =>
    line.includes("check_serial_messages")
  );

  if (hasForeverLoop && hasMessageHandlers) {
    // Insert check_serial_messages call inside existing while True loop
    const modifiedLines: string[] = [];
    let justFoundWhileTrue = false;

    for (let i = 0; i < otherLines.length; i++) {
      const line = otherLines[i];
      const trimmed = line.trim();

      if (trimmed === "while True:") {
        justFoundWhileTrue = true;
        modifiedLines.push(line);
        continue;
      }

      if (justFoundWhileTrue && trimmed !== "") {
        // Get the indent level of the first statement inside while True
        const indent = line.search(/\S/);
        const indentStr = " ".repeat(indent);
        // Add check_serial_messages before the first statement
        modifiedLines.push(
          `${indentStr}check_serial_messages()  # Check for serial messages`
        );
        justFoundWhileTrue = false;
      }

      modifiedLines.push(line);
    }

    result.push(...modifiedLines);
  } else {
    // Add the rest of the code as-is
    result.push(...otherLines);
  }

  // Add keep-alive loop if event handlers exist but no forever loop
  // This runs EVERY time code is generated, so:
  // - If user deletes forever block → loop is automatically added
  // - If user adds forever block → loop is automatically removed
  if (hasEventHandlers && !hasForeverLoop) {
    // Ensure time is imported since we use time.sleep()
    if (!imports.has("import time")) {
      imports.add("import time");
      // Rebuild imports section
      result.splice(0, result.length); // Clear result
      if (imports.size > 0) {
        const sortedImports = Array.from(imports).sort();
        result.push(...sortedImports);
        result.push(""); // Empty line after imports
      }
      // Re-add program start if it existed
      if (programStartLines.length > 0) {
        result.push("# === Program Start (runs once) ===");
        result.push(...programStartLines);
        result.push(""); // Empty line after program start
      }
      // Re-add other lines
      result.push(...otherLines);
    }

    result.push("");
    result.push("# Keep program running for event handlers");
    result.push("while True:");
    // Check if we have serial message handlers
    if (hasMessageHandlers) {
      result.push("    check_serial_messages()  # Check for serial messages");
    }
    result.push("    time.sleep(0.01)  # 10ms delay to prevent CPU overload");
  }

  return result.join("\n").trim();
}

export const Esp32BlocklyEditor: React.FC<Props> = ({
  title = "Micro Maker",
  exitPath,
  onExit,
  ydoc,
  yjsProvider,
}) => {
  const divRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const yjsApplyingRef = useRef(false);
  const codeEditorRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const isInitializingRef = useRef<boolean>(false); // Flag to prevent validation during init
  const [python, setPython] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [showDialog, setShowDialog] = useState<boolean>(false);
  const [s3Url, setS3Url] = useState<string>("");
  const [selectedPort, setSelectedPort] = useState<SerialPort | null>(null);
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [baud, setBaud] = useState<string>("115200");

  // Serial Monitor state
  const [isMonitorConnected, setIsMonitorConnected] = useState<boolean>(false);
  const [serialOutput, setSerialOutput] = useState<string>("");
  const [monitorPort, setMonitorPort] = useState<SerialPort | null>(null);
  const serialReaderRef =
    useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const serialOutputRef = useRef<HTMLDivElement | null>(null);

  // Web Bluetooth state
  const [showBleDialog, setShowBleDialog] = useState<boolean>(false);
  const [bleDevice, setBleDevice] = useState<any | null>(null);
  const [bleConnected, setBleConnected] = useState<boolean>(false);
  const [bleMessages, setBleMessages] = useState<string[]>([]);
  const [bleSendText, setBleSendText] = useState<string>("");
  const bleCharacteristicRef = useRef<any | null>(null);
  const [showUploadMenu, setShowUploadMenu] = useState<boolean>(false);
  const [showSerialDialog, setShowSerialDialog] = useState<boolean>(false);

  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID());
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showProjects, setShowProjects] = useState<boolean>(false);
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const MM_PROJECTS_KEY = "stemplitude_micromaker_projects";

  const loadProjectsFromStorage = () => {
    try { return JSON.parse(localStorage.getItem(MM_PROJECTS_KEY) || "[]"); }
    catch { return []; }
  };

  const handleSaveProject = () => {
    if (!workspaceRef.current) return;
    const xml = Blockly.Xml.workspaceToDom(workspaceRef.current);
    const xmlText = Blockly.Xml.domToText(xml);
    const now = new Date().toISOString();
    const projects = loadProjectsFromStorage();
    const idx = projects.findIndex((p: any) => p.id === projectId);
    const project = {
      id: projectId, name: projectName, xml: xmlText,
      boardId, updatedAt: now,
      createdAt: idx >= 0 ? projects[idx].createdAt : now,
    };
    if (idx >= 0) projects[idx] = project; else projects.unshift(project);
    localStorage.setItem(MM_PROJECTS_KEY, JSON.stringify(projects));
    setSavedProjects(projects);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus(null), 1500);
  };

  const handleLoadProject = (project: any) => {
    if (!workspaceRef.current) return;
    workspaceRef.current.clear();
    const xml = Blockly.Xml.textToDom(project.xml);
    Blockly.Xml.domToWorkspace(xml, workspaceRef.current);
    setProjectId(project.id);
    setProjectName(project.name);
    if (project.boardId) setBoardId(project.boardId);
    setShowProjects(false);
  };

  const handleDeleteProject = (id: string) => {
    const projects = loadProjectsFromStorage().filter((p: any) => p.id !== id);
    localStorage.setItem(MM_PROJECTS_KEY, JSON.stringify(projects));
    setSavedProjects(projects);
  };

  const handleNewProject = () => {
    if (!workspaceRef.current) return;
    workspaceRef.current.clear();
    insertStarterBlocks(workspaceRef.current);
    setProjectId(crypto.randomUUID());
    setProjectName("Untitled Project");
    setShowProjects(false);
  };

  const [boardId, setBoardId] = useState<string>(currentBoardId);
  const toolbox = useMemo(
    () => buildToolboxJson(BOARD_CONFIGS[boardId]?.label ?? "ESP32"),
    [boardId]
  );

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveProject();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [projectId, projectName, boardId]);

  // Auto-scroll serial monitor to bottom when new output arrives
  useEffect(() => {
    if (serialOutputRef.current && serialOutput) {
      serialOutputRef.current.scrollTop = serialOutputRef.current.scrollHeight;
    }
  }, [serialOutput]);

  useEffect(() => {
    // Suppress Blockly's internal deprecation warning for getAllVariables
    // This is a known issue in Blockly v12 that will be fixed in v13
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      const message = args[0];
      if (
        typeof message === "string" &&
        message.includes("getAllVariables was deprecated")
      ) {
        return; // Suppress this specific warning
      }
      originalWarn.apply(console, args);
    };

    registerCustomBlocks();
    // applyCustomBlockStyles(); // Reverted to default Blockly styling
    if (!divRef.current) return;
    const playfulTheme = (Blockly.Theme.defineTheme as any)("playful", {
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: "#ffffff",
        toolboxBackgroundColour: "#ffe8cc",
        toolboxForegroundColour: "#5c3d2e",
        flyoutBackgroundColour: "#f5e6d3",
        flyoutForegroundColour: "#2d1f14",
        insertionMarkerColour: "#ff9f1c",
        insertionMarkerOpacity: 0.3,
        scrollbarColour: "#d4a574",
        selectedGlowColour: "#ff9f1c",
      },
      categoryStyles: {
        logic_category: { colour: "#6a4c93" },
        loop_category: { colour: "#1982c4" },
        math_category: { colour: "#8ac926" },
        esp_category: { colour: "#ff595e" },
      },
      blockStyles: {
        // Standard Blockly block styling - this is the proper way to color blocks
        logic_blocks: {
          colourPrimary: "#6a4c93",
          colourSecondary: "#8b6ba3",
          colourTertiary: "#4a2c73",
        },
        loop_blocks: {
          colourPrimary: "#1982c4",
          colourSecondary: "#3b9edb",
          colourTertiary: "#0d5fa3",
        },
        math_blocks: {
          colourPrimary: "#8ac926",
          colourSecondary: "#a8d654",
          colourTertiary: "#6a8c1f",
        },
        esp_blocks: {
          colourPrimary: "#ff595e",
          colourSecondary: "#ff7f84",
          colourTertiary: "#dd3639",
        },
      },
    });
    const ws = Blockly.inject(divRef.current, {
      toolbox,
      toolboxPosition: "start",
      horizontalLayout: false,
      theme: playfulTheme,
      renderer: "zelos",
      scrollbars: true,
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true },
    });
    workspaceRef.current = ws;

    injectToolboxIconStyles();

    // Improve flyout scrolling
    const improveScrolling = () => {
      const style = document.createElement("style");
      style.textContent = `
        .blocklyToolboxFlyout {
          touch-action: pan-y;
        }
        .blocklyFlyout .blocklyScrollbarVertical {
          display: block !important;
        }
        .blocklyFlyout .blocklyBlockCanvas {
          will-change: transform;
        }
      `;
      document.head.appendChild(style);
    };

    // Apply CSS improvements immediately
    improveScrolling();

    // Fix flyout rendering order - ensure it renders on top
    setTimeout(() => {
      const injectionDiv = divRef.current?.querySelector(".injectionDiv");
      if (injectionDiv) {
        const svg = injectionDiv.querySelector("svg.blocklySvg");
        if (svg) {
          // Find the flyout group and move it to the end (renders on top)
          const flyout = svg.querySelector(".blocklyFlyout");
          const toolbox = svg.querySelector(".blocklyToolboxDiv");

          if (flyout && toolbox) {
            // Ensure flyout comes after toolbox in DOM order
            svg.appendChild(flyout);
          }
        }
      }

      // Force Blockly to recalculate positions after layout settles
      Blockly.svgResize(ws);
    }, 100);

    // Also trigger another resize after a longer delay to ensure everything is positioned correctly
    setTimeout(() => {
      Blockly.svgResize(ws);
    }, 300);

    // Register custom function procedure category
    registerFunctionsProcedureCategory(ws);

    // Register custom dynamic variable category callback with shadow blocks
    ws.registerToolboxCategoryCallback(
      "VARIABLE_DYNAMIC",
      (workspace: Blockly.WorkspaceSvg) => {
        const variableList: any[] = [];

        // Add "Create variable" button
        variableList.push({
          kind: "button",
          text: "Create variable",
          callbackKey: "CREATE_VARIABLE",
        });

        // Get all variables
        const variableModels = workspace.getAllVariables();

        if (variableModels.length > 0) {
          // Add blocks for each variable with shadow blocks
          variableModels.forEach((variable) => {
            // Set variable block
            variableList.push({
              kind: "block",
              type: "variables_set",
              gap: 8,
              fields: {
                VAR: { id: variable.getId() },
              },
            });

            // Change variable block
            variableList.push({
              kind: "block",
              type: "variables_change",
              gap: 8,
              fields: {
                VAR: { id: variable.getId() },
              },
              inputs: {
                DELTA: {
                  shadow: { type: "math_number", fields: { NUM: 1 } },
                },
              },
            });

            // Get variable block
            variableList.push({
              kind: "block",
              type: "variables_get",
              gap: 8,
              fields: {
                VAR: { id: variable.getId() },
              },
            });
          });
        }

        return variableList;
      }
    );

    // Register the "Create variable" button callback
    ws.registerButtonCallback("CREATE_VARIABLE", (button) => {
      console.log("CREATE_VARIABLE button clicked");
      const workspace = button.getTargetWorkspace();
      console.log("Target workspace:", workspace);

      // Custom variable creation that works with our dialog
      Blockly.Variables.createVariableButtonHandler(
        workspace,
        (variableName?: string | null) => {
          console.log("Variable creation callback with name:", variableName);
          if (variableName) {
            // Create the variable
            workspace.createVariable(variableName);
            console.log("Variable created:", variableName);

            // Refresh the toolbox to show the new variable
            workspace.refreshToolboxSelection();
            console.log("Toolbox refreshed");
          }
        },
        ""
      );
    });

    // Set initialization flag to prevent premature validation
    isInitializingRef.current = true;

    // Apply icons with a delay to ensure toolbox is fully rendered
    setTimeout(() => {
      try {
        applyToolboxIcons(ws);
      } catch (e) {
        console.error("Error applying toolbox icons:", e);
      }

      // Insert starter blocks after workspace is fully rendered
      // Use longer delay to ensure workspace is completely initialized
      setTimeout(() => {
        console.log("🕐 Attempting to insert starter blocks...");
        insertStarterBlocks(ws);

        // Validate block structure after starter blocks are added
        // and events are re-enabled
        setTimeout(() => {
          console.log("🔍 Running initial validation...");
          // Clear initialization flag to allow validation
          isInitializingRef.current = false;
          validateBlockStructure(ws);
        }, 200);
      }, 1000);
    }, 100);

    // Set up observer to apply spacing when flyout opens
    const flyoutObserver = new MutationObserver(() => {
      // Delay slightly to ensure DOM is fully updated
      setTimeout(() => {
        applyFlyoutLabelSpacing();
      }, 10);
    });

    // Wait for flyout to be created, then observe it
    setTimeout(() => {
      const flyout = document.querySelector(".blocklyFlyout");
      if (flyout) {
        flyoutObserver.observe(flyout, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }
    }, 200);

    const onChange = (event: any) => {
      // Validate block structure on ANY change
      setTimeout(() => {
        validateBlockStructure(ws);

        // Generate code only from enabled blocks
        resetTimerCount();

        // Get only enabled top-level blocks
        const topBlocks = ws.getTopBlocks(true); // true = ordered
        const enabledTopBlocks = topBlocks.filter(
          (block: any) =>
            block.isEnabled ? block.isEnabled() : !block.disabled // Only include enabled blocks
        );

        // Initialize the Python generator before generating code
        pythonGenerator.init(ws);

        // Generate code only from enabled blocks
        let code = "";
        enabledTopBlocks.forEach((block: any) => {
          const blockCode = pythonGenerator.blockToCode(block);
          if (blockCode) {
            code += blockCode;
          }
        });

        // Extract definitions (includes event handlers, functions, setup code)
        let definitions = "";
        if ((pythonGenerator as any).definitions_) {
          const defArray = Object.values((pythonGenerator as any).definitions_);
          definitions = defArray.join("\n");
        }

        // Combine definitions and code
        const fullCode = definitions + "\n" + code;
        const cleanedCode = cleanupPythonCode(fullCode);
        setPython(cleanedCode);
      }, 10);
    };
    ws.addChangeListener(onChange);

    // Listen for toolbox/flyout events to apply spacing
    ws.addChangeListener((event: any) => {
      if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
        // Reset the flag for new category
        spacingApplied = false;

        // Category was clicked - apply spacing with multiple retries
        let attempts = 0;
        const maxAttempts = 10;
        const tryApply = () => {
          attempts++;
          const success = applyFlyoutLabelSpacing();

          // Stop trying if successful, otherwise keep trying
          if (!success && attempts < maxAttempts) {
            setTimeout(tryApply, 100);
          }
        };
        setTimeout(tryApply, 50);
      }

      // Also validate when flyout closes (blocks finished dragging)
      if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT && !event.newItem) {
        setTimeout(() => validateBlockStructure(ws), 100);
      }
    });

    // Additional validation on UI events (after blocks settle)
    ws.addChangeListener((event: any) => {
      if (
        event.type === Blockly.Events.FINISHED_LOADING ||
        event.type === Blockly.Events.UI
      ) {
        setTimeout(() => validateBlockStructure(ws), 50);
      }
    });

    return () => {
      flyoutObserver.disconnect();
      ws.removeChangeListener(onChange);
      ws.dispose();
      workspaceRef.current = null;
    };
  }, [toolbox]);

  // Yjs Blockly XML sync
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !yjsProvider || !ydoc) return;

    const yXml = ydoc.getText("workspace-xml");

    const pushToYjs = (event: Blockly.Events.Abstract) => {
      if (yjsApplyingRef.current) return;
      if ((event as { isUiEvent?: boolean }).isUiEvent) return;
      const xml = Blockly.Xml.workspaceToDom(workspace);
      const xmlStr = Blockly.Xml.domToText(xml);
      ydoc.transact(() => {
        yXml.delete(0, yXml.length);
        yXml.insert(0, xmlStr);
      });
    };

    workspace.addChangeListener(pushToYjs);

    const onYjsChange = () => {
      const xmlStr = yXml.toString();
      if (!xmlStr || !workspaceRef.current) return;
      try {
        const dom = Blockly.utils.xml.textToDom(xmlStr);
        yjsApplyingRef.current = true;
        Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, workspaceRef.current);
      } catch {
        // ignore malformed XML during initial sync
      } finally {
        yjsApplyingRef.current = false;
      }
    };

    yXml.observe(onYjsChange);

    return () => {
      workspace.removeChangeListener(pushToYjs);
      yXml.unobserve(onYjsChange);
    };
  }, [yjsProvider, ydoc]);

  // Update dropdown pins and toolbox header when board changes
  useEffect(() => {
    currentBoardId = boardId;
    const ws = workspaceRef.current;
    if (ws) {
      ws.updateToolbox(
        buildToolboxJson(BOARD_CONFIGS[boardId]?.label ?? "ESP32")
      );
      setTimeout(() => {
        try {
          applyToolboxIcons(ws);
        } catch {}
      }, 0);
    }
  }, [boardId]);

  // Initialize CodeMirror editor
  useEffect(() => {
    if (!codeEditorRef.current) return;

    // Create the editor
    const view = new EditorView({
      state: EditorState.create({
        doc: python,
        extensions: [
          basicSetup,
          pythonLang(),
          oneDark,
          EditorView.editable.of(false), // Read-only
          EditorView.theme({
            "&": {
              fontSize: "13px",
              height: "100%",
            },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
            },
          }),
        ],
      }),
      parent: codeEditorRef.current,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []); // Only run once on mount

  // Update CodeMirror content when python code changes
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const currentCode = view.state.doc.toString();
    if (currentCode !== python) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentCode.length,
          insert: python,
        },
      });
    }
  }, [python]);

  // Close upload menu when clicking outside
  useEffect(() => {
    if (!showUploadMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      setShowUploadMenu(false);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showUploadMenu]);

  // Show customizable upload dialog instead of immediate upload
  function handleUpload() {
    setShowDialog(true);
  }

  async function refreshPorts() {
    try {
      const list: SerialPort[] = await (navigator as any).serial.getPorts();
      setPorts(list);
      // Keep selection if still present
      if (selectedPort && !list.includes(selectedPort)) {
        setSelectedPort(null);
      }
    } catch {}
  }

  async function addDevice() {
    try {
      const port = await (navigator as any).serial.requestPort({});
      await refreshPorts();
      setSelectedPort(port);
    } catch {}
  }

  async function handleSerialConnect() {
    if (isMonitorConnected) {
      // Disconnect
      if (serialReaderRef.current) {
        try {
          await serialReaderRef.current.cancel();
          serialReaderRef.current.releaseLock();
        } catch (e) {
          console.error("Error closing serial reader:", e);
        }
        serialReaderRef.current = null;
      }
      if (monitorPort) {
        try {
          await monitorPort.close();
        } catch (e) {
          console.error("Error closing monitor port:", e);
        }
        setMonitorPort(null);
      }
      setIsMonitorConnected(false);
      setMessage("Serial Monitor disconnected");
    } else {
      // Connect
      try {
        const port = await (navigator as any).serial.requestPort({});
        await port.open({ baudRate: Number(baud) || 115200 });
        setMonitorPort(port);
        setIsMonitorConnected(true);
        setMessage("Serial Monitor connected");

        // Clear any initial boot messages
        setSerialOutput(""); // Start with clean output

        // Start reading from serial port
        const reader = port.readable?.getReader();
        if (reader) {
          serialReaderRef.current = reader;
          const textDecoder = new TextDecoder();

          // Read loop - continuously stream data
          (async () => {
            try {
              // Flush initial boot messages (first 500ms of data)
              let isFlushPeriod = true;
              setTimeout(() => {
                isFlushPeriod = false;
                setSerialOutput(""); // Clear boot messages after flush period
              }, 500);

              // Buffer limit: keep last ~10,000 characters (adjustable)
              const MAX_BUFFER_SIZE = 10000;

              while (true) {
                const { value, done } = await reader.read();
                if (done) {
                  console.log("Serial reader done");
                  break;
                }
                if (value) {
                  const text = textDecoder.decode(value, { stream: true });
                  // Only display text after flush period
                  if (!isFlushPeriod) {
                    setSerialOutput((prev) => {
                      const newOutput = prev + text;
                      // Trim old data if buffer exceeds limit
                      if (newOutput.length > MAX_BUFFER_SIZE) {
                        // Keep only the last MAX_BUFFER_SIZE characters
                        return newOutput.slice(-MAX_BUFFER_SIZE);
                      }
                      return newOutput;
                    });
                  }
                }
              }
            } catch (error: any) {
              // Check if it's a cancellation (normal disconnect)
              if (error?.name !== "AbortError") {
                console.error("Error reading serial:", error);
                setMessage(
                  "Serial read error: " + (error?.message || String(error))
                );
              }
            }
          })();
        }
      } catch (e: any) {
        setMessage(e?.message ?? "Failed to connect to Serial Monitor");
      }
    }
  }

  function clearSerialOutput() {
    setSerialOutput("");
  }

  // Web Bluetooth Functions
  const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
  const BLE_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // ESP32 -> Web (Notifications)
  const BLE_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Web -> ESP32 (Write)

  async function handleBleConnect() {
    if (bleConnected && bleDevice) {
      // Disconnect
      try {
        if (bleDevice.gatt?.connected) {
          await bleDevice.gatt.disconnect();
        }
        setBleDevice(null);
        setBleConnected(false);
        bleCharacteristicRef.current = null;
        setBleMessages((prev) => [...prev, "❌ Disconnected from BLE device"]);
      } catch (e: any) {
        setBleMessages((prev) => [
          ...prev,
          `❌ Error disconnecting: ${e.message}`,
        ]);
      }
    } else {
      // Connect
      try {
        // Request BLE device with our UART service
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [{ services: [BLE_SERVICE_UUID] }],
          optionalServices: [BLE_SERVICE_UUID],
        });

        setBleDevice(device);
        setBleMessages((prev) => [
          ...prev,
          `🔍 Found device: ${device.name || "Unknown"}`,
        ]);

        // Connect to GATT server
        const server = await device.gatt.connect();
        setBleMessages((prev) => [...prev, "🔗 Connected to GATT server"]);

        // Get our UART service
        const service = await server.getPrimaryService(BLE_SERVICE_UUID);
        setBleMessages((prev) => [...prev, "✅ Got UART service"]);

        // Get TX characteristic (for receiving notifications from ESP32)
        const txCharacteristic = await service.getCharacteristic(BLE_TX_UUID);
        await txCharacteristic.startNotifications();
        txCharacteristic.addEventListener(
          "characteristicvaluechanged",
          (event: any) => {
            const value = new TextDecoder().decode(event.target.value);
            setBleMessages((prev) => [...prev, `📥 Received: ${value}`]);
          }
        );
        setBleMessages((prev) => [
          ...prev,
          "👂 Listening for notifications...",
        ]);

        // Get RX characteristic (for sending data to ESP32)
        const rxCharacteristic = await service.getCharacteristic(BLE_RX_UUID);
        bleCharacteristicRef.current = rxCharacteristic;

        setBleConnected(true);
        setBleMessages((prev) => [...prev, "✅ BLE connection established!"]);

        // Handle disconnect events
        device.addEventListener("gattserverdisconnected", () => {
          setBleConnected(false);
          setBleDevice(null);
          bleCharacteristicRef.current = null;
          setBleMessages((prev) => [
            ...prev,
            "❌ Device disconnected unexpectedly",
          ]);
        });
      } catch (e: any) {
        setBleMessages((prev) => [
          ...prev,
          `❌ Connection failed: ${e.message}`,
        ]);
      }
    }
  }

  async function sendBleMessage() {
    if (!bleConnected || !bleCharacteristicRef.current || !bleSendText.trim()) {
      return;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(bleSendText);
      await bleCharacteristicRef.current.writeValue(data);
      setBleMessages((prev) => [...prev, `📤 Sent: ${bleSendText}`]);
      setBleSendText("");
    } catch (e: any) {
      setBleMessages((prev) => [...prev, `❌ Send failed: ${e.message}`]);
    }
  }

  function clearBleMessages() {
    setBleMessages([]);
  }

  async function handleCloseSerialDialog() {
    // Disconnect serial if connected before closing
    if (isMonitorConnected) {
      if (serialReaderRef.current) {
        try {
          await serialReaderRef.current.cancel();
          serialReaderRef.current.releaseLock();
        } catch (e) {
          console.error("Error closing serial reader:", e);
        }
        serialReaderRef.current = null;
      }
      if (monitorPort) {
        try {
          await monitorPort.close();
        } catch (e) {
          console.error("Error closing monitor port:", e);
        }
        setMonitorPort(null);
      }
      setIsMonitorConnected(false);
    }
    setShowSerialDialog(false);
  }

  async function handleCloseBleDialog() {
    // Disconnect BLE if connected before closing
    if (bleConnected && bleDevice) {
      try {
        if (bleDevice.gatt?.connected) {
          await bleDevice.gatt.disconnect();
        }
        setBleDevice(null);
        setBleConnected(false);
        bleCharacteristicRef.current = null;
      } catch (e: any) {
        console.error("Error disconnecting BLE:", e);
      }
    }
    setShowBleDialog(false);
  }

  async function handleUploadFromDialog() {
    setBusy(true);
    setMessage("");
    let uploader: any = null;
    try {
      if (isMonitorConnected) {
        try {
          if (serialReaderRef.current) {
            await serialReaderRef.current.cancel();
            serialReaderRef.current.releaseLock();
            serialReaderRef.current = null;
          }
        } catch {}
        try {
          if (monitorPort) {
            await monitorPort.close();
          }
        } catch {}
        setMonitorPort(null);
        setIsMonitorConnected(false);
        await new Promise((r) => setTimeout(r, 200));
      }
      let codeToSend = python;
      if (s3Url) {
        const resp = await fetch(s3Url);
        codeToSend = await resp.text();
      }
      // If a port is selected, do manual upload using the attached port
      if (selectedPort) {
        const { WebSerialUploader } = await import(
          "../../lib/micropython/WebSerialUploader"
        );
        uploader = new WebSerialUploader();
        uploader.attachPort(selectedPort);
        await uploader.open({ baudRate: Number(baud) || 115200 });
        const res = await uploader.upload(codeToSend);
        setMessage(
          res.success
            ? "Uploaded and executed successfully."
            : res.message || "Upload failed"
        );
      } else {
        // No selection: fallback to default chooser
        const res = await uploadToMicroPython(codeToSend);
        setMessage(
          res.success
            ? "Uploaded and executed successfully."
            : res.message || "Upload failed"
        );
      }
    } catch (e: any) {
      setMessage(e?.message ?? String(e));
    } finally {
      // Always close the uploader if it was created
      if (uploader) {
        try {
          await uploader.close();
        } catch (e) {
          console.warn("Error closing uploader:", e);
        }
      }
      setBusy(false);
      setShowDialog(false);
    }
  }

  function insertStarterBlocks(ws: Blockly.WorkspaceSvg | null) {
    if (!ws) return;

    // Comprehensive checks to ensure workspace is truly ready
    if (!ws.rendered) {
      console.log("❌ Workspace not rendered yet");
      return;
    }

    // Check if this is a headless workspace (no rendering)
    if (!(ws as any).options || (ws as any).options.readOnly) {
      console.log("❌ Workspace is headless or read-only");
      return;
    }

    // Check if workspace is already populated (has blocks)
    if (ws.getAllBlocks(false).length > 0) {
      console.log("✅ Workspace already has blocks, skipping starter blocks");
      return;
    }

    console.log("✅ Creating starter blocks...");

    // Completely disable events during block creation to avoid premature validation
    const wasEnabled = Blockly.Events.isEnabled();
    Blockly.Events.disable();

    try {
      // Create "when program starts" block
      const programStart = ws.newBlock("mp_event_program_start");
      programStart.moveBy(50, 50);
      (programStart as any).isPrimaryBlock = true;
      programStart.initSvg();
      programStart.render();
      console.log("✅ Created program start block");

      // Create "forever" block - place it side by side with program start
      const foreverLoop = ws.newBlock("mp_forever_loop");
      foreverLoop.moveBy(400, 50); // Same Y coordinate, further to the right
      (foreverLoop as any).isPrimaryBlock = true;
      foreverLoop.initSvg();
      foreverLoop.render();
      console.log("✅ Created forever loop block");
    } catch (error) {
      console.error("❌ Error creating starter blocks:", error);
    } finally {
      // Re-enable events only if they were enabled before
      if (wasEnabled) {
        Blockly.Events.enable();
      }
    }
  }

  function validateBlockStructure(ws: Blockly.WorkspaceSvg) {
    if (!ws) return;

    // Skip validation if workspace is still initializing
    if (isInitializingRef.current) {
      console.log("⏸️ Skipping validation - workspace is initializing");
      return;
    }

    // Disable events during validation to prevent infinite loops
    const wasEnabled = Blockly.Events.isEnabled();
    Blockly.Events.disable();

    try {
      // Get top-level blocks only (blocks at root of workspace)
      const topBlocks = ws.getTopBlocks(false);

      console.log(
        "🔍 Validating blocks. Total top-level blocks:",
        topBlocks.length
      );

      // Define all hat block types (blocks that can start a script)
      const hatBlockTypes = [
        "mp_event_program_start",
        "mp_forever_loop",
        // Event blocks (multiple allowed)
        "mp_event_button_pressed",
        "mp_event_pin_change",
        "mp_event_every_sec",
        "mp_event_every_ms",
        "mp_event_message_received",
        "mp_event_touch_pressed",
        "mp_event_analog_threshold",
        "mp_ble_on_receive",
        // Function definition blocks (multiple allowed)
        "procedures_defnoreturn", // Blockly default
        "procedures_defreturn", // Blockly default with return
        "mp_function_define", // Custom
        "mp_function_define_params", // Custom with parameters
      ];

      // Separate hat blocks from regular blocks
      const hatBlocks: Blockly.Block[] = [];
      const regularBlocks: Blockly.Block[] = [];

      topBlocks.forEach((block) => {
        if (hatBlockTypes.includes(block.type)) {
          hatBlocks.push(block);
          console.log("✅ Hat block found:", block.type);
        } else {
          regularBlocks.push(block);
          console.log("❌ Orphaned block found:", block.type);
        }
      });

      // Find program start and forever blocks
      const programStartBlocks = hatBlocks.filter(
        (b: any) => b.type === "mp_event_program_start"
      );
      const foreverBlocks = hatBlocks.filter(
        (b: any) => b.type === "mp_forever_loop"
      );
      const otherHatBlocks = hatBlocks.filter(
        (b: any) =>
          b.type !== "mp_event_program_start" && b.type !== "mp_forever_loop"
      );

      // Enable only one program start and one forever block
      const enablePrimaryBlock = (blocks: Blockly.Block[]) => {
        if (blocks.length === 0) return null;

        let primary = blocks.find((b: any) => b.isPrimaryBlock === true);
        if (!primary) {
          primary = blocks[0];
          (primary as any).isPrimaryBlock = true;
        }

        blocks.forEach((block: any) => {
          if (block === primary) {
            // Enable block by clearing disabled reason
            if (block.setDisabledReason) {
              block.setDisabledReason(null);
            } else {
              block.disabled = false; // fallback
            }
          } else {
            // Disable block with a reason
            if (block.setDisabledReason) {
              block.setDisabledReason("ONLY_ONE_ALLOWED");
            } else {
              block.disabled = true; // fallback
            }
            block.isPrimaryBlock = false;
          }
        });

        return primary;
      };

      const primaryProgramStart = enablePrimaryBlock(programStartBlocks);
      const primaryForever = enablePrimaryBlock(foreverBlocks);

      // Enable all other hat blocks (events, function definitions - multiple allowed)
      console.log(
        "✅ Keeping",
        otherHatBlocks.length,
        "event/function blocks enabled (multiple allowed)"
      );
      otherHatBlocks.forEach((block: any) => {
        console.log("  → Enabling:", block.type);
        // Enable block by clearing disabled reason
        if (block.setDisabledReason) {
          block.setDisabledReason(null);
        } else {
          block.disabled = false; // fallback
        }
      });

      // Collect all enabled hat blocks
      const enabledHatBlocks: Blockly.Block[] = [];
      if (primaryProgramStart) enabledHatBlocks.push(primaryProgramStart);
      if (primaryForever) enabledHatBlocks.push(primaryForever);
      enabledHatBlocks.push(...otherHatBlocks);

      // Enable all descendants of enabled hat blocks
      enabledHatBlocks.forEach((hatBlock) => {
        const descendants = hatBlock.getDescendants(false);
        descendants.forEach((descendant: any) => {
          if (!descendant.isShadow()) {
            // Enable block by clearing disabled reason
            if (descendant.setDisabledReason) {
              descendant.setDisabledReason(null);
            } else {
              descendant.disabled = false; // fallback
            }
          }
        });
      });

      // Disable all orphaned regular blocks (not connected to any hat block)
      console.log("🚫 Disabling", regularBlocks.length, "orphaned blocks");
      regularBlocks.forEach((block: any) => {
        // This is a top-level block that's not a hat block - it's orphaned
        console.log(
          "  Disabling block:",
          block.type,
          "ID:",
          block.id,
          "Currently disabled:",
          block.disabled
        );

        // Disable the block with a reason
        if (block.setDisabledReason) {
          block.setDisabledReason("NOT_CONNECTED");
        } else {
          block.disabled = true; // fallback
        }

        // Also disable all its children
        const descendants = block.getDescendants(false);
        descendants.forEach((descendant: any) => {
          if (!descendant.isShadow()) {
            // Disable with reason
            if (descendant.setDisabledReason) {
              descendant.setDisabledReason("NOT_CONNECTED");
            } else {
              descendant.disabled = true; // fallback
            }
          }
        });

        console.log("  After disable, disabled state:", block.disabled);
      });

      console.log("✅ Validation complete");
    } finally {
      // Re-enable events
      if (wasEnabled) {
        Blockly.Events.enable();
      }
    }
  }

  function insertBlinkExample(ws: Blockly.WorkspaceSvg | null) {
    if (!ws) return;
    ws.clear();
    // Build: forever { pin 2 HIGH; delay 500; pin 2 LOW; delay 500 }
    const loop = ws.newBlock("mp_forever_loop");
    const pinHigh = ws.newBlock("mp_pin_write");
    (pinHigh as any).setFieldValue("2", "PIN");
    (pinHigh as any).setFieldValue("1", "STATE");
    const d1 = ws.newBlock("mp_delay_ms");
    const n500a = ws.newBlock("math_number");
    (n500a as any).setFieldValue("500", "NUM");
    d1.getInput("MS")?.connection?.connect(n500a.outputConnection!);
    const pinLow = ws.newBlock("mp_pin_write");
    (pinLow as any).setFieldValue("2", "PIN");
    (pinLow as any).setFieldValue("0", "STATE");
    const d2 = ws.newBlock("mp_delay_ms");
    const n500b = ws.newBlock("math_number");
    (n500b as any).setFieldValue("500", "NUM");
    d2.getInput("MS")?.connection?.connect(n500b.outputConnection!);

    // Chain statements
    pinHigh.nextConnection!.connect(d1.previousConnection!);
    d1.nextConnection!.connect(pinLow.previousConnection!);
    pinLow.nextConnection!.connect(d2.previousConnection!);
    loop.getInput("DO")?.connection?.connect(pinHigh.previousConnection!);
    loop.initSvg();
    loop.render();
  }

  const kidBtnStyle: React.CSSProperties = {
    background: "linear-gradient(135deg,#ffbf69,#ff9f1c)",
    color: "#3a2f2a",
    border: "2px solid #ffbf69",
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const iconBtnStyle: React.CSSProperties = {
    ...kidBtnStyle,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 84,
  };

  const headerBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 12px",
    background: "rgba(255,255,255,0.55)",
    border: "1px solid #e8c9a0",
    borderRadius: 7,
    color: "#5c3d2e",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    transition: "background 0.15s, border-color 0.15s",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#fff7ec",
        overflow: "visible",
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 16px",
          background: "linear-gradient(135deg, #ffe8c8, #ffd6a5)",
          borderBottom: "1px solid #e8c9a0",
          gap: 12,
          flexShrink: 0,
          minHeight: 44,
        }}
      >
        {/* Left: Logo + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={18} color="#3a2518" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#3a2518" }}>{title}</span>
        </div>

        {/* Center: Project name + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            spellCheck={false}
            maxLength={40}
            placeholder="Project name"
            style={{
              padding: "5px 10px",
              background: "rgba(255,255,255,0.7)",
              border: "1px solid #e0c09a",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              color: "#3a2518",
              minWidth: 160,
              maxWidth: 240,
              outline: "none",
            }}
          />
          <button
            style={headerBtnStyle}
            title="Save project (Ctrl+S)"
            onClick={handleSaveProject}
          >
            <Save size={14} /> {saveStatus ? "Saved!" : "Save"}
          </button>
          <button
            style={headerBtnStyle}
            title="Open project"
            onClick={() => { setSavedProjects(loadProjectsFromStorage()); setShowProjects(true); }}
          >
            <FolderOpen size={14} /> Open
          </button>
          <button
            style={headerBtnStyle}
            title="Help & reference"
            onClick={() => setShowHelp(!showHelp)}
          >
            <HelpCircle size={14} /> Help
          </button>
        </div>

        {/* Right: Board selector + Exit */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            style={{
              padding: "5px 8px",
              border: "1px solid #e0c09a",
              borderRadius: 7,
              fontSize: 13,
              background: "rgba(255,255,255,0.7)",
              color: "#3a2518",
              fontWeight: 600,
            }}
          >
            {Object.values(BOARD_CONFIGS).map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          {(onExit || exitPath) && (
            <button
              type="button"
              onClick={() => {
                if (onExit) {
                  onExit();
                  return;
                }
                if (exitPath) window.location.assign(exitPath);
              }}
              style={{ ...headerBtnStyle, background: "rgba(180,80,40,0.12)", borderColor: "#d4a574" }}
            >
              <X size={14} /> Exit
            </button>
          )}
        </div>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div
          style={{
            padding: "12px 20px",
            background: "#fff3e0",
            borderBottom: "1px solid #e8c9a0",
            fontSize: 13,
            color: "#5c3d2e",
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <strong>Getting Started:</strong> Drag blocks from the toolbox on the left into the workspace.
              Connect them to the <em>Program Start</em> or <em>Forever</em> blocks to build your program.
              Click <strong>Upload to Device</strong> to send your code to the microcontroller via USB or Bluetooth.
            </div>
            <button onClick={() => setShowHelp(false)} style={{ ...headerBtnStyle, padding: "2px 8px", marginLeft: 12 }}><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div
        style={{
          display: "flex",
          flex: 1,
          gap: 16,
          padding: 16,
          overflow: "visible",
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 520,
            border: "2px solid #ffd6a5",
            overflow: "visible",
          }}
          ref={divRef}
        />
        <div
          style={{
            width: 460,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            color: "#1f2d3a",
          }}
        >
        <div
          ref={codeEditorRef}
          style={{
            flex: 1,
            width: "100%",
            border: "2px solid #ffd6a5",
            borderRadius: 8,
            overflow: "hidden",
          }}
        />
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              borderRadius: 10,
              overflow: "hidden",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            <button
              onClick={handleUpload}
              disabled={busy}
              style={{
                flex: 1,
                background: "linear-gradient(135deg, #ffbf69, #ff9f1c)",
                color: "#3a2f2a",
                border: "none",
                padding: "14px 24px",
                fontSize: 16,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.7 : 1,
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <img
                src="/assets/blockly/upload/upload.svg"
                alt="Upload"
                style={{ width: 20, height: 20 }}
              />
              {busy ? "Uploading..." : "Upload to Device"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowUploadMenu(!showUploadMenu);
              }}
              style={{
                background: "linear-gradient(135deg, #ffbf69, #ff9f1c)",
                color: "#3a2f2a",
                border: "none",
                borderLeft: "1px solid rgba(58, 47, 42, 0.2)",
                padding: "14px 16px",
                fontSize: 18,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              ⋯
            </button>
          </div>
          {showUploadMenu && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                right: 0,
                background: "#fff",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                minWidth: 200,
                zIndex: 100,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => {
                  setShowUploadMenu(false);
                  setShowSerialDialog(true);
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "#fff",
                  border: "none",
                  borderBottom: "1px solid #eee",
                  textAlign: "left",
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "background 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f5f5f5")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#fff")
                }
              >
                <img
                  src="/assets/blockly/upload/serial.svg"
                  alt="Serial"
                  style={{ width: 20, height: 20 }}
                />
                Serial Monitor
              </button>
              <button
                onClick={() => {
                  setShowUploadMenu(false);
                  setShowBleDialog(true);
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "#fff",
                  border: "none",
                  textAlign: "left",
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "background 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f5f5f5")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#fff")
                }
              >
                <img
                  src="/assets/blockly/upload/bluetooth.svg"
                  alt="Bluetooth"
                  style={{ width: 20, height: 20 }}
                />
                Bluetooth Monitor
              </button>
            </div>
          )}
        </div>
        {message && (
          <div style={{ marginTop: 4, color: "#5c3d2e" }}>{message}</div>
        )}
      </div>
      </div>

      {/* Projects Dialog */}
      {showProjects && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowProjects(false); }}
        >
          <div
            style={{
              background: "#fff7ec",
              borderRadius: 16,
              width: 600,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              overflow: "hidden",
              animation: "fadeIn 0.2s ease",
            }}
          >
            {/* Dialog Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                background: "linear-gradient(135deg, #ffe8c8, #ffd6a5)",
                borderBottom: "1px solid #e8c9a0",
              }}
            >
              <button
                onClick={() => setShowProjects(false)}
                style={{
                  ...headerBtnStyle,
                  background: "transparent",
                  border: "1px solid #d4a574",
                }}
              >
                ← Back
              </button>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#3a2518" }}>
                My Projects
              </h3>
              <button
                onClick={handleNewProject}
                style={{
                  ...headerBtnStyle,
                  background: "#ff9f1c",
                  color: "#fff",
                  border: "1px solid #e8890a",
                }}
              >
                + New Project
              </button>
            </div>

            {/* Project List */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {savedProjects.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px 24px",
                    color: "#8b7355",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <FolderOpen size={40} color="#8b7355" />
                  <h3 style={{ margin: 0, fontSize: 16, color: "#5c3d2e" }}>No saved projects yet</h3>
                  <p style={{ margin: 0, fontSize: 13, maxWidth: 300, lineHeight: 1.5 }}>
                    Click <strong>Save</strong> in the header to save your current project, or start a new one.
                  </p>
                </div>
              ) : (
                savedProjects.map((p: any) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: p.id === projectId ? "rgba(255,159,28,0.12)" : "#fff",
                      border: p.id === projectId ? "1.5px solid #ff9f1c" : "1px solid #e8c9a0",
                      borderRadius: 10,
                      transition: "background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#3a2518" }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: "#8b7355" }}>
                        {new Date(p.updatedAt).toLocaleDateString(undefined, {
                          month: "short", day: "numeric", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                        {p.boardId ? ` · ${BOARD_CONFIGS[p.boardId]?.label || p.boardId}` : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleLoadProject(p)}
                        style={{
                          ...headerBtnStyle,
                          background: "#ff9f1c",
                          color: "#fff",
                          border: "1px solid #e8890a",
                          padding: "4px 14px",
                        }}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleDeleteProject(p.id)}
                        title="Delete project"
                        style={{
                          ...headerBtnStyle,
                          padding: "4px 8px",
                          color: "#c44",
                          background: "rgba(200,50,50,0.06)",
                          borderColor: "#e8c9a0",
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Serial Monitor Dialog */}
      {showSerialDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 12,
              width: 600,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <img
                  src="/assets/blockly/upload/serial.svg"
                  alt="Serial"
                  style={{ width: 24, height: 24 }}
                />
                Serial Monitor
              </h3>
              <button
                onClick={handleCloseSerialDialog}
                style={{
                  ...kidBtnStyle,
                  padding: "4px 12px",
                  fontSize: 13,
                }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSerialConnect}
                style={{
                  ...kidBtnStyle,
                  flex: 1,
                }}
              >
                {isMonitorConnected ? "🔌 Disconnect" : "🔌 Connect"}
              </button>
              {isMonitorConnected && (
                <button
                  onClick={clearSerialOutput}
                  style={{
                    ...kidBtnStyle,
                  }}
                >
                  🗑️ Clear
                </button>
              )}
            </div>

            {isMonitorConnected && (
              <div
                style={{
                  padding: 8,
                  background: "#e8f5e9",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <strong>Status:</strong> Connected and listening...
              </div>
            )}

            <div
              ref={serialOutputRef}
              style={{
                background: "#1e1e1e",
                color: "#d4d4d4",
                padding: 12,
                borderRadius: 8,
                fontFamily: "monospace",
                fontSize: 13,
                height: 400,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                border: isMonitorConnected
                  ? "2px solid #4ec9b0"
                  : "2px solid #3a3a3a",
              }}
            >
              {serialOutput ||
                (isMonitorConnected
                  ? "Listening..."
                  : "Click 'Connect' to start monitoring serial output")}
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#666",
                padding: 8,
                background: "#f5f5f5",
                borderRadius: 6,
              }}
            >
              <strong>💡 Tip:</strong> Upload your program to the ESP32 first,
              then connect to see serial output like print() statements and
              debug messages.
            </div>
          </div>
        </div>
      )}

      {/* BLE Dialog */}
      {showBleDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 12,
              width: 500,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <img
                  src="/assets/blockly/upload/bluetooth.svg"
                  alt="Bluetooth"
                  style={{ width: 24, height: 24 }}
                />
                Bluetooth Monitor
              </h3>
              <button
                onClick={handleCloseBleDialog}
                style={{
                  ...kidBtnStyle,
                  padding: "4px 12px",
                  fontSize: 13,
                }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleBleConnect}
                style={{
                  ...kidBtnStyle,
                  flex: 1,
                }}
              >
                {bleConnected ? "🔌 Disconnect" : "🔌 Connect to ESP32"}
              </button>
              {bleConnected && (
                <button
                  onClick={clearBleMessages}
                  style={{
                    ...kidBtnStyle,
                  }}
                >
                  🗑️ Clear
                </button>
              )}
            </div>

            {bleDevice && (
              <div
                style={{
                  padding: 8,
                  background: "#e8f5e9",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <strong>Connected to:</strong>{" "}
                {bleDevice.name || "Unknown Device"}
              </div>
            )}

            <div
              style={{
                background: "#1e1e1e",
                color: "#d4d4d4",
                padding: 12,
                borderRadius: 8,
                fontFamily: "monospace",
                fontSize: 13,
                height: 300,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                border: bleConnected
                  ? "2px solid #569cd6"
                  : "2px solid #3a3a3a",
              }}
            >
              {bleMessages.length === 0
                ? bleConnected
                  ? "Connected. Waiting for messages..."
                  : "Click 'Connect to ESP32' to pair with your BLE device"
                : bleMessages.map((msg, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      {msg}
                    </div>
                  ))}
            </div>

            {bleConnected && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={bleSendText}
                  onChange={(e) => setBleSendText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      sendBleMessage();
                    }
                  }}
                  placeholder="Type message to send..."
                  style={{
                    flex: 1,
                    padding: 8,
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
                <button
                  onClick={sendBleMessage}
                  disabled={!bleSendText.trim()}
                  style={{
                    ...kidBtnStyle,
                    padding: "8px 16px",
                  }}
                >
                  📤 Send
                </button>
              </div>
            )}

            <div
              style={{
                fontSize: 12,
                color: "#666",
                padding: 8,
                background: "#f5f5f5",
                borderRadius: 6,
              }}
            >
              <strong>💡 Tip:</strong> Make sure your ESP32 is running a
              Bluetooth program with the "🔧 start Bluetooth" block. The device
              name you set will appear in the pairing dialog.
            </div>
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      {showDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 16,
              borderRadius: 12,
              width: 420,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <h3 style={{ margin: 0 }}>Upload to ESP32</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <strong>Available devices</strong>
              <div
                style={{
                  maxHeight: 140,
                  overflow: "auto",
                  border: "1px solid #eee",
                  borderRadius: 6,
                  padding: 6,
                }}
              >
                {ports.length === 0 && (
                  <div style={{ fontSize: 12, color: "#666" }}>
                    No saved devices. Click "Add device" to pick a port.
                  </div>
                )}
                {ports.map((p, idx) => {
                  const info = (p as any).getInfo ? (p as any).getInfo() : {};

                  // Build a descriptive label with product name and serial if available
                  let label = "";

                  // Priority 1: Product name (most useful)
                  if (info.usbProductName) {
                    label = info.usbProductName;
                  } else if (info.usbVendorId) {
                    // Fallback to VID/PID
                    label = `Device ${idx + 1}`;
                  } else {
                    label = `Device ${idx + 1}`;
                  }

                  // Add serial number if available (helps distinguish multiple identical devices)
                  if (info.serialNumber) {
                    label += ` (S/N: ${info.serialNumber})`;
                  } else if (info.usbVendorId && info.usbProductId) {
                    // If no serial number, show VID/PID as fallback identifier
                    label += ` (${info.usbVendorId.toString(16).padStart(4, "0")}:${info.usbProductId.toString(16).padStart(4, "0")})`;
                  }

                  const isSelected = selectedPort === p;
                  return (
                    <label
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedPort(p)}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={refreshPorts} style={kidBtnStyle}>
                  ↻ Refresh
                </button>
                <button onClick={addDevice} style={kidBtnStyle}>
                  ➕ Add device
                </button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <strong>Custom fields</strong>
              <label style={{ fontSize: 13 }}>
                Presigned S3 URL (optional)
              </label>
              <input
                value={s3Url}
                onChange={(e) => setS3Url(e.target.value)}
                placeholder="https://..."
                style={{
                  padding: 8,
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
              <label style={{ fontSize: 13 }}>Baud rate</label>
              <select
                value={baud}
                onChange={(e) => setBaud(e.target.value)}
                style={{
                  padding: 8,
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              >
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="38400">38400</option>
                <option value="57600">57600</option>
                <option value="115200">115200</option>
                <option value="230400">230400</option>
                <option value="460800">460800</option>
                <option value="921600">921600</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={handleUploadFromDialog}
                style={{ ...kidBtnStyle, flex: 1 }}
              >
                {busy ? "Uploading..." : "Start Upload"}
              </button>
              <button onClick={() => setShowDialog(false)} style={kidBtnStyle}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Esp32BlocklyEditor;
