import { useEffect, useRef, type ReactNode } from "react";
import { Info } from "lucide-react";
import tippy from "tippy.js";

export function FieldInfoIcon({ content, ariaLabel }: { content: string; ariaLabel: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = btnRef.current;
    if (!node) return;
    const instance = tippy(node, {
      content,
      placement: "top",
      delay: [100, 40],
      maxWidth: 320,
      interactive: true,
      appendTo: () => document.body,
      zIndex: 10000,
    });
    return () => {
      instance.destroy();
    };
  }, [content]);

  return (
    <button type="button" ref={btnRef} className="classroom-list__field-info-btn" aria-label={ariaLabel}>
      <Info size={15} strokeWidth={2.25} aria-hidden />
    </button>
  );
}

export function ClassroomFormLabelRow({
  htmlFor,
  required,
  tip,
  ariaTopic,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  tip: string;
  ariaTopic: string;
  children: ReactNode;
}) {
  const labelBody = (
    <>
      {children}
      {required ? <span className="classroom-list__required">*</span> : null}
    </>
  );
  return (
    <div className="classroom-list__create-field-label-row">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="classroom-list__create-field-label-main">
          {labelBody}
        </label>
      ) : (
        <div className="classroom-list__create-field-label-main">{labelBody}</div>
      )}
      <FieldInfoIcon content={tip} ariaLabel={`More about ${ariaTopic}`} />
    </div>
  );
}
