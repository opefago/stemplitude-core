import { iconMap } from "@/components/icon-map";
import { SectionTitle } from "@/components/section-title";

type Capability = {
  title: string;
  description: string;
  icon: keyof typeof iconMap;
};

type CapabilitiesSectionProps = {
  items: readonly Capability[];
};

export function CapabilitiesSection({ items }: CapabilitiesSectionProps) {
  return (
    <section id="capabilities" className="border-t border-slate-800 bg-[#060d1f] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <SectionTitle
          eyebrow="Platform Capabilities"
          title="Everything needed to run interactive, guided learning at scale."
          description="Each capability is built to support hands-on learning operations from session setup through student outcomes."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const Icon = iconMap[item.icon];
            return (
              <article key={item.title} className="rounded-lg border border-slate-700 bg-[#0d152d] p-6 transition hover:border-slate-500">
                <span className="inline-flex rounded-md border border-slate-600 bg-slate-800 p-2 text-slate-200">
                  <Icon size={18} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
