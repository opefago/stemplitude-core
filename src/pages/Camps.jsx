import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Clock, Users, Sparkles, Sun, Snowflake, Leaf, ArrowRight, Check } from 'lucide-react';
import './Camps.css';

const Camps = () => {
  const camps = [
    {
      season: 'Spring Break',
      icon: <Leaf size={48} />,
      dates: 'March 17-21, 2026',
      description: 'A week of creativity and innovation during spring break!',
      color: '#10b981',
      programs: [
        'Robotics Challenge Week',
        'Game Development Bootcamp',
        '3D Design & Printing Workshop',
        'Electronics & IoT Projects'
      ],
      pricing: {
        fullDay: '$450/week',
        halfDay: '$250/week'
      },
      schedule: {
        fullDay: '9:00 AM - 4:00 PM',
        halfDay: '9:00 AM - 12:30 PM'
      }
    },
    {
      season: 'Summer',
      icon: <Sun size={48} />,
      dates: 'July 7 - August 29, 2026',
      description: 'Eight weeks of amazing STEAM learning adventures!',
      color: '#f59e0b',
      programs: [
        'Coding & Game Design (Weeks 1-2)',
        'Robotics Competition Prep (Weeks 3-4)',
        'AI & Machine Learning (Weeks 5-6)',
        '3D Modelling & Animation (Weeks 7-8)'
      ],
      pricing: {
        fullDay: '$425/week',
        halfDay: '$225/week',
        fullSummer: '$3,200 (8 weeks)',
      },
      schedule: {
        fullDay: '8:30 AM - 4:30 PM',
        halfDay: '8:30 AM - 12:30 PM'
      }
    },
    {
      season: 'Winter Break',
      icon: <Snowflake size={48} />,
      dates: 'December 22 - January 3, 2027',
      description: 'Holiday-themed STEAM projects and winter fun!',
      color: '#6366f1',
      programs: [
        'Build Your Own Smart Holiday Lights',
        'Winter Wonderland 3D Design',
        'Code Your Own Snowflake Generator',
        'Robot Winter Olympics'
      ],
      pricing: {
        fullDay: '$500/week',
        halfDay: '$275/week'
      },
      schedule: {
        fullDay: '9:00 AM - 4:00 PM',
        halfDay: '9:00 AM - 12:30 PM'
      }
    }
  ];

  const campFeatures = [
    {
      icon: <Users size={40} />,
      title: 'Small Group Sizes',
      description: 'Maximum 12 campers per instructor for personalized attention'
    },
    {
      icon: <Sparkles size={40} />,
      title: 'Project-Based Learning',
      description: 'Every camper completes a project to take home and showcase'
    },
    {
      icon: <Clock size={40} />,
      title: 'Flexible Options',
      description: 'Full-day and half-day options to fit your family schedule'
    },
    {
      icon: <Calendar size={40} />,
      title: 'Multiple Weeks',
      description: 'Sign up for one week or multiple weeks throughout the season'
    }
  ];

  const whatToExpect = [
    'Daily hands-on STEAM activities',
    'Age-appropriate instruction (6-14 years)',
    'Industry-standard tools and equipment',
    'Healthy snacks provided (full-day camps)',
    'Take-home projects',
    'Certificate of completion',
    'Optional extended care available',
    'Photo updates for parents'
  ];

  return (
    <div className="camps-page">
      {/* Hero Section */}
      <section className="camps-hero">
        <div className="container">
          <motion.div
            className="camps-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>
              <span className="gradient-text">STEAM</span> Camps
            </h1>
            <p>Unforgettable learning experiences during school breaks</p>
          </motion.div>
        </div>
      </section>

      {/* Camp Features */}
      <section className="camp-features">
        <div className="container">
          <div className="features-grid">
            {campFeatures.map((feature, index) => (
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

      {/* Camp Details */}
      <section className="camps-detail">
        <div className="container">
          {camps.map((camp, index) => (
            <motion.div
              key={index}
              className="camp-detail-card"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className="camp-header" style={{ background: camp.color }}>
                <div className="camp-icon">{camp.icon}</div>
                <div className="camp-title">
                  <h2>{camp.season} Camp</h2>
                  <p className="camp-dates">{camp.dates}</p>
                </div>
              </div>

              <div className="camp-content">
                <p className="camp-description">{camp.description}</p>

                <div className="camp-info-grid">
                  <div className="camp-programs">
                    <h3>Weekly Programs</h3>
                    <ul>
                      {camp.programs.map((program, idx) => (
                        <li key={idx}>
                          <Check size={20} style={{ color: camp.color }} />
                          <span>{program}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="camp-details-box">
                    <div className="detail-section">
                      <h3>Schedule</h3>
                      <p><strong>Full Day:</strong> {camp.schedule.fullDay}</p>
                      <p><strong>Half Day:</strong> {camp.schedule.halfDay}</p>
                    </div>

                    <div className="detail-section">
                      <h3>Pricing</h3>
                      <p><strong>Full Day:</strong> {camp.pricing.fullDay}</p>
                      <p><strong>Half Day:</strong> {camp.pricing.halfDay}</p>
                      {camp.pricing.fullSummer && (
                        <p><strong>Full Summer:</strong> {camp.pricing.fullSummer}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="camp-cta">
                  <Link to="/enrollment" className="btn btn-primary">
                    Register for {camp.season} Camp <ArrowRight size={20} />
                  </Link>
                  <Link to="/contact" className="btn btn-secondary">
                    Ask Questions
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* What to Expect */}
      <section className="what-to-expect">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>What to <span className="gradient-text">Expect</span></h2>
            <p>Everything included in our camps</p>
          </motion.div>

          <div className="expect-grid">
            {whatToExpect.map((item, index) => (
              <motion.div
                key={index}
                className="expect-item"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <Check size={24} />
                <span>{item}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section className="camp-gallery">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Past Camp <span className="gradient-text">Highlights</span></h2>
            <p>See what campers created and experienced</p>
          </motion.div>

          <div className="gallery-grid">
            <motion.div
              className="gallery-item"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <div className="gallery-placeholder">
                <Users size={64} />
                <p>Students Building Robots</p>
              </div>
            </motion.div>

            <motion.div
              className="gallery-item"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className="gallery-placeholder">
                <Sparkles size={64} />
                <p>3D Printing Projects</p>
              </div>
            </motion.div>

            <motion.div
              className="gallery-item"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className="gallery-placeholder">
                <Calendar size={64} />
                <p>Coding Workshop</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="camps-final-cta">
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Secure Your Spot Today!</h2>
            <p>Camps fill up quickly. Register early to guarantee your child's place.</p>
            <div className="cta-buttons">
              <Link to="/enrollment" className="btn btn-primary">
                Register Now <ArrowRight size={20} />
              </Link>
              <Link to="/contact" className="btn btn-accent">
                Enquire About Camps
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Camps;
