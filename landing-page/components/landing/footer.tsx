import Image from "next/image";
import Link from "next/link";

type FooterLink = {
  label: string;
  href: string;
};

type FooterProps = {
  links: FooterLink[];
};

export function Footer({ links }: FooterProps) {
  return (
    <footer className="border-t border-white/10 bg-[#040816] py-12">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 md:grid-cols-[1.3fr_1fr] lg:px-10">
        <div>
          <Image src="/images/logo.svg" alt="Stemplitude" width={168} height={36} className="h-7 w-auto" />
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
            A modern interactive learning platform for structured program delivery, hands-on engagement, and visible
            progress across STEM and beyond.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-4 md:justify-end">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-slate-300 transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-8 w-full max-w-7xl border-t border-white/10 px-6 pt-6 text-xs text-slate-500 lg:px-10">
        © {new Date().getFullYear()} Stemplitude, Inc. All rights reserved.
      </div>
    </footer>
  );
}
