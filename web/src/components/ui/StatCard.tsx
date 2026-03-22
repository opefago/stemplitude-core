import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
}

export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div
      className="stat-card"
      role="group"
      aria-label={`${label}: ${value}`}
    >
      {icon && (
        <div className="stat-card__icon" aria-hidden>
          {icon}
        </div>
      )}
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}
