import { getBgFromContent, sectionBgStyle } from "../sectionBg";

interface RichTextContent {
  html?: string;
  markdown?: string;
  _bg?: unknown;
}

export function RichTextSection({ content }: { content: RichTextContent }) {
  const bg = getBgFromContent(content as Record<string, unknown>);
  if (content.html) {
    return (
      <section className="th-richtext" style={sectionBgStyle(bg)}>
        <div className="th-richtext__inner" dangerouslySetInnerHTML={{ __html: content.html }} />
      </section>
    );
  }
  if (content.markdown) {
    return (
      <section className="th-richtext" style={sectionBgStyle(bg)}>
        <div className="th-richtext__inner">
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{content.markdown}</pre>
        </div>
      </section>
    );
  }
  return null;
}
