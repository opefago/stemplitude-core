import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Info, AlertTriangle, XCircle, X } from "lucide-react";
import "./feedback.css";

const ICONS = {
  success: CheckCircle,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
} as const;

export type ToastType = "success" | "info" | "warning" | "error";

export interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  onClose: () => void;
  duration?: number;
}

const DEFAULT_DURATION = 3000;

export function Toast({
  message,
  type = "info",
  visible,
  onClose,
  duration = DEFAULT_DURATION,
}: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onClose]);

  const Icon = ICONS[type];

  return (
    <AnimatePresence>
      {visible && (
      <motion.div
        className={`toast toast--${type}`}
        role="alert"
        aria-live="polite"
        aria-atomic="true"
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <Icon className="toast__icon" size={20} aria-hidden="true" />
        <span className="toast__message">{message}</span>
        <button
          type="button"
          className="toast__close"
          onClick={onClose}
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
