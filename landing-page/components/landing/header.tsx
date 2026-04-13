"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

type NavLink = {
  label: string;
  href: string;
};

type HeaderProps = {
  links: NavLink[];
};

export function Header({ links }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const close = () => setIsOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700 bg-[#070d1f]/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 lg:px-10">
        <Link href="#" className="inline-flex items-center gap-2.5">
          <Image
            src="/images/logo.svg"
            alt="Stemplitude"
            width={30}
            height={30}
            priority
            className="h-7 w-7 rounded-sm object-contain"
          />
          <span className="text-base font-semibold tracking-tight text-white md:text-lg">Stemplitude</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-slate-200 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Link
            href="#final-cta"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
          >
            Book a Demo
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className="rounded-md p-2 text-slate-100 transition hover:bg-slate-800/70 md:hidden"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {isOpen ? (
        <div className="border-t border-slate-700 bg-[#070d1f] px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-4 text-sm text-slate-100">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={close} className="py-1.5">
                {link.label}
              </Link>
            ))}
            <Link
              href="#final-cta"
              onClick={close}
              className="mt-2 inline-flex w-fit rounded-md bg-white px-4 py-2 font-medium text-slate-900"
            >
              Book a Demo
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
