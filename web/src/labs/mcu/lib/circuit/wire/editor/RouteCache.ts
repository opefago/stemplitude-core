/**
 * Memoized orthogonal route polylines; invalidate on obstacle or endpoint changes.
 */

export type CachedRoute = { polyline: { x: number; y: number }[]; cost: number; at: number };

export class RouteCache {
  private entries = new Map<string, CachedRoute>();

  get(key: string): { x: number; y: number }[] | undefined {
    return this.entries.get(key)?.polyline;
  }

  getFull(key: string): CachedRoute | undefined {
    return this.entries.get(key);
  }

  set(key: string, polyline: { x: number; y: number }[], cost: number): void {
    this.entries.set(key, { polyline, cost, at: performance.now() });
  }

  invalidate(predicate: (key: string) => boolean): void {
    for (const k of this.entries.keys()) {
      if (predicate(k)) this.entries.delete(k);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export function makeRouteCacheKey(parts: string[]): string {
  return parts.join("|");
}
