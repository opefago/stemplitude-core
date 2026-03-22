import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  /** Sticky bottom area (e.g. Cancel / primary actions). Body scrolls independently. */
  footer?: ReactNode;
  contentClassName?: string;
  closeVariant?: "neutral" | "danger";
  disableClose?: boolean;
}

export function ModalDialog({
  isOpen,
  onClose,
  title,
  ariaLabel,
  children,
  footer,
  contentClassName = "",
  closeVariant = "neutral",
  disableClose = false,
}: ModalDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!disableClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, disableClose, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="ui-modal__backdrop"
      onClick={() => {
        if (!disableClose) onClose();
      }}
    >
      <div
        className={`ui-modal__content ${footer != null ? "ui-modal__content--with-footer" : ""} ${contentClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-modal__header">
          {title ? <h3 className="ui-modal__title">{title}</h3> : null}
          <button
            type="button"
            className={`ui-modal__close ui-modal__close--${closeVariant} ${
              title ? "" : "ui-modal__close--solo"
            }`.trim()}
            onClick={onClose}
            aria-label="Close dialog"
            disabled={disableClose}
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="ui-modal__body">{children}</div>
        {footer != null ? <div className="ui-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
