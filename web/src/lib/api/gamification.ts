import { apiFetch } from "./client";

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

export function getMyGamificationProfile(): Promise<GamificationProfile> {
  return apiFetch<GamificationProfile>("/gamification/me");
}

export function getStudentGamificationProfile(studentId: string): Promise<GamificationProfile> {
  return apiFetch<GamificationProfile>(`/gamification/students/${studentId}`);
}

export function getLeaderboard(limit = 10): Promise<LeaderboardResponse> {
  return apiFetch<LeaderboardResponse>(`/gamification/leaderboard?limit=${limit}`);
}

export function listBadges(): Promise<BadgeDefinition[]> {
  return apiFetch<BadgeDefinition[]>("/gamification/badges");
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
    body: JSON.stringify(data),
  });
}

export function awardXP(data: {
  student_id: string;
  amount: number;
  reason: string;
  source?: string;
}): Promise<{ detail: string }> {
  return apiFetch("/gamification/xp", { method: "POST", body: JSON.stringify(data) });
}

export function awardBadge(data: {
  student_id: string;
  badge_slug: string;
}): Promise<StudentBadge> {
  return apiFetch<StudentBadge>("/gamification/badges/award", {
    method: "POST",
    body: JSON.stringify(data),
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
    body: JSON.stringify({ top_n: topN }),
  });
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
