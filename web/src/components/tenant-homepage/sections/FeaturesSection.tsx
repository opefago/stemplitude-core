import { motion } from "framer-motion";
import { getBgFromContent, sectionBgStyle } from "../sectionBg";

interface FeatureItem {
  title?: string;
  description?: string;
  icon_url?: string;
}

interface FeaturesContent {
  heading?: string;
  items?: FeatureItem[];
  _bg?: unknown;
}

export function FeaturesSection({ content }: { content: FeaturesContent }) {
  const items = content.items || [];
  if (!items.length) return null;
  const bg = getBgFromContent(content as Record<string, unknown>);
  return (
    <section className="th-features" style={sectionBgStyle(bg)}>
      {content.heading && <h2 className="th-features__heading">{content.heading}</h2>}
      <div className="th-features__grid">
        {items.map((item, i) => (
          <motion.div
            key={i}
            className="th-features__card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
          >
            {item.icon_url && <img src={item.icon_url} alt="" className="th-features__icon" />}
            {item.title && <h3 className="th-features__title">{item.title}</h3>}
            {item.description && <p className="th-features__desc">{item.description}</p>}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
