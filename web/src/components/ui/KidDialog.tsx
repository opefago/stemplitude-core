import { type ReactNode } from "react";
import { ModalDialog } from "./ModalDialog";

type KidDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
};

export function KidDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmDisabled = false,
}: KidDialogProps) {
  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeVariant="danger"
      contentClassName="kid-dialog__content"
      footer={
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
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="kid-button kid-button--danger kid-dialog__confirm"
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="kid-dialog__description">
        {description}
      </p>
    </ModalDialog>
  );
}
