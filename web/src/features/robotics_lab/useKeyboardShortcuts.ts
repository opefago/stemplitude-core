import { useEffect } from "react";

interface ShortcutActions {
  onRunPause?: () => void;
  onReset?: () => void;
  onSave?: () => void;
  onDeleteSelected?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDuplicate?: () => void;
  onGroup?: () => void;
  onCameraPreset?: (index: number) => void;
  onNudge?: (dx: number, dz: number) => void;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest(".monaco-editor") || el.closest(".cm-editor")) return true;
  return false;
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      if (ctrlOrCmd && e.key === "s") {
        e.preventDefault();
        actions.onSave?.();
        return;
      }
      if (ctrlOrCmd && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        actions.onRedo?.();
        return;
      }
      if (ctrlOrCmd && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        actions.onUndo?.();
        return;
      }
      if (ctrlOrCmd && e.key === "d") {
        e.preventDefault();
        actions.onDuplicate?.();
        return;
      }
      if (ctrlOrCmd && e.key === "g") {
        e.preventDefault();
        actions.onGroup?.();
        return;
      }

      if (isInputFocused()) return;

      if (e.key === " ") {
        e.preventDefault();
        actions.onRunPause?.();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        actions.onReset?.();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        actions.onDeleteSelected?.();
        return;
      }
      if (e.key === "1") {
        actions.onCameraPreset?.(0);
        return;
      }
      if (e.key === "2") {
        actions.onCameraPreset?.(1);
        return;
      }
      if (e.key === "3") {
        actions.onCameraPreset?.(2);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        actions.onNudge?.(-20, 0);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        actions.onNudge?.(20, 0);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        actions.onNudge?.(0, -20);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        actions.onNudge?.(0, 20);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
