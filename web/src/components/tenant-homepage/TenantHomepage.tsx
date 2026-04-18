import type { PublicHomepageSection, PublicTenantBranding } from "../../lib/api/tenants";
import { HeroSection } from "./sections/HeroSection";
import { FeaturesSection } from "./sections/FeaturesSection";
import { CTASection } from "./sections/CTASection";
import { TestimonialsSection } from "./sections/TestimonialsSection";
import { RichTextSection } from "./sections/RichTextSection";
import { StatsSection } from "./sections/StatsSection";
import { ImageGridSection } from "./sections/ImageGridSection";
import "./TenantHomepage.css";

const SECTION_REGISTRY: Record<string, React.ComponentType<{ content: Record<string, unknown> }>> = {
  hero: HeroSection as React.ComponentType<{ content: Record<string, unknown> }>,
  features: FeaturesSection as React.ComponentType<{ content: Record<string, unknown> }>,
  cta: CTASection as React.ComponentType<{ content: Record<string, unknown> }>,
  testimonials: TestimonialsSection as React.ComponentType<{ content: Record<string, unknown> }>,
  richText: RichTextSection as React.ComponentType<{ content: Record<string, unknown> }>,
  stats: StatsSection as React.ComponentType<{ content: Record<string, unknown> }>,
  imageGrid: ImageGridSection as React.ComponentType<{ content: Record<string, unknown> }>,
};

interface TenantHomepageProps {
  sections: PublicHomepageSection[];
  branding?: PublicTenantBranding | null;
}

export function TenantHomepage({ sections, branding }: TenantHomepageProps) {
  const visibleSections = sections.filter((s) => s.visible !== false);

  return (
    <div
      className="tenant-homepage"
      style={{
        "--th-primary": branding?.primary_color || "#58cc02",
        "--th-accent": branding?.accent_color || "#1cb0f6",
      } as React.CSSProperties}
    >
      {visibleSections.map((section, i) => {
        const Component = SECTION_REGISTRY[section.type];
        if (!Component) return null;
        return <Component key={`${section.type}-${i}`} content={section.content} />;
      })}
    </div>
  );
}
