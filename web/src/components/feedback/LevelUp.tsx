import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Zap } from "lucide-react";
import { useUIMode } from "../../providers/UIModeProvider";
import "./feedback.css";

export interface LevelUpProps {
  level: number;
  visible: boolean;
  onClose: () => void;
}

const DISMISS_MS = 3000;

export function LevelUp({ level, visible, onClose }: LevelUpProps) {
  const { mode } = useUIMode();

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  const isKids = mode === "kids";
  const isExplorer = mode === "explorer";
  const isPro = mode === "pro";

  return (
    <AnimatePresence>
      {visible && (
      <motion.div
        className="level-up"
        data-ui-mode={mode}
        role="alert"
        aria-live="polite"
        aria-label={`Level ${level} reached`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="level-up__backdrop" aria-hidden="true" />
        <motion.div
          className={`level-up__content level-up__content--${mode}`}
          initial={
            isPro
              ? { y: -20, opacity: 0 }
              : { scale: 0.8, opacity: 0 }
          }
          animate={
            isPro
              ? { y: 0, opacity: 1 }
              : { scale: 1, opacity: 1 }
          }
          exit={{ opacity: 0, scale: isPro ? 1 : 0.95 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 22,
          }}
        >
          {isKids && (
            <>
              <div className="level-up__stars" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      delay: 0.1 + i * 0.1,
                      type: "spring",
                      stiffness: 260,
                      damping: 18,
                    }}
                  >
                    <Star size={28} fill="currentColor" />
                  </motion.span>
                ))}
              </div>
              <h2 className="level-up__title">LEVEL UP!</h2>
              <motion.span
                className="level-up__level-num"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  delay: 0.3,
                  type: "spring",
                  stiffness: 300,
                  damping: 15,
                }}
              >
                {level}
              </motion.span>
            </>
          )}
          {isExplorer && (
            <>
              <div className="level-up__xp-flash" aria-hidden="true" />
              <div className="level-up__explorer-row">
                <Zap size={24} aria-hidden="true" />
                <motion.span
                  className="level-up__level-label"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  Level {level} reached!
                </motion.span>
              </div>
              <motion.span
                className="level-up__level-num level-up__level-num--explorer"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: 0.2,
                  type: "spring",
                  stiffness: 280,
                  damping: 18,
                }}
              >
                {level}
              </motion.span>
            </>
          )}
          {isPro && (
            <p className="level-up__pro-text">Level {level} reached</p>
          )}
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
