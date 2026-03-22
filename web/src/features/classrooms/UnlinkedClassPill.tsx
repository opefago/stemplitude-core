import { useEffect, useRef } from "react";
import { Link2Off } from "lucide-react";
import tippy from "tippy.js";

const UNLINKED_CLASS_TIP =
  "This class is not linked to a curriculum. Link it when editing the class to align lessons, assignments, and progress tracking.";

export function UnlinkedClassPill() {
  const tipRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = tipRef.current;
    if (!node) return;
    const instance = tippy(node, {
      content: UNLINKED_CLASS_TIP,
      placement: "top",
      delay: [120, 40],
      maxWidth: 300,
      appendTo: () => document.body,
      zIndex: 10000,
    });
    return () => {
      instance.destroy();
    };
  }, []);

  return (
    <span
      ref={tipRef}
      className="classroom-list__relationship-pill classroom-list__relationship-pill--muted classroom-list__relationship-pill--unlinked"
      tabIndex={0}
      aria-label={UNLINKED_CLASS_TIP}
    >
      <Link2Off size={14} strokeWidth={2.25} className="classroom-list__unlinked-icon" aria-hidden />
    </span>
  );
}
