import { useEffect, useState } from "react";
import {
  Flame, Star, Target, Trophy, Zap,
  BookOpen, FolderOpen, GraduationCap, Lock,
  Code2, Palette, Compass, Gamepad2, Users, Box,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useUIMode } from "../../providers/UIModeProvider";
import { ProgressBar, StatCard } from "../../components/ui";
import {
  getMyGamificationProfile,
  listShoutouts,
  type GamificationProfile,
  type ShoutoutItem,
  iconSlugToEmoji,
  timeAgo,
} from "../../lib/api/gamification";
import { HallOfFame } from "../gamification/HallOfFame";
import "../../components/ui/ui.css";
import "../gamification/gamification.css";
import "./achievements.css";

// Map backend icon_slug → Lucide component
const ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap, target: Target, box: Box, flame: Flame,
  "gamepad-2": Gamepad2, "code-2": Code2, palette: Palette,
  compass: Compass, "book-open": BookOpen, star: Star,
  users: Users, trophy: Trophy,
};

function getIcon(slug: string): LucideIcon {
  return ICON_MAP[slug] ?? Trophy;
}

export function AchievementsPage() {
  const { user } = useAuth();
  const { mode } = useUIMode();
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [shoutouts, setShoutouts] = useState<ShoutoutItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getMyGamificationProfile(),
      listShoutouts({ limit: 5 }),
    ])
      .then(([prof, shoutData]) => {
        if (!mounted) return;
        setProfile(prof);
        setShoutouts(shoutData.items.filter((s) => s.to_student_id === prof.student_id));
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const xpPercent = profile
    ? Math.min(100, ((profile.total_xp - profile.xp_start) / Math.max(1, profile.xp_end - profile.xp_start)) * 100)
    : 0;

  return (
    <div className="achievements" data-ui-mode={mode} role="main" aria-label="Achievements and progress">
      <header className="achievements__header">
        <h1 className="achievements__title">Achievements</h1>
        {user && <p className="achievements__subtitle">Your progress, {user.firstName}</p>}
      </header>

      {loading ? (
        <div className="achievements__loading" aria-live="polite">
          <div className="achievements__loading-dot" />
          <div className="achievements__loading-dot" />
          <div className="achievements__loading-dot" />
        </div>
      ) : (
        <>
          {/* ── Level & XP ─────────────────────────────────────────────── */}
          <section className="achievements__level-section" aria-labelledby="level-heading">
            <div className="achievements__level-badge">
              <span className="achievements__level-number">{profile?.level ?? 1}</span>
              <span className="achievements__level-name">{profile?.level_name ?? "Explorer"}</span>
            </div>
            <ProgressBar
              value={xpPercent}
              label={`${profile?.total_xp ?? 0} / ${profile?.xp_end ?? 100} XP`}
              showPercent
              variant="xp"
            />
            {(profile?.total_xp ?? 0) === 0 && (
              <p className="achievements__level-hint">
                Complete lessons and labs to start earning XP and level up! ⚡
              </p>
            )}
          </section>

          {/* ── Stats ──────────────────────────────────────────────────── */}
          <section className="achievements__stats-section" aria-labelledby="stats-heading">
            <h2 id="stats-heading" className="achievements__section-title">Stats</h2>
            <div className="achievements__stats-row">
              <StatCard label="Total XP" value={profile?.total_xp ?? 0} icon={<Zap size={20} aria-hidden />} />
              <StatCard label="Badges" value={profile?.stats.total_badges ?? 0} icon={<Trophy size={20} aria-hidden />} />
              <StatCard label="Day Streak" value={profile?.streak.current_streak ?? 0} icon={<Flame size={20} aria-hidden />} />
              <StatCard label="Shoutouts" value={profile?.stats.total_shoutouts_received ?? 0} icon={<Star size={20} aria-hidden />} />
            </div>
          </section>

          {/* ── Streak ─────────────────────────────────────────────────── */}
          <section className="achievements__streak-section" aria-labelledby="streak-heading">
            <h2 id="streak-heading" className="achievements__section-title">Streaks</h2>
            <div className="achievements__streak-row">
              <div className="achievements__streak-card" aria-label={`Current streak: ${profile?.streak.current_streak ?? 0} days`}>
                <Flame
                  className={`achievements__streak-flame${(profile?.streak.current_streak ?? 0) === 0 ? " achievements__streak-flame--cold" : ""}`}
                  size={32}
                  aria-hidden
                />
                <div className="achievements__streak-value">{profile?.streak.current_streak ?? 0}</div>
                <div className="achievements__streak-label">Current streak</div>
                {(profile?.streak.current_streak ?? 0) === 0 && (
                  <p className="achievements__streak-hint">Log in daily to start your streak!</p>
                )}
              </div>
              <div className="achievements__streak-card" aria-label={`Best streak: ${profile?.streak.best_streak ?? 0} days`}>
                <Flame className="achievements__streak-flame achievements__streak-flame--best" size={32} aria-hidden />
                <div className="achievements__streak-value">{profile?.streak.best_streak ?? 0}</div>
                <div className="achievements__streak-label">Best streak</div>
                {(profile?.streak.best_streak ?? 0) === 0 && (
                  <p className="achievements__streak-hint">Your record will appear here.</p>
                )}
              </div>
            </div>
          </section>

          {/* ── Badge Collection ───────────────────────────────────────── */}
          <section className="achievements__badges-section" aria-labelledby="badges-heading">
            <h2 id="badges-heading" className="achievements__section-title">Badge Collection</h2>
            {!profile || profile.badges.length === 0 ? (
              <>
                <div className="achievements__empty-state achievements__empty-state--badges">
                  <span className="achievements__empty-state-icon">🏅</span>
                  <p className="achievements__empty-state-text">No badges earned yet</p>
                  <p className="achievements__empty-state-hint">
                    Complete labs, keep your streak and collect shoutouts to unlock badges.
                  </p>
                </div>
                {/* Locked preview grid — shows students what they can earn */}
                <div className="achievements__badges-grid achievements__badges-grid--preview" role="list" aria-label="Locked badges preview">
                  {([
                    { slug: "first-circuit", label: "First Circuit" },
                    { slug: "code-ninja",    label: "Code Ninja" },
                    { slug: "week-streak",   label: "Week Streak" },
                    { slug: "python-master", label: "Python Master" },
                  ] as const).map((b) => (
                    <div key={b.slug} className="achievements__badge achievements__badge--locked" role="listitem" aria-label={`${b.label}, locked`}>
                      <div className="achievements__badge-icon-wrap">
                        <Lock size={20} aria-hidden />
                      </div>
                      <span className="achievements__badge-name">???</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="achievements__badges-grid" role="list" aria-label="Earned badges">
                {profile?.badges.map((sb) => {
                  const Icon = getIcon(sb.badge.icon_slug);
                  return (
                    <div
                      key={sb.id}
                      className="achievements__badge achievements__badge--earned"
                      role="listitem"
                      aria-label={`${sb.badge.name}, earned`}
                      title={`${sb.badge.name} — ${sb.badge.description}`}
                      style={{ "--badge-color": sb.badge.color } as React.CSSProperties}
                    >
                      <div className="achievements__badge-icon-wrap">
                        <Icon size={28} aria-hidden />
                      </div>
                      <span className="achievements__badge-name">{sb.badge.name}</span>
                      <span className="achievements__badge-date">
                        {new Date(sb.awarded_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Recent XP activity ─────────────────────────────────────── */}
          <section className="achievements__xp-section" aria-labelledby="xp-heading">
            <h2 id="xp-heading" className="achievements__section-title">Recent XP</h2>
            {profile && profile.recent_xp.length > 0 ? (
              <ul className="achievements__xp-list">
                {profile.recent_xp.map((tx) => (
                  <li key={tx.id} className="achievements__xp-item">
                    <span className="achievements__xp-amount">+{tx.amount} XP</span>
                    <span className="achievements__xp-reason">{tx.reason}</span>
                    <span className="achievements__xp-time">{timeAgo(tx.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="achievements__empty-state">
                <span className="achievements__empty-state-icon">⚡</span>
                <p className="achievements__empty-state-text">No XP earned yet.</p>
                <p className="achievements__empty-state-hint">
                  Finish a lesson or lab to see your first XP here.
                </p>
              </div>
            )}
          </section>

          {/* ── Hall of Fame ───────────────────────────────────────────── */}
          <section className="achievements__hof-section" aria-labelledby="hof-heading">
            <h2 id="hof-heading" className="achievements__section-title">Hall of Fame</h2>
            <HallOfFame compact />
          </section>

          {/* ── My Shoutouts ───────────────────────────────────────────── */}
          <section className="achievements__shoutouts-section" aria-labelledby="shoutouts-heading">
            <h2 id="shoutouts-heading" className="achievements__section-title">My Shoutouts 🌟</h2>
            {shoutouts.length > 0 ? (
              <ul className="achievements__shoutouts-list">
                {shoutouts.map((s) => (
                  <li key={s.id} className="achievements__shoutout-item">
                    <span className="achievements__shoutout-emoji">{s.emoji}</span>
                    <div className="achievements__shoutout-body">
                      <p className="achievements__shoutout-msg">{s.message}</p>
                      <span className="achievements__shoutout-meta">
                        from {s.from_user_name} · {timeAgo(s.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="achievements__empty-state">
                <span className="achievements__empty-state-icon">🌟</span>
                <p className="achievements__empty-state-text">No shoutouts yet.</p>
                <p className="achievements__empty-state-hint">
                  Keep up the great work — praise from your instructor will appear here!
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
