import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { rewardEngine, type ActiveRewardAnimation } from "../engine/rewardEngine";
import { RewardRenderer } from "./RewardRenderer";
import "./reward-overlay.css";

function buildAnnouncement(animation: ActiveRewardAnimation): string {
  const name = animation.metadata?.studentName ?? "You";
  const rewardName = animation.metadata?.rewardName ?? "reward";
  const points = animation.metadata?.points;
  if (typeof points === "number" && Number.isFinite(points) && points > 0) {
    return `🎉 ${name} earned ${points} points!`;
  }
  return `🎉 ${name} earned ${rewardName.replaceAll("_", " ")}!`;
}

export function RewardOverlay() {
  const [active, setActive] = useState<ActiveRewardAnimation | null>(
    rewardEngine.getActive(),
  );

  useEffect(() => rewardEngine.subscribe(setActive), []);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => rewardEngine.complete(active.id), active.duration);
    return () => window.clearTimeout(timer);
  }, [active]);

  const content = useMemo(() => {
    if (!active) return null;
    const isBigWin = Boolean(active.metadata?.bigWin);
    const themeClass =
      active.metadata?.theme === "celebration"
        ? "reward-overlay--celebration"
        : "reward-overlay--classic";
    return (
      <div
        className={`reward-overlay ${themeClass}${isBigWin ? " reward-overlay--big-win" : ""}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <RewardRenderer animation={active} />
        <div className="reward-overlay__announcement">
          <strong>{buildAnnouncement(active)}</strong>
          {active.metadata?.message ? (
            <span>{active.metadata.message}</span>
          ) : null}
        </div>
      </div>
    );
  }, [active]);

  if (!content) return null;
  return createPortal(content, document.body);
}

