/** Persists selected learner while in Child Mode so API calls can send X-Child-Context. */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "steamplitude_child_context_student_id";

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyChildContextChanged(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeChildContextChanged(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getChildContextStudentId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function setChildContextStudentId(studentId: string | null): void {
  try {
    if (!studentId?.trim()) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, studentId.trim());
  } catch {
    /* ignore quota / private mode */
  }
  notifyChildContextChanged();
}

/** React hook: re-renders when child context is set or cleared (same tab or cross-tab). */
export function useChildContextStudentId(): string | null {
  return useSyncExternalStore(
    subscribeChildContextChanged,
    getChildContextStudentId,
    () => null,
  );
}
