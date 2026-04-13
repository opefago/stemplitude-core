import { type ReactNode } from "react";
import { ModalDialog } from "./ModalDialog";

type KidDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  showActions?: boolean;
  closeVariant?: "neutral" | "danger";
  layout?: "default" | "fullscreen";
};

export function KidDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmDisabled = false,
  showActions = true,
  closeVariant = "danger",
  layout = "default",
}: KidDialogProps) {
  const contentClassName = `kid-dialog__content ${layout === "fullscreen" ? "kid-dialog__content--fullscreen" : ""}`.trim();
  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeVariant={closeVariant}
      contentClassName={contentClassName}
      footer={
        showActions ? (
          <div className="kid-dialog__actions">
            <button
              type="button"
              onClick={onClose}
              className="kid-button kid-button--ghost kid-dialog__cancel"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => onConfirm?.()}
              disabled={confirmDisabled}
              className="kid-button kid-button--danger kid-dialog__confirm"
            >
              {confirmLabel}
            </button>
          </div>
        ) : undefined
      }
    >
      {description ? <p className="kid-dialog__description">{description}</p> : null}
      {children}
    </ModalDialog>
  );
}
