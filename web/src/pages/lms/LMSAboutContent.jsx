import { Link } from "react-router-dom";
import {
  Target,
  Heart,
  Lightbulb,
  Users,
  Award,
  Briefcase,
  GraduationCap,
  ArrowRight,
} from "lucide-react";

const values = [
  {
    icon: <Target size={28} />,
    title: "Innovation",
    description:
      "We foster creative thinking and encourage students to push boundaries.",
  },
  {
    icon: <Heart size={28} />,
    title: "Inclusion",
    description:
      "Every child deserves access to quality STEAM education, regardless of background.",
  },
  {
    icon: <Lightbulb size={28} />,
    title: "Hands-On Learning",
    description:
      "Real projects and practical experience build lasting skills and confidence.",
  },
  {
    icon: <Users size={28} />,
    title: "Community",
    description:
      "We build a supportive community where students learn and grow together.",
  },
];

const achievements = [
  {
    icon: <Award size={24} />,
    title: "Founded in 2026",
    description:
      "New venture built on 15+ years of teaching and engineering experience",
  },
  {
    icon: <Users size={24} />,
    title: "Growing Community",
    description:
      "Started with 8 students, plus neighborhood kids in free classes",
  },
  {
    icon: <GraduationCap size={24} />,
    title: "Proven Impact",
    description:
      "Students represented Nigeria globally, neighborhood kids thriving in free classes",
  },
  {
    icon: <Briefcase size={24} />,
    title: "Industry Expertise",
    description:
      "15+ years across software engineering, game development, and embedded systems",
  },
];

const founder = {
  name: "Damilola Fagoyinbo",
  role: "Founder & Lead Instructor",
  bio: "Electronic and Electrical Engineering graduate with 15+ years in software engineering, game development, and embedded systems expertise, passionate about empowering young minds through STEM.",
  credentials: [
    "B.Eng. Electronic & Electrical Engineering",
    "15+ Years in Software Engineering",
    "Former Game Company Founder",
    "Embedded Systems Expert",
    "Former University Robotics Instructor",
  ],
};

export default function LMSAboutContent() {
  return (
    <div className="lms-about-content">
      <section className="lms-about-content__block">
        <div className="lms-about-content__two-col">
          <article className="lms-about-content__panel">
            <h2>Our Mission</h2>
            <p>
              To make high-quality STEAM education accessible, engaging, and
              impactful for every child through a holistic, integrated learning
              journey. Every student enrolls in our complete STEAM package,
              experiencing all five core disciplines (Coding, Robotics,
              Electronics, 3D Printing, and 3D Modelling), progressing from
              foundational concepts to advanced mastery in each area as their
              skills develop. We believe in learning by doing-building real
              projects that spark curiosity and create well-rounded innovators
              over years, not weeks.
            </p>
          </article>
          <article className="lms-about-content__panel">
            <h2>Our Vision</h2>
            <p>
              A future where every young person has the skills, confidence, and
              creativity to shape the world through technology. We&apos;re
              building a generation of innovators who will solve tomorrow&apos;s
              challenges today.
            </p>
          </article>
        </div>
      </section>

      <section className="lms-about-content__block">
        <h2>Our Story</h2>
        <p>
          STEMplitude was founded by Damilola Fagoyinbo, whose journey in STEM
          education began during his university years when he had the privilege
          of teaching robotics to high school students. That experience proved
          transformative-not just for him, but for his students who went on to
          represent Nigeria in global robotics competitions. Witnessing
          firsthand the profound impact that early exposure to STEM can have on
          young minds ignited a passion that would shape his life&apos;s work.
        </p>
        <p>
          With a background in Electronic and Electrical Engineering and over 15
          years of professional experience spanning software engineering,
          embedded systems, and game development, Damilola brings a
          comprehensive technical expertise to STEM education. After founding
          and building a game company, where he combined creativity with
          cutting-edge technology, he gained deep insights into what makes
          learning engaging and fun. His work with embedded systems-from
          Arduino to advanced microcontrollers-gives him unique expertise in
          bridging the physical and digital worlds, a skill he now uses to
          guide students from simple LEGO robots to sophisticated embedded
          system projects.
        </p>
        <p>
          Throughout his career working with cutting-edge technologies and
          leading innovative projects, his most rewarding work has always been
          closer to home-introducing his own children to the wonders of STEM and
          opening his door to neighborhood kids, offering free lessons and
          mentorship to any child eager to learn. His experience building games
          taught him how to make complex concepts accessible and exciting, while
          his embedded systems expertise allows him to take students on journeys
          from visual programming to controlling real-world hardware.
        </p>
        <p>
          These grassroots teaching experiences revealed a crucial insight: there
          were countless children with incredible potential, hungry to learn
          coding, robotics, and technology, but lacking access to quality STEM
          education. The impact was undeniable-kids who started with simple LEGO
          builds were soon programming robots, those who began with Scratch were
          creating sophisticated applications, and all were developing
          confidence, problem-solving skills, and a belief in their own
          capabilities. The neighborhood kids who have been attending free
          classes continue to thrive, with parents sharing stories of
          transformed interests, newfound confidence, and children who now see
          themselves as creators and innovators.
        </p>
        <p>
          In 2026, Damilola decided it was time to formalize and scale this
          impact. STEMplitude was born from a simple but powerful question: How
          can we provide more children with the same transformative experience?
          Starting with 8 students, we&apos;re building something special-a
          complete STEAM package where every student experiences all five core
          disciplines, progressing from beginner to advanced levels across
          Coding, Robotics, Electronics, 3D Printing, and 3D Modelling. Rather
          than choosing one path, our students gain mastery in all areas, moving
          from visual programming to text-based coding, from LEGO builds to
          embedded systems, from basic CAD to complex 3D designs-all at their
          own pace. This holistic approach draws from decades of engineering
          experience, game design principles that keep learning engaging, and
          embedded systems expertise that connects code to the real world.
        </p>
        <p>
          We&apos;re at the beginning of an exciting journey, and every student in
          our inaugural group is helping shape what STEMplitude will become.
          Alongside our formal program, we continue the tradition of free
          community classes for neighborhood kids, ensuring that access to
          quality STEM education isn&apos;t limited by ability to pay. We&apos;re
          building on proven principles: personalized attention, hands-on
          learning, progressive skill development, and an unwavering belief that
          every child can be an innovator. Our students don&apos;t just learn-they
          create, and soon they&apos;ll compete and showcase their work, carrying
          forward the same spirit that took those early students to
          international competitions and that continues to inspire neighborhood
          kids today. From these 8 formal students and our growing community of
          free class participants, we&apos;re building something that will serve
          many more young innovators across Vancouver and beyond.
        </p>
      </section>

      <section className="lms-about-content__block">
        <h2>Our Values</h2>
        <div className="lms-about-content__grid">
          {values.map((value) => (
            <article key={value.title} className="lms-about-content__card">
              <div className="lms-about-content__card-icon">{value.icon}</div>
              <h3>{value.title}</h3>
              <p>{value.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lms-about-content__block">
        <h2>Highlights</h2>
        <div className="lms-about-content__grid">
          {achievements.map((item) => (
            <article key={item.title} className="lms-about-content__card">
              <div className="lms-about-content__card-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lms-about-content__block">
        <h2>Meet Our Founder</h2>
        <article className="lms-about-content__founder">
          <div className="lms-about-content__avatar" aria-hidden>
            {founder.name.charAt(0)}
          </div>
          <h3>{founder.name}</h3>
          <p className="lms-about-content__founder-role">{founder.role}</p>
          <p>{founder.bio}</p>
          <ul className="lms-about-content__list">
            {founder.credentials.map((cred) => (
              <li key={cred}>{cred}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="lms-about-content__cta">
        <h2>Join Our Community</h2>
        <p>Be part of something bigger-where creativity meets engineering.</p>
        <div className="lms-about-content__cta-actions">
          <Link to="/enrollment" className="lms-btn lms-btn--primary">
            Enroll Your Child <ArrowRight size={16} aria-hidden />
          </Link>
          <Link to="/contact" className="lms-btn lms-btn--outline">
            Get in Touch
          </Link>
        </div>
      </section>
    </div>
  );
}
