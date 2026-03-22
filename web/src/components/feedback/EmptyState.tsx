import { motion } from "framer-motion";
import { useUIMode } from "../../providers/UIModeProvider";
import "./feedback.css";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  const { mode } = useUIMode();

  return (
    <div
      className="empty-state"
      data-ui-mode={mode}
      role="status"
      aria-label={title}
    >
      <motion.div
        className="empty-state__illustration"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {icon}
      </motion.div>
      <h3 className="empty-state__title">{title}</h3>
      {description && (
        <p className="empty-state__description">{description}</p>
      )}
      {action && (
        <motion.button
          type="button"
          className="empty-state__action"
          onClick={action.onClick}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {action.label}
        </motion.button>
      )}
    </div>
  );
}
