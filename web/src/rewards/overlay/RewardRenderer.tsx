import { useEffect, useMemo, useState, type ComponentType } from "react";
import { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ActiveRewardAnimation } from "../engine/rewardEngine";
import { getTsParticlesPreset } from "../animations/tsparticlesPresets";

interface RewardRendererProps {
  animation: ActiveRewardAnimation;
}

type ParticlesComponent = ComponentType<{
  id?: string;
  options?: unknown;
}>;

export function RewardRenderer({ animation }: RewardRendererProps) {
  const [Particles, setParticles] = useState<ParticlesComponent | null>(null);
  const [particlesReady, setParticlesReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void import("@tsparticles/react")
      .then(async (reactMod) => {
        if (!active) return;
        await initParticlesEngine(async (engine) => {
          await loadSlim(engine);
        });
        setParticles(() => reactMod.default);
        setParticlesReady(true);
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
    [animation.id, animation.type, animation.intensity],
  );

  if (!Particles || !particlesReady) {
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
        key={animation.id}
        id={`reward-${animation.id}`}
        options={options}
      />
    </div>
  );
}

