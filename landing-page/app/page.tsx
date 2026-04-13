import { CapabilitiesSection } from "@/components/landing/capabilities-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FeaturedSection } from "@/components/landing/featured-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { OutcomesSection } from "@/components/landing/outcomes-section";
import { UseCasesSection } from "@/components/landing/use-cases-section";
import { WhySection } from "@/components/landing/why-section";
import {
  capabilities,
  experiences,
  faqs,
  footerLinks,
  hero,
  navLinks,
  outcomes,
  painPoints,
  steps,
  useCases,
} from "@/content/landing-content";

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Stemplitude",
        url: "https://stemplitude.com",
        email: "damilola@stemplitude.com",
      },
      {
        "@type": "WebSite",
        name: "Stemplitude",
        url: "https://stemplitude.com",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://stemplitude.com/?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "SoftwareApplication",
        name: "Stemplitude",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        description:
          "Interactive learning and guided program delivery platform for STEM programs, enrichment academies, tutoring organizations, and project-based education.",
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header links={navLinks} />
      <main>
        <HeroSection
          eyebrow={hero.eyebrow}
          title={hero.title}
          description={hero.description}
          primaryCta={hero.primaryCta}
          secondaryCta={hero.secondaryCta}
          trustPills={hero.trustPills}
        />
        <WhySection items={painPoints} />
        <CapabilitiesSection items={capabilities} />
        <UseCasesSection items={useCases} />
        <OutcomesSection groups={outcomes} />
        <HowItWorksSection steps={steps} />
        <FeaturedSection items={experiences} />
        <FaqSection items={faqs} />
        <FinalCtaSection />
      </main>
      <Footer links={footerLinks} />
    </div>
  );
}
