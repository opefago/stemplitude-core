import { useCallback, useRef } from "react";
import { createLabProject, updateLabProject } from "../../lib/api/labs";
import type { LabClassroomContext } from "./useLabSession";

const DEBOUNCE_MS = 5_000;

/**
 * Pushes project snapshots to S3 when the lab is running inside a classroom
 * session. Each lab should call `pushToServer` after its local save succeeds.
 *
 * The hook deduplicates rapid saves with a trailing-edge debounce and reuses
 * the server-side project ID across saves so a single project record is
 * updated rather than creating duplicates.
 */
export function useSessionProjectSync(
  classroomContext: LabClassroomContext | null | undefined,
  labType: string,
) {
  const serverIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayloadRef = useRef<{
    title: string;
    blob: Blob;
    filename: string;
  } | null>(null);

  const flush = useCallback(async () => {
    const ctx = classroomContext;
    const payload = latestPayloadRef.current;
    if (!ctx || !payload) return;

    const metadata: Record<string, unknown> = {
      lab_type: labType,
      classroom_id: ctx.classroomId,
      session_id: ctx.sessionId,
    };

    try {
      if (serverIdRef.current) {
        await updateLabProject(serverIdRef.current, {
          title: payload.title,
          metadata,
          save_kind: "autosave",
          file: payload.blob,
          filename: payload.filename,
        });
      } else {
        const created = await createLabProject({
          title: payload.title,
          file: payload.blob,
          filename: payload.filename,
          metadata,
          save_kind: "autosave",
        });
        serverIdRef.current = created.id;
      }
    } catch (err) {
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      if ((status === 404 || status === 409) && serverIdRef.current) {
        serverIdRef.current = null;
      }
      console.warn("[SessionProjectSync] S3 push failed:", err);
    }
  }, [classroomContext, labType]);

  /** Call after every local save. Debounces rapid calls. */
  const pushToServer = useCallback(
    (title: string, blob: Blob, filename: string) => {
      if (!classroomContext) return;
      latestPayloadRef.current = { title, blob, filename };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, DEBOUNCE_MS);
    },
    [classroomContext, flush],
  );

  return { pushToServer };
}
