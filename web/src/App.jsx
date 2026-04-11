import React, { lazy, Suspense, useEffect } from "react";
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
import Playground from "./pages/Playground";
import LMSMarketingPage from "./pages/lms/LMSMarketingPage";
import { OnboardWizard, AcceptInvitePage } from "./features/auth";
import { useChildContextStudentId } from "./lib/childContext";
import { RewardRuntime } from "./rewards";
import { writeLabLastOpenedAt } from "./lib/learnerLabStorage";
import "./App.css";

const LAB_ROUTE_PREFIX_TO_ID = [
  ["/playground/circuit-maker", "circuit-maker"],
  ["/playground/micro-maker", "micro-maker"],
  ["/playground/gamedev", "gamedev"],
  ["/playground/python-game", "python-game"],
  ["/playground/game-maker", "game-maker"],
  ["/playground/design-maker", "design-maker"],
];

const lazyNamed = (loader, exportName) =>
  lazy(() => loader().then((m) => ({ default: m[exportName] })));

const LabLauncher = lazyNamed(() => import("./features/labs"), "LabLauncher");
const AchievementsPage = lazyNamed(() => import("./features/progress"), "AchievementsPage");
const StudentDashboard = lazyNamed(() => import("./features/dashboard"), "StudentDashboard");
const InstructorDashboard = lazyNamed(() => import("./features/dashboard"), "InstructorDashboard");
const ParentDashboard = lazyNamed(() => import("./features/dashboard"), "ParentDashboard");
const ChildrenPage = lazyNamed(() => import("./features/dashboard"), "ChildrenPage");
const AdminDashboard = lazyNamed(() => import("./features/dashboard"), "AdminDashboard");
const ChildModePage = lazyNamed(() => import("./features/parent"), "ChildModePage");
const MessagingHub = lazyNamed(() => import("./features/parent"), "MessagingHub");
const ParentActivityPage = lazyNamed(() => import("./features/parent"), "ParentActivityPage");
const ParentChildAnalyticsPage = lazyNamed(() => import("./features/parent"), "ParentChildAnalyticsPage");
const ParentAttendancePanel = lazyNamed(() => import("./features/parent"), "ParentAttendancePanel");
const ParentChildControlsPage = lazyNamed(() => import("./features/parent"), "ParentChildControlsPage");
const StaffExcusalRequestsPage = lazyNamed(
  () => import("./features/attendance/StaffExcusalRequestsPage"),
  "StaffExcusalRequestsPage",
);
const TenantSettings = lazyNamed(() => import("./features/settings"), "TenantSettings");
const BillingPage = lazyNamed(() => import("./features/settings"), "BillingPage");
const RolesManager = lazyNamed(() => import("./features/settings"), "RolesManager");
const MemberBillingAdminPage = lazyNamed(() => import("./features/member_billing"), "MemberBillingAdminPage");
const MemberBillingCancelPage = lazyNamed(() => import("./features/member_billing"), "MemberBillingCancelPage");
const MemberBillingSuccessPage = lazyNamed(() => import("./features/member_billing"), "MemberBillingSuccessPage");
const MemberInvoicesPage = lazyNamed(() => import("./features/member_billing"), "MemberInvoicesPage");
const MemberPayPage = lazyNamed(() => import("./features/member_billing"), "MemberPayPage");
const ClassroomList = lazyNamed(() => import("./features/classrooms"), "ClassroomList");
const ClassroomDetail = lazyNamed(() => import("./features/classrooms"), "ClassroomDetail");
const ClassroomLiveSession = lazyNamed(() => import("./features/classrooms"), "ClassroomLiveSession");
const LabObserverPage = lazyNamed(() => import("./pages/LabObserverPage"), "LabObserverPage");
const ConversationThread = lazyNamed(() => import("./features/messaging"), "ConversationThread");
const StudentAssignmentsPage = lazyNamed(() => import("./features/assignments"), "StudentAssignmentsPage");
const MembersPage = lazyNamed(() => import("./features/admin"), "MembersPage");
const IntegrationsPage = lazyNamed(() => import("./features/admin"), "IntegrationsPage");
const CurriculumPage = lazyNamed(() => import("./features/admin"), "CurriculumPage");
const CurriculumAuthoringPage = lazyNamed(() => import("./features/admin"), "CurriculumAuthoringPage");
const ProgramsPage = lazyNamed(() => import("./features/admin"), "ProgramsPage");
const SuperAdminDashboard = lazyNamed(() => import("./features/admin"), "SuperAdminDashboard");
const AssetsPage = lazyNamed(() => import("./features/admin"), "AssetsPage");
const AdminTasksPage = lazyNamed(() => import("./features/platform"), "AdminTasksPage");
const HealthCheckPage = lazyNamed(() => import("./features/platform"), "HealthCheckPage");
const PlatformDashboardPage = lazyNamed(() => import("./features/platform"), "PlatformDashboardPage");
const JobWorkerPage = lazyNamed(() => import("./features/platform"), "JobWorkerPage");
const EntityBrowserPage = lazyNamed(() => import("./features/platform"), "EntityBrowserPage");
const EntityDetailPage = lazyNamed(() => import("./features/platform"), "EntityDetailPage");
const PlatformUsersPage = lazyNamed(() => import("./features/platform"), "PlatformUsersPage");
const PlatformRolesPage = lazyNamed(() => import("./features/platform"), "PlatformRolesPage");
const PlatformEmailConfigPage = lazyNamed(() => import("./features/platform"), "PlatformEmailConfigPage");
const PlatformMemberBillingFeesPage = lazyNamed(
  () => import("./features/platform"),
  "PlatformMemberBillingFeesPage",
);
const BlobFinderPage = lazyNamed(() => import("./features/platform"), "BlobFinderPage");
const GrowthOpsPage = lazyNamed(() => import("./features/platform"), "GrowthOpsPage");
const GrowthOpsHelpPage = lazyNamed(() => import("./features/platform"), "GrowthOpsHelpPage");
const ProfilePage = lazyNamed(() => import("./features/profile"), "ProfilePage");
const NotificationsPage = lazyNamed(() => import("./features/notifications"), "NotificationsPage");
const TenantAnalyticsPage = lazyNamed(() => import("./features/analytics"), "TenantAnalyticsPage");
const GamificationStudioPage = lazyNamed(
  () => import("./features/gamification/GamificationStudioPage"),
  "GamificationStudioPage",
);
const StudentProjectsPage = lazyNamed(
  () => import("./features/projects/StudentProjectsPage"),
  "StudentProjectsPage",
);
const ElectronicsLab = lazy(() => import("./pages/ElectronicsLab"));
const MCULab = lazy(() => import("./pages/MCULab"));
const GameDevLab = lazy(() => import("./pages/GameDevLab"));
const PythonGameLab = lazy(() => import("./pages/PythonGameLab"));
const GameMakerLab = lazy(() => import("./pages/GameMakerLab"));
const DesignMakerLab = lazy(() => import("./pages/DesignMakerLab"));
const InvitationsPage = lazyNamed(() => import("./features/admin"), "InvitationsPage");
const ExploreGamesPage = lazy(() => import("./pages/ExploreGamesPage"));

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
      <Route path="/child-analytics" element={<ParentChildAnalyticsPage />} />
      <Route path="/attendance" element={<ParentAttendancePanel />} />

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
      <Route path="/excusals" element={<StaffExcusalRequestsPage />} />
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
      <Suspense fallback={<div className="dashboard-bento" style={{ padding: 16 }}>Loading…</div>}>
        <DashboardRouter key={dashboardMountKey} />
      </Suspense>
    </AppShell>
  );
}

function PublicContent() {
  const location = useLocation();

  useEffect(() => {
    const route = LAB_ROUTE_PREFIX_TO_ID.find(([prefix]) =>
      location.pathname.startsWith(prefix),
    );
    if (!route) return;
    writeLabLastOpenedAt(route[1]);
  }, [location.pathname]);

  const isLabPage =
    location.pathname.startsWith("/playground/circuit-maker") ||
    location.pathname.startsWith("/playground/micro-maker") ||
    location.pathname.startsWith("/playground/gamedev") ||
    location.pathname.startsWith("/playground/python-game") ||
    location.pathname.startsWith("/playground/game-maker") ||
    location.pathname.startsWith("/playground/design-maker");

  const isLMSHome = location.pathname === "/";
  const isLMSMarketingPage =
    isLMSHome ||
    location.pathname === "/learning" ||
    location.pathname === "/programs" ||
    location.pathname === "/camps" ||
    location.pathname === "/demo-days" ||
    location.pathname === "/pricing" ||
    location.pathname === "/about" ||
    location.pathname === "/contact" ||
    location.pathname === "/enrollment" ||
    location.pathname === "/faq" ||
    location.pathname === "/explore";
  const isAuthPage =
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/invite/");
  const isAppPage = location.pathname.startsWith("/app");
  const showChrome = !isLabPage && !isLMSMarketingPage && !isAuthPage && !isAppPage;

  return (
    <div className="app">
      {showChrome && <Navbar />}
      <AnimatePresence mode="wait">
        <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
          <Routes>
            {/* New LMS homepage - standalone, no Navbar/Footer */}
            <Route path="/" element={<LMSHome />} />

          {/* STEM learning pages - with Navbar/Footer */}
          <Route path="/learning" element={<LMSMarketingPage pageKey="learning" />} />
          <Route path="/programs" element={<LMSMarketingPage pageKey="programs" />} />
          <Route path="/camps" element={<LMSMarketingPage pageKey="camps" />} />
          <Route path="/demo-days" element={<LMSMarketingPage pageKey="demo-days" />} />
          <Route path="/pricing" element={<LMSMarketingPage pageKey="pricing" />} />
          <Route path="/explore" element={<ExploreGamesPage />} />
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
          <Route path="/about" element={<LMSMarketingPage pageKey="about" />} />
          <Route path="/contact" element={<LMSMarketingPage pageKey="contact" />} />
          <Route path="/enrollment" element={<LMSMarketingPage pageKey="enrollment" />} />
          <Route path="/faq" element={<LMSMarketingPage pageKey="faq" />} />

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
        </Suspense>
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
