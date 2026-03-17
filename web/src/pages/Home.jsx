import { Link } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Code, Cpu, Zap, Printer, Box, ArrowRight, Calendar, Trophy, Star, Users } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import '../components/ReCaptcha.css';
import './Home.css';

const Home = () => {
  const [newsletterData, setNewsletterData] = useState({ name: '', email: '' });
  const [recaptchaValue, setRecaptchaValue] = useState(null);

  const handleNewsletterChange = (e) => {
    setNewsletterData({ ...newsletterData, [e.target.name]: e.target.value });
  };

  const handleRecaptchaChange = (value) => {
    setRecaptchaValue(value);
  };

  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    if (!recaptchaValue) {
      alert('Please complete the reCAPTCHA verification');
      return;
    }
    console.log('Newsletter signup:', newsletterData);
    // Add your newsletter integration here
    alert('Thank you for subscribing!');
    setNewsletterData({ name: '', email: '' });
    setRecaptchaValue(null);
  };
  const programs = [
    {
      id: 'coding',
      icon: <Code size={40} />,
      title: 'Coding',
      description: 'Progress from visual programming to advanced development at your own pace.',
      color: '#0066FF'
    },
    {
      id: 'robotics',
      icon: <Cpu size={40} />,
      title: 'Robotics',
      description: 'Start with LEGO, advance to embedded systems and competition robotics.',
      color: '#FF6B35'
    },
    {
      id: 'electronics',
      icon: <Zap size={40} />,
      title: 'Electronics',
      description: 'Build circuits and IoT projects with continuous skill progression.',
      color: '#0066FF'
    },
    {
      id: '3d-printing',
      icon: <Printer size={40} />,
      title: '3D Printing',
      description: 'Transform ideas into physical objects, from simple to complex designs.',
      color: '#FF6B35'
    },
    {
      id: '3d-modelling',
      icon: <Box size={40} />,
      title: '3D Modelling',
      description: 'Create stunning models and animations with progressive skill building.',
      color: '#0066FF'
    }
  ];

  const testimonials = [
    {
      name: 'Ola',
      role: 'Parent of 3 Children',
      text: 'The experience of my 3 children from the coding class was very positive. The classes were engaging, well structured, and age appropriate. My children developed a strong interest in coding, improved their problem-solving skills, and become more confident using technology. He was patient, encouraging, and explained concepts in a way the children could easily understand. We truly appreciate the impact the coding lessons had on our children and would gladly recommend him to other families.',
      rating: 5
    },
    {
      name: 'Marcus T.',
      role: 'Neighborhood Student - Free Classes',
      text: 'I started with simple LEGOs and now I\'m programming my own robot! Mr. Damilola makes everything fun and easy to understand.',
      rating: 5
    },
    {
      name: 'Lisa K.',
      role: 'Parent - Free Community Classes',
      text: 'My daughter has been attending the free neighborhood classes for months. The transformation in her confidence and interest in technology is amazing!',
      rating: 5
    }
  ];

  const stats = [
    { icon: <Users size={32} />, value: '8+', label: 'Students & Growing' },
    { icon: <Trophy size={32} />, value: '2026', label: 'Launched' },
    { icon: <Star size={32} />, value: '12', label: 'Students Per Class' },
    { icon: <Calendar size={32} />, value: '5', label: 'STEAM Disciplines' }
  ];

  return (
    <div className="home">
      {/* Hero Section with Banner Image */}
      <section className="hero">
        <div className="hero-banner-bg">
          <img 
            src="/children-making-robot.jpg" 
            alt="Children building robots and learning STEAM" 
            className="hero-banner-image"
          />
          <div className="hero-overlay"></div>
          <a 
            href="https://www.freepik.com/free-photo/children-making-robot_12557435.htm#fromView=search&page=6&position=48&uuid=7d7099ea-501f-40c6-9462-aa2036431fff&query=stem+coding"
            target="_blank"
            rel="noopener noreferrer"
            className="image-attribution"
          >
            Image by freepik
          </a>
        </div>

        <div className="container hero-content">
          <motion.div
            className="hero-text"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>
              Where Creativity <br />
              Meets <span className="gradient-text">Engineering</span>
            </h1>
            <p className="hero-subtitle">
              Complete STEAM package where students master all five disciplines—coding, robotics, electronics, 3D printing, and 3D modelling—progressing from beginner to advanced as they grow
            </p>
            <div className="hero-cta">
              <Link to="/enrollment" className="btn btn-primary">
                Enroll Now <ArrowRight size={20} />
              </Link>
              <Link to="/demo-days" className="btn btn-secondary">
                Book a Demo
              </Link>
            </div>
          </motion.div>

          {/* Bouncy Robot - Commented out for now
          <motion.div
            className="hero-visual"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="hero-image floating">
              <div className="robot-illustration">
                <div className="robot-head"></div>
                <div className="robot-body"></div>
                <div className="robot-arm robot-arm-left"></div>
                <div className="robot-arm robot-arm-right"></div>
              </div>
            </div>
          </motion.div>
          */}
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                className="stat-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="stat-icon">{stat.icon}</div>
                <h3>{stat.value}</h3>
                <p>{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Programs Section */}
      <section className="programs-section">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Our <span className="gradient-text">STEM</span> Programs</h2>
            <p>An integrated STEAM journey where students master all five disciplines</p>
          </motion.div>

          <div className="programs-grid">
            {programs.map((program, index) => (
              <motion.div
                key={index}
                className="program-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -10 }}
              >
                <div className="program-icon" style={{ color: program.color }}>
                  {program.icon}
                </div>
                <h3>{program.title}</h3>
                <p>{program.description}</p>
                <Link to={`/programs#${program.id}`} className="learn-more">
                  Learn More <ArrowRight size={16} />
                </Link>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="programs-cta"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Link to="/programs" className="btn btn-primary">
              View All Programs <ArrowRight size={20} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Camps Teaser */}
      <section className="camps-teaser">
        <div className="container">
          <div className="camps-content">
            <motion.div
              className="camps-text"
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2>Summer & Holiday <span className="gradient-text">Camps</span></h2>
              <p>
                Give your child an unforgettable learning experience during school breaks! 
                Our camps combine fun, creativity, and cutting-edge technology.
              </p>
              <ul className="camps-features">
                <li>✓ Full-day and half-day options</li>
                <li>✓ Ages 6-14 welcome</li>
                <li>✓ Project-based learning</li>
                <li>✓ Take-home creations</li>
              </ul>
              <div className="camps-buttons">
                <Link to="/camps" className="btn btn-accent">
                  Explore Camps <ArrowRight size={20} />
                </Link>
                <Link to="/contact" className="btn btn-secondary">
                  Enquire Now
                </Link>
              </div>
            </motion.div>

            <motion.div
              className="camps-visual"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="camp-card floating">
                <Calendar size={48} />
                <h3>Spring Break Camp</h3>
                <p>March 17-21, 2026</p>
              </div>
              <div className="camp-card floating" style={{ animationDelay: '1s' }}>
                <Calendar size={48} />
                <h3>Summer Camp</h3>
                <p>July - August 2026</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Demo Days Preview */}
      <section className="demo-days-preview">
        <div className="wide-container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Quarterly <span className="gradient-text">Demo Days</span></h2>
            <p>Watch your child showcase their projects and skills every quarter</p>
          </motion.div>

          <div className="demo-grid">
            <motion.div
              className="demo-card"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <div className="demo-image demo-image-blue">
                <Trophy size={64} />
              </div>
              <h3>Proven Track Record</h3>
              <p>Our founder's students represented Nigeria in global robotics competitions</p>
            </motion.div>

            <motion.div
              className="demo-card"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className="demo-image demo-image-blue">
                <Code size={64} />
              </div>
              <h3>Building Today</h3>
              <p>8 students plus neighborhood kids creating projects across all five STEAM disciplines</p>
            </motion.div>

            <motion.div
              className="demo-card"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className="demo-image demo-image-blue">
                <Calendar size={64} />
              </div>
              <h3>Quarterly Showcases</h3>
              <p>Students present their work to parents every quarter—first Demo Day in March 2026</p>
            </motion.div>
          </div>

          <motion.div
            className="demo-cta"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Link to="/demo-days" className="btn btn-secondary">
              Learn About Demo Days <ArrowRight size={20} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials-section">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>What Parents <span className="gradient-text">Say</span></h2>
            <p>Hear from families who've experienced STEMplitude</p>
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
                <div className="stars">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} size={20} fill="currentColor" />
                  ))}
                </div>
                <p>"{testimonial.text}"</p>
                <div className="testimonial-author">
                  <strong>{testimonial.name}</strong>
                  <span>{testimonial.role}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter/Contact Snippet */}
      <section className="newsletter-section">
        <div className="container">
          <motion.div
            className="newsletter-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Stay Updated</h2>
            <p>Get the latest news about programs, camps, and special events</p>
            <form className="newsletter-form" onSubmit={handleNewsletterSubmit}>
              <input 
                type="text" 
                name="name"
                placeholder="Your Name" 
                value={newsletterData.name}
                onChange={handleNewsletterChange}
                required 
              />
              <input 
                type="email" 
                name="email"
                placeholder="Your Email" 
                value={newsletterData.email}
                onChange={handleNewsletterChange}
                required 
              />
              <button type="submit" className="btn btn-primary">
                Subscribe <ArrowRight size={20} />
              </button>
            </form>
            <div className="recaptcha-container" style={{ marginTop: '1.5rem' }}>
              <ReCAPTCHA
                sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
                onChange={handleRecaptchaChange}
                theme="dark"
              />
            </div>
            <p className="newsletter-note">
              Or <Link to="/contact">contact us directly</Link> for more information
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Home;
