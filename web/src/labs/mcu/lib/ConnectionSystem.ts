import { MechanicalComponent } from "./MechanicalComponent";
import { MechanicalState } from "./PhysicsSystem";
import { Belt } from "./components/Belt";

export interface Connection {
  id: string;
  type: "gear_mesh" | "belt_connection" | "shaft_connection";
  component1: MechanicalComponent;
  component2: MechanicalComponent;
  connectionPoint1?: string;
  connectionPoint2?: string;
  belt?: Belt; // For belt connections
  isActive: boolean;
}

export interface MechanicalNetwork {
  components: Set<MechanicalComponent>;
  connections: Map<string, Connection>;
  powerSources: Set<MechanicalComponent>; // Motors and other power sources
}

export class ConnectionSystem {
  private networks: Map<string, MechanicalNetwork>;
  private componentToNetwork: Map<MechanicalComponent, string>;
  private nextConnectionId: number = 1;
  private nextNetworkId: number = 1;

  constructor() {
    this.networks = new Map();
    this.componentToNetwork = new Map();
  }

  /**
   * Connect two mechanical components
   */
  public connect(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent,
    connectionType: "gear_mesh" | "belt_connection" | "shaft_connection",
    options?: {
      point1?: string;
      point2?: string;
      belt?: Belt;
      beltRadius1?: number;
      beltRadius2?: number;
      crossedBelt?: boolean;
    }
  ): boolean {
    // Validate connection
    if (!this.validateConnection(comp1, comp2, connectionType)) {
      return false;
    }

    // Create connection
    const connectionId = `conn_${this.nextConnectionId++}`;
    const connection: Connection = {
      id: connectionId,
      type: connectionType,
      component1: comp1,
      component2: comp2,
      connectionPoint1: options?.point1,
      connectionPoint2: options?.point2,
      isActive: true,
    };

    // Handle belt connections
    if (connectionType === "belt_connection" && options?.belt) {
      connection.belt = options.belt;

      // Configure belt between components
      const radius1 = options.beltRadius1 || this.getEffectiveRadius(comp1);
      const radius2 = options.beltRadius2 || this.getEffectiveRadius(comp2);

      if (
        !connection.belt.connectBetween(
          comp1,
          comp2,
          radius1,
          radius2,
          options.crossedBelt
        )
      ) {
        console.warn(
          `Failed to connect belt between ${comp1.getName()} and ${comp2.getName()}`
        );
        return false;
      }
    }

    // Connect components at their level
    if (
      !comp1.connectTo(comp2, connectionType, options?.point1, options?.point2)
    ) {
      return false;
    }

    // Update networks
    this.updateNetworksInternal(comp1, comp2, connection);

    return true;
  }

  /**
   * Disconnect two components
   */
  public disconnect(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent
  ): boolean {
    const connectionId = this.findConnectionId(comp1, comp2);
    if (!connectionId) {
      return false;
    }

    const connection = this.getConnectionById(connectionId);
    if (!connection) {
      return false;
    }

    // Disconnect at component level
    comp1.disconnectFrom(comp2);

    // Remove from network
    this.removeConnection(connectionId);

    // Check if networks need to be split
    this.checkNetworkSplit(comp1, comp2);

    return true;
  }

  /**
   * Propagate mechanical state through the network
   */
  public propagatePower(
    sourceComponent: MechanicalComponent,
    state: MechanicalState
  ): void {
    const networkId = this.componentToNetwork.get(sourceComponent);
    if (!networkId) {
      return;
    }

    const network = this.networks.get(networkId);
    if (!network) {
      return;
    }

    // Mark source as power source if not already
    network.powerSources.add(sourceComponent);

    // Use breadth-first search to propagate power
    const visited = new Set<MechanicalComponent>();
    const queue: Array<{
      component: MechanicalComponent;
      state: MechanicalState;
    }> = [];

    queue.push({ component: sourceComponent, state });
    visited.add(sourceComponent);

    while (queue.length > 0) {
      const { component: currentComp, state: currentState } = queue.shift()!;

      // Find all connections from this component
      const connections = this.getConnectionsForComponent(currentComp);

      for (const connection of connections) {
        if (!connection.isActive) continue;

        const nextComp =
          connection.component1 === currentComp
            ? connection.component2
            : connection.component1;

        if (visited.has(nextComp)) continue;

        let transmittedState: MechanicalState | null = null;

        // Calculate transmitted state based on connection type
        if (connection.type === "belt_connection" && connection.belt) {
          // Belt handles its own transmission completely - no need for separate state calculation
          connection.belt.transmitPower(currentState, currentComp);
          // Skip further processing for this connection as belt handles it internally
          continue;
        } else {
          // Direct mechanical connection (gear mesh or shaft)
          transmittedState = this.calculateDirectTransmission(
            connection,
            currentState,
            currentComp
          );
        }

        if (transmittedState && this.isValidTransmission(transmittedState)) {
          nextComp.applyInput(transmittedState, connection.id);
          queue.push({ component: nextComp, state: transmittedState });
          visited.add(nextComp);
        }
      }
    }
  }

  /**
   * Get all networks
   */
  public getNetworks(): Map<string, MechanicalNetwork> {
    return new Map(this.networks);
  }

  /**
   * Get network containing a component
   */
  public getNetworkForComponent(
    component: MechanicalComponent
  ): MechanicalNetwork | null {
    const networkId = this.componentToNetwork.get(component);
    return networkId ? this.networks.get(networkId) || null : null;
  }

  /**
   * Get all connections for a component
   */
  public getConnectionsForComponent(
    component: MechanicalComponent
  ): Connection[] {
    const connections: Connection[] = [];

    for (const connection of this.getAllConnections()) {
      if (
        connection.component1 === component ||
        connection.component2 === component
      ) {
        connections.push(connection);
      }
    }

    return connections;
  }

  /**
   * Get all active connections
   */
  public getAllConnections(): Connection[] {
    const allConnections: Connection[] = [];

    for (const network of this.networks.values()) {
      allConnections.push(...network.connections.values());
    }

    return allConnections;
  }

  /**
   * Update mechanical network after simulation step
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public updateNetworks(_deltaTime: number): void {
    for (const network of this.networks.values()) {
      // Check for broken connections due to excessive force
      this.checkConnectionIntegrity(network);

      // Update power flow from sources
      for (const powerSource of network.powerSources) {
        const state = powerSource.getMechanicalState();
        if (Math.abs(state.omega) > 0.001) {
          // Only propagate if there's meaningful motion
          this.propagatePower(powerSource, state);
        }
      }
    }
  }

  // Private helper methods

  private validateConnection(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent,
    connectionType: "gear_mesh" | "belt_connection" | "shaft_connection"
  ): boolean {
    if (comp1 === comp2) {
      console.warn("Cannot connect component to itself");
      return false;
    }

    if (this.findConnectionId(comp1, comp2)) {
      console.warn(
        `Components ${comp1.getName()} and ${comp2.getName()} are already connected`
      );
      return false;
    }

    // Type-specific validation
    if (connectionType === "gear_mesh") {
      return (
        comp1.getComponentType() === "gear" &&
        comp2.getComponentType() === "gear"
      );
    }

    return true;
  }

  private updateNetworksInternal(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent,
    connection: Connection
  ): void {
    const network1Id = this.componentToNetwork.get(comp1);
    const network2Id = this.componentToNetwork.get(comp2);

    if (!network1Id && !network2Id) {
      // Create new network
      const newNetworkId = `net_${this.nextNetworkId++}`;
      const newNetwork: MechanicalNetwork = {
        components: new Set([comp1, comp2]),
        connections: new Map([[connection.id, connection]]),
        powerSources: new Set(),
      };

      this.networks.set(newNetworkId, newNetwork);
      this.componentToNetwork.set(comp1, newNetworkId);
      this.componentToNetwork.set(comp2, newNetworkId);
    } else if (network1Id && !network2Id) {
      // Add comp2 to comp1's network
      const network = this.networks.get(network1Id)!;
      network.components.add(comp2);
      network.connections.set(connection.id, connection);
      this.componentToNetwork.set(comp2, network1Id);
    } else if (!network1Id && network2Id) {
      // Add comp1 to comp2's network
      const network = this.networks.get(network2Id)!;
      network.components.add(comp1);
      network.connections.set(connection.id, connection);
      this.componentToNetwork.set(comp1, network2Id);
    } else if (network1Id && network2Id && network1Id !== network2Id) {
      // Merge networks
      this.mergeNetworks(network1Id, network2Id, connection);
    } else if (network1Id && network2Id && network1Id === network2Id) {
      // Same network, just add connection
      const network = this.networks.get(network1Id)!;
      network.connections.set(connection.id, connection);
    }
  }

  private mergeNetworks(
    network1Id: string,
    network2Id: string,
    connection: Connection
  ): void {
    const network1 = this.networks.get(network1Id)!;
    const network2 = this.networks.get(network2Id)!;

    // Merge network2 into network1
    for (const component of network2.components) {
      network1.components.add(component);
      this.componentToNetwork.set(component, network1Id);
    }

    for (const [id, conn] of network2.connections) {
      network1.connections.set(id, conn);
    }

    for (const powerSource of network2.powerSources) {
      network1.powerSources.add(powerSource);
    }

    // Add new connection
    network1.connections.set(connection.id, connection);

    // Remove network2
    this.networks.delete(network2Id);
  }

  private findConnectionId(
    comp1: MechanicalComponent,
    comp2: MechanicalComponent
  ): string | null {
    for (const network of this.networks.values()) {
      for (const [id, connection] of network.connections) {
        if (
          (connection.component1 === comp1 &&
            connection.component2 === comp2) ||
          (connection.component1 === comp2 && connection.component2 === comp1)
        ) {
          return id;
        }
      }
    }
    return null;
  }

  private getConnectionById(connectionId: string): Connection | null {
    for (const network of this.networks.values()) {
      const connection = network.connections.get(connectionId);
      if (connection) {
        return connection;
      }
    }
    return null;
  }

  private removeConnection(connectionId: string): void {
    for (const network of this.networks.values()) {
      if (network.connections.has(connectionId)) {
        network.connections.delete(connectionId);
        break;
      }
    }
  }

  private checkNetworkSplit(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _comp1: MechanicalComponent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _comp2: MechanicalComponent
  ): void {
    // Implementation would check if removing the connection splits the network
    // and create separate networks if needed. Simplified for now.
  }

  private getEffectiveRadius(component: MechanicalComponent): number {
    const props = component.getMechanicalProperties();

    // For motors, use pulley radius
    if (component.getComponentType() === "motor") {
      const motorProps = props as any;
      return motorProps.pulleyRadius || 20;
    }

    // For forklifts, use pulley groove radius (where belt actually sits)
    if (component.getComponentType() === "forklift") {
      const forkliftProps = props as any;
      const pulleyRadius = forkliftProps.pulleyRadius || 35;
      return pulleyRadius - 2; // Belt sits in the groove, not on outer edge
    }

    // For gears, use beltRadius if available and > 0, otherwise fallback to radius
    if (component.getComponentType() === "gear") {
      const beltRadius = (props as any).beltRadius;
      if (beltRadius && beltRadius > 0) {
        return beltRadius;
      }
    }

    return props.radius || 10; // Default radius if not specified
  }

  // calculateBeltTransmission removed - belts now handle their own transmission completely

  private calculateDirectTransmission(
    connection: Connection,
    state: MechanicalState,
    fromComponent: MechanicalComponent
  ): MechanicalState | null {
    // For direct connections (gears, shafts), let the components handle their own calculations
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _targetComponent =
      connection.component1 === fromComponent
        ? connection.component2
        : connection.component1;

    // This would use the component's calculateOutputState method
    return { ...state };
  }

  private isValidTransmission(state: MechanicalState): boolean {
    return (
      !isNaN(state.omega) &&
      !isNaN(state.torque) &&
      isFinite(state.omega) &&
      isFinite(state.torque)
    );
  }

  private checkConnectionIntegrity(network: MechanicalNetwork): void {
    // Check for broken connections due to excessive stress
    for (const [id, connection] of network.connections) {
      if (this.shouldConnectionBreak(connection)) {
        connection.isActive = false;
        console.warn(`Connection ${id} has failed due to excessive stress`);
      }
    }
  }

  private shouldConnectionBreak(connection: Connection): boolean {
    // Simplified stress check - in real implementation would check against material limits
    const state1 = connection.component1.getMechanicalState();
    const state2 = connection.component2.getMechanicalState();

    const maxStress = Math.max(
      Math.abs(state1.torque),
      Math.abs(state2.torque)
    );
    const stressLimit = 1000; // Simplified limit

    return maxStress > stressLimit;
  }
}
