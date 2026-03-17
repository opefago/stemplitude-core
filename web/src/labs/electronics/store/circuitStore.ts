import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type {
  CircuitState,
  CircuitComponent,
  Connection,
  Point,
  ComponentType,
} from "../types/Circuit";
import { createComponent } from "../utils/ComponentFactory";

export interface CircuitStore extends CircuitState {
  // Actions
  addComponent: (type: ComponentType, position: Point) => CircuitComponent;
  removeComponent: (id: string) => void;
  updateComponent: (id: string, updates: Partial<CircuitComponent>) => void;
  moveComponent: (id: string, position: Point) => void;

  addConnection: (
    fromPin: string,
    toPin: string,
    points: Point[],
    routedPath?: Point[]
  ) => Connection;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, updates: Partial<Connection>) => void;

  clearCircuit: () => void;
  setSelectedTool: (tool: string | null) => void;
  setShowGrid: (show: boolean) => void;
  setSelectedComponent: (component: CircuitComponent | null) => void;
  setIsSimulating: (simulating: boolean) => void;

  // Getters
  getComponentById: (id: string) => CircuitComponent | undefined;
  getConnectionById: (id: string) => Connection | undefined;
  getFreshComponents: () => CircuitComponent[]; // Always returns current components
  getFreshConnections: () => Connection[]; // Always returns current connections
}

const initialState: CircuitState = {
  components: [],
  connections: [],
  selectedTool: null,
  showGrid: true,
  selectedComponent: null,
  isSimulating: false,
  results: null,
};

export const useCircuitStore = create<CircuitStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Actions
    addComponent: (type: ComponentType, position: Point) => {
      const newComponent = createComponent(type, position);

      set((state) => ({
        components: [...state.components, newComponent],
      }));

      console.log(
        "🟢 Zustand: Added component",
        newComponent.type,
        "at",
        position
      );
      return newComponent;
    },

    removeComponent: (id: string) => {
      set((state) => ({
        components: state.components.filter((c) => c.id !== id),
        connections: state.connections.filter(
          (c) =>
            !state.components
              .find((comp) => comp.id === id)
              ?.pins.some((pin) => pin.id === c.fromPin || pin.id === c.toPin)
        ),
      }));
      console.log("🟢 Zustand: Removed component", id);
    },

    updateComponent: (id: string, updates: Partial<CircuitComponent>) => {
      set((state) => ({
        components: state.components.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }));
      console.log("🟢 Zustand: Updated component", id, updates);
    },

    moveComponent: (id: string, position: Point) => {
      set((state) => {
        const component = state.components.find((c) => c.id === id);
        if (!component) return state;

        // Calculate pin offset
        const updatedComponent = {
          ...component,
          position,
          pins: component.pins.map((pin) => ({
            ...pin,
            position: {
              x: position.x + (pin.position.x - component.position.x),
              y: position.y + (pin.position.y - component.position.y),
            },
          })),
        };

        // Update connections that use this component's pins
        const updatedConnections = state.connections.map((connection) => {
          const fromPinBelongsToMoved = component.pins.some(
            (pin) => pin.id === connection.fromPin
          );
          const toPinBelongsToMoved = component.pins.some(
            (pin) => pin.id === connection.toPin
          );

          if (fromPinBelongsToMoved || toPinBelongsToMoved) {
            const fromPin =
              updatedComponent.pins.find((p) => p.id === connection.fromPin) ||
              state.components
                .flatMap((c) => c.pins)
                .find((p) => p.id === connection.fromPin);
            const toPin =
              updatedComponent.pins.find((p) => p.id === connection.toPin) ||
              state.components
                .flatMap((c) => c.pins)
                .find((p) => p.id === connection.toPin);

            if (fromPin && toPin) {
              return {
                ...connection,
                points: [fromPin.position, toPin.position],
                routedPath: undefined, // Clear routedPath so it gets recalculated with new simplified routing
              };
            }
          }
          return connection;
        });

        return {
          components: state.components.map((c) =>
            c.id === id ? updatedComponent : c
          ),
          connections: updatedConnections,
        };
      });
      console.log("🟢 Zustand: Moved component", id, "to", position);
    },

    addConnection: (
      fromPin: string,
      toPin: string,
      points: Point[],
      routedPath?: Point[]
    ) => {
      const newConnection: Connection = {
        id: uuidv4(),
        fromPin,
        toPin,
        points,
        routedPath: routedPath || points, // Use routed path if provided, otherwise fallback to direct points
        current: 0,
      };

      set((state) => ({
        connections: [...state.connections, newConnection],
      }));

      console.log(
        "🟢 Zustand: Added routed connection",
        fromPin,
        "->",
        toPin,
        "with path:",
        routedPath?.length || points.length,
        "segments"
      );
      return newConnection;
    },

    removeConnection: (id: string) => {
      set((state) => ({
        connections: state.connections.filter((c) => c.id !== id),
      }));
      console.log("🟢 Zustand: Removed connection", id);
    },

    updateConnection: (id: string, updates: Partial<Connection>) => {
      set((state) => ({
        connections: state.connections.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }));
      console.log("🟢 Zustand: Updated connection", id, updates);
    },

    clearCircuit: () => {
      set(initialState);
      console.log("🟢 Zustand: Cleared circuit");
    },

    setSelectedTool: (tool: string | null) => {
      set({ selectedTool: tool });
      console.log("🟢 Zustand: Selected tool", tool);
    },

    setShowGrid: (show: boolean) => {
      set({ showGrid: show });
      console.log("🟢 Zustand: Show grid", show);
    },

    setSelectedComponent: (component: CircuitComponent | null) => {
      set({ selectedComponent: component });
      console.log("🟢 Zustand: Selected component", component);
    },

    setIsSimulating: (simulating: boolean) => {
      set({ isSimulating: simulating });
      console.log("🟢 Zustand: Simulation", simulating);
    },

    // Getters - Always return fresh data
    getComponentById: (id: string) => {
      return get().components.find((c) => c.id === id);
    },

    getConnectionById: (id: string) => {
      return get().connections.find((c) => c.id === id);
    },

    getFreshComponents: () => {
      return get().components;
    },

    getFreshConnections: () => {
      return get().connections;
    },
  }))
);

// Selector hooks for performance
export const useComponents = () => useCircuitStore((state) => state.components);
export const useConnections = () =>
  useCircuitStore((state) => state.connections);
export const useSelectedTool = () =>
  useCircuitStore((state) => state.selectedTool);
export const useShowGrid = () => useCircuitStore((state) => state.showGrid);
export const useSelectedComponent = () =>
  useCircuitStore((state) => state.selectedComponent);
export const useIsSimulating = () =>
  useCircuitStore((state) => state.isSimulating);
export const useResults = () => useCircuitStore((state) => state.results);

// Action hooks - use useCallback to prevent infinite loops
export const useCircuitActions = () => {
  const addComponent = useCircuitStore((state) => state.addComponent);
  const removeComponent = useCircuitStore((state) => state.removeComponent);
  const updateComponent = useCircuitStore((state) => state.updateComponent);
  const moveComponent = useCircuitStore((state) => state.moveComponent);
  const addConnection = useCircuitStore((state) => state.addConnection);
  const removeConnection = useCircuitStore((state) => state.removeConnection);
  const updateConnection = useCircuitStore((state) => state.updateConnection);
  const clearCircuit = useCircuitStore((state) => state.clearCircuit);
  const setSelectedTool = useCircuitStore((state) => state.setSelectedTool);
  const setShowGrid = useCircuitStore((state) => state.setShowGrid);
  const setSelectedComponent = useCircuitStore(
    (state) => state.setSelectedComponent
  );
  const setIsSimulating = useCircuitStore((state) => state.setIsSimulating);
  const getFreshComponents = useCircuitStore(
    (state) => state.getFreshComponents
  );
  const getFreshConnections = useCircuitStore(
    (state) => state.getFreshConnections
  );

  return {
    addComponent,
    removeComponent,
    updateComponent,
    moveComponent,
    addConnection,
    removeConnection,
    updateConnection,
    clearCircuit,
    setSelectedTool,
    setShowGrid,
    setSelectedComponent,
    setIsSimulating,
    getFreshComponents,
    getFreshConnections,
  };
};
