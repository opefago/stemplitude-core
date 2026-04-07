import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLabProject,
  createLabProjectCheckpoint,
  type StudentLabProject,
  updateLabProject,
} from "../../lib/api/labs";
import { emitLabEventThrottled } from "../../lib/api/gamification";
import { readLabProjectsArray, writeLabProjectsArray } from "../../lib/learnerLabStorage";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type LabSavePayload = {
  blob: Blob;
  filename: string;
  metadata?: Record<string, unknown> | null;
  localDraft?: Record<string, unknown> | null;
};

export type UseLabPersistenceOptions = {
  labId: string;
  localStorageKey: string;
  title: string;
  getPayload: () => LabSavePayload | null;
  autosaveMs?: number;
  debounceMs?: number;
  enabled?: boolean;
};

type SaveKind = "autosave" | "checkpoint";

export function useLabPersistence(opts: UseLabPersistenceOptions) {
  const {
    labId,
    localStorageKey,
    title,
    getPayload,
    autosaveMs = 10000,
    debounceMs = 800,
    enabled = true,
  } = opts;

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const autosaveIntervalRef = useRef<number | null>(null);
  const lastPayloadHashRef = useRef<string>("");
  const inFlightRef = useRef(false);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const writeLocalDraft = useCallback(
    (payload: LabSavePayload, saveKind: SaveKind) => {
      const rows = readLabProjectsArray(localStorageKey);
      const nowIso = new Date().toISOString();
      const row = {
        id: projectId ?? crypto.randomUUID(),
        name: title || "Untitled",
        updatedAt: nowIso,
        createdAt: nowIso,
        saveKind,
        draft: payload.localDraft ?? null,
      };
      const idx = rows.findIndex((r: any) => r?.id === row.id);
      if (idx >= 0) {
        const prev = rows[idx] as any;
        rows[idx] = {
          ...prev,
          ...row,
          createdAt: prev?.createdAt ?? nowIso,
        };
      } else {
        rows.unshift(row);
      }
      writeLabProjectsArray(localStorageKey, rows);
      if (!projectId) setProjectId(row.id);
    },
    [localStorageKey, projectId, title],
  );

  const applyServerResponse = useCallback((resp: StudentLabProject) => {
    setProjectId(resp.id);
    setRevision(resp.revision ?? null);
    setLastSavedAt(Date.now());
    setStatus("saved");
    setError(null);
  }, []);

  const saveWithRetry = useCallback(
    async (saveKind: SaveKind, payload: LabSavePayload) => {
      if (!enabled || inFlightRef.current) return;
      inFlightRef.current = true;
      setStatus("saving");
      let attempt = 0;
      let backoff = 500;
      while (attempt < 3) {
        try {
          let resp: StudentLabProject;
          if (!projectId) {
            resp = await createLabProject({
              title: title || "Untitled",
              lab_id: null,
              file: payload.blob,
              filename: payload.filename,
              metadata: payload.metadata ?? {},
              save_kind: saveKind,
            });
          } else if (saveKind === "checkpoint") {
            resp = await createLabProjectCheckpoint(projectId, {
              title: title || "Untitled",
              lab_id: null,
              file: payload.blob,
              filename: payload.filename,
              metadata: payload.metadata ?? {},
            });
          } else {
            resp = await updateLabProject(projectId, {
              title: title || "Untitled",
              metadata: payload.metadata ?? {},
              save_kind: "autosave",
              expected_revision: revision ?? undefined,
              file: payload.blob,
              filename: payload.filename,
            });
          }
          applyServerResponse(resp);
          emitLabEventThrottled(
            {
              lab_id: labId,
              lab_type: labId,
              event_type: "LAB_SAVE_OK",
              context: {
                save_kind: saveKind,
                revision: resp.revision,
                project_id: resp.id,
              },
            },
            1200,
          );
          writeLocalDraft(payload, saveKind);
          dirtyRef.current = false;
          inFlightRef.current = false;
          return;
        } catch (e) {
          attempt += 1;
          if (attempt >= 3) {
            const msg = e instanceof Error ? e.message : "Save failed";
            setError(msg);
            setStatus("error");
            emitLabEventThrottled(
              {
                lab_id: labId,
                lab_type: labId,
                event_type: "LAB_SAVE_FAILED",
                context: {
                  save_kind: saveKind,
                  attempt,
                  message: msg,
                },
              },
              1200,
            );
            writeLocalDraft(payload, saveKind);
            inFlightRef.current = false;
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, backoff));
          backoff *= 2;
        }
      }
      inFlightRef.current = false;
    },
    [
      enabled,
      projectId,
      title,
      revision,
      applyServerResponse,
      writeLocalDraft,
      labId,
    ],
  );

  const flushAutosave = useCallback(async () => {
    if (!enabled || !dirtyRef.current) return;
    const payload = getPayload();
    if (!payload) return;
    const hash = JSON.stringify(payload.localDraft ?? payload.metadata ?? {});
    if (hash === lastPayloadHashRef.current) {
      dirtyRef.current = false;
      return;
    }
    lastPayloadHashRef.current = hash;
    await saveWithRetry("autosave", payload);
  }, [enabled, getPayload, saveWithRetry]);

  const markDirty = useCallback(() => {
    if (!enabled) return;
    dirtyRef.current = true;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      void flushAutosave();
    }, debounceMs);
  }, [clearSaveTimer, debounceMs, enabled, flushAutosave]);

  const saveCheckpoint = useCallback(async () => {
    const payload = getPayload();
    if (!payload) return;
    await saveWithRetry("checkpoint", payload);
  }, [getPayload, saveWithRetry]);

  useEffect(() => {
    if (!enabled) return undefined;
    autosaveIntervalRef.current = window.setInterval(() => {
      if (dirtyRef.current) {
        void flushAutosave();
      }
    }, autosaveMs);
    return () => {
      if (autosaveIntervalRef.current != null) {
        window.clearInterval(autosaveIntervalRef.current);
        autosaveIntervalRef.current = null;
      }
      clearSaveTimer();
    };
  }, [autosaveMs, clearSaveTimer, enabled, flushAutosave]);

  const saveLabel = useMemo(() => {
    if (status === "saving") return "Saving...";
    if (status === "saved") return "Saved";
    if (status === "error") return "Save failed";
    if (status === "dirty") return "Unsaved changes";
    return "Idle";
  }, [status]);

  return {
    status,
    saveLabel,
    error,
    lastSavedAt,
    projectId,
    revision,
    markDirty,
    saveCheckpoint,
    setProjectIdentity: (nextProjectId: string | null, nextRevision: number | null = null) => {
      setProjectId(nextProjectId);
      setRevision(nextRevision);
    },
  };
}
