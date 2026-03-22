import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useUIMode } from "../../providers/UIModeProvider";
import { Confetti } from "./Confetti";
import "./feedback.css";

export interface BadgeUnlockBadge {
  name: string;
  icon: string | React.ReactNode;
  description: string;
}

export interface BadgeUnlockProps {
  badge: BadgeUnlockBadge;
  visible: boolean;
  onClose: () => void;
}

const DISMISS_MS = 3000;

export function BadgeUnlock({ badge, visible, onClose }: BadgeUnlockProps) {
  const { mode } = useUIMode();
  const [confettiActive, setConfettiActive] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setConfettiActive(mode === "kids");
    const timer = setTimeout(onClose, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, mode, onClose]);

  const isKids = mode === "kids";
  const isExplorer = mode === "explorer";
  const isPro = mode === "pro";

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="badge-unlock"
          className="badge-unlock"
        data-ui-mode={mode}
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-unlock-title"
        aria-describedby="badge-unlock-desc"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="badge-unlock__backdrop"
          onClick={onClose}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          role="button"
          tabIndex={0}
          aria-label="Close badge unlock"
        />
        <motion.div
          className={`badge-unlock__content badge-unlock__content--${mode}`}
          initial={
            isPro
              ? { x: 100, opacity: 0 }
              : { scale: 0.5, opacity: 0 }
          }
          animate={
            isPro
              ? { x: 0, opacity: 1 }
              : { scale: 1, opacity: 1 }
          }
          exit={
            isPro
              ? { x: 100, opacity: 0 }
              : { scale: 0.9, opacity: 0 }
          }
          transition={{
            type: "spring",
            stiffness: isPro ? 300 : 260,
            damping: isPro ? 25 : 20,
          }}
        >
          {isKids && <Confetti active={confettiActive} onComplete={() => setConfettiActive(false)} />}
          <button
            type="button"
            className="badge-unlock__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div className="badge-unlock__badge-wrap">
            {isExplorer && <div className="badge-unlock__glow" aria-hidden="true" />}
            <div className="badge-unlock__icon-wrap">
              {typeof badge.icon === "string" ? (
                <span className="badge-unlock__icon-text">{badge.icon}</span>
              ) : (
                badge.icon
              )}
            </div>
          </div>
          <h2 id="badge-unlock-title" className="badge-unlock__title">
            {isKids && "Amazing!"}
            {isExplorer && "Badge Earned!"}
            {isPro && "Badge Earned"}
          </h2>
          <p id="badge-unlock-desc" className="badge-unlock__badge-name">
            {badge.name}
          </p>
          {badge.description && (
            <p className="badge-unlock__description">{badge.description}</p>
          )}
        </motion.div>
      </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
