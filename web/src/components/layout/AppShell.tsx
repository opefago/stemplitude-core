import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useUIMode } from "../../providers/UIModeProvider";
import { useAuth } from "../../providers/AuthProvider";
import { SidebarProvider } from "../../contexts/SidebarContext";
import { Sidebar } from "./Sidebar";
import { DashboardHeader } from "./DashboardHeader";
import { BottomNav } from "./BottomNav";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { ChildModeBanner } from "./ChildModeBanner";
import { TenantMessagesRealtimeBridge } from "./TenantMessagesRealtimeBridge";
import "./app-shell.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { mode } = useUIMode();
  const { isImpersonating } = useAuth();
  const isKidsMode = mode === "kids";
  const location = useLocation();
  const isChildModeRoute = location.pathname.startsWith("/app/child");
  const showSidebar = !isKidsMode && !isChildModeRoute;

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

        {showSidebar && <Sidebar />}

        <div className="app-shell__main-area">
        <ChildModeBanner />
        <TenantMessagesRealtimeBridge />
        {!isChildModeRoute && <DashboardHeader />}

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
