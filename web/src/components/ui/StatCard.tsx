import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  /** Secondary line under the value (analytics hints, footnotes). */
  hint?: ReactNode;
  /** Label above value, left-aligned — matches dashboard metric tiles. */
  titleFirst?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  titleFirst = false,
  className = "",
}: StatCardProps) {
  const rootClass = ["stat-card", titleFirst && "stat-card--title-first", className]
    .filter(Boolean)
    .join(" ");

  const labelEl = (
    <div className="stat-card__label">{label}</div>
  );
  const valueEl = <div className="stat-card__value">{value}</div>;
  const hintEl = hint != null && hint !== false ? (
    <div className="stat-card__hint">{hint}</div>
  ) : null;

  return (
    <div className={rootClass} role="group" aria-label={`${label}: ${value}`}>
      {titleFirst ? (
        <>
          {labelEl}
          {icon ? (
            <div className="stat-card__icon" aria-hidden>
              {icon}
            </div>
          ) : null}
          {valueEl}
          {hintEl}
        </>
      ) : (
        <>
          {icon ? (
            <div className="stat-card__icon" aria-hidden>
              {icon}
            </div>
          ) : null}
          {valueEl}
          {labelEl}
          {hintEl}
        </>
      )}
    </div>
  );
}
