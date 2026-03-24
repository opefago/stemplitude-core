import { useId } from "react";

export interface KidSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Quirky, cartoon-style switch intended as a reusable replacement
 * for raw role="switch" buttons across settings and admin surfaces.
 */
export function KidSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  id: idProp,
  size = "md",
  className = "",
}: KidSwitchProps) {
  const fallbackId = useId();
  const id = idProp ?? fallbackId;
  const cls = [
    "kid-switch",
    `kid-switch--${size}`,
    checked ? "kid-switch--on" : "kid-switch--off",
    disabled ? "kid-switch--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={cls} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="kid-switch__native"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="kid-switch__track" aria-hidden>
        <span className="kid-switch__thumb" />
      </span>
    </label>
  );
}

