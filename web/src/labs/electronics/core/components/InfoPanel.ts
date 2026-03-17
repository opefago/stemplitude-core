import * as PIXI from "pixi.js";
import {
  useComponents,
  useConnections,
  useResults,
} from "../../store/circuitStore";
import { CircuitComponent } from "../../types/Circuit";

export class InfoPanel extends PIXI.Container {
  private background: PIXI.Graphics;
  private titleText: PIXI.Text;
  private contentContainer: PIXI.Container;
  private selectedComponent: CircuitComponent | null = null;
  public readonly panelWidth = 300;

  constructor() {
    super();
    this.createBackground();
    this.createTitle();
    this.createContent();
    this.updateContent();
  }

  private createBackground() {
    this.background = new PIXI.Graphics();
    this.background.rect(0, 0, this.panelWidth, window.innerHeight);
    this.background.fill(0x2d2d2d);
    this.background.stroke({ width: 1, color: 0x444444 });
    this.addChild(this.background);
  }

  private createTitle() {
    this.titleText = new PIXI.Text({
      text: "Circuit Info",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 18,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    this.titleText.x = 15;
    this.titleText.y = 15;
    this.addChild(this.titleText);
  }

  private createContent() {
    this.contentContainer = new PIXI.Container();
    this.contentContainer.x = 15;
    this.contentContainer.y = 60;
    this.addChild(this.contentContainer);
  }

  private updateContent() {
    // Clear previous content
    this.contentContainer.removeChildren();

    if (this.selectedComponent) {
      this.showComponentDetails();
    } else {
      this.showCircuitSummary();
    }
  }

  private showComponentDetails() {
    if (!this.selectedComponent) return;

    let yPos = 0;

    // Component type
    const typeText = new PIXI.Text({
      text: `Type: ${this.selectedComponent.type.toUpperCase()}`,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fontWeight: "bold",
        fill: 0x4caf50,
      }),
    });
    typeText.y = yPos;
    this.contentContainer.addChild(typeText);
    yPos += 25;

    // Component ID
    const idText = new PIXI.Text({
      text: `ID: ${this.selectedComponent.id.slice(0, 8)}...`,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 12,
        fill: 0xaaaaaa,
      }),
    });
    idText.y = yPos;
    this.contentContainer.addChild(idText);
    yPos += 25;

    // Position
    const posText = new PIXI.Text({
      text: `Position: (${Math.round(this.selectedComponent.position.x)}, ${Math.round(this.selectedComponent.position.y)})`,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 12,
        fill: 0xffffff,
      }),
    });
    posText.y = yPos;
    this.contentContainer.addChild(posText);
    yPos += 35;

    // Properties
    const propsTitle = new PIXI.Text({
      text: "Properties:",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    propsTitle.y = yPos;
    this.contentContainer.addChild(propsTitle);
    yPos += 25;

    // Show component-specific properties
    Object.entries(this.selectedComponent.properties || {}).forEach(
      ([key, value]) => {
        const propText = new PIXI.Text({
          text: `${key}: ${value}`,
          style: new PIXI.TextStyle({
            fontFamily: "Arial",
            fontSize: 12,
            fill: 0xffffff,
          }),
        });
        propText.y = yPos;
        this.contentContainer.addChild(propText);
        yPos += 20;
      }
    );

    // Pin information
    yPos += 10;
    const pinsTitle = new PIXI.Text({
      text: "Pins:",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    pinsTitle.y = yPos;
    this.contentContainer.addChild(pinsTitle);
    yPos += 25;

    this.selectedComponent.pins.forEach((pin, index) => {
      const pinText = new PIXI.Text({
        text: `Pin ${index + 1}: (${Math.round(pin.position.x)}, ${Math.round(pin.position.y)})`,
        style: new PIXI.TextStyle({
          fontFamily: "Arial",
          fontSize: 12,
          fill: 0xffffff,
        }),
      });
      pinText.y = yPos;
      this.contentContainer.addChild(pinText);
      yPos += 20;
    });
  }

  private showCircuitSummary() {
    // TODO: Get data from external state management
    const components: any[] = [];
    const connections: any[] = [];
    const results: any = { voltages: {} };

    let yPos = 0;

    // Circuit statistics
    const statsTitle = new PIXI.Text({
      text: "Circuit Statistics",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 16,
        fontWeight: "bold",
        fill: 0x4caf50,
      }),
    });
    statsTitle.y = yPos;
    this.contentContainer.addChild(statsTitle);
    yPos += 35;

    // Component count
    const compCountText = new PIXI.Text({
      text: `Components: ${components.length}`,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0xffffff,
      }),
    });
    compCountText.y = yPos;
    this.contentContainer.addChild(compCountText);
    yPos += 25;

    // Connection count
    const connCountText = new PIXI.Text({
      text: `Connections: ${connections.length}`,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 14,
        fill: 0xffffff,
      }),
    });
    connCountText.y = yPos;
    this.contentContainer.addChild(connCountText);
    yPos += 35;

    // Component breakdown
    const componentTypes = components.reduce(
      (acc: Record<string, number>, comp) => {
        acc[comp.type] = (acc[comp.type] || 0) + 1;
        return acc;
      },
      {}
    );

    if (Object.keys(componentTypes).length > 0) {
      const breakdownTitle = new PIXI.Text({
        text: "Component Breakdown:",
        style: new PIXI.TextStyle({
          fontFamily: "Arial",
          fontSize: 14,
          fontWeight: "bold",
          fill: 0xffffff,
        }),
      });
      breakdownTitle.y = yPos;
      this.contentContainer.addChild(breakdownTitle);
      yPos += 25;

      Object.entries(componentTypes).forEach(([type, count]) => {
        const typeText = new PIXI.Text({
          text: `${type}: ${count}`,
          style: new PIXI.TextStyle({
            fontFamily: "Arial",
            fontSize: 12,
            fill: 0xffffff,
          }),
        });
        typeText.y = yPos;
        this.contentContainer.addChild(typeText);
        yPos += 20;
      });
    }

    // Simulation results
    if (results.voltages && Object.keys(results.voltages).length > 0) {
      yPos += 15;
      const resultsTitle = new PIXI.Text({
        text: "Simulation Results:",
        style: new PIXI.TextStyle({
          fontFamily: "Arial",
          fontSize: 14,
          fontWeight: "bold",
          fill: 0x4caf50,
        }),
      });
      resultsTitle.y = yPos;
      this.contentContainer.addChild(resultsTitle);
      yPos += 25;

      Object.entries(results.voltages)
        .slice(0, 5)
        .forEach(([nodeId, voltage]) => {
          const voltageText = new PIXI.Text({
            text: `Node ${nodeId}: ${voltage.toFixed(2)}V`,
            style: new PIXI.TextStyle({
              fontFamily: "Arial",
              fontSize: 12,
              fill: 0xffffff,
            }),
          });
          voltageText.y = yPos;
          this.contentContainer.addChild(voltageText);
          yPos += 20;
        });
    }
  }

  public showComponentInfo(componentId: string) {
    // TODO: Get components from external state management
    const components: any[] = [];
    this.selectedComponent =
      components.find((c: any) => c.id === componentId) || null;
    this.updateContent();

    // Update title
    this.titleText.text = this.selectedComponent
      ? `${this.selectedComponent.type.toUpperCase()} Info`
      : "Circuit Info";
  }

  public clearSelection() {
    this.selectedComponent = null;
    this.titleText.text = "Circuit Info";
    this.updateContent();
  }

  public resize(height: number) {
    this.background.clear();
    this.background.rect(0, 0, this.panelWidth, height);
    this.background.fill(0x2d2d2d);
    this.background.stroke({ width: 1, color: 0x444444 });
  }

  public refresh() {
    this.updateContent();
  }
}
