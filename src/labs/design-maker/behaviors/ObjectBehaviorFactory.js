import DefaultShapeBehavior from "./DefaultShapeBehavior";
import ImportedBehavior from "./ImportedBehavior";
import TextBehavior from "./TextBehavior";
import TorusBehavior from "./TorusBehavior";

const defaultBehavior = new DefaultShapeBehavior();
const textBehavior = new TextBehavior();
const torusBehavior = new TorusBehavior();
const importedBehavior = new ImportedBehavior();

export function getObjectBehavior(type) {
  if (type === "text") return textBehavior;
  if (type === "torus" || type === "tube") return torusBehavior;
  if (type === "imported") return importedBehavior;
  return defaultBehavior;
}
