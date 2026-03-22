import { useId } from "react";
import type { ReactNode } from "react";
import "./kid-checkbox.css";

export interface KidCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label (renders after the box unless `labelPosition` is `start`). */
  children?: ReactNode;
  /** When there is no `children`, set this for accessibility. */
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** `start` = text first, then box (e.g. wide agreement rows). */
  labelPosition?: "start" | "end";
  compact?: boolean;
}

/**
 * Cartoony checkbox with thick border and bounce — use instead of raw `<input type="checkbox">`.
 */
export function KidCheckbox({
  checked,
  onChange,
  children,
  ariaLabel,
  id: idProp,
  disabled = false,
  className = "",
  labelPosition = "end",
  compact = false,
}: KidCheckboxProps) {
  const uid = useId();
  const id = idProp ?? uid;

  const control = (
    <span className="kid-checkbox__control">
      <input
        id={id}
        type="checkbox"
        className="kid-checkbox__native"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={children ? undefined : ariaLabel}
      />
      <span className="kid-checkbox__face" aria-hidden>
        <span className="kid-checkbox__check">
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4.5 10.2L8.4 14.5L15.8 5.2"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </span>
  );

  const mods = [
    "kid-checkbox",
    compact && "kid-checkbox--compact",
    disabled && "kid-checkbox--disabled",
    labelPosition === "start" && "kid-checkbox--label-start",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (children != null && children !== false) {
    return (
      <label className={mods}>
        {labelPosition === "start" ? (
          <>
            <span className="kid-checkbox__label">{children}</span>
            {control}
          </>
        ) : (
          <>
            {control}
            <span className="kid-checkbox__label">{children}</span>
          </>
        )}
      </label>
    );
  }

  return (
    <label className={`${mods} kid-checkbox--solo`}>
      {control}
    </label>
  );
}
