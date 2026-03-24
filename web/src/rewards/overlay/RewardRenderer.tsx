import { useEffect, useMemo, useState, type ComponentType } from "react";
import type { Engine } from "@tsparticles/engine";
import type { ActiveRewardAnimation } from "../engine/rewardEngine";
import { getTsParticlesPreset } from "../animations/tsparticlesPresets";

interface RewardRendererProps {
  animation: ActiveRewardAnimation;
}

type ParticlesComponent = ComponentType<{
  id?: string;
  init?: (engine: Engine) => Promise<void>;
  options: unknown;
}>;

export function RewardRenderer({ animation }: RewardRendererProps) {
  const [Particles, setParticles] = useState<ParticlesComponent | null>(null);
  const [loadSlimFn, setLoadSlimFn] = useState<((engine: Engine) => Promise<void>) | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([import("@tsparticles/react"), import("@tsparticles/slim")])
      .then(([reactMod, slimMod]) => {
        if (!active) return;
        setParticles(() => reactMod.default);
        setLoadSlimFn(() => slimMod.loadSlim);
      })
      .catch(() => {
        if (!active) return;
        setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const options = useMemo(
    () => getTsParticlesPreset(animation.type, animation.intensity),
    [animation.type, animation.intensity],
  );

  if (!Particles || !loadSlimFn) {
    const symbols =
      animation.type === "rocket"
        ? ["🚀", "✨", "💫", "⭐", "✨", "💫", "🚀", "⭐"]
        : animation.type === "stars"
          ? ["⭐", "✨", "🌟", "⭐", "✨", "🌟", "⭐", "✨"]
          : animation.type === "trophy"
            ? ["🏆", "✨", "🎉", "⭐", "✨", "🎉", "🏆", "⭐"]
            : ["🎉", "✨", "🎊", "⭐", "✨", "🎉", "🎊", "⭐"];
    return (
      <div
        className={`reward-overlay__fallback reward-overlay__fallback--${animation.intensity}`}
        aria-label={loadFailed ? "Reward animation fallback" : "Reward animation loading"}
      >
        {symbols.map((symbol, index) => (
          <span
            key={`${symbol}-${index}`}
            className="reward-overlay__fallback-piece"
            style={{
              left: `${8 + index * 11}%`,
              animationDelay: `${(index % 5) * 0.12}s`,
            }}
          >
            {symbol}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="reward-overlay__particles">
      <Particles
        id={`reward-${animation.id}`}
        init={loadSlimFn}
        options={options}
      />
    </div>
  );
}

