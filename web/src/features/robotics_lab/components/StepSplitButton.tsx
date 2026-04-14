import { ChevronDown, StepForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface StepSplitButtonProps {
  onStep: () => void;
  onStepInto: () => void;
  onStepOver: () => void;
  className?: string;
}

export function StepSplitButton({ onStep, onStepInto, onStepOver, className = "" }: StepSplitButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onWindowPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!rootRef.current || !target) return;
      if (rootRef.current.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onWindowPointerDown);
    return () => window.removeEventListener("mousedown", onWindowPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className={`robotics-step-split ${className}`.trim()}>
      <button
        className="robotics-lab-btn robotics-lab-btn--icon"
        onClick={() => {
          onStep();
        }}
      >
        <StepForward size={16} /> Step
      </button>
      <button
        className="robotics-lab-btn robotics-lab-btn--icon robotics-step-split-toggle"
        aria-label="Open step actions"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="robotics-step-split-menu">
          <button
            className="robotics-step-split-item"
            onClick={() => {
              setOpen(false);
              onStepInto();
            }}
          >
            Step Into
          </button>
          <button
            className="robotics-step-split-item"
            onClick={() => {
              setOpen(false);
              onStepOver();
            }}
          >
            Step Over
          </button>
        </div>
      ) : null}
    </div>
  );
}

