import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLabProject,
  createLabProjectCheckpoint,
  getLabProject,
  type StudentLabProject,
  updateLabProject,
} from "../../lib/api/labs";
import { emitLabEventThrottled } from "../../lib/api/gamification";
import { ensureFreshAccessToken } from "../../lib/api/client";
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
  const authFailedRef = useRef(false);
  const authFailedAtRef = useRef(0);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const writeLocalDraft = useCallback(
    (payload: LabSavePayload, saveKind: SaveKind, serverRevision?: number) => {
      const currentPid = projectIdRef.current;
      const rows = readLabProjectsArray(localStorageKey);
      const nowIso = new Date().toISOString();
      const localId = currentPid ?? `local:${crypto.randomUUID()}`;
      const row = {
        id: localId,
        name: title || "Untitled",
        updatedAt: nowIso,
        createdAt: nowIso,
        saveKind,
        revision: serverRevision ?? revisionRef.current ?? undefined,
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
    },
    [localStorageKey, title],
  );

  const applyServerResponse = useCallback((resp: StudentLabProject) => {
    setProjectId(resp.id);
    setRevision(resp.revision ?? null);
    setLastSavedAt(Date.now());
    setStatus("saved");
    setError(null);
  }, []);

  const projectIdRef = useRef<string | null>(projectId);
  const revisionRef = useRef<number | null>(revision);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);
  useEffect(() => { revisionRef.current = revision; }, [revision]);

  const saveWithRetry = useCallback(
    async (saveKind: SaveKind, payload: LabSavePayload) => {
      if (!enabled || inFlightRef.current) return;
      if (authFailedRef.current && Date.now() - authFailedAtRef.current < 60_000) return;
      inFlightRef.current = true;
      setStatus("saving");
      const hasToken = await ensureFreshAccessToken(30);
      if (!hasToken) {
        writeLocalDraft(payload, saveKind);
        setStatus("error");
        setError("Not authenticated");
        authFailedRef.current = true;
        authFailedAtRef.current = Date.now();
        inFlightRef.current = false;
        return;
      }
      authFailedRef.current = false;
      let attempt = 0;
      let backoff = 500;
      while (attempt < 3) {
        const currentProjectId = projectIdRef.current;
        const currentRevision = revisionRef.current;
        try {
          let resp: StudentLabProject;
          if (!currentProjectId) {
            resp = await createLabProject({
              title: title || "Untitled",
              lab_id: null,
              file: payload.blob,
              filename: payload.filename,
              metadata: payload.metadata ?? {},
              save_kind: saveKind,
            });
          } else if (saveKind === "checkpoint") {
            resp = await createLabProjectCheckpoint(currentProjectId, {
              title: title || "Untitled",
              lab_id: null,
              file: payload.blob,
              filename: payload.filename,
              metadata: payload.metadata ?? {},
            });
          } else {
            resp = await updateLabProject(currentProjectId, {
              title: title || "Untitled",
              metadata: payload.metadata ?? {},
              save_kind: "autosave",
              expected_revision: currentRevision ?? undefined,
              file: payload.blob,
              filename: payload.filename,
            });
          }
          applyServerResponse(resp);
          projectIdRef.current = resp.id;
          revisionRef.current = resp.revision ?? null;
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
          writeLocalDraft(payload, saveKind, resp.revision);
          dirtyRef.current = false;
          inFlightRef.current = false;
          return;
        } catch (e) {
          const errStatus = (e as any)?.status ?? (e as any)?.response?.status;
          if (errStatus === 401 || errStatus === 403) {
            writeLocalDraft(payload, saveKind);
            setStatus("error");
            setError("Not authenticated");
            authFailedRef.current = true;
            authFailedAtRef.current = Date.now();
            inFlightRef.current = false;
            return;
          }
          if ((errStatus === 404 || errStatus === 409) && currentProjectId) {
            setProjectId(null);
            setRevision(null);
            projectIdRef.current = null;
            revisionRef.current = null;
            attempt += 1;
            continue;
          }
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
      title,
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

  /**
   * Resolve the freshest version of a project by comparing the local row's
   * revision against the server. Returns `{ source, data }` where `data`
   * is the parsed JSON blob (the project snapshot) when downloaded from
   * the server, or `null` when the local copy is current.
   *
   * Call this from any lab's "Open project" handler instead of blindly
   * trusting the localStorage row.
   */
  const resolveLatestProject = useCallback(
    async (localRow: {
      id?: string;
      revision?: number;
      [key: string]: unknown;
    }): Promise<{
      source: "local" | "server" | "server_unreachable";
      serverData: unknown | null;
      serverRevision: number | null;
      serverProjectId: string | null;
    }> => {
      const localId = typeof localRow.id === "string" ? localRow.id : null;
      const localRev = typeof localRow.revision === "number" ? localRow.revision : null;

      if (!localId) {
        return { source: "local", serverData: null, serverRevision: null, serverProjectId: null };
      }

      try {
        const serverProject = await getLabProject(localId);
        const serverRev = serverProject.revision ?? 0;

        if (localRev != null && serverRev <= localRev) {
          setProjectId(serverProject.id);
          setRevision(serverRev);
          return {
            source: "local",
            serverData: null,
            serverRevision: serverRev,
            serverProjectId: serverProject.id,
          };
        }

        if (serverProject.blob_url) {
          const res = await fetch(serverProject.blob_url);
          if (res.ok) {
            const data = await res.json();
            setProjectId(serverProject.id);
            setRevision(serverRev);

            const rows = readLabProjectsArray(localStorageKey);
            const idx = rows.findIndex((r: any) => r?.id === localId);
            if (idx >= 0) {
              (rows[idx] as any).revision = serverRev;
              writeLabProjectsArray(localStorageKey, rows);
            }

            return {
              source: "server",
              serverData: data,
              serverRevision: serverRev,
              serverProjectId: serverProject.id,
            };
          }
        }

        setProjectId(serverProject.id);
        setRevision(serverRev);
        return { source: "local", serverData: null, serverRevision: serverRev, serverProjectId: serverProject.id };
      } catch {
        return { source: "server_unreachable", serverData: null, serverRevision: null, serverProjectId: localId };
      }
    },
    [localStorageKey],
  );

  return {
    status,
    saveLabel,
    error,
    lastSavedAt,
    projectId,
    revision,
    markDirty,
    saveCheckpoint,
    resolveLatestProject,
    setProjectIdentity: (nextProjectId: string | null, nextRevision: number | null = null) => {
      const serverId = nextProjectId?.startsWith("local:") ? null : nextProjectId;
      setProjectId(serverId);
      setRevision(nextRevision);
      projectIdRef.current = serverId;
      revisionRef.current = nextRevision;
    },
  };
}
