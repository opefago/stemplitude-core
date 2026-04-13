import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://stemplitude.com"),
  title: "Stemplitude | Interactive Learning Program Platform",
  description:
    "Stemplitude is an interactive learning platform and guided program delivery system for STEM education, enrichment programs, and project-based learning.",
  keywords: [
    "LMS for STEM programs",
    "guided learning platform",
    "interactive learning platform",
    "STEM tools for schools",
    "project-based learning software",
    "education program delivery platform",
    "virtual STEM labs",
    "learning management system for enrichment",
  ],
  openGraph: {
    title: "Stemplitude | Interactive Learning Platform for STEM and Guided Programs",
    description:
      "Deliver engaging, hands-on learning with interactive labs, guided lessons, LMS-style delivery workflows, and measurable outcomes.",
    url: "https://stemplitude.com",
    siteName: "Stemplitude",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stemplitude | Interactive Learning Platform",
    description:
      "A modern platform for guided learning, STEM labs, and scalable program delivery across schools and enrichment organizations.",
  },
  alternates: {
    canonical: "https://stemplitude.com",
  },
  category: "education",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} bg-midnight font-sans text-slate-100 antialiased`}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
