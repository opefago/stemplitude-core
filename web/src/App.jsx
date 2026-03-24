import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "./providers/AuthProvider";
import { TenantProvider } from "./providers/TenantProvider";
import { UIModeProvider } from "./providers/UIModeProvider";
import { ThemeProvider } from "./providers/ThemeProvider";
import {
  AppShell,
  PlatformShell,
  RouteGuard,
  CommandPalette,
  ColorSchemeInit,
} from "./components/layout";
import { GlobalBanner } from "./components/feedback";
import { GlobalBannerProvider } from "./contexts/GlobalBannerContext";
import { CommandPaletteProvider } from "./contexts/CommandPaletteContext";
import { useAuth } from "./providers/AuthProvider";
import { useWorkspace } from "./providers/WorkspaceProvider";
import { WorkspaceProvider } from "./providers/WorkspaceProvider";
import { useUIMode } from "./providers/UIModeProvider";
import { resolveUIMode, ageGroupFromDob } from "./lib/modes";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ScrollToTop from "./components/ScrollToTop";
import LMSHome from "./pages/LMSHome";
import Home from "./pages/Home";
import Programs from "./pages/Programs";
import Camps from "./pages/Camps";
import DemoDays from "./pages/DemoDays";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Enrollment from "./pages/Enrollment";
import Pricing from "./pages/Pricing";
import Playground from "./pages/Playground";
import ElectronicsLab from "./pages/ElectronicsLab";
import MCULab from "./pages/MCULab";
import GameDevLab from "./pages/GameDevLab";
import PythonGameLab from "./pages/PythonGameLab";
import GameMakerLab from "./pages/GameMakerLab";
import DesignMakerLab from "./pages/DesignMakerLab";
import FAQ from "./pages/FAQ";
import { OnboardWizard, AcceptInvitePage } from "./features/auth";
import { LabLauncher } from "./features/labs";
import { AchievementsPage } from "./features/progress";
import {
  StudentDashboard,
  InstructorDashboard,
  ParentDashboard,
  AdminDashboard,
} from "./features/dashboard";
import { TenantSettings, BillingPage, RolesManager } from "./features/settings";
import {
  ClassroomList,
  ClassroomDetail,
  ClassroomLiveSession,
} from "./features/classrooms";
import { LabObserverPage } from "./pages/LabObserverPage";
import { Inbox, ConversationThread } from "./features/messaging";
import { StudentAssignmentsPage } from "./features/assignments";
import {
  MembersPage,
  IntegrationsPage,
  CurriculumPage,
  ProgramsPage,
  SuperAdminDashboard,
  AssetsPage,
  InvitationsPage,
} from "./features/admin";
import {
  AdminTasksPage,
  HealthCheckPage,
  PlatformDashboardPage,
  JobWorkerPage,
  EntityBrowserPage,
  EntityDetailPage,
  PlatformUsersPage,
  PlatformRolesPage,
  BlobFinderPage,
  GrowthOpsPage,
  GrowthOpsHelpPage,
} from "./features/platform";
import { ProfilePage } from "./features/profile";
import { NotificationsPage } from "./features/notifications";
import { RewardRuntime } from "./rewards";
import "./App.css";

function PublicContent() {
  const location = useLocation();

  const isLabPage =
    location.pathname.startsWith("/playground/circuit-maker") ||
    location.pathname.startsWith("/playground/micro-maker") ||
    location.pathname.startsWith("/playground/gamedev") ||
    location.pathname.startsWith("/playground/python-game") ||
    location.pathname.startsWith("/playground/game-maker") ||
    location.pathname.startsWith("/playground/design-maker");

  const isLMSHome = location.pathname === "/";
  const isAuthPage =
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/invite/");
  const isAppPage = location.pathname.startsWith("/app");
  const showChrome = !isLabPage && !isLMSHome && !isAuthPage && !isAppPage;

  return (
    <div className="app">
      {showChrome && <Navbar />}
      <AnimatePresence mode="wait">
        <Routes>
          {/* New LMS homepage - standalone, no Navbar/Footer */}
          <Route path="/" element={<LMSHome />} />

          {/* STEM learning pages - with Navbar/Footer */}
          <Route path="/learning" element={<Home />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/camps" element={<Camps />} />
          <Route path="/demo-days" element={<DemoDays />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/playground" element={<Playground />} />
          <Route
            path="/playground/circuit-maker"
            element={<ElectronicsLab />}
          />
          <Route path="/playground/micro-maker" element={<MCULab />} />
          <Route path="/playground/gamedev" element={<GameDevLab />} />
          <Route path="/playground/python-game" element={<PythonGameLab />} />
          <Route path="/playground/game-maker" element={<GameMakerLab />} />
          <Route path="/playground/design-maker" element={<DesignMakerLab />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/enrollment" element={<Enrollment />} />
          <Route path="/faq" element={<FAQ />} />

          {/* Auth routes */}
          <Route path="/auth/onboard" element={<OnboardWizard />} />
          <Route path="/invite/:token" element={<AcceptInvitePage />} />

          {/* Platform analytics/users/roles - use AppShell with sidebar (must be before /app/platform/*) */}
          <Route
            path="/app/platform/dashboard"
            element={
              <RouteGuard>
                <AppShell>
                  <PlatformDashboardPage />
                </AppShell>
              </RouteGuard>
            }
          />
          <Route
            path="/app/platform/users"
            element={
              <RouteGuard>
                <AppShell>
                  <PlatformUsersPage />
                </AppShell>
              </RouteGuard>
            }
          />
          <Route
            path="/app/platform/roles"
            element={
              <RouteGuard>
                <AppShell>
                  <PlatformRolesPage />
                </AppShell>
              </RouteGuard>
            }
          />

          {/* Platform routes — header only, no sidebar */}
          <Route
            path="/app/platform/*"
            element={
              <RouteGuard>
                <PlatformShell>
                  <PlatformRouter />
                </PlatformShell>
              </RouteGuard>
            }
          />

          {/* Authenticated app routes */}
          <Route
            path="/app/*"
            element={
              <RouteGuard>
                <AppShell>
                  <DashboardRouter />
                </AppShell>
              </RouteGuard>
            }
          />
        </Routes>
      </AnimatePresence>
      {showChrome && <Footer />}
    </div>
  );
}

function RoleDashboard() {
  const { role, isSuperAdmin } = useAuth();
  const { isPlatformView } = useWorkspace();

  if (role === "instructor") return <InstructorDashboard />;
  if (role === "parent" || role === "homeschool_parent")
    return <ParentDashboard />;
  if (isSuperAdmin && isPlatformView) return <SuperAdminDashboard />;
  if (isSuperAdmin && !isPlatformView) return <AdminDashboard />;
  if (role === "admin" || role === "owner") return <AdminDashboard />;
  return <StudentDashboard />;
}

function PlatformRouter() {
  return (
    <Routes>
      <Route path="/" element={<SuperAdminDashboard />} />
      <Route path="/tasks" element={<AdminTasksPage />} />
      <Route path="/health" element={<HealthCheckPage />} />
      <Route path="/jobs" element={<JobWorkerPage />} />
      <Route path="/entities" element={<EntityBrowserPage />} />
      <Route path="/blobs" element={<BlobFinderPage />} />
      <Route path="/growth" element={<GrowthOpsPage />} />
      <Route path="/growth/help" element={<GrowthOpsHelpPage />} />
      <Route
        path="/entities/:entityKey/:entityId"
        element={<EntityDetailPage />}
      />
    </Routes>
  );
}

function DashboardRouter() {
  return (
    <Routes>
      <Route path="/" element={<RoleDashboard />} />

      {/* Shared */}
      <Route path="/labs" element={<LabLauncher />} />
      <Route path="/assignments" element={<StudentAssignmentsPage />} />
      <Route path="/classrooms" element={<ClassroomList />} />
      <Route path="/classrooms/:id" element={<ClassroomDetail />} />
      <Route path="/classrooms/:id/live" element={<ClassroomLiveSession />} />
      <Route
        path="/classrooms/:classroomId/observe-lab/:actorId"
        element={<LabObserverPage />}
      />
      <Route path="/achievements" element={<AchievementsPage />} />
      <Route path="/messages" element={<Inbox />}>
        <Route path=":id" element={<ConversationThread />} />
      </Route>
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/notifications" element={<NotificationsPage />} />

      {/* Parent */}
      <Route
        path="/children"
        element={<DashboardPlaceholder title="My Children" />}
      />

      {/* Instructor */}
      <Route path="/students" element={<MembersPage />} />

      {/* Admin / Owner */}
      <Route path="/members" element={<MembersPage />} />
      <Route path="/invitations" element={<InvitationsPage />} />
      <Route path="/curriculum" element={<CurriculumPage />} />
      <Route path="/programs" element={<ProgramsPage />} />
      <Route path="/assets" element={<AssetsPage />} />
      <Route path="/settings" element={<TenantSettings />} />
      <Route path="/integrations" element={<IntegrationsPage />} />
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/roles" element={<RolesManager />} />
      <Route
        path="/audit"
        element={<DashboardPlaceholder title="Audit Log" />}
      />

      {/* Super Admin overview (within sidebar shell) */}
      <Route path="/platform" element={<SuperAdminDashboard />} />
    </Routes>
  );
}

function DashboardPlaceholder({ title }) {
  return (
    <div style={{ padding: "var(--spacing-lg)", maxWidth: 960 }}>
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 600,
          marginBottom: "var(--spacing-md)",
        }}
      >
        {title}
      </h1>
      <p style={{ color: "var(--color-text-secondary)" }}>
        This page is under construction. Coming soon in Phase 2.
      </p>
    </div>
  );
}

function UIModeSyncer({ children }) {
  const { user, isAuthenticated } = useAuth();
  const { setMode } = useUIMode();

  React.useEffect(() => {
    if (!isAuthenticated || !user) return;

    if (user.subType === "student" && user.resolvedUIMode) {
      const validModes = ["kids", "explorer", "pro"];
      if (validModes.includes(user.resolvedUIMode)) {
        setMode(user.resolvedUIMode, user.uiModeSource || "age");
      }
    } else if (
      user.role === "instructor" ||
      user.role === "admin" ||
      user.role === "owner"
    ) {
      setMode("pro", "default");
    }
  }, [isAuthenticated, user, setMode]);

  return children;
}

function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <WorkspaceProvider>
          <UIModeProvider>
            <UIModeSyncer>
              <ThemeProvider>
                <ColorSchemeInit>
                  <GlobalBannerProvider>
                    <CommandPaletteProvider>
                      <Router>
                        <GlobalBanner />
                        <ScrollToTop />
                        <PublicContent />
                        <RewardRuntime />
                        <CommandPalette />
                      </Router>
                    </CommandPaletteProvider>
                  </GlobalBannerProvider>
                </ColorSchemeInit>
              </ThemeProvider>
            </UIModeSyncer>
          </UIModeProvider>
        </WorkspaceProvider>
      </TenantProvider>
    </AuthProvider>
  );
}

export default App;
