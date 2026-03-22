import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import "./labs.css";

interface LabWrapperProps {
  children: ReactNode;
}

export function LabWrapper({ children }: LabWrapperProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/app/labs");
  };

  const handleExit = () => {
    navigate("/app");
  };

  return (
    <div
      className="lab-wrapper"
      role="main"
      aria-label="Lab workspace"
    >
      <button
        type="button"
        className="lab-wrapper__back"
        onClick={handleBack}
        aria-label="Back to dashboard"
      >
        <ArrowLeft size={20} aria-hidden />
        Back to dashboard
      </button>
      <button
        type="button"
        className="lab-wrapper__exit"
        onClick={handleExit}
        aria-label="Exit lab"
      >
        <X size={20} aria-hidden />
      </button>
      <div className="lab-wrapper__content">{children}</div>
    </div>
  );
}
