import { SectionTitle } from "@/components/section-title";

type Step = {
  title: string;
  description: string;
};

type HowItWorksSectionProps = {
  steps: Step[];
};

export function HowItWorksSection({ steps }: HowItWorksSectionProps) {
  return (
    <section id="how-it-works" className="border-t border-slate-800 bg-[#070f22] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <SectionTitle
          eyebrow="How It Works"
          title="A practical flow for interactive learning delivery."
          description="From pathway setup to measurable outcomes, Stemplitude keeps execution structured while preserving creativity in the classroom."
        />
        <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-slate-700 bg-[#0d152d] p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
                Step {index + 1}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
