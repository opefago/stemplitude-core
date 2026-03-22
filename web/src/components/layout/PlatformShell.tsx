import type { ReactNode } from "react";
import { useAuth } from "../../providers/AuthProvider";
import { DashboardHeader } from "./DashboardHeader";
import { ImpersonationBanner } from "./ImpersonationBanner";
import "./platform-shell.css";

interface PlatformShellProps {
  children: ReactNode;
}

export function PlatformShell({ children }: PlatformShellProps) {
  const { isImpersonating } = useAuth();

  return (
    <div className="platform-shell">
      {isImpersonating && <ImpersonationBanner />}
      <DashboardHeader variant="platform" />
      <main className="platform-shell__content" role="main">
        {children}
      </main>
    </div>
  );
}
