import { X } from "lucide-react";
import type { WeeklyWinner } from "../../lib/api/gamification";
import { winnerSeenKey } from "../../lib/api/gamification";

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

interface WeeklyWinnerBannerProps {
  winners: WeeklyWinner[];
  onDismiss: () => void;
}

export function WeeklyWinnerBanner({ winners, onDismiss }: WeeklyWinnerBannerProps) {
  if (!winners.length) return null;

  const gold = winners.find((w) => w.rank === 1);
  const weekLabel = gold
    ? `${new Date(gold.week_start + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })} – ${new Date(gold.week_end + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}`
    : "";

  function dismiss() {
    if (gold) localStorage.setItem(winnerSeenKey(gold.week_start), "1");
    onDismiss();
  }

  return (
    <div className="ww-banner" role="alert" aria-live="polite">
      <div className="ww-banner__confetti" aria-hidden />
      <div className="ww-banner__body">
        <span className="ww-banner__crown" aria-hidden>👑</span>
        <div className="ww-banner__text">
          <strong className="ww-banner__headline">Weekly Winners — {weekLabel}</strong>
          <span className="ww-banner__names">
            {winners.slice(0, 3).map((w) => (
              <span key={w.id} className="ww-banner__winner-chip">
                {RANK_MEDAL[w.rank] ?? `#${w.rank}`} {w.student_name.split(" ")[0]}
                <span className="ww-banner__xp">{w.xp_earned.toLocaleString()} XP</span>
              </span>
            ))}
          </span>
        </div>
      </div>
      <button
        className="ww-banner__dismiss"
        onClick={dismiss}
        aria-label="Dismiss weekly winner announcement"
      >
        <X size={16} />
      </button>
    </div>
  );
}
