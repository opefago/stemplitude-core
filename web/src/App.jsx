import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "./providers/AuthProvider";
import { GuardianLearnerProvider } from "./providers/GuardianLearnerProvider";
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
import { useTenant } from "./providers/TenantProvider";
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
  ChildrenPage,
  AdminDashboard,
} from "./features/dashboard";
import {
  ChildModePage,
  MessagingHub,
  ParentActivityPage,
  ParentChildControlsPage,
} from "./features/parent";
import { useChildContextStudentId } from "./lib/childContext";
import { TenantSettings, BillingPage, RolesManager } from "./features/settings";
import {
  MemberBillingAdminPage,
  MemberBillingCancelPage,
  MemberBillingSuccessPage,
  MemberInvoicesPage,
  MemberPayPage,
} from "./features/member_billing";
import {
  ClassroomList,
  ClassroomDetail,
  ClassroomLiveSession,
} from "./features/classrooms";
import { LabObserverPage } from "./pages/LabObserverPage";
import { ConversationThread } from "./features/messaging";
import { StudentAssignmentsPage } from "./features/assignments";
import {
  MembersPage,
  IntegrationsPage,
  CurriculumPage,
  CurriculumAuthoringPage,
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
  PlatformEmailConfigPage,
  PlatformMemberBillingFeesPage,
  BlobFinderPage,
  GrowthOpsPage,
  GrowthOpsHelpPage,
} from "./features/platform";
import { ProfilePage } from "./features/profile";
import { NotificationsPage } from "./features/notifications";
import { TenantAnalyticsPage } from "./features/analytics";
import { GamificationStudioPage } from "./features/gamification/GamificationStudioPage";
import { StudentProjectsPage } from "./features/projects/StudentProjectsPage";
import { RewardRuntime } from "./rewards";
import "./App.css";

function DashboardPlaceholder({ title, body }) {
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
        {body ??
          "This page is under construction. Coming soon in Phase 2."}
      </p>
    </div>
  );
}

function RoleDashboard() {
  const { role, subType, isSuperAdmin } = useAuth();
  const { isPlatformView } = useWorkspace();
  const childCtx = useChildContextStudentId();
  const guardianAsLearner =
    Boolean(childCtx) &&
    subType === "user" &&
    (role === "parent" || role === "homeschool_parent");

  if (subType === "student") return <StudentDashboard />;
  if (guardianAsLearner) return <StudentDashboard />;
  if (role === "instructor") return <InstructorDashboard />;
  if (role === "parent" || role === "homeschool_parent")
    return <ParentDashboard />;
  if (isSuperAdmin && isPlatformView) return <SuperAdminDashboard />;
  if (isSuperAdmin && !isPlatformView) return <AdminDashboard />;
  if (role === "admin" || role === "owner") return <AdminDashboard />;
  if (subType === "user") {
    return (
      <DashboardPlaceholder
        title="Workspace access"
        body="Your account is signed in, but this organization has not assigned you a role yet, or your role could not be loaded. Ask an admin to assign a role, or try signing out and back in."
      />
    );
  }
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
      <Route path="/projects" element={<StudentProjectsPage />} />
      <Route path="/assignments" element={<StudentAssignmentsPage />} />
      <Route path="/classrooms" element={<ClassroomList />} />
      <Route path="/classrooms/:id" element={<ClassroomDetail />} />
      <Route path="/classrooms/:id/live" element={<ClassroomLiveSession />} />
      <Route
        path="/classrooms/:classroomId/observe-lab/:actorId"
        element={<LabObserverPage />}
      />
      <Route path="/achievements" element={<AchievementsPage />} />
      <Route path="/child" element={<ChildModePage />} />
      <Route path="/messages" element={<MessagingHub />}>
        <Route path=":id" element={<ConversationThread />} />
      </Route>
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/notifications" element={<NotificationsPage />} />

      {/* Parent / guardian */}
      <Route path="/children" element={<ChildrenPage />} />
      <Route path="/children/settings" element={<ParentChildControlsPage />} />
      <Route path="/activity" element={<ParentActivityPage />} />

      {/* Instructor */}
      <Route path="/students" element={<MembersPage />} />

      {/* Admin / Owner */}
      <Route path="/members" element={<MembersPage />} />
      <Route path="/invitations" element={<InvitationsPage />} />
      <Route path="/curriculum" element={<CurriculumPage />} />
      <Route path="/curriculum/authoring" element={<CurriculumAuthoringPage />} />
      <Route path="/programs" element={<ProgramsPage />} />
      <Route path="/assets" element={<AssetsPage />} />
      {/* More specific than /settings — Stripe checkout success/cancel URLs use this path */}
      <Route path="/settings/billing" element={<BillingPage />} />
      <Route path="/settings/member-billing" element={<MemberBillingAdminPage />} />
      <Route path="/settings" element={<TenantSettings />} />
      <Route path="/gamification" element={<GamificationStudioPage />} />
      <Route path="/analytics" element={<TenantAnalyticsPage />} />
      <Route path="/integrations" element={<IntegrationsPage />} />
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/member-billing/pay" element={<MemberPayPage />} />
      <Route path="/member-billing/invoices" element={<MemberInvoicesPage />} />
      <Route path="/member-billing/success" element={<MemberBillingSuccessPage />} />
      <Route path="/member-billing/cancel" element={<MemberBillingCancelPage />} />
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

/**
 * Remount all /app/* routes when guardian learner context changes so pages refetch
 * with the correct X-Child-Context (many screens only load data on mount).
 */
function AppDashboardLayout() {
  const childCtx = useChildContextStudentId();
  const dashboardMountKey = childCtx ?? "__no_learner_ctx__";
  return (
    <AppShell>
      <DashboardRouter key={dashboardMountKey} />
    </AppShell>
  );
}

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
          <Route
            path="/app/platform/email"
            element={
              <RouteGuard>
                <AppShell>
                  <PlatformEmailConfigPage />
                </AppShell>
              </RouteGuard>
            }
          />
          <Route
            path="/app/platform/member-billing-fees"
            element={
              <RouteGuard>
                <AppShell>
                  <PlatformMemberBillingFeesPage />
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
                <GuardianLearnerProvider>
                  <AppDashboardLayout />
                </GuardianLearnerProvider>
              </RouteGuard>
            }
          />
        </Routes>
      </AnimatePresence>
      {showChrome && <Footer />}
    </div>
  );
}

/** When the selected tenant changes after initial load, refresh role from `/auth/me`. */
function AuthTenantProfileSync() {
  const { user, refreshProfile } = useAuth();
  const { tenant } = useTenant();
  const prevTenantIdRef = React.useRef(null);

  React.useEffect(() => {
    if (!user?.id) {
      prevTenantIdRef.current = null;
      return;
    }
    if (user.subType !== "user" || !tenant?.id) return;
    const id = tenant.id;
    if (prevTenantIdRef.current === null) {
      prevTenantIdRef.current = id;
      return;
    }
    if (prevTenantIdRef.current !== id) {
      prevTenantIdRef.current = id;
      void refreshProfile();
    }
  }, [tenant?.id, user?.id, user?.subType, refreshProfile, user]);

  return null;
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
      user.role === "owner" ||
      user.role === "parent" ||
      user.role === "homeschool_parent"
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
        <AuthTenantProfileSync />
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
