import Link from "next/link";

export function FinalCtaSection() {
  return (
    <section id="final-cta" className="border-t border-slate-800 bg-[#060d1f] py-20">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <div className="rounded-lg border border-slate-700 bg-[#0d152d] p-8 md:p-12">
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Ready to create more engaging learning experiences?
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-200">
            See how Stemplitude helps your team deliver structured, hands-on learning across STEM and adjacent
            program models.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="mailto:damilola@stemplitude.com?subject=Stemplitude%20Demo%20Request"
              className="rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Schedule a Demo
            </Link>
            <Link
              href="mailto:damilola@stemplitude.com?subject=Talk%20to%20Stemplitude"
              className="rounded-md border border-slate-600 bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800/50"
            >
              Talk to Us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
