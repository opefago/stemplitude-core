import { type ReactElement, type ReactNode } from "react";
import Tippy, { type TippyProps } from "@tippyjs/react";
import "tippy.js/dist/tippy.css";
import "./ui.css";

type AppTooltipTheme = "cartoon" | "light";

export interface AppTooltipProps {
  children: ReactElement;
  title?: string;
  description?: string;
  media?: ReactNode;
  content?: ReactNode;
  theme?: AppTooltipTheme;
  placement?: TippyProps["placement"];
  disabled?: boolean;
  tippyProps?: Partial<TippyProps>;
}

export function AppTooltip({
  children,
  title,
  description,
  media,
  content,
  theme = "cartoon",
  placement = "bottom",
  disabled = false,
  tippyProps,
}: AppTooltipProps) {
  const hasStructuredContent = Boolean(title || description || media);
  const resolvedContent =
    content ??
    (hasStructuredContent ? (
      <div className="ui-tooltip__content">
        {media ? <div className="ui-tooltip__media">{media}</div> : null}
        {title ? <strong className="ui-tooltip__title">{title}</strong> : null}
        {description ? (
          <span className="ui-tooltip__description">{description}</span>
        ) : null}
      </div>
    ) : null);

  if (disabled || !resolvedContent) return children;

  /* Tippy must attach ref to a host DOM node. In React 19, refs on composite
   * children (e.g. react-router Link) are regular props — @tippyjs/react still
   * reads element.ref internally, which triggers a deprecation warning. */
  return (
    <Tippy
      content={resolvedContent}
      placement={placement}
      animation="fade"
      delay={[100, 50]}
      duration={[160, 120]}
      maxWidth={340}
      interactive={false}
      offset={[0, 10]}
      appendTo={() => document.body}
      theme={theme === "cartoon" ? "ui-kid-tooltip" : "ui-light-tooltip"}
      {...tippyProps}
    >
      <span className="ui-tooltip__ref-anchor">{children}</span>
    </Tippy>
  );
}

