import { v4 as uuidv4 } from "uuid";
import type { CircuitComponent, Point, ComponentType } from "../types/Circuit";

const COMPONENT_SIZE = 40; // Base size for components

export function createComponent(
  type: ComponentType,
  position: Point
): CircuitComponent {
  const id = uuidv4();
  const baseComponent: CircuitComponent = {
    id,
    type,
    position,
    rotation: 0,
    properties: {},
    pins: [],
  };

  // Define pins based on component type
  switch (type) {
    case "battery": {
      baseComponent.properties = { voltage: 9, label: "9V Battery" };
      baseComponent.pins = [
        {
          id: uuidv4(),
          position: { x: position.x - 20, y: position.y },
          type: "negative",
          label: "-",
        },
        {
          id: uuidv4(),
          position: { x: position.x + 20, y: position.y },
          type: "positive",
          label: "+",
        },
      ];
      break;
    }

    case "resistor": {
      baseComponent.properties = { resistance: 330, label: "330Ω Resistor" };
      baseComponent.pins = [
        {
          id: uuidv4(),
          position: { x: position.x - 20, y: position.y },
          type: "terminal",
          label: "1",
        },
        {
          id: uuidv4(),
          position: { x: position.x + 20, y: position.y },
          type: "terminal",
          label: "2",
        },
      ];
      break;
    }

    case "led": {
      baseComponent.properties = { color: "red", label: "Red LED" };
      baseComponent.pins = [
        {
          id: uuidv4(),
          position: { x: position.x - 15, y: position.y },
          type: "cathode",
          label: "-",
        },
        {
          id: uuidv4(),
          position: { x: position.x + 15, y: position.y },
          type: "anode",
          label: "+",
        },
      ];
      break;
    }

    case "capacitor": {
      baseComponent.properties = {
        capacitance: 100,
        unit: "µF",
        label: "100µF Capacitor",
      };
      baseComponent.pins = [
        {
          id: uuidv4(),
          position: { x: position.x - 18, y: position.y },
          type: "negative",
          label: "-",
        },
        {
          id: uuidv4(),
          position: { x: position.x + 18, y: position.y },
          type: "positive",
          label: "+",
        },
      ];
      break;
    }

    case "switch": {
      baseComponent.properties = { closed: false, label: "Switch" };
      baseComponent.pins = [
        {
          id: uuidv4(),
          position: { x: position.x - 20, y: position.y },
          type: "terminal",
          label: "1",
        },
        {
          id: uuidv4(),
          position: { x: position.x + 20, y: position.y },
          type: "terminal",
          label: "2",
        },
      ];
      break;
    }

    case "ground": {
      baseComponent.properties = { label: "Ground" };
      baseComponent.pins = [
        {
          id: uuidv4(),
          position: { x: position.x, y: position.y - 15 },
          type: "ground",
          label: "GND",
        },
      ];
      break;
    }

    case "voltmeter": {
      baseComponent.properties = { reading: 0, label: "Voltmeter" };
      baseComponent.pins = [
        {
          id: uuidv4(),
          position: { x: position.x - 20, y: position.y },
          type: "positive",
          label: "+",
        },
        {
          id: uuidv4(),
          position: { x: position.x + 20, y: position.y },
          type: "negative",
          label: "-",
        },
      ];
      break;
    }

    default:
      console.warn(`Unknown component type: ${type}`);
      // Fallback: create a basic component with 2 pins
      baseComponent.pins = [
        {
          id: uuidv4(),
          position: { x: position.x - 20, y: position.y },
          type: "terminal",
          label: "1",
        },
        {
          id: uuidv4(),
          position: { x: position.x + 20, y: position.y },
          type: "terminal",
          label: "2",
        },
      ];
  }

  console.log(
    `🔧 Created ${type} component with ${baseComponent.pins.length} pins at`,
    position
  );
  return baseComponent;
}

// Snap position to grid
export function snapToGrid(position: Point, gridSize: number = 20): Point {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}
