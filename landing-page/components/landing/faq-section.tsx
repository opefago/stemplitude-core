import { SectionTitle } from "@/components/section-title";

type FaqItem = {
  question: string;
  answer: string;
};

type FaqSectionProps = {
  items: FaqItem[];
};

export function FaqSection({ items }: FaqSectionProps) {
  return (
    <section id="faq" className="border-t border-slate-800 bg-[#070f22] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <SectionTitle
          eyebrow="FAQ"
          title="Answers for teams evaluating LMS and guided learning tools."
          description="This section helps families, schools, and program operators quickly understand where Stemplitude fits."
        />
        <div className="mt-10 grid gap-4">
          {items.map((item) => (
            <details key={item.question} className="rounded-lg border border-slate-700 bg-[#0d152d] p-5">
              <summary className="cursor-pointer list-none text-base font-semibold text-white marker:hidden">
                {item.question}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
