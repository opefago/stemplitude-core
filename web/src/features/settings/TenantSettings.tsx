import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";
import { useTenant } from "../../providers/TenantProvider";
import {
  createSupportAccessGrant,
  decideFranchiseJoinRequest,
  getSupportAccessOptions,
  getTenantById,
  listFranchiseJoinRequests,
  listSupportAccessGrants,
  patchTenant,
  revokeSupportAccessGrant,
  submitFranchiseJoinRequest,
  updateTenantSettings,
  type FranchiseGovernanceMode,
  type FranchiseJoinRequest,
  type SupportAccessGrant,
  type SupportAccessRoleOption,
  type SupportAccessUserOption,
} from "../../lib/api/tenants";
import {
  getTenantGamificationConfig,
  listGamificationGoals,
  createGamificationGoal,
  deleteGamificationGoal,
  simulateLabEvent,
  type GamificationGoal,
  type GoalReward,
  updateTenantGamificationConfig,
  type TenantGamificationConfig,
} from "../../lib/api/gamification";
import { AppTooltip, KidDropdown, KidSwitch } from "../../components/ui";
import {
  AttendanceSettings,
  type AttendanceConfig,
} from "../classrooms/AttendanceSettings";
import { GamificationPuzzleBuilder } from "./GamificationPuzzleBuilder";
import "../../components/ui/ui.css";
import "./settings.css";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese (Simplified)" },
  { value: "yo", label: "Yoruba" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Toronto", label: "Toronto (ET)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const LABS = [
  { id: "circuit-maker", name: "Circuit Maker" },
  { id: "micro-maker", name: "Micro Maker" },
  { id: "python-game", name: "Python Game Maker" },
  { id: "game-maker", name: "Game Maker" },
  { id: "design-maker", name: "Design Maker" },
];

const UI_MODES = [
  { value: "auto", label: "Auto" },
  { value: "kids", label: "Kids" },
  { value: "explorer", label: "Explorer" },
  { value: "pro", label: "Pro" },
];

const REWARD_THEMES = [
  { value: "classic", label: "Classic" },
  { value: "celebration", label: "Celebration" },
];

const REWARD_INTENSITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const GAMIFICATION_MODES = [
  { value: "academic", label: "Academic (minimal gamification)" },
  { value: "light", label: "Light gamification" },
  { value: "balanced", label: "Balanced" },
  { value: "full", label: "Full gamification" },
];

const LAB_EVENTS: Record<string, { value: string; label: string }[]> = {
  "circuit-maker": [
    { value: "OBJECT_CONNECTED", label: "Object connected" },
    { value: "CIRCUIT_COMPLETE", label: "Circuit completed" },
    { value: "OBJECT_ERROR", label: "Object error" },
  ],
  "design-maker": [
    { value: "OBJECT_CREATED", label: "Object created" },
    { value: "OBJECT_TRANSFORMED", label: "Object transformed" },
    { value: "MODEL_COMPLETE", label: "Model complete" },
  ],
  "micro-maker": [
    { value: "SENSOR_CONNECTED", label: "Sensor connected" },
    { value: "CODE_DEPLOYED", label: "Code deployed" },
    { value: "PROGRAM_COMPLETE", label: "Program complete" },
  ],
  "python-game": [
    { value: "SCRIPT_RUN", label: "Script run" },
    { value: "LEVEL_COMPLETE", label: "Level complete" },
    { value: "BUG_FIXED", label: "Bug fixed" },
  ],
  "game-maker": [
    { value: "SCENE_BUILT", label: "Scene built" },
    { value: "LOGIC_CONNECTED", label: "Logic connected" },
    { value: "GAME_COMPLETE", label: "Game complete" },
  ],
};

const GOAL_TEMPLATES = [
  {
    key: "electronics-led",
    label: "Electronics: Light an LED",
    lab_type: "circuit-maker",
    name: "Light an LED",
    description: "Student successfully completes a safe LED circuit.",
    eventType: "CIRCUIT_COMPLETE",
  },
  {
    key: "electronics-series",
    label: "Electronics: Build a series circuit",
    lab_type: "circuit-maker",
    name: "Build a series circuit",
    description: "Student creates a valid series circuit connection path.",
    eventType: "OBJECT_CONNECTED",
  },
  {
    key: "design-mug",
    label: "3D: Build a hollow mug",
    lab_type: "design-maker",
    name: "Build a hollow mug",
    description: "Student builds mug shell and subtracts interior volume.",
    eventType: "OBJECT_TRANSFORMED",
  },
  {
    key: "design-handle",
    label: "3D: Add handle",
    lab_type: "design-maker",
    name: "Add handle",
    description: "Student unions a handle into the base model.",
    eventType: "OBJECT_TRANSFORMED",
  },
];

const REWARD_MIN_MS = 1000;
const REWARD_MAX_DURATION_MS = 5000;
const REWARD_MAX_BIG_WIN_POINTS = 200;
const REWARD_LOW_MAX_MS = 3000;
const REWARD_MEDIUM_MAX_MS = 4000;
const REWARD_HIGH_MAX_MS = 5000;


type RewardAnimationSettings = {
  enabled: boolean;
  theme: "classic" | "celebration";
  max_intensity: "low" | "medium" | "high";
  max_duration_ms: number;
  big_win_enabled: boolean;
  big_win_points: number;
  durations: {
    low: number;
    medium: number;
    high: number;
  };
};

const DEFAULT_REWARD_SETTINGS: RewardAnimationSettings = {
  enabled: true,
  theme: "classic",
  max_intensity: "high",
  max_duration_ms: 4200,
  big_win_enabled: true,
  big_win_points: 50,
  durations: {
    low: 2200,
    medium: 2800,
    high: 3600,
  },
};

const DEFAULT_GAMIFICATION_CONFIG: TenantGamificationConfig = {
  mode: "balanced",
  enabled: true,
  enabled_labs: [],
  max_points_per_event: 50,
  allow_badges: true,
  allow_live_recognition: true,
  allow_leaderboard: true,
  allow_streaks: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampRewardSettings(input: RewardAnimationSettings): RewardAnimationSettings {
  return {
    ...input,
    max_duration_ms: clamp(
      input.max_duration_ms,
      REWARD_MIN_MS,
      REWARD_MAX_DURATION_MS,
    ),
    big_win_points: clamp(input.big_win_points, 1, REWARD_MAX_BIG_WIN_POINTS),
    durations: {
      low: clamp(input.durations.low, REWARD_MIN_MS, REWARD_LOW_MAX_MS),
      medium: clamp(input.durations.medium, REWARD_MIN_MS, REWARD_MEDIUM_MAX_MS),
      high: clamp(input.durations.high, REWARD_MIN_MS, REWARD_HIGH_MAX_MS),
    },
  };
}


function FieldHint({ title, description }: { title: string; description: string }) {
  return (
    <AppTooltip title={title} description={description} placement="top">
      <button
        type="button"
        className="tenant-settings__hint-btn"
        aria-label={`Info: ${title}`}
      >
        <CircleHelp size={14} />
      </button>
    </AppTooltip>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="tenant-settings__panel-title-row">
      <h2 className="tenant-settings__panel-title">{title}</h2>
      <FieldHint title={title} description={description} />
    </div>
  );
}

type TabId =
  | "general"
  | "franchise"
  | "labs"
  | "ui"
  | "parent"
  | "attendance"
  | "rewards"
  | "support"
  | "danger";

const VALID_SETTINGS_TAB_PARAMS = new Set<string>([
  "general",
  "franchise",
  "labs",
  "ui",
  "parent",
  "attendance",
  "rewards",
  "support",
  "danger",
]);

const TABS: { id: TabId; label: string; iconSrc?: string; icon?: LucideIcon }[] = [
  { id: "general", label: "General", iconSrc: "/assets/cartoon-icons/settings.png" },
  { id: "franchise", label: "Franchise & domain", icon: Building2 },
  { id: "labs", label: "Lab Settings", iconSrc: "/assets/cartoon-icons/telescope.png" },
  { id: "ui", label: "UI Policy", iconSrc: "/assets/cartoon-icons/cursor2.png" },
  { id: "parent", label: "Parent Policies", iconSrc: "/assets/cartoon-icons/Players.png" },
  { id: "attendance", label: "Attendance", iconSrc: "/assets/cartoon-icons/Callendar.png" },
  { id: "rewards", label: "Reward Animations", iconSrc: "/assets/cartoon-icons/Gift1.png" },
  { id: "support", label: "Support Access", iconSrc: "/assets/cartoon-icons/Information.png" },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export function TenantSettings() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const { tenant, setTenant } = useTenant();
  const [activeTab, setActiveTab] = useState<TabId>("general");

  useEffect(() => {
    if (tabParam && VALID_SETTINGS_TAB_PARAMS.has(tabParam)) {
      setActiveTab(tabParam as TabId);
    }
  }, [tabParam]);
  const [labEnabled, setLabEnabled] = useState<Record<string, boolean>>(() =>
    LABS.reduce((acc, lab) => ({ ...acc, [lab.id]: true }), {})
  );
  const [uiMode, setUiMode] = useState("auto");
  const [allowCancel, setAllowCancel] = useState(true);
  const [allowReschedule, setAllowReschedule] = useState(true);
  const [cancelDeadlineHours, setCancelDeadlineHours] = useState(24);
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [supportUsers, setSupportUsers] = useState<SupportAccessUserOption[]>([]);
  const [supportRoles, setSupportRoles] = useState<SupportAccessRoleOption[]>([]);
  const [supportGrants, setSupportGrants] = useState<SupportAccessGrant[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportSuccess, setSupportSuccess] = useState("");
  const [selectedSupportUserId, setSelectedSupportUserId] = useState("");
  const [selectedSupportRoleId, setSelectedSupportRoleId] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [supportExpiry, setSupportExpiry] = useState(() => {
    const dt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });

  const [hostSub, setHostSub] = useState("");
  const [customDom, setCustomDom] = useState("");
  const [hostSaving, setHostSaving] = useState(false);
  const [hostErr, setHostErr] = useState("");
  const [hostOk, setHostOk] = useState(false);
  const [parentSlugReq, setParentSlugReq] = useState("");
  const [prefBill, setPrefBill] = useState<"central" | "independent" | "">("");
  const [franchiseMsg, setFranchiseMsg] = useState("");
  const [franchiseBusy, setFranchiseBusy] = useState(false);
  const [franchiseNote, setFranchiseNote] = useState("");
  const [incomingFr, setIncomingFr] = useState<FranchiseJoinRequest[]>([]);
  const [incLoading, setIncLoading] = useState(false);
  const [approveFranchiseGovernance, setApproveFranchiseGovernance] =
    useState<FranchiseGovernanceMode>("hybrid");

  // Attendance settings
  const [attendanceCfg, setAttendanceCfg] = useState<AttendanceConfig>({
    enabled: true,
    mode: "any_join",
    minimum_minutes: 15,
    percentage: 75,
  });
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [rewardCfg, setRewardCfg] = useState<RewardAnimationSettings>(
    DEFAULT_REWARD_SETTINGS,
  );
  const [rewardSaving, setRewardSaving] = useState(false);
  const [rewardSaved, setRewardSaved] = useState(false);
  const [rewardError, setRewardError] = useState("");
  const [gamificationCfg, setGamificationCfg] = useState<TenantGamificationConfig>(
    DEFAULT_GAMIFICATION_CONFIG,
  );
  const [gamificationSaving, setGamificationSaving] = useState(false);
  const [gamificationSaved, setGamificationSaved] = useState(false);
  const [gamificationError, setGamificationError] = useState("");
  const [goals, setGoals] = useState<GamificationGoal[]>([]);
  const [goalLoading, setGoalLoading] = useState(false);
  const [goalError, setGoalError] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalLabType, setGoalLabType] = useState(LABS[0]?.id ?? "circuit-maker");
  const [goalEventType, setGoalEventType] = useState("OBJECT_CONNECTED");
  const [goalRewardType, setGoalRewardType] = useState<"points" | "reward">("points");
  const [goalPoints, setGoalPoints] = useState(10);
  const [goalRewardKind, setGoalRewardKind] = useState<"badge" | "hi-five" | "sticker" | "custom">("badge");
  const [goalBadgeSlug, setGoalBadgeSlug] = useState("circuit_rookie");
  const [simulateContextJson, setSimulateContextJson] = useState("{}");
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateResult, setSimulateResult] = useState<{
    points_awarded_total: number;
    matched_goals: Array<{ goal_name: string; points_awarded: number; reward_type: string }>;
  } | null>(null);

  // Load attendance config from tenant settings on mount
  useEffect(() => {
    const raw = tenant?.settings?.attendance as Record<string, unknown> | undefined;
    if (raw && typeof raw === "object") {
      setAttendanceCfg((prev) => ({
        ...prev,
        ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
        ...(typeof raw.mode === "string" ? { mode: raw.mode as AttendanceConfig["mode"] } : {}),
        ...(typeof raw.minimum_minutes === "number" ? { minimum_minutes: raw.minimum_minutes } : {}),
        ...(typeof raw.percentage === "number" ? { percentage: raw.percentage } : {}),
      }));
    }
  }, [tenant?.settings]);

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;
    async function loadGamificationConfig() {
      try {
        const cfg = await getTenantGamificationConfig();
        if (!cancelled) {
          setGamificationCfg(cfg);
        }
      } catch {
        if (!cancelled) {
          setGamificationCfg(DEFAULT_GAMIFICATION_CONFIG);
        }
      }
    }
    void loadGamificationConfig();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  useEffect(() => {
    const defaultEvent = LAB_EVENTS[goalLabType]?.[0]?.value ?? "OBJECT_CONNECTED";
    setGoalEventType(defaultEvent);
  }, [goalLabType]);

  useEffect(() => {
    const raw =
      tenant?.settings?.reward_animations as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") {
      setRewardCfg(DEFAULT_REWARD_SETTINGS);
      return;
    }
    const durationsRaw =
      raw.durations && typeof raw.durations === "object"
        ? (raw.durations as Record<string, unknown>)
        : {};
    setRewardCfg(clampRewardSettings({
      enabled:
        typeof raw.enabled === "boolean"
          ? raw.enabled
          : DEFAULT_REWARD_SETTINGS.enabled,
      theme:
        raw.theme === "celebration" || raw.theme === "classic"
          ? raw.theme
          : DEFAULT_REWARD_SETTINGS.theme,
      max_intensity:
        raw.max_intensity === "low" ||
        raw.max_intensity === "medium" ||
        raw.max_intensity === "high"
          ? raw.max_intensity
          : DEFAULT_REWARD_SETTINGS.max_intensity,
      max_duration_ms:
        typeof raw.max_duration_ms === "number" &&
        Number.isFinite(raw.max_duration_ms)
          ? raw.max_duration_ms
          : DEFAULT_REWARD_SETTINGS.max_duration_ms,
      big_win_enabled:
        typeof raw.big_win_enabled === "boolean"
          ? raw.big_win_enabled
          : DEFAULT_REWARD_SETTINGS.big_win_enabled,
      big_win_points:
        typeof raw.big_win_points === "number" &&
        Number.isFinite(raw.big_win_points)
          ? raw.big_win_points
          : DEFAULT_REWARD_SETTINGS.big_win_points,
      durations: {
        low:
          typeof durationsRaw.low === "number" && Number.isFinite(durationsRaw.low)
            ? durationsRaw.low
            : DEFAULT_REWARD_SETTINGS.durations.low,
        medium:
          typeof durationsRaw.medium === "number" &&
          Number.isFinite(durationsRaw.medium)
            ? durationsRaw.medium
            : DEFAULT_REWARD_SETTINGS.durations.medium,
        high:
          typeof durationsRaw.high === "number" && Number.isFinite(durationsRaw.high)
            ? durationsRaw.high
            : DEFAULT_REWARD_SETTINGS.durations.high,
      },
    }));
  }, [tenant?.settings]);

  useEffect(() => {
    if (activeTab !== "franchise" || !tenant?.id) return;
    setHostErr("");
    setHostOk(false);
    setFranchiseNote("");
    setIncLoading(true);
    getTenantById(tenant.id)
      .then((t) => {
        setHostSub(t.publicHostSubdomain ?? "");
        setCustomDom(t.customDomain ?? "");
      })
      .catch(() => {});
    listFranchiseJoinRequests(tenant.id, "pending")
      .then((r) => setIncomingFr(r.items))
      .catch(() => setIncomingFr([]))
      .finally(() => setIncLoading(false));
  }, [activeTab, tenant?.id]);

  const handleSaveHosts = async () => {
    if (!tenant?.id) return;
    setHostSaving(true);
    setHostErr("");
    setHostOk(false);
    try {
      const updated = await patchTenant(tenant.id, {
        public_host_subdomain: hostSub.trim() || null,
        custom_domain: customDom.trim() || null,
      });
      setTenant({
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        code: updated.code,
        type: updated.type,
        logoUrl: updated.logoUrl,
        settings: updated.settings,
        publicHostSubdomain: updated.publicHostSubdomain,
        customDomain: updated.customDomain,
      });
      setHostOk(true);
      setTimeout(() => setHostOk(false), 2500);
    } catch (e) {
      setHostErr(e instanceof Error ? e.message : "Could not save host settings.");
    } finally {
      setHostSaving(false);
    }
  };

  const handleSubmitFranchiseRequest = async () => {
    if (!tenant?.id || !parentSlugReq.trim()) return;
    setFranchiseBusy(true);
    setFranchiseNote("");
    try {
      await submitFranchiseJoinRequest({
        parent_slug: parentSlugReq.trim().toLowerCase(),
        message: franchiseMsg.trim() || undefined,
        preferred_billing_mode: prefBill || undefined,
      });
      setFranchiseNote(
        "Request sent. The parent organization can approve it from their Franchise & domain tab.",
      );
      setParentSlugReq("");
      setFranchiseMsg("");
    } catch (e) {
      setFranchiseNote(e instanceof Error ? e.message : "Could not submit request.");
    } finally {
      setFranchiseBusy(false);
    }
  };

  const handleFranchiseDecision = async (
    requestId: string,
    approve: boolean,
    billing?: "central" | "independent",
  ) => {
    if (!tenant?.id) return;
    setIncLoading(true);
    setFranchiseNote("");
    try {
      await decideFranchiseJoinRequest(tenant.id, requestId, {
        approve,
        billing_mode: billing,
        rejection_reason: approve ? undefined : "Declined by administrator",
        governance_mode: approve ? approveFranchiseGovernance : undefined,
      });
      const r = await listFranchiseJoinRequests(tenant.id, "pending");
      setIncomingFr(r.items);
      setFranchiseNote(approve ? "Link created." : "Request declined.");
    } catch (e) {
      setFranchiseNote(e instanceof Error ? e.message : "Could not update request.");
    } finally {
      setIncLoading(false);
    }
  };

  const handleSaveAttendance = async () => {
    if (!tenant?.id) return;
    setAttendanceSaving(true);
    try {
      const existing = (tenant.settings as Record<string, unknown> | undefined) ?? {};
      await updateTenantSettings(tenant.id, { ...existing, attendance: attendanceCfg });
      setAttendanceSaved(true);
      setTimeout(() => setAttendanceSaved(false), 2500);
    } catch {
      // Silently ignore for now — settings page is non-critical
    } finally {
      setAttendanceSaving(false);
    }
  };

  const handleSaveRewards = async () => {
    if (!tenant?.id) return;
    setRewardSaving(true);
    setRewardSaved(false);
    setRewardError("");
    try {
      const existing = (tenant.settings as Record<string, unknown> | undefined) ?? {};
      const mergedSettings = {
        ...existing,
        reward_animations: clampRewardSettings(rewardCfg),
      };
      const updated = await updateTenantSettings(tenant.id, mergedSettings);
      setTenant({
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        code: updated.code,
        type: updated.type,
        logoUrl: updated.logoUrl,
        settings: updated.settings,
      });
      setRewardSaved(true);
      setTimeout(() => setRewardSaved(false), 2500);
    } catch (error) {
      setRewardError(
        error instanceof Error ? error.message : "Failed to save reward settings.",
      );
    } finally {
      setRewardSaving(false);
    }
  };

  const handleSaveGamification = async () => {
    setGamificationSaving(true);
    setGamificationSaved(false);
    setGamificationError("");
    try {
      await updateTenantGamificationConfig(gamificationCfg);
      setGamificationSaved(true);
      setTimeout(() => setGamificationSaved(false), 2500);
    } catch (error) {
      setGamificationError(
        error instanceof Error ? error.message : "Failed to save gamification settings.",
      );
    } finally {
      setGamificationSaving(false);
    }
  };


  const refreshGoals = async (labType?: string) => {
    setGoalLoading(true);
    setGoalError("");
    try {
      const list = await listGamificationGoals(
        labType ? { lab_type: labType } : undefined,
      );
      setGoals(list);
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "Failed to load goals.");
    } finally {
      setGoalLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "rewards") return;
    void refreshGoals();
  }, [activeTab]);

  const handleApplyTemplate = () => {
    const template = GOAL_TEMPLATES.find((item) => item.key === selectedTemplateKey);
    if (!template) return;
    setGoalLabType(template.lab_type);
    setGoalName(template.name);
    setGoalDescription(template.description);
    setGoalEventType(template.eventType);
    setGoalRewardType("points");
    setGoalPoints(10);
  };

  const handleCreateGoal = async () => {
    if (!goalName.trim()) {
      setGoalError("Goal name is required.");
      return;
    }
    setGoalSaving(true);
    setGoalError("");
    try {
      const reward: GoalReward =
        goalRewardType === "points"
          ? { type: "points", value: Math.max(1, goalPoints) }
          : { type: "reward", reward_kind: goalRewardKind, badge_slug: goalBadgeSlug || undefined };
      await createGamificationGoal({
        lab_type: goalLabType,
        name: goalName.trim(),
        description: goalDescription.trim(),
        event_map: { events: [goalEventType], context_match: {} },
        conditions: [],
        reward,
        is_active: true,
      });
      setGoalName("");
      setGoalDescription("");
      setGoalPoints(10);
      setGoalRewardType("points");
      await refreshGoals(goalLabType);
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "Failed to create goal.");
    } finally {
      setGoalSaving(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    setGoalError("");
    try {
      await deleteGamificationGoal(goalId);
      await refreshGoals(goalLabType);
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "Failed to delete goal.");
    }
  };

  const handleSimulate = async () => {
    setSimulateLoading(true);
    setGoalError("");
    setSimulateResult(null);
    try {
      const context = JSON.parse(simulateContextJson || "{}") as Record<string, unknown>;
      const result = await simulateLabEvent({
        lab_id: "preview-lab",
        lab_type: goalLabType,
        event_type: goalEventType,
        context,
      });
      setSimulateResult({
        points_awarded_total: result.points_awarded_total,
        matched_goals: result.matched_goals.map((item) => ({
          goal_name: item.goal_name,
          points_awarded: item.points_awarded,
          reward_type: item.reward_type,
        })),
      });
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "Simulation failed.");
    } finally {
      setSimulateLoading(false);
    }
  };

  const tenantName = tenant?.name ?? "Organization";
  const tenantSlug = tenant?.slug ?? "org";
  const contactEmail = "admin@example.com";
  const roleNameById = useMemo(
    () => Object.fromEntries(supportRoles.map((item) => [item.id, item.name])),
    [supportRoles],
  );
  const supportUserLabelById = useMemo(
    () =>
      Object.fromEntries(
        supportUsers.map((item) => [
          item.id,
          `${item.first_name} ${item.last_name}`.trim() || item.email,
        ]),
      ),
    [supportUsers],
  );

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;

    async function loadSupportAccess() {
      setSupportLoading(true);
      setSupportError("");
      try {
        const [options, grants] = await Promise.all([
          getSupportAccessOptions(tenant.id),
          listSupportAccessGrants(tenant.id),
        ]);
        if (cancelled) return;
        setSupportUsers(options.support_users);
        setSupportRoles(options.roles);
        setSupportGrants(grants.items);
      } catch (error) {
        if (cancelled) return;
        setSupportError(error instanceof Error ? error.message : "Failed to load support access");
      } finally {
        if (!cancelled) setSupportLoading(false);
      }
    }

    loadSupportAccess();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  const refreshSupportGrants = async () => {
    if (!tenant?.id) return;
    const grants = await listSupportAccessGrants(tenant.id);
    setSupportGrants(grants.items);
  };

  const handleCreateSupportGrant = async () => {
    if (!tenant?.id) return;
    setSupportError("");
    setSupportSuccess("");
    try {
      await createSupportAccessGrant(tenant.id, {
        support_user_id: selectedSupportUserId,
        role_id: selectedSupportRoleId,
        reason: supportReason.trim() || undefined,
        expires_at: new Date(supportExpiry).toISOString(),
      });
      setSupportSuccess("Support access granted.");
      setSupportReason("");
      await refreshSupportGrants();
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Failed to grant support access");
    }
  };

  const handleRevokeSupportGrant = async (grantId: string) => {
    if (!tenant?.id) return;
    setSupportError("");
    setSupportSuccess("");
    try {
      await revokeSupportAccessGrant(tenant.id, grantId);
      setSupportSuccess("Support access revoked.");
      await refreshSupportGrants();
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Failed to revoke support access");
    }
  };

  return (
    <div
      className="tenant-settings"
      role="main"
      aria-label="Tenant settings"
    >
      <header className="tenant-settings__header">
        <div className="tenant-settings__panel-title-row">
          <h1 className="tenant-settings__title">Organization Settings</h1>
          <FieldHint
            title="Organization Settings"
            description="Manage tenant-wide defaults for labs, UI policy, attendance, rewards, and support access."
          />
        </div>
        <p className="tenant-settings__subtitle">
          Manage your organization configuration
        </p>
      </header>

      <div className="tenant-settings__layout">
        <nav
          className="tenant-settings__nav"
          role="tablist"
          aria-label="Settings sections"
        >
          {TABS.map((tab) => {
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                className={`tenant-settings__nav-btn ${
                  activeTab === tab.id ? "tenant-settings__nav-btn--active" : ""
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.iconSrc ? (
                  <img
                    src={tab.iconSrc}
                    alt=""
                    className="tenant-settings__nav-icon-img"
                    aria-hidden
                  />
                ) : tab.icon ? (
                  <tab.icon size={18} aria-hidden />
                ) : null}
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="tenant-settings__content">
          {/* General */}
          <section
            id="panel-general"
            role="tabpanel"
            aria-labelledby="tab-general"
            hidden={activeTab !== "general"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="General"
              description="Core tenant identity and locale defaults. Name, slug, and contact are read-only from org setup."
            />
            <div className="tenant-settings__form">
              <div className="tenant-settings__field">
                <label htmlFor="org-name">Organization name</label>
                <input
                  id="org-name"
                  type="text"
                  value={tenantName}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-slug">Slug</label>
                <input
                  id="org-slug"
                  type="text"
                  value={tenantSlug}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="contact-email">Contact email</label>
                <input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-language">Language</label>
                <KidDropdown
                  value={language}
                  onChange={setLanguage}
                  fullWidth
                  ariaLabel="Language"
                  options={LANGUAGES}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-timezone">Timezone</label>
                <KidDropdown
                  value={timezone}
                  onChange={setTimezone}
                  fullWidth
                  ariaLabel="Timezone"
                  options={TIMEZONES}
                />
              </div>
            </div>
          </section>

          <section
            id="panel-franchise"
            role="tabpanel"
            aria-labelledby="tab-franchise"
            hidden={activeTab !== "franchise"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Franchise & domain"
              description="Map a public subdomain or custom hostname, request to join a parent organization, or approve child sites. Production routing also requires backend PUBLIC_HOST_BASE_DOMAIN and DNS."
            />
            <div className="tenant-settings__form">
              <h3 className="tenant-settings__panel-desc" style={{ marginTop: 0 }}>
                Public hostname
              </h3>
              <p className="tenant-settings__panel-desc">
                Subdomain label for <code>{`{label}.your-platform-domain`}</code> (set the apex domain on the
                server). Custom domain: point DNS to your app, then enter the hostname here.
              </p>
              <div className="tenant-settings__field">
                <label htmlFor="host-sub">Public subdomain label</label>
                <input
                  id="host-sub"
                  className="tenant-settings__input"
                  value={hostSub}
                  onChange={(e) => setHostSub(e.target.value.toLowerCase())}
                  placeholder="e.g. oakridge"
                  autoComplete="off"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="custom-dom">Custom domain (optional)</label>
                <input
                  id="custom-dom"
                  className="tenant-settings__input"
                  value={customDom}
                  onChange={(e) => setCustomDom(e.target.value.toLowerCase())}
                  placeholder="learn.oakridge.edu"
                  autoComplete="off"
                />
              </div>
              {hostErr ? <p className="auth-error">{hostErr}</p> : null}
              {hostOk ? <p className="auth-success">Saved host mapping.</p> : null}
              <button
                type="button"
                className="tenant-settings__save-btn"
                onClick={() => void handleSaveHosts()}
                disabled={hostSaving || !tenant?.id}
              >
                {hostSaving ? "Saving…" : "Save hostname settings"}
              </button>

              <h3 className="tenant-settings__panel-desc" style={{ marginTop: "1.75rem" }}>
                Request link under a parent org
              </h3>
              <p className="tenant-settings__panel-desc">
                Sends a pending request to the parent workspace. An owner/admin there chooses{" "}
                <strong>central</strong> (shared billing pool) or <strong>independent</strong> billing, and
                can set shared curriculum / brand / rollup policies on approval.
              </p>
              <div className="tenant-settings__field">
                <label htmlFor="parent-slug-req">Parent organization slug</label>
                <input
                  id="parent-slug-req"
                  className="tenant-settings__input"
                  value={parentSlugReq}
                  onChange={(e) => setParentSlugReq(e.target.value)}
                  placeholder="district-slug"
                  autoComplete="off"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="pref-bill">Preferred structure (optional hint)</label>
                <KidDropdown
                  value={prefBill || "any"}
                  onChange={(v) =>
                    setPrefBill(v === "any" ? "" : (v as "central" | "independent"))
                  }
                  fullWidth
                  ariaLabel="Billing preference"
                  options={[
                    { value: "any", label: "No preference" },
                    { value: "central", label: "Central (parent license)" },
                    { value: "independent", label: "Independent (child billing)" },
                  ]}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="fr-msg">Message to parent (optional)</label>
                <textarea
                  id="fr-msg"
                  className="tenant-settings__input"
                  rows={3}
                  value={franchiseMsg}
                  onChange={(e) => setFranchiseMsg(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="tenant-settings__save-btn"
                onClick={() => void handleSubmitFranchiseRequest()}
                disabled={franchiseBusy || !parentSlugReq.trim()}
              >
                {franchiseBusy ? "Sending…" : "Submit join request"}
              </button>

              <h3 className="tenant-settings__panel-desc" style={{ marginTop: "1.75rem" }}>
                Incoming franchise requests
              </h3>
              <p className="tenant-settings__panel-desc">
                Child organizations asking to link under this workspace. Choose how curriculum, shared asset
                libraries, brand, and parent rollups apply, then approve with central or independent billing.
              </p>
              <div className="tenant-settings__field">
                <label>Policy when approving</label>
                <KidDropdown
                  value={approveFranchiseGovernance}
                  onChange={(v) => setApproveFranchiseGovernance(v as FranchiseGovernanceMode)}
                  fullWidth
                  ariaLabel="Franchise governance when approving"
                  options={[
                    {
                      value: "child_managed",
                      label: "Child-managed — child curriculum & brand only",
                    },
                    {
                      value: "parent_managed",
                      label: "Parent-managed — parent curriculum, library & brand (read-only for child)",
                    },
                    {
                      value: "hybrid",
                      label: "Hybrid — child may author; parent catalog & library visible",
                    },
                    {
                      value: "isolated",
                      label: "Isolated — billing/ops link only; no parent content, brand, or rollups",
                    },
                  ]}
                />
              </div>
              {franchiseNote ? <p className="tenant-settings__panel-desc">{franchiseNote}</p> : null}
              {incLoading ? (
                <p className="tenant-settings__panel-desc">Loading…</p>
              ) : incomingFr.length === 0 ? (
                <p className="tenant-settings__panel-desc">No pending requests.</p>
              ) : (
                <ul className="tenant-settings__panel-desc" style={{ listStyle: "none", padding: 0 }}>
                  {incomingFr.map((r) => (
                    <li key={r.id} className="tenant-settings__franchise-card">
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        Child tenant ID: {r.child_tenant_id}
                      </div>
                      {r.message ? <p style={{ margin: "0 0 8px" }}>{r.message}</p> : null}
                      {r.preferred_billing_mode ? (
                        <p style={{ margin: "0 0 8px", fontSize: "0.875rem" }}>
                          Preferred: {r.preferred_billing_mode}
                        </p>
                      ) : null}
                      <div className="tenant-settings__franchise-actions">
                        <button
                          type="button"
                          className="tenant-settings__save-btn"
                          onClick={() => void handleFranchiseDecision(r.id, true, "central")}
                        >
                          Approve (central)
                        </button>
                        <button
                          type="button"
                          className="tenant-settings__save-btn"
                          onClick={() => void handleFranchiseDecision(r.id, true, "independent")}
                        >
                          Approve (independent)
                        </button>
                        <button
                          type="button"
                          className="tenant-settings__save-btn tenant-settings__save-btn--secondary"
                          onClick={() => void handleFranchiseDecision(r.id, false)}
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Lab Settings */}
          <section
            id="panel-labs"
            role="tabpanel"
            aria-labelledby="tab-labs"
            hidden={activeTab !== "labs"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Lab Settings"
              description="Enable or disable lab surfaces available to this tenant. Disabled labs are hidden from learners."
            />
            <p className="tenant-settings__panel-desc">
              Enable or disable labs for your organization
            </p>
            <div className="tenant-settings__toggles">
              {LABS.map((lab) => (
                <div
                  key={lab.id}
                  className="tenant-settings__toggle-row"
                  role="group"
                  aria-label={`${lab.name} lab`}
                >
                  <label
                    htmlFor={`lab-${lab.id}`}
                    className="tenant-settings__toggle-label"
                  >
                    {lab.name}
                  </label>
                  <KidSwitch
                    id={`lab-${lab.id}`}
                    checked={labEnabled[lab.id]}
                    onChange={(next) =>
                      setLabEnabled((prev) => ({
                        ...prev,
                        [lab.id]: next,
                      }))
                    }
                    ariaLabel={`${lab.name} lab toggle`}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* UI Policy */}
          <section
            id="panel-ui"
            role="tabpanel"
            aria-labelledby="tab-ui"
            hidden={activeTab !== "ui"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="UI Policy"
              description="Controls the tenant-wide default UI mode for student experiences."
            />
            <p className="tenant-settings__panel-desc">
              Set tenant-wide UI mode
            </p>
            <div className="tenant-settings__field">
              <label htmlFor="ui-mode">UI mode</label>
              <KidDropdown
                value={uiMode}
                onChange={setUiMode}
                fullWidth
                ariaLabel="UI mode"
                options={UI_MODES}
              />
            </div>
          </section>

          {/* Parent Policies */}
          <section
            id="panel-parent"
            role="tabpanel"
            aria-labelledby="tab-parent"
            hidden={activeTab !== "parent"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Parent Policies"
              description="Defines whether parents can cancel or reschedule and how close to session start those actions are allowed."
            />
            <p className="tenant-settings__panel-desc">
              Configure parent-facing policies
            </p>
            <div className="tenant-settings__toggles">
              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Allow cancel"
              >
                <label
                  htmlFor="allow-cancel"
                  className="tenant-settings__toggle-label"
                >
                  Allow cancel
                </label>
                <KidSwitch
                  id="allow-cancel"
                  checked={allowCancel}
                  onChange={setAllowCancel}
                  ariaLabel="Allow cancel toggle"
                />
              </div>
              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Allow reschedule"
              >
                <label
                  htmlFor="allow-reschedule"
                  className="tenant-settings__toggle-label"
                >
                  Allow reschedule
                </label>
                <KidSwitch
                  id="allow-reschedule"
                  checked={allowReschedule}
                  onChange={setAllowReschedule}
                  ariaLabel="Allow reschedule toggle"
                />
              </div>
            </div>
            <div className="tenant-settings__field">
              <label htmlFor="cancel-deadline">Cancel deadline (hours)</label>
              <input
                id="cancel-deadline"
                type="number"
                min={0}
                value={cancelDeadlineHours}
                onChange={(e) =>
                  setCancelDeadlineHours(Number(e.target.value) || 0)
                }
                className="tenant-settings__input"
              />
            </div>
          </section>

          {/* Attendance */}
          <section
            id="panel-attendance"
            role="tabpanel"
            aria-labelledby="tab-attendance"
            hidden={activeTab !== "attendance"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Attendance"
              description="Sets the organization default attendance rule. Programs/classes can override this default."
            />
            <p className="tenant-settings__panel-desc">
              Set the default attendance policy for your organization. Programs and classes can override this setting.
            </p>
            <AttendanceSettings
              value={attendanceCfg}
              onChange={(v) => setAttendanceCfg(v ?? attendanceCfg)}
              saving={attendanceSaving}
            />
            <div className="ui-form-actions" style={{ marginTop: 24 }}>
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => void handleSaveAttendance()}
                disabled={attendanceSaving}
              >
                {attendanceSaving ? "Saving…" : attendanceSaved ? "Saved!" : "Save Attendance Settings"}
              </button>
            </div>
          </section>

          {/* Reward Animations */}
          <section
            id="panel-rewards"
            role="tabpanel"
            aria-labelledby="tab-rewards"
            hidden={activeTab !== "rewards"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Reward Animations"
              description="Global reward effects across live class and app pages, with guardrails to protect performance."
            />
            <p className="tenant-settings__panel-desc">
              Configure global reward animation behavior for students across live class and app pages.
            </p>
            {false ? (
            <>
            <div className="tenant-settings__support-card" style={{ marginBottom: 18 }}>
              <h3 className="tenant-settings__support-title">Gamification Policy</h3>
              <div className="tenant-settings__form tenant-settings__form--rewards">
                <div className="tenant-settings__field">
                  <label htmlFor="gamification-mode">
                    <span className="tenant-settings__label-with-hint">
                      Mode
                      <FieldHint
                        title="Gamification mode"
                        description="Academic minimizes game mechanics. Full applies strongest point rewards."
                      />
                    </span>
                  </label>
                  <KidDropdown
                    value={gamificationCfg.mode}
                    onChange={(value) =>
                      setGamificationCfg((prev) => ({
                        ...prev,
                        mode:
                          value === "academic" ||
                          value === "light" ||
                          value === "balanced" ||
                          value === "full"
                            ? value
                            : prev.mode,
                      }))
                    }
                    fullWidth
                    ariaLabel="Gamification mode"
                    options={GAMIFICATION_MODES}
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="gamification-max-points">
                    <span className="tenant-settings__label-with-hint">
                      Max points per lab event
                      <FieldHint
                        title="Max points per lab event"
                        description="Safety cap to prevent accidental oversized rewards from custom rules."
                      />
                    </span>
                  </label>
                  <input
                    id="gamification-max-points"
                    type="number"
                    min={1}
                    max={500}
                    value={gamificationCfg.max_points_per_event}
                    onChange={(event) =>
                      setGamificationCfg((prev) => ({
                        ...prev,
                        max_points_per_event: clamp(
                          Number(event.target.value) || 1,
                          1,
                          500,
                        ),
                      }))
                    }
                    className="tenant-settings__input"
                  />
                </div>
              </div>
              <div className="tenant-settings__toggles">
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Enable gamification</span>
                  <KidSwitch
                    checked={gamificationCfg.enabled}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({ ...prev, enabled: next }))
                    }
                    ariaLabel="Enable gamification"
                  />
                </div>
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Allow stickers</span>
                  <KidSwitch
                    checked={gamificationCfg.allow_badges}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({ ...prev, allow_badges: next }))
                    }
                    ariaLabel="Allow stickers"
                  />
                </div>
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Allow leaderboard</span>
                  <KidSwitch
                    checked={gamificationCfg.allow_leaderboard}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({ ...prev, allow_leaderboard: next }))
                    }
                    ariaLabel="Allow leaderboard"
                  />
                </div>
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Allow streaks</span>
                  <KidSwitch
                    checked={gamificationCfg.allow_streaks}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({ ...prev, allow_streaks: next }))
                    }
                    ariaLabel="Allow streaks"
                  />
                </div>
                <div className="tenant-settings__toggle-row">
                  <span className="tenant-settings__toggle-label">Allow live recognition popups</span>
                  <KidSwitch
                    checked={gamificationCfg.allow_live_recognition}
                    onChange={(next) =>
                      setGamificationCfg((prev) => ({
                        ...prev,
                        allow_live_recognition: next,
                      }))
                    }
                    ariaLabel="Allow live recognition popups"
                  />
                </div>
              </div>
              <div className="tenant-settings__toggles" style={{ marginTop: 12 }}>
                {LABS.map((lab) => {
                  const enabled = gamificationCfg.enabled_labs.includes(lab.id);
                  return (
                    <div key={`gamification-lab-${lab.id}`} className="tenant-settings__toggle-row">
                      <span className="tenant-settings__toggle-label">{lab.name} events</span>
                      <KidSwitch
                        checked={enabled}
                        onChange={(next) =>
                          setGamificationCfg((prev) => {
                            const current = new Set(prev.enabled_labs);
                            if (next) current.add(lab.id);
                            else current.delete(lab.id);
                            return { ...prev, enabled_labs: Array.from(current) };
                          })
                        }
                        ariaLabel={`Enable ${lab.name} gamification events`}
                      />
                    </div>
                  );
                })}
              </div>
              {gamificationError ? (
                <p className="tenant-settings__reward-error">{gamificationError}</p>
              ) : null}
              <div className="ui-form-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  onClick={() => void handleSaveGamification()}
                  disabled={gamificationSaving}
                >
                  {gamificationSaving
                    ? "Saving…"
                    : gamificationSaved
                      ? "Saved!"
                      : "Save Gamification Policy"}
                </button>
              </div>
            </div>
            <GamificationPuzzleBuilder />
            <div className="tenant-settings__support-card" style={{ marginBottom: 18 }}>
              <h3 className="tenant-settings__support-title">Goal Builder (Instructor-Friendly)</h3>
              <p className="tenant-settings__panel-desc">
                Create lab goals using templates or custom events. Choose points or rewards per goal.
              </p>
              <div className="tenant-settings__form tenant-settings__form--rewards">
                <div className="tenant-settings__field">
                  <label htmlFor="goal-template">Template</label>
                  <KidDropdown
                    value={selectedTemplateKey}
                    onChange={setSelectedTemplateKey}
                    fullWidth
                    ariaLabel="Goal template"
                    options={[
                      { value: "", label: "Select a template" },
                      ...GOAL_TEMPLATES.map((item) => ({ value: item.key, label: item.label })),
                    ]}
                  />
                  <div className="ui-form-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      onClick={handleApplyTemplate}
                      disabled={!selectedTemplateKey}
                    >
                      Apply Template
                    </button>
                  </div>
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-lab-type">Lab type</label>
                  <KidDropdown
                    value={goalLabType}
                    onChange={setGoalLabType}
                    fullWidth
                    ariaLabel="Goal lab type"
                    options={LABS.map((lab) => ({ value: lab.id, label: lab.name }))}
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-name">Goal name</label>
                  <input
                    id="goal-name"
                    className="tenant-settings__input tenant-settings__input--wide"
                    value={goalName}
                    onChange={(event) => setGoalName(event.target.value)}
                    placeholder="e.g. Light an LED"
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-event-type">Event trigger</label>
                  <KidDropdown
                    value={goalEventType}
                    onChange={setGoalEventType}
                    fullWidth
                    ariaLabel="Goal event type"
                    options={(LAB_EVENTS[goalLabType] ?? LAB_EVENTS["circuit-maker"]).map((evt) => ({
                      value: evt.value,
                      label: evt.label,
                    }))}
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-description">Description</label>
                  <input
                    id="goal-description"
                    className="tenant-settings__input tenant-settings__input--wide"
                    value={goalDescription}
                    onChange={(event) => setGoalDescription(event.target.value)}
                    placeholder="Describe success criteria in simple terms"
                  />
                </div>
                <div className="tenant-settings__field">
                  <label htmlFor="goal-reward-type">Reward type</label>
                  <KidDropdown
                    value={goalRewardType}
                    onChange={(value) => setGoalRewardType(value === "reward" ? "reward" : "points")}
                    fullWidth
                    ariaLabel="Goal reward type"
                    options={[
                      { value: "points", label: "Points" },
                      { value: "reward", label: "Reward" },
                    ]}
                  />
                </div>
                {goalRewardType === "points" ? (
                  <div className="tenant-settings__field">
                    <label htmlFor="goal-points">Points</label>
                    <input
                      id="goal-points"
                      type="number"
                      min={1}
                      max={500}
                      className="tenant-settings__input"
                      value={goalPoints}
                      onChange={(event) =>
                        setGoalPoints(clamp(Number(event.target.value) || 1, 1, 500))
                      }
                    />
                  </div>
                ) : (
                  <>
                    <div className="tenant-settings__field">
                      <label htmlFor="goal-reward-kind">Reward kind</label>
                      <KidDropdown
                        value={goalRewardKind}
                        onChange={(value) =>
                          setGoalRewardKind(
                            value === "hi-five" || value === "sticker" || value === "custom"
                              ? value
                              : "badge",
                          )
                        }
                        fullWidth
                        ariaLabel="Goal reward kind"
                        options={[
                          { value: "badge", label: "Sticker" },
                          { value: "hi-five", label: "Hi-five" },
                          { value: "sticker", label: "Sticker" },
                          { value: "custom", label: "Custom image" },
                        ]}
                      />
                    </div>
                    <div className="tenant-settings__field">
                      <label htmlFor="goal-badge-slug">Sticker slug (optional)</label>
                      <input
                        id="goal-badge-slug"
                        className="tenant-settings__input tenant-settings__input--wide"
                        value={goalBadgeSlug}
                        onChange={(event) => setGoalBadgeSlug(event.target.value)}
                        placeholder="e.g. circuit_master"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="ui-form-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  onClick={() => void handleCreateGoal()}
                  disabled={goalSaving}
                >
                  {goalSaving ? "Creating…" : "Create Goal"}
                </button>
              </div>
              <div className="tenant-settings__field" style={{ marginTop: 16 }}>
                <label htmlFor="goal-simulate-context">Simulation context (JSON)</label>
                <input
                  id="goal-simulate-context"
                  className="tenant-settings__input tenant-settings__input--wide"
                  value={simulateContextJson}
                  onChange={(event) => setSimulateContextJson(event.target.value)}
                />
              </div>
              <div className="ui-form-actions" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => void handleSimulate()}
                  disabled={simulateLoading}
                >
                  {simulateLoading ? "Simulating…" : "Preview / Simulate Rule Match"}
                </button>
              </div>
              {simulateResult ? (
                <div className="tenant-settings__support-message tenant-settings__support-message--success" style={{ marginTop: 12 }}>
                  Matched {simulateResult.matched_goals.length} goal(s), total points preview: {simulateResult.points_awarded_total}
                </div>
              ) : null}
              {goalError ? (
                <p className="tenant-settings__reward-error">{goalError}</p>
              ) : null}

              <div style={{ marginTop: 16 }}>
                <h4 className="tenant-settings__support-title" style={{ marginBottom: 8 }}>
                  Existing goals
                </h4>
                {goalLoading ? (
                  <p className="tenant-settings__panel-desc">Loading goals...</p>
                ) : goals.length === 0 ? (
                  <p className="tenant-settings__panel-desc">No goals yet for this tenant.</p>
                ) : (
                  <div className="tenant-settings__support-list">
                    {goals.map((goal) => (
                      <div key={goal.id} className="tenant-settings__support-item">
                        <div className="tenant-settings__support-item-main">
                          <div className="tenant-settings__support-item-name">
                            {goal.name}
                          </div>
                          <div className="tenant-settings__support-item-meta">
                            <span>{goal.lab_type}</span>
                            <span>{goal.event_map?.events?.join(", ") || "No event"}</span>
                            <span>
                              {goal.reward.type === "points"
                                ? `${goal.reward.value ?? 0} points`
                                : `${goal.reward.reward_kind ?? "reward"}`}
                            </span>
                          </div>
                        </div>
                        <div className="tenant-settings__support-item-actions">
                          <span
                            className={`tenant-settings__status-badge ${
                              goal.is_active
                                ? "tenant-settings__status-badge--active"
                                : "tenant-settings__status-badge--inactive"
                            }`}
                          >
                            {goal.is_active ? "Active" : "Inactive"}
                          </span>
                          <button
                            type="button"
                            className="tenant-settings__secondary-btn"
                            onClick={() => void handleDeleteGoal(goal.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </>
            ) : (
              <div className="tenant-settings__support-card" style={{ marginBottom: 18 }}>
                <h3 className="tenant-settings__support-title">Gamification Moved</h3>
                <p className="tenant-settings__panel-desc">
                  Gamification policy and nested puzzle goal builder are now in the dedicated sidebar tab.
                </p>
                <div className="ui-form-actions">
                  <a href="/app/gamification" className="ui-btn ui-btn--primary">
                    Open Gamification Studio
                  </a>
                </div>
              </div>
            )}
            <div className="tenant-settings__toggles">
              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Enable reward animations"
              >
                <label
                  htmlFor="reward-enabled"
                  className="tenant-settings__toggle-label"
                >
                  <span className="tenant-settings__label-with-hint">
                    Enable reward animations
                    <FieldHint
                      title="Enable reward animations"
                      description="Turns reward effects on/off globally for this tenant. Disable to maximize performance on very low-end devices."
                    />
                  </span>
                </label>
                <KidSwitch
                  id="reward-enabled"
                  checked={rewardCfg.enabled}
                  onChange={(next) =>
                    setRewardCfg((prev) => ({ ...prev, enabled: next }))
                  }
                  ariaLabel="Enable reward animations toggle"
                />
              </div>

              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Enable big win mode"
              >
                <label
                  htmlFor="reward-big-win"
                  className="tenant-settings__toggle-label"
                >
                  <span className="tenant-settings__label-with-hint">
                    Enable BIG WIN mode
                    <FieldHint
                      title="Enable BIG WIN mode"
                      description="Adds a short flash + stronger effect for high-point rewards. Recommended to keep enabled."
                    />
                  </span>
                </label>
                <KidSwitch
                  id="reward-big-win"
                  checked={rewardCfg.big_win_enabled}
                  onChange={(next) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      big_win_enabled: next,
                    }))
                  }
                  ariaLabel="Enable BIG WIN mode toggle"
                />
              </div>
            </div>

            <div className="tenant-settings__form tenant-settings__form--rewards">
              <div className="tenant-settings__field">
                <label htmlFor="reward-theme">
                  <span className="tenant-settings__label-with-hint">
                    Animation theme
                    <FieldHint
                      title="Animation theme"
                      description="Classic is calmer. Celebration is brighter and more festive."
                    />
                  </span>
                </label>
                <KidDropdown
                  value={rewardCfg.theme}
                  onChange={(value) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      theme:
                        value === "celebration" || value === "classic"
                          ? value
                          : prev.theme,
                    }))
                  }
                  fullWidth
                  ariaLabel="Reward animation theme"
                  options={REWARD_THEMES}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-max-intensity">
                  <span className="tenant-settings__label-with-hint">
                    Maximum intensity
                    <FieldHint
                      title="Maximum intensity"
                      description="Caps all animations to Low, Medium, or High to prevent excessive particle load."
                    />
                  </span>
                </label>
                <KidDropdown
                  value={rewardCfg.max_intensity}
                  onChange={(value) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      max_intensity:
                        value === "low" || value === "medium" || value === "high"
                          ? value
                          : prev.max_intensity,
                    }))
                  }
                  fullWidth
                  ariaLabel="Reward maximum intensity"
                  options={REWARD_INTENSITIES}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-max-duration">
                  <span className="tenant-settings__label-with-hint">
                    Max duration (ms)
                    <FieldHint
                      title="Max duration (ms)"
                      description="Hard cap for any single animation. Allowed range: 1000 to 5000 ms."
                    />
                  </span>
                </label>
                <input
                  id="reward-max-duration"
                  type="number"
                  min={REWARD_MIN_MS}
                  max={REWARD_MAX_DURATION_MS}
                  value={rewardCfg.max_duration_ms}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      max_duration_ms: clamp(
                        Number(e.target.value) ||
                          DEFAULT_REWARD_SETTINGS.max_duration_ms,
                        REWARD_MIN_MS,
                        REWARD_MAX_DURATION_MS,
                      ),
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-big-win-points">
                  <span className="tenant-settings__label-with-hint">
                    BIG WIN threshold (points)
                    <FieldHint
                      title="BIG WIN threshold (points)"
                      description="Points needed to trigger BIG WIN visuals. Allowed range: 1 to 200 points."
                    />
                  </span>
                </label>
                <input
                  id="reward-big-win-points"
                  type="number"
                  min={1}
                  max={REWARD_MAX_BIG_WIN_POINTS}
                  value={rewardCfg.big_win_points}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      big_win_points: clamp(
                        Number(e.target.value) ||
                          DEFAULT_REWARD_SETTINGS.big_win_points,
                        1,
                        REWARD_MAX_BIG_WIN_POINTS,
                      ),
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
            </div>

            <div className="tenant-settings__reward-duration-grid">
              <div className="tenant-settings__field">
                <label htmlFor="reward-duration-low">
                  <span className="tenant-settings__label-with-hint">
                    Low duration (ms)
                    <FieldHint
                      title="Low duration (ms)"
                      description="Animation length for low intensity. Allowed range: 1000 to 3000 ms."
                    />
                  </span>
                </label>
                <input
                  id="reward-duration-low"
                  type="number"
                  min={REWARD_MIN_MS}
                  max={REWARD_LOW_MAX_MS}
                  value={rewardCfg.durations.low}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      durations: {
                        ...prev.durations,
                        low: clamp(
                          Number(e.target.value) ||
                            DEFAULT_REWARD_SETTINGS.durations.low,
                          REWARD_MIN_MS,
                          REWARD_LOW_MAX_MS,
                        ),
                      },
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-duration-medium">
                  <span className="tenant-settings__label-with-hint">
                    Medium duration (ms)
                    <FieldHint
                      title="Medium duration (ms)"
                      description="Animation length for medium intensity. Allowed range: 1000 to 4000 ms."
                    />
                  </span>
                </label>
                <input
                  id="reward-duration-medium"
                  type="number"
                  min={REWARD_MIN_MS}
                  max={REWARD_MEDIUM_MAX_MS}
                  value={rewardCfg.durations.medium}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      durations: {
                        ...prev.durations,
                        medium: clamp(
                          Number(e.target.value) ||
                            DEFAULT_REWARD_SETTINGS.durations.medium,
                          REWARD_MIN_MS,
                          REWARD_MEDIUM_MAX_MS,
                        ),
                      },
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="reward-duration-high">
                  <span className="tenant-settings__label-with-hint">
                    High duration (ms)
                    <FieldHint
                      title="High duration (ms)"
                      description="Animation length for high intensity. Allowed range: 1000 to 5000 ms."
                    />
                  </span>
                </label>
                <input
                  id="reward-duration-high"
                  type="number"
                  min={REWARD_MIN_MS}
                  max={REWARD_HIGH_MAX_MS}
                  value={rewardCfg.durations.high}
                  onChange={(e) =>
                    setRewardCfg((prev) => ({
                      ...prev,
                      durations: {
                        ...prev.durations,
                        high: clamp(
                          Number(e.target.value) ||
                            DEFAULT_REWARD_SETTINGS.durations.high,
                          REWARD_MIN_MS,
                          REWARD_HIGH_MAX_MS,
                        ),
                      },
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
            </div>

            {rewardError ? (
              <p className="tenant-settings__reward-error">{rewardError}</p>
            ) : null}

            <div className="ui-form-actions" style={{ marginTop: 24 }}>
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => void handleSaveRewards()}
                disabled={rewardSaving}
              >
                {rewardSaving
                  ? "Saving…"
                  : rewardSaved
                    ? "Saved!"
                    : "Save Reward Animation Settings"}
              </button>
            </div>
          </section>

          {/* Support Access */}
          <section
            id="panel-support"
            role="tabpanel"
            aria-labelledby="tab-support"
            hidden={activeTab !== "support"}
            className="tenant-settings__panel"
          >
            <SectionHeading
              title="Support Access"
              description="Grant temporary, role-scoped access to support staff for troubleshooting and operations."
            />
            <p className="tenant-settings__panel-desc">
              Grant time-limited, role-scoped access to a specific STEMplitude support user.
            </p>

            <div className="tenant-settings__support-grid">
              <div className="tenant-settings__support-card">
                <h3 className="tenant-settings__support-title">Grant access</h3>
                <div className="tenant-settings__form">
                  <div className="tenant-settings__field">
                    <label htmlFor="support-user">Support user</label>
                    <KidDropdown
                      value={selectedSupportUserId}
                      onChange={setSelectedSupportUserId}
                      fullWidth
                      ariaLabel="Support user"
                      options={[
                        { value: "", label: "Select a support user" },
                        ...supportUsers.map((user) => ({
                          value: user.id,
                          label: `${`${user.first_name} ${user.last_name}`.trim() || user.email}${user.global_role ? ` • ${user.global_role}` : ""}`,
                        })),
                      ]}
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-role">Tenant role scope</label>
                    <KidDropdown
                      value={selectedSupportRoleId}
                      onChange={setSelectedSupportRoleId}
                      fullWidth
                      ariaLabel="Tenant role scope"
                      options={[
                        { value: "", label: "Select tenant role" },
                        ...supportRoles.map((roleOption) => ({
                          value: roleOption.id,
                          label: roleOption.name,
                        })),
                      ]}
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-expiry">Expires at</label>
                    <input
                      id="support-expiry"
                      type="datetime-local"
                      value={supportExpiry}
                      onChange={(e) => setSupportExpiry(e.target.value)}
                      className="tenant-settings__input"
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-reason">Reason</label>
                    <input
                      id="support-reason"
                      type="text"
                      value={supportReason}
                      onChange={(e) => setSupportReason(e.target.value)}
                      className="tenant-settings__input tenant-settings__input--wide"
                      placeholder="Investigating sync issue, billing issue, onboarding help..."
                    />
                  </div>

                  {(supportError || supportSuccess) && (
                    <div
                      className={`tenant-settings__support-message ${
                        supportError
                          ? "tenant-settings__support-message--error"
                          : "tenant-settings__support-message--success"
                      }`}
                    >
                      {supportError || supportSuccess}
                    </div>
                  )}

                  <div className="tenant-settings__support-actions">
                    <button
                      type="button"
                      className="tenant-settings__primary-btn"
                      disabled={
                        supportLoading ||
                        !selectedSupportUserId ||
                        !selectedSupportRoleId ||
                        !supportExpiry
                      }
                      onClick={handleCreateSupportGrant}
                    >
                      Grant support access
                    </button>
                  </div>
                </div>
              </div>

              <div className="tenant-settings__support-card">
                <h3 className="tenant-settings__support-title">Active and past grants</h3>
                {supportLoading ? (
                  <p className="tenant-settings__panel-desc">Loading support grants...</p>
                ) : supportGrants.length === 0 ? (
                  <p className="tenant-settings__panel-desc">No support access grants yet.</p>
                ) : (
                  <div className="tenant-settings__support-list">
                    {supportGrants.map((grant) => {
                      const isExpired = new Date(grant.expires_at).getTime() <= Date.now();
                      const isRevoked = grant.status !== "active" || !!grant.revoked_at || isExpired;
                      return (
                        <div key={grant.id} className="tenant-settings__support-item">
                          <div className="tenant-settings__support-item-main">
                            <div className="tenant-settings__support-item-name">
                              {supportUserLabelById[grant.support_user_id] ?? grant.support_user_id}
                            </div>
                            <div className="tenant-settings__support-item-meta">
                              <span>{roleNameById[grant.role_id ?? ""] ?? "No role scope"}</span>
                              <span>Expires {new Date(grant.expires_at).toLocaleString()}</span>
                              {grant.reason && <span>{grant.reason}</span>}
                            </div>
                          </div>
                          <div className="tenant-settings__support-item-actions">
                            <span
                              className={`tenant-settings__status-badge ${
                                isRevoked
                                  ? "tenant-settings__status-badge--inactive"
                                  : "tenant-settings__status-badge--active"
                              }`}
                            >
                              {isExpired ? "Expired" : isRevoked ? "Revoked" : "Active"}
                            </span>
                            {!isRevoked && (
                              <button
                                type="button"
                                className="tenant-settings__secondary-btn"
                                onClick={() => handleRevokeSupportGrant(grant.id)}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section
            id="panel-danger"
            role="tabpanel"
            aria-labelledby="tab-danger"
            hidden={activeTab !== "danger"}
            className="tenant-settings__panel tenant-settings__panel--danger"
          >
            <SectionHeading
              title="Danger Zone"
              description="High-risk organization actions. Use carefully because changes may be irreversible."
            />
            <p className="tenant-settings__panel-desc">
              Irreversible actions. Proceed with caution.
            </p>
            <div className="tenant-settings__danger-actions">
              <button
                type="button"
                className="tenant-settings__danger-btn"
                disabled
                title="Contact support to delete your organization"
                aria-disabled="true"
              >
                Delete organization
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
