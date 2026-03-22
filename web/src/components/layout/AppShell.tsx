import type { ReactNode } from "react";
import { useUIMode } from "../../providers/UIModeProvider";
import { useAuth } from "../../providers/AuthProvider";
import { SidebarProvider } from "../../contexts/SidebarContext";
import { Sidebar } from "./Sidebar";
import { DashboardHeader } from "./DashboardHeader";
import { BottomNav } from "./BottomNav";
import { ImpersonationBanner } from "./ImpersonationBanner";
import "./app-shell.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { mode } = useUIMode();
  const { isImpersonating } = useAuth();
  const isKidsMode = mode === "kids";

  return (
    <SidebarProvider>
      <div
        className={`app-shell ${
          isKidsMode ? "app-shell--with-bottom-nav" : "app-shell--with-sidebar"
        }`}
      >
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>

        {isImpersonating && <ImpersonationBanner />}

        {!isKidsMode && <Sidebar />}

        <div className="app-shell__main-area">
        <DashboardHeader />

        <main
          id="main-content"
          className="app-content"
          tabIndex={-1}
          role="main"
        >
          {children}
        </main>
      </div>

      {isKidsMode && <BottomNav />}
    </div>
    </SidebarProvider>
  );
}
