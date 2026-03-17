import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Target, Heart, Lightbulb, Users, Award, Briefcase, GraduationCap, ArrowRight } from 'lucide-react';
import './About.css';

const About = () => {
  const values = [
    {
      icon: <Target size={40} />,
      title: 'Innovation',
      description: 'We foster creative thinking and encourage students to push boundaries.'
    },
    {
      icon: <Heart size={40} />,
      title: 'Inclusion',
      description: 'Every child deserves access to quality STEAM education, regardless of background.'
    },
    {
      icon: <Lightbulb size={40} />,
      title: 'Hands-On Learning',
      description: 'Real projects and practical experience build lasting skills and confidence.'
    },
    {
      icon: <Users size={40} />,
      title: 'Community',
      description: 'We build a supportive community where students learn and grow together.'
    }
  ];

  const team = [
    {
      name: 'Damilola Fagoyinbo',
      role: 'Founder & Lead Instructor',
      bio: 'Electronic and Electrical Engineering graduate with 15+ years in software engineering, game development, and embedded systems expertise, passionate about empowering young minds through STEM.',
      credentials: [
        'B.Eng. Electronic & Electrical Engineering',
        '15+ Years in Software Engineering',
        'Former Game Company Founder',
        'Embedded Systems Expert',
        'Former University Robotics Instructor'
      ]
    }
  ];

  const achievements = [
    {
      icon: <Award size={32} />,
      title: 'Founded in 2026',
      description: 'New venture built on 15+ years of teaching and engineering experience'
    },
    {
      icon: <Users size={32} />,
      title: 'Growing Community',
      description: 'Started with 8 students, plus neighborhood kids in free classes'
    },
    {
      icon: <GraduationCap size={32} />,
      title: 'Proven Impact',
      description: 'Students represented Nigeria globally, neighborhood kids thriving in free classes'
    },
    {
      icon: <Briefcase size={32} />,
      title: 'Industry Expertise',
      description: '15+ years across software engineering, game development, and embedded systems'
    }
  ];

  return (
    <div className="about-page">
      {/* Hero Section */}
      <section className="about-hero">
        <div className="container">
          <motion.div
            className="about-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>About <span className="gradient-text">STEM</span>plitude</h1>
            <p>Empowering the next generation of innovators and problem solvers</p>
          </motion.div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="mission-vision">
        <div className="container">
          <div className="mission-grid">
          <motion.div
            className="mission-card"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2>Our Mission</h2>
            <p>
              To make high-quality STEAM education accessible, engaging, and impactful for every child 
              through a holistic, integrated learning journey. Every student enrolls in our complete STEAM package, 
              experiencing all five core disciplines (Coding, Robotics, Electronics, 3D Printing, and 3D Modelling), 
              progressing from foundational concepts to advanced mastery in each area as their skills develop. 
              We believe in learning by doing—building real projects that spark curiosity and create well-rounded 
              innovators over years, not weeks.
            </p>
          </motion.div>

            <motion.div
              className="vision-card"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2>Our Vision</h2>
              <p>
                A future where every young person has the skills, confidence, and creativity to shape 
                the world through technology. We're building a generation of innovators who will solve 
                tomorrow's challenges today.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="our-story">
        <div className="container">
          <motion.div
            className="story-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Our <span className="gradient-text">Story</span></h2>
            <p>
              STEMplitude was founded by Damilola Fagoyinbo, whose journey in STEM education began 
              during his university years when he had the privilege of teaching robotics to high school 
              students. That experience proved transformative—not just for him, but for his students who 
              went on to represent Nigeria in global robotics competitions. Witnessing firsthand the 
              profound impact that early exposure to STEM can have on young minds ignited a passion that 
              would shape his life's work.
            </p>
            <p>
              With a background in Electronic and Electrical Engineering and over 15 years of professional 
              experience spanning software engineering, embedded systems, and game development, Damilola 
              brings a comprehensive technical expertise to STEM education. After founding and building a 
              game company, where he combined creativity with cutting-edge technology, he gained deep 
              insights into what makes learning engaging and fun. His work with embedded systems—from 
              Arduino to advanced microcontrollers—gives him unique expertise in bridging the physical 
              and digital worlds, a skill he now uses to guide students from simple LEGO robots to 
              sophisticated embedded system projects.
            </p>
            <p>
              Throughout his career working with cutting-edge technologies and leading innovative projects, 
              his most rewarding work has always been closer to home—introducing his own children to the 
              wonders of STEM and opening his door to neighborhood kids, offering free lessons and mentorship 
              to any child eager to learn. His experience building games taught him how to make complex 
              concepts accessible and exciting, while his embedded systems expertise allows him to take 
              students on journeys from visual programming to controlling real-world hardware.
            </p>
            <p>
              These grassroots teaching experiences revealed a crucial insight: there were countless 
              children with incredible potential, hungry to learn coding, robotics, and technology, but 
              lacking access to quality STEM education. The impact was undeniable—kids who started with 
              simple LEGO builds were soon programming robots, those who began with Scratch were creating 
              sophisticated applications, and all were developing confidence, problem-solving skills, and 
              a belief in their own capabilities. The neighborhood kids who have been attending free 
              classes continue to thrive, with parents sharing stories of transformed interests, newfound 
              confidence, and children who now see themselves as creators and innovators.
            </p>
            <p>
              In 2026, Damilola decided it was time to formalize and scale this impact. STEMplitude was 
              born from a simple but powerful question: How can we provide more children with the same 
              transformative experience? Starting with 8 students, we're building something special—a 
              complete STEAM package where every student experiences all five core disciplines, progressing 
              from beginner to advanced levels across Coding, Robotics, Electronics, 3D Printing, and 3D Modelling. 
              Rather than choosing one path, our students gain mastery in all areas, moving from 
              visual programming to text-based coding, from LEGO builds to embedded systems, from basic 
              CAD to complex 3D designs—all at their own pace. This holistic approach draws from decades 
              of engineering experience, game design principles that keep learning engaging, and embedded 
              systems expertise that connects code to the real world.
            </p>
            <p>
              We're at the beginning of an exciting journey, and every student in our inaugural group is 
              helping shape what STEMplitude will become. Alongside our formal program, we continue the 
              tradition of free community classes for neighborhood kids, ensuring that access to quality 
              STEM education isn't limited by ability to pay. We're building on proven principles: 
              personalized attention, hands-on learning, progressive skill development, and an unwavering 
              belief that every child can be an innovator. Our students don't just learn—they create, and 
              soon they'll compete and showcase their work, carrying forward the same spirit that took 
              those early students to international competitions and that continues to inspire neighborhood 
              kids today. From these 8 formal students and our growing community of free class participants, 
              we're building something that will serve many more young innovators across Vancouver and beyond.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Core Values */}
      <section className="core-values">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Our <span className="gradient-text">Values</span></h2>
            <p>The principles that guide everything we do</p>
          </motion.div>

          <div className="values-grid">
            {values.map((value, index) => (
              <motion.div
                key={index}
                className="value-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="value-icon">{value.icon}</div>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Achievements */}
      <section className="achievements">
        <div className="container">
          <div className="achievements-grid">
            {achievements.map((achievement, index) => (
              <motion.div
                key={index}
                className="achievement-card"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="achievement-icon">{achievement.icon}</div>
                <h3>{achievement.title}</h3>
                <p>{achievement.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="team">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Meet Our <span className="gradient-text">Founder</span></h2>
            <p>Leading STEMplitude with passion and expertise</p>
          </motion.div>

          <div className="team-grid">
            {team.map((member, index) => (
              <motion.div
                key={index}
                className="team-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="team-avatar">
                  {member.name.charAt(0)}
                </div>
                <h3>{member.name}</h3>
                <p className="team-role">{member.role}</p>
                <p className="team-bio">{member.bio}</p>
                <ul className="team-credentials">
                  {member.credentials.map((cred, idx) => (
                    <li key={idx}>{cred}</li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="about-cta">
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Join Our <span className="gradient-text">Community</span></h2>
            <p>Be part of something bigger—where creativity meets engineering</p>
            <div className="cta-buttons">
              <Link to="/enrollment" className="btn btn-primary">
                Enroll Your Child <ArrowRight size={20} />
              </Link>
              <Link to="/contact" className="btn btn-secondary">
                Get in Touch
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default About;
