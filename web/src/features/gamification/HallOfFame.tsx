import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { getHallOfFame, type HallOfFameResponse } from "../../lib/api/gamification";

const RANK_MEDAL = ["🥇", "🥈", "🥉"];
const RANK_COLOR = ["#ffc800", "#b0bec5", "#cd7f32"];

function getCurrentWeekStart(): string {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

interface HallOfFameProps {
  /** Compact mode: show fewer weeks, smaller cards */
  compact?: boolean;
}

export function HallOfFame({ compact = false }: HallOfFameProps) {
  const [data, setData] = useState<HallOfFameResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const currentWeek = getCurrentWeekStart();

  useEffect(() => {
    getHallOfFame(compact ? 4 : 8)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [compact]);

  if (loading) {
    return (
      <div className="hof__loading" aria-live="polite">
        <span className="hof__loading-dot" />
        <span className="hof__loading-dot" />
        <span className="hof__loading-dot" />
      </div>
    );
  }

  if (!data || data.weeks.length === 0) {
    return (
      <div className="hof__empty">
        <Trophy size={32} className="hof__empty-icon" aria-hidden />
        <p className="hof__empty-text">No weekly winners crowned yet.</p>
        <p className="hof__empty-hint">
          Admins can crown the top students each week to celebrate their achievements.
        </p>
      </div>
    );
  }

  return (
    <div className={`hof${compact ? " hof--compact" : ""}`} role="region" aria-label="Hall of fame">
      <div className="hof__weeks">
        {data.weeks.map((week) => {
          const isCurrentWeek = week.week_start === currentWeek;
          return (
            <div
              key={week.week_start}
              className={`hof__week${isCurrentWeek ? " hof__week--current" : ""}`}
              aria-label={`Week of ${week.week_label}`}
            >
              <div className="hof__week-header">
                <span className="hof__week-label">{week.week_label}</span>
                {isCurrentWeek && (
                  <span className="hof__week-badge">This week</span>
                )}
              </div>
              <ul className="hof__podium" role="list">
                {week.winners.map((w) => (
                  <li
                    key={w.id}
                    className={`hof__entry hof__entry--rank${w.rank}`}
                    role="listitem"
                    style={{ "--rank-color": RANK_COLOR[w.rank - 1] ?? "#aaa" } as React.CSSProperties}
                  >
                    <span className="hof__entry-medal" aria-hidden>
                      {RANK_MEDAL[w.rank - 1] ?? `#${w.rank}`}
                    </span>
                    <span className="hof__entry-name">{w.student_name.split(" ")[0]}</span>
                    <span className="hof__entry-xp">{w.xp_earned.toLocaleString()} XP</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
