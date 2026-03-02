import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, X, ArrowRight, DollarSign, Calendar, Users, BookOpen, Trophy } from 'lucide-react';
import './Pricing.css';

const Pricing = () => {
  const comparisonData = [
    {
      feature: 'Monthly Cost',
      stemplitude: '$150/month',
      competitors: '$200-$400/month',
      highlight: true
    },
    {
      feature: 'Sessions Per Week',
      stemplitude: '2 sessions',
      competitors: '1 session',
      highlight: true
    },
    {
      feature: 'Disciplines Included',
      stemplitude: 'All 5 STEAM disciplines',
      competitors: 'Single discipline only',
      highlight: true
    },
    {
      feature: 'Class Size',
      stemplitude: '12 students max',
      competitors: '15-20 students'
    },
    {
      feature: 'Progression Model',
      stemplitude: 'Continuous, at your pace',
      competitors: 'Fixed 8-12 week courses'
    },
    {
      feature: 'Demo Days',
      stemplitude: 'Quarterly showcases',
      competitors: 'End of term only'
    },
    {
      feature: 'Equipment & Materials',
      stemplitude: 'All included',
      competitors: 'Often extra cost'
    },
    {
      feature: 'Instructor Experience',
      stemplitude: '15+ years, game dev & embedded systems',
      competitors: 'Varies'
    }
  ];

  const benefits = [
    {
      icon: <DollarSign size={32} />,
      title: 'Better Value',
      description: 'More sessions, all disciplines, lower cost than single-subject competitors'
    },
    {
      icon: <BookOpen size={32} />,
      title: 'Complete Package',
      description: 'Coding, Robotics, Electronics, 3D Printing & Modelling - all included'
    },
    {
      icon: <Calendar size={32} />,
      title: 'Flexible Learning',
      description: 'No fixed course durations - progress at your own pace'
    },
    {
      icon: <Users size={32} />,
      title: 'Small Classes',
      description: 'Maximum 12 students for personalized attention'
    }
  ];

  return (
    <div className="pricing-page">
      {/* Hero Section */}
      <section className="pricing-hero">
        <div className="container">
          <motion.div
            className="pricing-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>Why <span className="gradient-text">STEMplitude</span>?</h1>
            <p className="hero-price">$150/month • 2 Sessions/Week • All 5 Disciplines</p>
            <p>More value, better learning, competitive pricing</p>
          </motion.div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="comparison-section">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>STEMplitude vs <span className="gradient-text">Typical Programs</span></h2>
            <p>See how we deliver more value for your investment</p>
          </motion.div>

          <div className="comparison-table-wrapper">
            <motion.table
              className="comparison-table"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="stemplitude-col">
                    <div className="col-header">
                      <span className="steam-blue">STEM</span><span className="plitude-orange">plitude</span>
                      <div className="badge">Best Value</div>
                    </div>
                  </th>
                  <th>Typical Programs</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, index) => (
                  <motion.tr
                    key={index}
                    className={row.highlight ? 'highlight-row' : ''}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <td className="feature-name">{row.feature}</td>
                    <td className="stemplitude-value">
                      <Check size={20} className="check-icon" />
                      {row.stemplitude}
                    </td>
                    <td className="competitor-value">
                      {row.competitors}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </motion.table>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="benefits-section">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Why Parents <span className="gradient-text">Choose Us</span></h2>
            <p>Exceptional value with comprehensive STEAM education</p>
          </motion.div>

          <div className="benefits-grid">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                className="benefit-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="benefit-icon">{benefit.icon}</div>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Breakdown */}
      <section className="pricing-breakdown">
        <div className="container">
          <motion.div
            className="breakdown-card"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Simple, Transparent Pricing</h2>
            <div className="price-display">
              <div className="price-amount">$150</div>
              <div className="price-period">per month</div>
            </div>
            
            <div className="whats-included">
              <h3>What's Included:</h3>
              <ul>
                <li><Check size={20} /> 8 sessions per month (2 per week)</li>
                <li><Check size={20} /> All 5 STEAM disciplines</li>
                <li><Check size={20} /> All materials and equipment</li>
                <li><Check size={20} /> Small class sizes (12 max)</li>
                <li><Check size={20} /> Continuous progression tracking</li>
                <li><Check size={20} /> Quarterly Demo Day participation</li>
                <li><Check size={20} /> Progress reports & certificates</li>
                <li><Check size={20} /> No hidden fees or extra costs</li>
              </ul>
            </div>

            <div className="price-comparison-note">
              <Trophy size={24} />
              <p>
                <strong>That's just $18.75 per session</strong> for comprehensive STEAM education across 
                all 5 disciplines - significantly less than competitors charging $25-$50 per session 
                for single subjects!
              </p>
            </div>

            <Link to="/enrollment" className="btn btn-primary btn-lg">
              Enroll Now <ArrowRight size={20} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pricing-cta">
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Ready to Give Your Child the <span className="gradient-text">STEMplitude</span> Advantage?</h2>
            <p>Join our growing community and see the difference comprehensive STEAM education makes</p>
            <div className="cta-buttons">
              <Link to="/enrollment" className="btn btn-primary">
                Start Enrollment <ArrowRight size={20} />
              </Link>
              <Link to="/contact" className="btn btn-secondary">
                Ask Questions
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Pricing;
