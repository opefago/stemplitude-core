import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface AccordionCardProps {
  expanded: boolean;
  onToggle: () => void;
  /** Rendered inside the always-visible header area. */
  summary: ReactNode;
  /** Rendered inside the collapsible detail panel. */
  children: ReactNode;
  className?: string;
}

export function AccordionCard({
  expanded,
  onToggle,
  summary,
  children,
  className,
}: AccordionCardProps) {
  return (
    <div
      className={`accordion-card ${expanded ? "accordion-card--expanded" : ""} ${className ?? ""}`}
    >
      <button
        type="button"
        className="accordion-card__toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <div className="accordion-card__summary">{summary}</div>
        <ChevronDown
          size={20}
          className={`accordion-card__chevron ${expanded ? "accordion-card__chevron--open" : ""}`}
          aria-hidden
        />
      </button>
      <div className="accordion-card__detail-wrap" aria-hidden={!expanded}>
        <div className="accordion-card__detail-inner">
          <div className="accordion-card__detail">{children}</div>
        </div>
      </div>
    </div>
  );
}
