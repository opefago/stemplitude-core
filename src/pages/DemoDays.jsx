import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Medal, Award, Star, Users, Code, Cpu, Calendar, ArrowRight } from 'lucide-react';
import './DemoDays.css';

const DemoDays = () => {
  const founderAchievements = [
    {
      icon: <Trophy size={48} />,
      title: 'International Robotics Competition',
      date: 'Past Achievement',
      achievement: 'Nigeria Representation',
      description: 'When teaching at university, students went on to represent Nigeria in global robotics competitions, demonstrating the effectiveness of hands-on STEM education.',
      color: '#f59e0b'
    }
  ];

  const currentProjects = [
    {
      category: 'What Our Students Are Building',
      description: 'Our inaugural group of 8 students plus neighborhood kids are currently working on exciting projects across all our programs.',
      projects: [
        {
          title: 'LEGO Robotics Foundations',
          level: 'Beginner Level',
          description: 'Students learning mechanical design, basic programming, and problem-solving through LEGO builds.'
        },
        {
          title: 'First Coding Projects',
          level: 'Beginner to Intermediate',
          description: 'From Scratch animations to simple Python programs, students are creating their first interactive applications.'
        },
        {
          title: 'Electronics Exploration',
          level: 'Beginner Level',
          description: 'Building basic circuits, working with LEDs, and understanding how electricity powers our world.'
        },
        {
          title: '3D Design & Printing',
          level: 'All Levels',
          description: 'Students designing objects in Tinkercad and watching their digital creations become physical reality.'
        }
      ]
    }
  ];

  const quarterlyDemoDays = [
    {
      icon: <Calendar size={48} />,
      title: 'Q1 Demo Day',
      date: 'March 2026',
      description: 'First quarter showcase where students present their projects and demonstrate skills learned to parents and family.',
      color: '#6366f1'
    },
    {
      icon: <Users size={48} />,
      title: 'Q2 Demo Day',
      date: 'June 2026',
      description: 'Second quarter showcase featuring more advanced projects as students progress through their learning journey.',
      color: '#ec4899'
    },
    {
      icon: <Star size={48} />,
      title: 'Q3 Demo Day',
      date: 'September 2026',
      description: 'Third quarter showcase highlighting summer learning and camp projects completed during break.',
      color: '#10b981'
    },
    {
      icon: <Trophy size={48} />,
      title: 'Q4 Demo Day',
      date: 'December 2026',
      description: 'Year-end showcase celebrating a full year of learning, growth, and amazing student achievements.',
      color: '#f59e0b'
    }
  ];

  const testimonials = [
    {
      quote: "Seeing students I taught go on to compete internationally for Nigeria showed me the power of hands-on STEM education. That's what we're building here.",
      author: "Damilola Fagoyinbo",
      role: "Founder & Lead Instructor"
    },
    {
      quote: "My son comes home excited about every class. He's already building things I never thought a kid his age could do.",
      author: "Parent",
      role: "Inaugural Student Family"
    },
    {
      quote: "The free classes changed my perspective. I used to think technology was for other people, not for kids like me. Now I know I can be a creator too.",
      author: "Neighborhood Student",
      role: "Free Community Classes"
    }
  ];

  return (
    <div className="demo-days-page">
      {/* Hero Section */}
      <section className="demo-hero">
        <div className="container">
          <motion.div
            className="demo-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>
              Quarterly <span className="gradient-text">Demo Days</span>
            </h1>
            <p>Students showcase their skills and projects to parents every quarter</p>
          </motion.div>
        </div>
      </section>

      {/* Founder's Past Success */}
      <section className="competitions">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Proven <span className="gradient-text">Track Record</span></h2>
            <p>The founder's students have achieved international success</p>
          </motion.div>

          <div className="competitions-grid">
            {founderAchievements.map((achievement, index) => (
              <motion.div
                key={index}
                className="competition-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="competition-icon" style={{ color: achievement.color }}>
                  {achievement.icon}
                </div>
                <div className="achievement-badge" style={{ background: achievement.color }}>
                  {achievement.achievement}
                </div>
                <h3>{achievement.title}</h3>
                <p className="competition-date">{achievement.date}</p>
                <p className="competition-description">{achievement.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Current Student Projects */}
      <section className="demo-projects">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Current <span className="gradient-text">Learning</span></h2>
            <p>Our students are actively building skills and creating projects</p>
          </motion.div>

          {currentProjects.map((category, catIndex) => (
            <motion.div
              key={catIndex}
              className="project-category"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h3 className="category-title">
                <Code size={28} />
                {category.category}
              </h3>
              <p className="category-description">{category.description}</p>

              <div className="projects-grid">
                {category.projects.map((project, projIndex) => (
                  <motion.div
                    key={projIndex}
                    className="project-card"
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: projIndex * 0.1 }}
                  >
                    <h4>{project.title}</h4>
                    <p className="project-student">{project.level}</p>
                    <p className="project-description">{project.description}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Quarterly Demo Days */}
      <section className="upcoming-demos">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Quarterly <span className="gradient-text">Demo Days</span></h2>
            <p>Students showcase their skills and projects to parents every quarter</p>
          </motion.div>

          <div className="demo-days-info">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              Every quarter, we host a Demo Day where students present their projects, demonstrate what 
              they've learned, and celebrate their achievements with family. These events give students 
              valuable presentation experience while allowing parents to see their child's progress firsthand.
            </motion.p>
          </div>

          <div className="upcoming-grid">
            {quarterlyDemoDays.map((demoDay, index) => (
              <motion.div
                key={index}
                className="upcoming-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div style={{ color: demoDay.color }}>{demoDay.icon}</div>
                <h3>{demoDay.title}</h3>
                <p className="event-date">{demoDay.date}</p>
                <p>{demoDay.description}</p>
                <Link to="/contact" className="btn btn-secondary" style={{ marginTop: '1rem' }}>
                  Learn More
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="demo-testimonials">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>What People <span className="gradient-text">Say</span></h2>
          </motion.div>

          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                className="testimonial-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Star size={24} fill="currentColor" className="quote-icon" />
                <p className="testimonial-quote">"{testimonial.quote}"</p>
                <div className="testimonial-author">
                  <strong>{testimonial.author}</strong>
                  <span>{testimonial.role}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="demo-cta">
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>See Your Child Present at Our Next Demo Day</h2>
            <p>Join STEMplitude and watch your child showcase their projects and skills quarterly</p>
            <div className="cta-buttons">
              <Link to="/enrollment" className="btn btn-primary">
                Enroll Now <ArrowRight size={20} />
              </Link>
              <Link to="/contact" className="btn btn-secondary">
                Learn More About Demo Days
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default DemoDays;
