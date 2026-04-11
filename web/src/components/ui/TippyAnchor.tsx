import {
  useEffect,
  useRef,
  type ReactElement,
} from "react";
import tippy, { type Instance, type Props } from "tippy.js";

/**
 * String-only tooltips without @tippyjs/react (avoids React 19 `element.ref` deprecation).
 * Wraps children in an inline-flex span; tippy attaches to that wrapper.
 */
export type TippyAnchorProps = {
  content: string;
  children: ReactElement;
} & Omit<Partial<Props>, "content">;

export function TippyAnchor({
  content,
  children,
  ...tippyOptions
}: TippyAnchorProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const instRef = useRef<Instance | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    instRef.current = tippy(el, {
      content,
      ...tippyOptions,
    });
    return () => {
      instRef.current?.destroy();
      instRef.current = null;
    };
    // Options are fixed for each call site (e.g. shared tipProps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    instRef.current?.setContent(content);
  }, [content]);

  return (
    <span
      ref={wrapRef}
      style={{
        display: "inline-flex",
        alignItems: "center",
        verticalAlign: "middle",
      }}
    >
      {children}
    </span>
  );
}
