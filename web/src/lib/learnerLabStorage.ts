/**
 * Lab project lists in localStorage are scoped per learner so guardian Child Mode
 * reads/writes the child's bucket, not the parent's (or a shared global key).
 */

import { getChildContextStudentId } from "./childContext";
import { decodeToken, getAccessToken } from "./tokens";

function parseJsonArray(raw: string | null): unknown[] {
  try {
    const p = JSON.parse(raw || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function getActiveLabLearnerContext(): {
  subType: "user" | "student" | null;
  jwtSubjectId: string | null;
} {
  const token = getAccessToken();
  const payload = token ? decodeToken(token) : null;
  if (!payload?.sub) return { subType: null, jwtSubjectId: null };
  const subType = payload.sub_type === "student" ? "student" : "user";
  return { subType, jwtSubjectId: payload.sub };
}

/** Stable id for the learner whose lab files we read/write (student JWT sub, or child-context id). */
export function getLearnerStorageScopeId(): string | null {
  const ctx = getActiveLabLearnerContext();
  const childId = getChildContextStudentId();
  if (ctx.subType === "student" && ctx.jwtSubjectId?.trim()) {
    return ctx.jwtSubjectId.trim();
  }
  if (ctx.subType === "user" && childId?.trim()) {
    return childId.trim();
  }
  return null;
}

/** localStorage key for this learner's project list (falls back to legacy global key when unscoped). */
export function labProjectsStorageKey(baseKey: string): string {
  const scope = getLearnerStorageScopeId();
  return scope ? `${baseKey}__sid_${scope}` : baseKey;
}

/**
 * Common shape for lab project entries persisted in localStorage.
 * The blob store (via useLabPersistence) is the authoritative copy;
 * localStorage holds a lightweight project list for the UI plus an
 * optional local draft as a failure/offline fallback.
 */
export interface LabProject<TDraft = unknown> {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  /** Server revision counter for freshness validation across browsers. */
  revision?: number;
  /** Local draft data saved by useLabPersistence or manual save. */
  draft?: TDraft | null;
  /** Legacy: some labs store the full snapshot inline. Prefer `draft`. */
  snapshot?: TDraft | null;
  /** Which save produced this row (autosave, checkpoint, or manual). */
  saveKind?: string;
}

/** Read project rows: scoped bucket first, then legacy global key if scoped is empty. */
export function readLabProjectsArray<T = unknown>(baseKey: string): T[] {
  const scoped = labProjectsStorageKey(baseKey);
  let rows = parseJsonArray(localStorage.getItem(scoped));
  if (rows.length > 0) return rows as T[];
  if (scoped !== baseKey) {
    rows = parseJsonArray(localStorage.getItem(baseKey));
  }
  return rows as T[];
}

export function writeLabProjectsArray(baseKey: string, rows: unknown[]): void {
  try {
    localStorage.setItem(labProjectsStorageKey(baseKey), JSON.stringify(rows));
  } catch {
    /* quota / private mode */
  }
}

/**
 * One-time copy from legacy global keys into scoped keys (student JWT or guardian Child Mode)
 * so existing saves keep working after namespacing shipped.
 */
export function migrateLegacyLabProjectsIfNeeded(baseKey: string): void {
  const scoped = labProjectsStorageKey(baseKey);
  if (scoped === baseKey) return;
  const ctx = getActiveLabLearnerContext();
  const childId = getChildContextStudentId();
  const parentChildMode = ctx.subType === "user" && Boolean(childId?.trim());
  if (ctx.subType !== "student" && !parentChildMode) return;
  if (parseJsonArray(localStorage.getItem(scoped)).length > 0) return;
  const legacy = parseJsonArray(localStorage.getItem(baseKey));
  if (legacy.length === 0) return;
  try {
    localStorage.setItem(scoped, JSON.stringify(legacy));
  } catch {
    /* ignore */
  }
}

function labLastOpenedBaseKey(labId: string): string {
  return `stemplitude_lab_last_opened__${labId}`;
}

/**
 * Persist "lab opened" timestamp per learner scope so launcher cards can show
 * recency even when no project has been saved yet.
 */
export function writeLabLastOpenedAt(labId: string, timestampMs: number = Date.now()): void {
  if (!labId) return;
  const baseKey = labLastOpenedBaseKey(labId);
  const scopedKey = labProjectsStorageKey(baseKey);
  const value = String(Math.max(0, Math.floor(timestampMs)));
  try {
    localStorage.setItem(scopedKey, value);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Read "lab opened" timestamp from scoped key first, then legacy unscoped key.
 */
export function readLabLastOpenedAt(labId: string): number {
  if (!labId) return 0;
  const baseKey = labLastOpenedBaseKey(labId);
  const scopedKey = labProjectsStorageKey(baseKey);
  const read = (key: string): number => {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const scoped = read(scopedKey);
  if (scoped > 0) return scoped;
  return scopedKey === baseKey ? scoped : read(baseKey);
}
