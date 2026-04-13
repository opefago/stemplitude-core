import Link from "next/link";
import { ArrowRight } from "lucide-react";

type HeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  trustPills: string[];
};

export function HeroSection({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  trustPills,
}: HeroProps) {
  const metrics = [
    { label: "Session readiness", value: "92% sample session coverage" },
    { label: "Learner engagement", value: "84% sample participation" },
    { label: "Pathway completion", value: "71% sample completion trend" },
    { label: "Instructor support alerts", value: "3 sample classes flagged" },
  ];

  return (
    <section className="bg-[#070d1f] pb-14 pt-14 md:pb-20 md:pt-20">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-10">
        <div>
          <p className="inline-flex items-center rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-200">
            {eyebrow}
          </p>
          <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-white md:text-6xl md:leading-[1.06]">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-300">{description}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={primaryCta.href}
              className="inline-flex items-center gap-2 rounded-md bg-azure px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#728eff]"
            >
              {primaryCta.label}
              <ArrowRight size={16} />
            </Link>
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center rounded-md border border-slate-600 bg-transparent px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-800/50"
            >
              {secondaryCta.label}
            </Link>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {trustPills.map((pill) => (
              <p
                key={pill}
                className="rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300"
              >
                {pill}
              </p>
            ))}
          </div>
        </div>

        <div>
          <div className="rounded-lg border border-slate-700 bg-[#0b1328] p-5">
            <div className="rounded-md border border-slate-700 bg-[#111a2e] p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-100">Program Dashboard</p>
                <span className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200">
                  Demo Preview
                </span>
              </div>
              <div className="space-y-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-md border border-slate-700 bg-[#151e3c] px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">{metric.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">Illustrative sample metrics for product visualization.</p>
            </div>
            <div className="mt-4 rounded-md border border-slate-700 bg-[#111a2e] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-300">Learning mix this month</p>
              <p className="mt-1 text-sm text-slate-100">STEM 56% • Innovation 24% • Guided Projects 20%</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
