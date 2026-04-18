import { getBgFromContent, sectionBgStyle } from "../sectionBg";

interface ImageItem {
  url?: string;
  alt?: string;
  caption?: string;
}

interface ImageGridContent {
  heading?: string;
  items?: ImageItem[];
  columns?: number;
  _bg?: unknown;
}

export function ImageGridSection({ content }: { content: ImageGridContent }) {
  const items = content.items || [];
  if (!items.length) return null;
  const cols = content.columns || 3;
  const bg = getBgFromContent(content as Record<string, unknown>);
  return (
    <section className="th-image-grid" style={sectionBgStyle(bg)}>
      {content.heading && <h2 className="th-image-grid__heading">{content.heading}</h2>}
      <div className="th-image-grid__grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {items.map((img, i) => (
          <figure key={i} className="th-image-grid__item">
            {img.url && <img src={img.url} alt={img.alt || ""} className="th-image-grid__img" />}
            {img.caption && <figcaption className="th-image-grid__caption">{img.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  );
}
