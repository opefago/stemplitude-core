import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider";
import { useTenant } from "./TenantProvider";

/** "platform" = Platform Administration (super admin dashboard); string = tenant ID */
export type WorkspaceMode = "platform" | string;

const WORKSPACE_KEY = "workspace_mode";

interface WorkspaceContextValue {
  /** Current workspace: "platform" for Platform Admin, or tenant ID for tenant view */
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  /** True when viewing Platform Administration */
  isPlatformView: boolean;
  /** True when viewing a tenant (org) */
  isTenantView: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { user, isSuperAdmin } = useAuth();
  const { tenant, setTenant } = useTenant();
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>(() => {
    const stored = localStorage.getItem(WORKSPACE_KEY);
    if (stored === "platform") return "platform";
    if (stored) return stored;
    return "platform"; // default for super admin
  });

  const setWorkspaceMode = useCallback(
    (mode: WorkspaceMode) => {
      setWorkspaceModeState(mode);
      if (mode === "platform") {
        localStorage.setItem(WORKSPACE_KEY, "platform");
      } else {
        localStorage.setItem(WORKSPACE_KEY, mode);
      }
    },
    [],
  );

  // Sync with tenant: when tenant changes externally (e.g. login), update workspace
  useEffect(() => {
    if (!user) return;
    if (isSuperAdmin) {
      // Super admin: keep stored preference, or default to platform
      const stored = localStorage.getItem(WORKSPACE_KEY);
      if (stored === "platform") {
        setWorkspaceModeState("platform");
      } else if (stored && tenant?.id === stored) {
        setWorkspaceModeState(stored);
      } else if (tenant?.id) {
        // Has tenant from login, could switch to it
        setWorkspaceModeState((prev) => (prev === "platform" ? "platform" : prev));
      }
    } else {
      // Non-super-admin: always tenant view, use their tenant
      if (tenant?.id) {
        setWorkspaceModeState(tenant.id);
        localStorage.setItem(WORKSPACE_KEY, tenant.id);
      }
    }
  }, [user, isSuperAdmin, tenant?.id]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceMode,
      setWorkspaceMode,
      isPlatformView: workspaceMode === "platform",
      isTenantView: workspaceMode !== "platform" && !!workspaceMode,
    }),
    [workspaceMode, setWorkspaceMode],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
