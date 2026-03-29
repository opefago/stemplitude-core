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

/** Read project rows: scoped bucket first, then legacy global key if scoped is empty. */
export function readLabProjectsArray(baseKey: string): unknown[] {
  const scoped = labProjectsStorageKey(baseKey);
  let rows = parseJsonArray(localStorage.getItem(scoped));
  if (rows.length > 0) return rows;
  if (scoped !== baseKey) {
    rows = parseJsonArray(localStorage.getItem(baseKey));
  }
  return rows;
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
