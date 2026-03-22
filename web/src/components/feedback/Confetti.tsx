import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./feedback.css";

const COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#6C5CE7",
  "#00CEC9",
  "#FDCB6E",
  "#0984E3",
  "#00B894",
  "#E17055",
  "#FD79A8",
];

const PARTICLE_COUNT = 30;

function generateParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length],
    angle: (360 / PARTICLE_COUNT) * i + Math.random() * 30,
    distance: 80 + Math.random() * 120,
    size: 6 + Math.random() * 8,
    shape: Math.random() > 0.5 ? "square" : "circle",
    delay: Math.random() * 0.15,
    duration: 1.2 + Math.random() * 0.6,
    rotation: (Math.random() - 0.5) * 720,
  }));
}

export interface ConfettiProps {
  active: boolean;
  onComplete?: () => void;
}

export function Confetti({ active, onComplete }: ConfettiProps) {
  const particles = useMemo(() => generateParticles(), [active]);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      onComplete?.();
    }, 2000);
    return () => clearTimeout(timer);
  }, [active, onComplete]);

  if (!active) return null;

  return (
    <div
      className="confetti"
      role="img"
      aria-hidden="true"
    >
      <AnimatePresence>
        {particles.map((p) => {
          const rad = (p.angle * Math.PI) / 180;
          const x = Math.cos(rad) * p.distance;
          const y = Math.sin(rad) * p.distance;
          return (
            <motion.div
              key={p.id}
              className={`confetti__particle confetti__particle--${p.shape}`}
              style={{
                backgroundColor: p.color,
                width: p.size,
                height: p.size,
                left: "50%",
                top: "50%",
                marginLeft: -p.size / 2,
                marginTop: -p.size / 2,
              }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{
                x,
                y,
                opacity: 0,
                rotate: p.rotation,
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: "easeOut",
              }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
