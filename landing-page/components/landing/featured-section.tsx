import Image from "next/image";
import { SectionTitle } from "@/components/section-title";

type Experience = {
  title: string;
  description: string;
  image: string;
};

type FeaturedSectionProps = {
  items: Experience[];
};

export function FeaturedSection({ items }: FeaturedSectionProps) {
  return (
    <section className="border-t border-slate-800 bg-[#060d1f] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <SectionTitle
          eyebrow="Featured Experiences"
          title="Modular learning environments built for expansion."
          description="Start with high-impact experiences now and evolve your catalog over time."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <article key={item.title} className="rounded-lg border border-slate-700 bg-[#0d152d] p-6">
              <div className="relative mb-4 h-44 overflow-hidden rounded-md border border-slate-700 bg-[#0c1530]">
                <Image
                  src={item.image}
                  alt={`${item.title} experience preview`}
                  fill
                  className="object-cover object-center transition duration-500 hover:scale-[1.02]"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
