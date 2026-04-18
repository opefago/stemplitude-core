import { getBgFromContent, sectionBgStyle } from "../sectionBg";

interface StatItem {
  label?: string;
  value?: string;
}

interface StatsContent {
  heading?: string;
  items?: StatItem[];
  _bg?: unknown;
}

export function StatsSection({ content }: { content: StatsContent }) {
  const items = content.items || [];
  if (!items.length) return null;
  const bg = getBgFromContent(content as Record<string, unknown>);
  return (
    <section className="th-stats" style={sectionBgStyle(bg)}>
      {content.heading && <h2 className="th-stats__heading">{content.heading}</h2>}
      <div className="th-stats__grid">
        {items.map((s, i) => (
          <div key={i} className="th-stats__item">
            {s.value && <span className="th-stats__value">{s.value}</span>}
            {s.label && <span className="th-stats__label">{s.label}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
