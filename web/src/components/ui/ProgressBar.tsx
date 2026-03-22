interface ProgressBarProps {
  value: number;
  label?: string;
  showPercent?: boolean;
  variant?: "xp" | "default" | "success";
}

export function ProgressBar({
  value,
  label,
  showPercent = false,
  variant = "default",
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const percentText = `${Math.round(clampedValue)}%`;

  return (
    <div
      className={`progress-bar progress-bar--${variant}`}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
    >
      {(label || showPercent) && (
        <div className="progress-bar__header">
          {label && <span className="progress-bar__label">{label}</span>}
          {showPercent && (
            <span className="progress-bar__percent">{percentText}</span>
          )}
        </div>
      )}
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
