import { apiFetch, browserCalendarTimeZone } from "./client";
import type { Paginated } from "./pagination";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BadgeDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon_slug: string;
  color: string;
  xp_reward: number;
  category: string;
}

export interface StudentBadge {
  id: string;
  badge: BadgeDefinition;
  awarded_at: string;
  awarded_by_id: string | null;
}

export interface XPTransaction {
  id: string;
  amount: number;
  reason: string;
  source: string;
  created_at: string;
}

export interface Streak {
  current_streak: number;
  best_streak: number;
  last_activity_date?: string | null;
  /** Local week Sun–Sat; active = part of current consecutive streak, not all activity. */
  seven_day_summary?: Array<{
    date: string;
    weekday: string;
    active: boolean;
    is_today: boolean;
  }>;
}

export interface GamificationStats {
  total_lessons_completed: number;
  total_labs_completed: number;
  total_badges: number;
  total_shoutouts_received: number;
}

export interface GamificationProfile {
  student_id: string;
  total_xp: number;
  level: number;
  level_name: string;
  xp_start: number;
  xp_end: number;
  streak: Streak;
  badges: StudentBadge[];
  recent_xp: XPTransaction[];
  stats: GamificationStats;
}

export interface LeaderboardEntry {
  rank: number;
  student_id: string;
  student_name: string;
  total_xp: number;
  level: number;
  level_name: string;
  badge_count: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  my_rank: number | null;
  my_xp: number | null;
}

export interface ShoutoutItem {
  id: string;
  from_user_id: string;
  from_user_name: string;
  to_student_id: string;
  to_student_name: string;
  message: string;
  emoji: string;
  classroom_id: string | null;
  created_at: string;
}

export interface ShoutoutListResponse {
  items: ShoutoutItem[];
  total: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

function calendarTzQueryParam(): string {
  const tz = browserCalendarTimeZone();
  return tz ? encodeURIComponent(tz) : "UTC";
}

export function getMyGamificationProfile(): Promise<GamificationProfile> {
  const tz = calendarTzQueryParam();
  return apiFetch<GamificationProfile>(`/gamification/me?calendar_tz=${tz}`);
}

export function getStudentGamificationProfile(studentId: string): Promise<GamificationProfile> {
  const tz = calendarTzQueryParam();
  return apiFetch<GamificationProfile>(
    `/gamification/students/${studentId}?calendar_tz=${tz}`,
  );
}

export function getLeaderboard(limit = 10): Promise<LeaderboardResponse> {
  return apiFetch<LeaderboardResponse>(`/gamification/leaderboard?limit=${limit}`);
}

/** All badge definitions (follows pagination until `total` is reached). */
export async function listBadges(): Promise<BadgeDefinition[]> {
  const limit = 100;
  let skip = 0;
  const all: BadgeDefinition[] = [];
  for (;;) {
    const q = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    const page = await apiFetch<Paginated<BadgeDefinition>>(
      `/gamification/badges?${q}`,
    );
    all.push(...page.items);
    if (page.items.length < limit || all.length >= page.total) break;
    skip += limit;
  }
  return all;
}

export function listShoutouts(params?: {
  student_id?: string;
  limit?: number;
  offset?: number;
}): Promise<ShoutoutListResponse> {
  const q = new URLSearchParams();
  if (params?.student_id) q.set("student_id", params.student_id);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<ShoutoutListResponse>(`/gamification/shoutouts${qs ? `?${qs}` : ""}`);
}

export function createShoutout(data: {
  to_student_id: string;
  message: string;
  emoji?: string;
  classroom_id?: string;
}): Promise<ShoutoutItem> {
  return apiFetch<ShoutoutItem>("/gamification/shoutouts", {
    method: "POST",
    body: data,
  });
}

export function awardXP(data: {
  student_id: string;
  amount: number;
  reason: string;
  source?: string;
}): Promise<{ detail: string }> {
  return apiFetch("/gamification/xp", { method: "POST", body: data });
}

export function awardBadge(data: {
  student_id: string;
  badge_slug: string;
}): Promise<StudentBadge> {
  return apiFetch<StudentBadge>("/gamification/badges/award", {
    method: "POST",
    body: data,
  });
}

/** Removes the badge award row; does not subtract XP already granted for that badge. */
export function revokeBadge(data: {
  student_id: string;
  badge_slug: string;
}): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>("/gamification/badges/revoke", {
    method: "POST",
    body: data,
  });
}

// ── Weekly winners ────────────────────────────────────────────────────────────

export interface WeeklyWinner {
  id: string;
  student_id: string;
  student_name: string;
  week_start: string;
  week_end: string;
  xp_earned: number;
  rank: number;
  crowned_at: string;
}

export interface HallOfFameWeek {
  week_start: string;
  week_end: string;
  week_label: string;
  winners: WeeklyWinner[];
}

export interface HallOfFameResponse {
  weeks: HallOfFameWeek[];
}

export function getCurrentWeekWinners(): Promise<WeeklyWinner[]> {
  return apiFetch<WeeklyWinner[]>("/gamification/weekly-winners/current");
}

export function getHallOfFame(limitWeeks = 8): Promise<HallOfFameResponse> {
  return apiFetch<HallOfFameResponse>(
    `/gamification/weekly-winners?limit_weeks=${limitWeeks}`,
  );
}

export function crownWeeklyWinners(topN = 3): Promise<WeeklyWinner[]> {
  return apiFetch<WeeklyWinner[]>("/gamification/weekly-winners/crown", {
    method: "POST",
    body: { top_n: topN },
  });
}

// ── Tenant config + goal builder primitives ──────────────────────────────────

export interface TenantGamificationConfig {
  mode: "academic" | "light" | "balanced" | "full";
  enabled: boolean;
  enabled_labs: string[];
  max_points_per_event: number;
  allow_badges: boolean;
  allow_live_recognition: boolean;
  allow_leaderboard: boolean;
  allow_streaks: boolean;
}

export interface GoalEventMap {
  events: string[];
  context_match: Record<string, string | number | boolean>;
}

export interface GoalReward {
  type: "points" | "reward";
  value?: number;
  reward_kind?: "badge" | "hi-five" | "sticker" | "custom";
  badge_slug?: string;
  icon?: string;
}

export interface GamificationGoal {
  id: string;
  tenant_id: string;
  lab_type: string;
  name: string;
  description: string;
  is_active: boolean;
  event_map: GoalEventMap;
  conditions: Array<string | Record<string, unknown>>;
  reward: GoalReward;
  created_by_id: string | null;
  updated_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export function getTenantGamificationConfig(): Promise<TenantGamificationConfig> {
  return apiFetch<TenantGamificationConfig>("/gamification/config");
}

export function updateTenantGamificationConfig(
  patch: Partial<TenantGamificationConfig>,
): Promise<TenantGamificationConfig> {
  return apiFetch<TenantGamificationConfig>("/gamification/config", {
    method: "PATCH",
    body: patch,
  });
}

export function listGamificationGoals(params?: {
  lab_type?: string;
  is_active?: boolean;
}): Promise<GamificationGoal[]> {
  const q = new URLSearchParams();
  if (params?.lab_type) q.set("lab_type", params.lab_type);
  if (typeof params?.is_active === "boolean") q.set("is_active", String(params.is_active));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiFetch<GamificationGoal[]>(`/gamification/goals${suffix}`);
}

export function createGamificationGoal(payload: {
  lab_type: string;
  name: string;
  description?: string;
  is_active?: boolean;
  event_map: GoalEventMap;
  conditions?: Array<string | Record<string, unknown>>;
  reward: GoalReward;
}): Promise<GamificationGoal> {
  return apiFetch<GamificationGoal>("/gamification/goals", {
    method: "POST",
    body: payload,
  });
}

export function updateGamificationGoal(
  goalId: string,
  patch: Partial<{
    name: string;
    description: string;
    is_active: boolean;
    event_map: GoalEventMap;
    conditions: string[];
    reward: GoalReward;
  }>,
): Promise<GamificationGoal> {
  return apiFetch<GamificationGoal>(`/gamification/goals/${goalId}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteGamificationGoal(goalId: string): Promise<void> {
  return apiFetch<void>(`/gamification/goals/${goalId}`, { method: "DELETE" });
}

export interface LabEventSimulationResult {
  processed: boolean;
  points_awarded_total: number;
  matched_goals: Array<{
    goal_id: string;
    goal_name: string;
    reward_type: string;
    points_awarded: number;
    reward_kind?: string | null;
  }>;
}

export function simulateLabEvent(payload: {
  event_type: string;
  lab_id: string;
  lab_type: string;
  context?: Record<string, unknown>;
  timestamp?: string;
}): Promise<LabEventSimulationResult> {
  return apiFetch<LabEventSimulationResult>("/gamification/events/ingest", {
    method: "POST",
    body: {
      ...payload,
      context: payload.context ?? {},
      timestamp: payload.timestamp ?? new Date().toISOString(),
      dry_run: true,
    },
  });
}

const labEventCooldowns = new Map<string, number>();

export async function emitLabEvent(payload: {
  event_type: string;
  lab_id: string;
  lab_type: string;
  context?: Record<string, unknown>;
  timestamp?: string;
}): Promise<void> {
  try {
    await apiFetch("/gamification/events/ingest", {
      method: "POST",
      body: {
        ...payload,
        context: payload.context ?? {},
        timestamp: payload.timestamp ?? new Date().toISOString(),
      },
    });
  } catch {
    // Do not break lab UX when telemetry/reward event submission fails.
  }
}

export function emitLabEventThrottled(
  payload: {
    event_type: string;
    lab_id: string;
    lab_type: string;
    context?: Record<string, unknown>;
    timestamp?: string;
  },
  cooldownMs = 2500,
): void {
  const key = `${payload.lab_type}:${payload.lab_id}:${payload.event_type}`;
  const now = Date.now();
  const last = labEventCooldowns.get(key) ?? 0;
  if (now - last < cooldownMs) return;
  labEventCooldowns.set(key, now);
  void emitLabEvent(payload);
}

/** localStorage key for "has this student seen this week's winner announcement" */
export function winnerSeenKey(weekStart: string): string {
  return `seen_winner_${weekStart}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map Lucide icon slug to an emoji fallback for contexts where icons aren't available. */
export function iconSlugToEmoji(slug: string): string {
  const map: Record<string, string> = {
    zap: "⚡", target: "🎯", box: "📦", flame: "🔥", "gamepad-2": "🎮",
    "code-2": "💻", palette: "🎨", compass: "🧭", "book-open": "📖",
    star: "⭐", users: "👥", trophy: "🏆",
  };
  return map[slug] ?? "🏅";
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
