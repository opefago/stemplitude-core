import { SectionTitle } from "@/components/section-title";

type Testimonial = {
  quote: string;
  name: string;
  org: string;
};

type TrustSectionProps = {
  testimonials: Testimonial[];
};

export function TrustSection({ testimonials }: TrustSectionProps) {
  return (
    <section className="border-t border-white/10 bg-[#060d21] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <SectionTitle
          eyebrow="Trust & Proof"
          title="Built for modern learning programs."
          description="Use this section to swap in logos, quantified outcomes, and verified partner testimonials as the platform grows."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {testimonials.map((testimonial) => (
            <blockquote key={testimonial.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-base leading-relaxed text-slate-200">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <footer className="mt-4 text-sm text-slate-400">
                {testimonial.name} • {testimonial.org}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
