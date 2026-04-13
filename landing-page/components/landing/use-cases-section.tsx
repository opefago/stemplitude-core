import { SectionTitle } from "@/components/section-title";

type UseCasesSectionProps = {
  items: string[];
};

export function UseCasesSection({ items }: UseCasesSectionProps) {
  return (
    <section id="use-cases" className="border-t border-slate-800 bg-[#070f22] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <SectionTitle
          eyebrow="Use Cases"
          title="A platform that flexes across program models."
          description="Stemplitude powers STEM delivery while staying broad enough for enrichment, tutoring, innovation labs, and guided project experiences."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item} className="rounded-lg border border-slate-700 bg-[#0d152d] p-6 transition hover:border-slate-500">
              <h3 className="text-lg font-semibold text-white">{item}</h3>
              <p className="mt-2 text-sm text-slate-300">
                Structured sessions, interactive learning, and progress visibility tailored to this delivery model.
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
