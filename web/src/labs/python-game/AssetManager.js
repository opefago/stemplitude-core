/**
 * Unified asset registry for the Py Game Maker.
 *
 * Maps user-friendly names to actual asset data for sprites, backgrounds,
 * and sounds. Supports multiple sources: gallery (built-in), uploaded
 * (blob-cached), and user-created (painted/recorded).
 *
 * Asset entry shape:
 *   { name, type, source, ...data }
 *
 * Sprite data:   { image, thumbnail, width, height, frames?, fps? }
 * Background:    { image, thumbnail, width, height }
 * Sound:         { audioUrl, duration? }
 *
 * Types:    'sprite' | 'background' | 'sound'
 * Sources:  'gallery' | 'upload' | 'created' | 'recorded'
 */
export class AssetManager {
  constructor() {
    this._assets = new Map();
    this._listeners = new Set();
  }

  // ─── Core CRUD ───────────────────────────────────────

  register(name, type, source, data = {}) {
    const entry = { name, type, source, ...data };
    this._assets.set(name, entry);
    this._notify();
    return entry;
  }

  get(name) {
    return this._assets.get(name) || null;
  }

  has(name) {
    return this._assets.has(name);
  }

  remove(name) {
    const existed = this._assets.delete(name);
    if (existed) this._notify();
    return existed;
  }

  rename(oldName, newName) {
    if (oldName === newName) return true;
    const asset = this._assets.get(oldName);
    if (!asset) return false;
    if (this._assets.has(newName)) return false;
    this._assets.delete(oldName);
    asset.name = newName;
    this._assets.set(newName, asset);
    this._notify();
    return true;
  }

  update(name, data) {
    const asset = this._assets.get(name);
    if (!asset) return false;
    Object.assign(asset, data);
    this._notify();
    return true;
  }

  // ─── Query ───────────────────────────────────────────

  list(type) {
    const result = [];
    for (const a of this._assets.values()) {
      if (!type || a.type === type) result.push(a);
    }
    return result;
  }

  names(type) {
    return this.list(type).map(a => a.name);
  }

  find(name, ...types) {
    const asset = this._assets.get(name);
    if (!asset) return null;
    if (types.length === 0) return asset;
    return types.includes(asset.type) ? asset : null;
  }

  // ─── Naming helpers ──────────────────────────────────

  uniqueName(prefix) {
    let i = 1;
    while (this._assets.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  }

  isNameAvailable(name, excludeName) {
    if (!name || !name.trim()) return false;
    const existing = this._assets.get(name);
    if (!existing) return true;
    return existing.name === excludeName;
  }

  // ─── Bulk operations ────────────────────────────────

  clear() {
    if (this._assets.size === 0) return;
    this._assets.clear();
    this._notify();
  }

  clearType(type) {
    let removed = false;
    for (const [name, a] of this._assets) {
      if (a.type === type) {
        this._assets.delete(name);
        removed = true;
      }
    }
    if (removed) this._notify();
  }

  // ─── Serialization (for future save/load) ───────────

  toJSON() {
    const entries = [];
    for (const asset of this._assets.values()) {
      const { image, ...serializable } = asset;
      if (asset.type === 'sprite' || asset.type === 'background') {
        serializable.thumbnail = asset.thumbnail || null;
      }
      if (asset.type === 'sound') {
        serializable.audioUrl = asset.audioUrl || null;
      }
      entries.push(serializable);
    }
    return entries;
  }

  // ─── React integration ──────────────────────────────

  onChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify() {
    for (const fn of this._listeners) {
      try { fn(); } catch (e) { console.error('AssetManager listener error:', e); }
    }
  }

  get size() {
    return this._assets.size;
  }

  countByType(type) {
    let n = 0;
    for (const a of this._assets.values()) {
      if (a.type === type) n++;
    }
    return n;
  }
}
