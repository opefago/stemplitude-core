import { Assets, Texture } from "pixi.js";

/**
 * Cached textures for IEC/COM SVGs (chris-pikul/electronic-symbols, MIT).
 * Black strokes are remapped to white for the dark schematic canvas.
 */
const cache = new Map<string, Promise<Texture>>();

function remapBlackToWhite(svg: string): string {
  return svg
    .replace(/#000000/gi, "#ffffff")
    .replace(/#000\b/g, "#ffffff")
    .replace(/fill:\s*#000\b/gi, "fill: #ffffff")
    .replace(/stroke:\s*#000\b/gi, "stroke: #ffffff");
}

export function loadSchematicSvgTextureForCanvas(url: string): Promise<Texture> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`SVG fetch failed: ${url} (${res.status})`);
      const svg = remapBlackToWhite(await res.text());
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await Assets.load<Texture>(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    })();
    cache.set(url, p);
  }
  return p;
}
