import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { getBgFromContent, getCtaBtnStyle, sectionBgStyle } from "../sectionBg";

interface HeroContent {
  title?: string;
  subtitle?: string;
  cta_text?: string;
  cta_link?: string;
  cta_visible?: boolean;
  background_image_url?: string;
  _bg?: unknown;
  _styles?: unknown;
}

export function HeroSection({ content }: { content: HeroContent }) {
  const rawBg = getBgFromContent(content as Record<string, unknown>);
  const bg = { ...rawBg, image_url: rawBg.image_url || content.background_image_url || undefined };
  const bgStyle = sectionBgStyle(bg);
  const btnStyle = getCtaBtnStyle(content as Record<string, unknown>);

  return (
    <section className="th-hero" style={bgStyle}>
      <div className="th-hero__inner">
        <motion.h1
          className="th-hero__title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {content.title || "Welcome"}
        </motion.h1>
        {content.subtitle && (
          <motion.p
            className="th-hero__subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {content.subtitle}
          </motion.p>
        )}
        {content.cta_text && content.cta_visible !== false && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Link to={content.cta_link || "/"} className="th-hero__cta" style={btnStyle}>
              {content.cta_text} <ArrowRight size={18} />
            </Link>
          </motion.div>
        )}
      </div>
    </section>
  );
}
