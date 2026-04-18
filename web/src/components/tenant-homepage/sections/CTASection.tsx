import { Link } from "react-router-dom";
import { getBgFromContent, getCtaBtnStyle, sectionBgStyle } from "../sectionBg";

interface CTAContent {
  heading?: string;
  description?: string;
  button_text?: string;
  button_link?: string;
  button_visible?: boolean;
  _bg?: unknown;
  _styles?: unknown;
}

export function CTASection({ content }: { content: CTAContent }) {
  const bg = getBgFromContent(content as Record<string, unknown>);
  const btnStyle = getCtaBtnStyle(content as Record<string, unknown>);
  return (
    <section className="th-cta" style={sectionBgStyle(bg)}>
      <div className="th-cta__inner">
        {content.heading && <h2 className="th-cta__heading">{content.heading}</h2>}
        {content.description && <p className="th-cta__desc">{content.description}</p>}
        {content.button_text && content.button_visible !== false && (
          <Link to={content.button_link || "/"} className="th-cta__btn" style={btnStyle}>
            {content.button_text}
          </Link>
        )}
      </div>
    </section>
  );
}
