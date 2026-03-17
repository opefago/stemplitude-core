import { Container } from "pixi.js";

/**
 * Base class for all interactive objects in both mechanical and circuit simulations
 */
export default class GameObject {
  protected name: string;
  protected position: { x: number; y: number };
  protected rotation: number;
  protected scale: { x: number; y: number };
  protected visible: boolean;
  protected interactive: boolean;
  protected selected: boolean;
  protected displayContainer: Container;

  constructor(name: string) {
    this.name = name;
    this.position = { x: 0, y: 0 };
    this.rotation = 0;
    this.scale = { x: 1, y: 1 };
    this.visible = true;
    this.interactive = true;
    this.selected = false;
    this.displayContainer = new Container();

    // Make container interactive by default
    this.displayContainer.eventMode = "static";
    this.displayContainer.cursor = "pointer";
  }

  // Basic getters and setters
  public getName(): string {
    return this.name;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getPosition(): { x: number; y: number } {
    return { ...this.position };
  }

  public setPosition(x: number, y: number): void {
    this.position.x = x;
    this.position.y = y;
    this.updateDisplayPosition();
  }

  public getRotation(): number {
    return this.rotation;
  }

  public setRotation(rotation: number): void {
    this.rotation = rotation;
    this.updateDisplayRotation();
  }

  public getScale(): { x: number; y: number } {
    return { ...this.scale };
  }

  public setScale(x: number, y: number): void {
    this.scale.x = x;
    this.scale.y = y;
    this.updateDisplayScale();
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.displayContainer.visible = visible;
  }

  public isInteractive(): boolean {
    return this.interactive;
  }

  public setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    this.displayContainer.eventMode = interactive ? "static" : "none";
  }

  public isSelected(): boolean {
    return this.selected;
  }

  public setSelected(selected: boolean): void {
    this.selected = selected;
    this.onSelectionChanged(selected);
  }

  public displayObject(): Container {
    return this.displayContainer;
  }

  // Update methods
  protected updateDisplayPosition(): void {
    this.displayContainer.x = this.position.x;
    this.displayContainer.y = this.position.y;
  }

  protected updateDisplayRotation(): void {
    this.displayContainer.rotation = this.rotation;
  }

  protected updateDisplayScale(): void {
    this.displayContainer.scale.x = this.scale.x;
    this.displayContainer.scale.y = this.scale.y;
  }

  // Virtual methods to be overridden
  public update(deltaTime: number): void {
    // Override in derived classes
  }

  protected onSelectionChanged(selected: boolean): void {
    // Override in derived classes to handle selection visual changes
  }

  // Abstract methods that must be implemented by derived classes
  protected createVisuals(): void {
    throw new Error("createVisuals() must be implemented by derived classes");
  }

  protected updateVisuals(deltaTime: number): void {
    throw new Error("updateVisuals() must be implemented by derived classes");
  }

  // Cleanup
  public destroy(): void {
    if (this.displayContainer.parent) {
      this.displayContainer.parent.removeChild(this.displayContainer);
    }
    this.displayContainer.destroy();
  }
}
