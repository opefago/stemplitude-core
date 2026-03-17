import DefaultShapeBehavior from "./DefaultShapeBehavior";
import ImportedBehavior from "./ImportedBehavior";
import TextBehavior from "./TextBehavior";
import TorusBehavior from "./TorusBehavior";
import RingBehavior from "./RingBehavior";
import TetrahedronBehavior from "./TetrahedronBehavior";

const defaultBehavior  = new DefaultShapeBehavior();
const textBehavior     = new TextBehavior();
const torusBehavior    = new TorusBehavior();
const ringBehavior     = new RingBehavior();
const tetrahedronBehavior = new TetrahedronBehavior();
const importedBehavior = new ImportedBehavior();

export function getObjectBehavior(type) {
  if (type === "text") return textBehavior;
  if (type === "tetrahedron") return tetrahedronBehavior;
  if (type === "torus" || type === "tube") return torusBehavior;
  if (type === "ring") return ringBehavior;
  if (type === "imported") return importedBehavior;
  return defaultBehavior;
}
