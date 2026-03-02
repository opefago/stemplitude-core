import { DisplayObject } from "pixi.js";
export default class GameObject {
  private name: string;
  private position: { x: number; y: number };
  private rotation: number;
  private scale: { x: number; y: number };
  constructor(name: string) {
    this.name = name;
    this.position = { x: 0, y: 0 };
    this.rotation = 0;
    this.scale = { x: 1, y: 1 };
  }
  public setName(name: string) {
    this.name = name;
    return this;
  }
  public setPosition(x: number, y: number) {
    this.position = { x, y };
    return this;
  }
  public setRotation(rotation: number) {
    this.rotation = rotation;
    return this;
  }
  public setScale(x: number, y: number) {
    this.scale = { x, y };
    return this;
  }

  public getName() {
    return this.name;
  }
  public getPosition() {
    return this.position;
  }
  public getRotation() {
    return this.rotation;
  }
  public getScale() {
    return this.scale;
  }
  public update(_deltaTime: number) {
    // Update logic for the game object
  }
  public render() {
    // Render logic for the game object
  }

  public displayObject(): DisplayObject | null {
    // Return a display object for rendering
    return null;
  }
}
