import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Code, Cpu, Zap, Printer, Box, Check, ArrowRight, Users, Clock, Target, TrendingUp, RefreshCw } from 'lucide-react';
import './Programs.css';

const Programs = () => {
  const programs = [
    {
      id: 'coding',
      icon: <Code size={48} />,
      title: 'Coding',
      subtitle: 'Build the Future with Code',
      description: 'Begin your journey in software development with continuous progression from visual programming to advanced coding.',
      color: '#0066FF',
      ageGroups: '6-14 years',
      progression: [
        'Beginner (Ages 6-8): Scratch & Visual Programming',
        'Intermediate (Ages 9-11): Python & JavaScript Fundamentals',
        'Advanced (Ages 12-14): Web Development, Game Dev & Algorithms'
      ],
      skills: [
        'Visual Programming (Scratch, Blockly)',
        'Python & JavaScript',
        'Web Development (HTML, CSS, React)',
        'Game Development',
        'Problem-solving & Logic',
        'Software Design Patterns',
        'Version Control with Git'
      ],
      benefits: [
        'Continuous skill progression at your pace',
        'Build real-world applications',
        'Prepare for coding competitions',
        'Develop computational thinking',
        'Create a portfolio of projects'
      ]
    },
    {
      id: 'robotics',
      icon: <Cpu size={48} />,
      title: 'Robotics',
      subtitle: 'Design, Build, Program',
      description: 'Progress from LEGO robotics to advanced embedded systems, building increasingly complex robots along the way.',
      color: '#FF6B35',
      ageGroups: '6-14 years',
      progression: [
        'Beginner (Ages 6-8): LEGO WeDo & Simple Mechanisms',
        'Intermediate (Ages 9-11): LEGO Mindstorms & Arduino Basics',
        'Advanced (Ages 12-14): Embedded Systems, Raspberry Pi & Competition Robotics'
      ],
      skills: [
        'LEGO Robotics (WeDo, Mindstorms)',
        'Robot Design & Assembly',
        'Arduino & Raspberry Pi Programming',
        'Sensor Integration',
        'Motor Control Systems',
        'Embedded Systems',
        'Competition Strategy',
        'Team Collaboration'
      ],
      benefits: [
        'Progress from LEGOs to real embedded systems',
        'Compete in VEX & FIRST competitions',
        'Learn mechanical engineering basics',
        'Develop teamwork skills',
        'Win scholarships & recognition'
      ]
    },
    {
      id: 'electronics',
      icon: <Zap size={48} />,
      title: 'Electronics',
      subtitle: 'Circuit Design & Hardware',
      description: 'Explore circuits and electronic components with hands-on progression from basic circuits to complex IoT systems.',
      color: '#0066FF',
      ageGroups: '7-14 years',
      progression: [
        'Beginner (Ages 7-9): Basic Circuits & LED Projects',
        'Intermediate (Ages 10-12): Sensors, Motors & Breadboard Prototyping',
        'Advanced (Ages 13-14): PCB Design, Soldering & IoT Projects'
      ],
      skills: [
        'Circuit Design & Analysis',
        'Breadboard Prototyping',
        'LEDs, Sensors & Actuators',
        'Soldering Techniques',
        'Multimeter Usage',
        'PCB Design Basics',
        'IoT Integration'
      ],
      benefits: [
        'Build working electronic devices',
        'Understand electricity fundamentals',
        'Create IoT projects',
        'Prepare for engineering careers'
      ]
    },
    {
      id: '3d-printing',
      icon: <Printer size={48} />,
      title: '3D Printing',
      subtitle: 'From Digital to Physical',
      description: 'Transform digital designs into physical objects, progressing from simple prints to complex multi-part assemblies.',
      color: '#FF6B35',
      ageGroups: '6-14 years',
      progression: [
        'Beginner (Ages 6-8): Pre-designed Models & Simple Modifications',
        'Intermediate (Ages 9-11): Custom Design & Basic CAD',
        'Advanced (Ages 12-14): Complex Assemblies, Multi-material & Optimization'
      ],
      skills: [
        'Tinkercad & Fusion 360',
        '3D Printer Operation',
        'STL File Preparation',
        'Print Settings Optimization',
        'Post-Processing Techniques',
        'Material Selection',
        'Troubleshooting Print Issues'
      ],
      benefits: [
        'Create physical prototypes',
        'Learn manufacturing processes',
        'Design custom products',
        'Explore rapid prototyping'
      ]
    },
    {
      id: '3d-modelling',
      icon: <Box size={48} />,
      title: '3D Modelling',
      subtitle: 'Create Stunning 3D Worlds',
      description: 'Design 3D models and animations, advancing from basic shapes to professional-quality renders and animations.',
      color: '#0066FF',
      ageGroups: '8-14 years',
      progression: [
        'Beginner (Ages 8-10): Basic Shapes & Tinkercad',
        'Intermediate (Ages 11-12): Blender Modeling & Texturing',
        'Advanced (Ages 13-14): Animation, Rendering & Character Design'
      ],
      skills: [
        'Tinkercad for Beginners',
        'Blender Mastery',
        '3D Modeling Techniques',
        'Texturing & Materials',
        'Animation Basics',
        'Rendering & Lighting',
        'Character Design'
      ],
      benefits: [
        'Create game assets',
        'Design for 3D printing',
        'Build animation skills',
        'Develop spatial reasoning'
      ]
    }
  ];

  const workshopFeatures = [
    {
      icon: <Users size={32} />,
      title: 'Small Class Sizes',
      description: '12 students per class for personalized attention'
    },
    {
      icon: <Clock size={32} />,
      title: 'Flexible Scheduling',
      description: 'After-school programs, weekend sessions, and online classes'
    },
    {
      icon: <Target size={32} />,
      title: 'Progressive Learning',
      description: 'Advance through skill levels at your own pace with continuous support'
    }
  ];

  return (
    <div className="programs-page">
      {/* Hero Section */}
      <section className="programs-hero">
        <div className="container">
          <motion.div
            className="programs-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>Our <span className="gradient-text">STEAM</span> Programs</h1>
            <p>Complete STEAM package where every student masters all five disciplines—from beginner to advanced</p>
          </motion.div>
        </div>
      </section>

      {/* Integrated Curriculum Explanation */}
      <section className="curriculum-explanation">
        <div className="container">
          <motion.div
            className="explanation-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>How Our <span className="gradient-text">Complete STEAM Package</span> Works</h2>
            <p className="explanation-intro">
              At STEMplitude, enrollment includes all five STEAM disciplines in one complete package. 
              Every student participates in Coding, Robotics, Electronics, 3D Printing, and 3D Modelling, 
              progressing from beginner to advanced levels in each area as they gain mastery.
            </p>
            <div className="explanation-grid">
              <div className="explanation-card">
                <h3>
                  <span className="explanation-icon">
                    <Target size={24} />
                  </span>
                  Holistic Learning
                </h3>
                <p>Students rotate through all disciplines, ensuring well-rounded technical skills that mirror real-world innovation</p>
              </div>
              <div className="explanation-card">
                <h3>
                  <span className="explanation-icon">
                    <TrendingUp size={24} />
                  </span>
                  Individual Progression
                </h3>
                <p>Advance at your own pace in each area—you might be advanced in Coding while still a beginner in 3D Modelling</p>
              </div>
              <div className="explanation-card">
                <h3>
                  <span className="explanation-icon">
                    <RefreshCw size={24} />
                  </span>
                  Continuous Growth
                </h3>
                <p>No fixed durations—stay with us for years, mastering each discipline from foundational concepts to advanced applications</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Workshop Features */}
      <section className="workshop-features">
        <div className="container">
          <div className="features-grid">
            {workshopFeatures.map((feature, index) => (
              <motion.div
                key={index}
                className="feature-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Programs Detail */}
      <section className="programs-detail">
        <div className="container">
          {programs.map((program, index) => (
            <motion.div
              key={program.id}
              id={program.id}
              className="program-detail-card"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className="program-detail-header" style={{ borderColor: program.color }}>
                <div className="program-detail-icon" style={{ color: program.color }}>
                  {program.icon}
                </div>
                <div className="program-detail-title">
                  <h2>{program.title}</h2>
                  <p className="program-subtitle">{program.subtitle}</p>
                </div>
              </div>

              <p className="program-description">{program.description}</p>

              <div className="program-meta">
                <div className="meta-item">
                  <strong>Age Groups:</strong> {program.ageGroups}
                </div>
                <div className="meta-item">
                  <strong>Learning Model:</strong> Continuous progression at your own pace
                </div>
              </div>

              <div className="program-progression">
                <h3>Learning Progression</h3>
                <ul>
                  {program.progression.map((level, idx) => (
                    <li key={idx}>
                      <Check size={20} style={{ color: program.color }} />
                      <span>{level}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="program-content-grid">
                <div className="program-skills">
                  <h3>What You'll Learn</h3>
                  <ul>
                    {program.skills.map((skill, idx) => (
                      <li key={idx}>
                        <Check size={20} style={{ color: program.color }} />
                        <span>{skill}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="program-benefits">
                  <h3>Program Benefits</h3>
                  <ul>
                    {program.benefits.map((benefit, idx) => (
                      <li key={idx}>
                        <Check size={20} style={{ color: program.color }} />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="program-cta">
                <Link to="/contact" className="btn btn-secondary">
                  Ask Questions <ArrowRight size={20} />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="programs-final-cta">
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Ready to Start Your <span className="gradient-text">STEAM</span> Journey?</h2>
            <p>Join our complete STEAM package where you'll master all five disciplines</p>
            <div className="cta-buttons">
              <Link to="/enrollment" className="btn btn-primary">
                Enroll Now <ArrowRight size={20} />
              </Link>
              <Link to="/demo-days" className="btn btn-secondary">
                Book a Demo
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Programs;
