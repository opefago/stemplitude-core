import { SectionTitle } from "@/components/section-title";

type WhySectionProps = {
  items: Array<{ title: string; description: string }>;
};

export function WhySection({ items }: WhySectionProps) {
  return (
    <section id="why-stemplitude" className="border-t border-slate-800 bg-[#070f22] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <SectionTitle
          eyebrow="Why Stemplitude"
          title="Program delivery challenges are operational problems, not just curriculum problems."
          description="Stemplitude is designed to remove friction across planning, facilitation, engagement, and reporting so learning organizations can grow without losing quality."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <article key={item.title} className="rounded-lg border border-slate-700 bg-[#0d152d] p-6">
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
