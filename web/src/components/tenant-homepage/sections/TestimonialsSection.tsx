import { getBgFromContent, sectionBgStyle } from "../sectionBg";

interface Testimonial {
  quote?: string;
  author?: string;
  role?: string;
  avatar_url?: string;
}

interface TestimonialsContent {
  heading?: string;
  items?: Testimonial[];
  _bg?: unknown;
}

export function TestimonialsSection({ content }: { content: TestimonialsContent }) {
  const items = content.items || [];
  if (!items.length) return null;
  const bg = getBgFromContent(content as Record<string, unknown>);
  return (
    <section className="th-testimonials" style={sectionBgStyle(bg)}>
      {content.heading && <h2 className="th-testimonials__heading">{content.heading}</h2>}
      <div className="th-testimonials__grid">
        {items.map((t, i) => (
          <blockquote key={i} className="th-testimonials__card">
            {t.quote && <p className="th-testimonials__quote">&ldquo;{t.quote}&rdquo;</p>}
            <footer className="th-testimonials__author">
              {t.avatar_url && <img src={t.avatar_url} alt="" className="th-testimonials__avatar" />}
              <div>
                {t.author && <strong>{t.author}</strong>}
                {t.role && <span className="th-testimonials__role">{t.role}</span>}
              </div>
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}
