import { useEffect } from "react";
import type { WeeklyWinner } from "../../lib/api/gamification";
import { winnerSeenKey } from "../../lib/api/gamification";

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const RANK_LABEL: Record<number, string> = {
  1: "Champion",
  2: "Runner-up",
  3: "Top 3",
};

interface WeeklyWinnerModalProps {
  winners: WeeklyWinner[];
  currentStudentId?: string;
  onClose: () => void;
}

export function WeeklyWinnerModal({
  winners,
  currentStudentId,
  onClose,
}: WeeklyWinnerModalProps) {
  const gold = winners.find((w) => w.rank === 1);
  const isWinner = currentStudentId
    ? winners.some((w) => w.student_id === currentStudentId)
    : false;
  const myEntry = winners.find((w) => w.student_id === currentStudentId);

  const weekLabel = gold
    ? `${new Date(gold.week_start + "T00:00:00").toLocaleDateString([], { month: "long", day: "numeric" })} – ${new Date(gold.week_end + "T00:00:00").toLocaleDateString([], { month: "long", day: "numeric" })}`
    : "This week";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function close() {
    if (gold) localStorage.setItem(winnerSeenKey(gold.week_start), "1");
    onClose();
  }

  return (
    <div className="ww-modal__backdrop" onClick={close} role="dialog" aria-modal aria-label="Weekly winners announcement">
      {/* Floating confetti particles */}
      <div className="ww-modal__confetti" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className={`ww-modal__particle ww-modal__particle--${(i % 6) + 1}`} />
        ))}
      </div>

      <div className="ww-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="ww-modal__trophy" aria-hidden>🏆</div>

        {isWinner ? (
          <>
            <h2 className="ww-modal__title ww-modal__title--you">
              🎉 You're this week's {RANK_LABEL[myEntry?.rank ?? 1]}!
            </h2>
            <p className="ww-modal__sub">
              {weekLabel} · {myEntry?.xp_earned.toLocaleString()} XP
            </p>
          </>
        ) : (
          <>
            <h2 className="ww-modal__title">This week's champions!</h2>
            <p className="ww-modal__sub">{weekLabel}</p>
          </>
        )}

        <ul className="ww-modal__podium" role="list">
          {winners.slice(0, 3).map((w) => (
            <li
              key={w.id}
              className={`ww-modal__podium-entry ww-modal__podium-entry--rank${w.rank}${w.student_id === currentStudentId ? " ww-modal__podium-entry--me" : ""}`}
              role="listitem"
            >
              <span className="ww-modal__podium-medal">{RANK_MEDAL[w.rank] ?? `#${w.rank}`}</span>
              <span className="ww-modal__podium-name">
                {w.student_id === currentStudentId ? "You" : w.student_name.split(" ")[0]}
              </span>
              <span className="ww-modal__podium-xp">{w.xp_earned.toLocaleString()} XP</span>
            </li>
          ))}
        </ul>

        <button className="ww-modal__cta" onClick={close}>
          {isWinner ? "Claim my glory! 🚀" : "Awesome! 👏"}
        </button>
      </div>
    </div>
  );
}
