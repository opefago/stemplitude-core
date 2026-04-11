import { Link } from "react-router-dom";
import LMSStaticHeader from "./LMSStaticHeader";
import LMSAboutContent from "./LMSAboutContent";
import "../LMSHome.css";
import "./lms-marketing-page.css";

const PAGE_CONTENT = {
  learning: {
    eyebrow: "Learning",
    title: "Hands-On STEM Learning",
    body: "Interactive coding, robotics, electronics, and design experiences built for kids.",
  },
  programs: {
    eyebrow: "Programs",
    title: "Programs for Every Learner",
    body: "Structured paths that grow with students from beginner to advanced explorer.",
  },
  camps: {
    eyebrow: "Camps",
    title: "STEM Camps",
    body: "Seasonal camps with project-based activities, team challenges, and demos.",
  },
  "demo-days": {
    eyebrow: "Showcase",
    title: "Demo Days",
    body: "Students present what they build to parents, peers, and the wider community.",
  },
  pricing: {
    eyebrow: "Plans",
    title: "Simple Pricing",
    body: "Flexible options for families, tutors, and STEM centers.",
  },
  about: {
    eyebrow: "About",
    title: "About Stemplitude",
    body: "We help kids build real STEM skills through creativity, projects, and play.",
  },
  contact: {
    eyebrow: "Contact",
    title: "Contact Us",
    body: "Questions, partnerships, or support requests - we are here to help.",
  },
  enrollment: {
    eyebrow: "Enrollment",
    title: "Enrollment",
    body: "Start your child’s STEM journey with guided onboarding and placement.",
  },
  faq: {
    eyebrow: "FAQ",
    title: "Frequently Asked Questions",
    body: "Answers for parents, students, and educators using Stemplitude.",
  },
};

export default function LMSMarketingPage({ pageKey }) {
  const content = PAGE_CONTENT[pageKey] || PAGE_CONTENT.about;
  const isAbout = pageKey === "about";

  return (
    <div className="lms-marketing-page">
      <LMSStaticHeader solidHero />
      <main className="lms-marketing-page__main" role="main">
        <section className="lms-marketing-page__hero">
          <p className="lms-marketing-page__eyebrow">{content.eyebrow}</p>
          <h1 className="lms-marketing-page__title">{content.title}</h1>
          <p className="lms-marketing-page__body">{content.body}</p>
        </section>

        {isAbout ? (
          <LMSAboutContent />
        ) : (
          <section className="lms-marketing-page__card">
            <h2>Fresh page, consistent header</h2>
            <p>
              This route now uses the same modern Stemplitude header style as
              the homepage. Legacy marketing views are no longer used for this
              page.
            </p>
            <div className="lms-marketing-page__actions">
              <Link to="/" className="lms-btn lms-btn--primary">
                Back Home
              </Link>
              <Link to="/explore" className="lms-btn lms-btn--outline">
                Explore Games
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
