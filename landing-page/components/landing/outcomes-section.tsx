import { CheckCircle2 } from "lucide-react";
import { SectionTitle } from "@/components/section-title";

type OutcomeGroup = {
  audience: string;
  items: string[];
};

type OutcomesSectionProps = {
  groups: OutcomeGroup[];
};

export function OutcomesSection({ groups }: OutcomesSectionProps) {
  return (
    <section className="border-t border-slate-800 bg-[#060d1f] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <SectionTitle
          eyebrow="Benefits & Outcomes"
          title="Clear value for every stakeholder in the learning journey."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {groups.map((group) => (
            <article key={group.audience} className="rounded-lg border border-slate-700 bg-[#0d152d] p-6">
              <h3 className="text-lg font-semibold text-white">{group.audience}</h3>
              <ul className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 size={16} className="mt-[1px] shrink-0 text-slate-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
