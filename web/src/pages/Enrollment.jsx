import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, CreditCard, Calendar, Users, Shield, ArrowRight } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import '../components/ReCaptcha.css';
import './Enrollment.css';

const Enrollment = () => {
  const [formData, setFormData] = useState({
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    childName: '',
    childAge: '',
    program: '',
    sessionType: '',
    startDate: '',
    medicalInfo: '',
    emergencyContact: '',
    emergencyPhone: ''
  });

  const [step, setStep] = useState(1);
  const [enrolled, setEnrolled] = useState(false);
  const [recaptchaValue, setRecaptchaValue] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRecaptchaChange = (value) => {
    setRecaptchaValue(value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!recaptchaValue) {
      alert('Please complete the reCAPTCHA verification');
      return;
    }
    
    // Here you would integrate with Stripe and Airtable
    console.log('Enrollment submitted:', formData);
    console.log('reCAPTCHA token:', recaptchaValue);
    setEnrolled(true);
  };

  const programs = [
    { name: 'Coding - Beginner (Ages 6-8)', price: '$249/month' },
    { name: 'Coding - Intermediate (Ages 9-11)', price: '$279/month' },
    { name: 'Coding - Advanced (Ages 12-14)', price: '$299/month' },
    { name: 'Robotics - LEGO Beginner (Ages 6-8)', price: '$279/month' },
    { name: 'Robotics - Mindstorms (Ages 9-11)', price: '$299/month' },
    { name: 'Robotics - Embedded Systems (Ages 12-14)', price: '$349/month' },
    { name: 'Electronics - Beginner (Ages 7-9)', price: '$249/month' },
    { name: 'Electronics - Intermediate (Ages 10-12)', price: '$279/month' },
    { name: 'Electronics - Advanced (Ages 13-14)', price: '$299/month' },
    { name: '3D Printing - All Levels', price: '$249/month' },
    { name: '3D Modelling - Beginner (Ages 8-10)', price: '$249/month' },
    { name: '3D Modelling - Advanced (Ages 11-14)', price: '$279/month' },
    { name: 'AI - Beginner (Ages 10-11)', price: '$299/month' },
    { name: 'AI - Advanced (Ages 12-14)', price: '$349/month' }
  ];

  const camps = [
    { name: 'Spring Break Camp - Full Day', price: '$450/week' },
    { name: 'Spring Break Camp - Half Day', price: '$250/week' },
    { name: 'Summer Camp - Full Day', price: '$425/week' },
    { name: 'Summer Camp - Half Day', price: '$225/week' },
    { name: 'Winter Break Camp - Full Day', price: '$500/week' },
    { name: 'Winter Break Camp - Half Day', price: '$275/week' }
  ];

  const sessionTypes = [
    'After-School Program (Weekdays)',
    'Weekend Workshop (Saturdays)',
    'Online Sunday Class',
    'Private Tutoring'
  ];

  const enrollmentSteps = [
    {
      icon: <Users size={32} />,
      title: 'Complete Registration',
      description: 'Fill out enrollment form with student information'
    },
    {
      icon: <Calendar size={32} />,
      title: 'Pick Schedule',
      description: 'Choose the session type and start date'
    },
    {
      icon: <CreditCard size={32} />,
      title: 'Complete Payment',
      description: 'Secure monthly subscription via Stripe'
    },
    {
      icon: <Check size={32} />,
      title: 'Begin Learning',
      description: 'Start your continuous learning journey'
    }
  ];

  const benefits = [
    'Complete STEAM package - All 5 core disciplines included',
    'Progress at your own pace in each area',
    'Small class sizes (12 students per class)',
    'Industry-standard tools and equipment',
    'Experienced instructor with 15+ years expertise',
    'Continuous progression tracking across all disciplines',
    'Progress reports and assessments',
    'Level advancement as skills develop in each area',
    'Certificate at each level completion',
    'Quarterly Demo Day showcase opportunity',
    'Parent portal access',
    'Flexible scheduling options',
    'No fixed duration - master all disciplines over time'
  ];

  if (enrolled) {
    return (
      <div className="enrollment-page">
        <section className="enrollment-success">
          <div className="container">
            <motion.div
              className="success-content"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="success-icon">
                <Check size={64} />
              </div>
              <h1>Enrollment Successful!</h1>
              <p>Thank you for enrolling at STEMplitude. We've sent a confirmation email to {formData.parentEmail}.</p>
              <div className="success-details">
                <h3>What's Next?</h3>
                <ul>
                  <li>Check your email for enrollment confirmation</li>
                  <li>You'll receive class details and access to parent portal</li>
                  <li>First class starts on {formData.startDate}</li>
                  <li>Our team will contact you within 24 hours</li>
                </ul>
              </div>
              <Link to="/" className="btn btn-primary">
                Back to Home <ArrowRight size={20} />
              </Link>
            </motion.div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="enrollment-page">
      {/* Hero Section */}
      <section className="enrollment-hero">
        <div className="container">
          <motion.div
            className="enrollment-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>Enroll <span className="gradient-text">Today</span></h1>
            <p>Join our complete STEAM package where your child will master all five disciplines</p>
          </motion.div>
        </div>
      </section>

      {/* Enrollment Steps */}
      <section className="enrollment-steps">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>How <span className="gradient-text">Enrollment</span> Works</h2>
          </motion.div>

          <div className="steps-grid">
            {enrollmentSteps.map((step, index) => (
              <motion.div
                key={index}
                className="step-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="step-number">{index + 1}</div>
                <div className="step-icon">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Enrollment Form */}
      <section className="enrollment-form-section">
        <div className="container">
          <div className="enrollment-layout">
            <motion.div
              className="form-wrapper"
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2>Enrollment Form</h2>
              <form onSubmit={handleSubmit} className="enrollment-form">
                {/* Parent Information */}
                <div className="form-section">
                  <h3>Parent/Guardian Information</h3>
                  <div className="form-group">
                    <label htmlFor="parentName">Full Name *</label>
                    <input
                      type="text"
                      id="parentName"
                      name="parentName"
                      value={formData.parentName}
                      onChange={handleChange}
                      required
                      placeholder="John Doe"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="parentEmail">Email *</label>
                      <input
                        type="email"
                        id="parentEmail"
                        name="parentEmail"
                        value={formData.parentEmail}
                        onChange={handleChange}
                        required
                        placeholder="john@example.com"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="parentPhone">Phone *</label>
                      <input
                        type="tel"
                        id="parentPhone"
                        name="parentPhone"
                        value={formData.parentPhone}
                        onChange={handleChange}
                        required
                        placeholder="(604) 555-0123"
                      />
                    </div>
                  </div>
                </div>

                {/* Child Information */}
                <div className="form-section">
                  <h3>Student Information</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="childName">Child's Name *</label>
                      <input
                        type="text"
                        id="childName"
                        name="childName"
                        value={formData.childName}
                        onChange={handleChange}
                        required
                        placeholder="Jane Doe"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="childAge">Age *</label>
                      <input
                        type="number"
                        id="childAge"
                        name="childAge"
                        value={formData.childAge}
                        onChange={handleChange}
                        required
                        min="6"
                        max="14"
                        placeholder="10"
                      />
                    </div>
                  </div>
                </div>

                {/* Program Selection */}
                <div className="form-section">
                  <h3>Program Selection</h3>
                  <div className="form-group">
                    <label htmlFor="program">Choose Program *</label>
                    <select
                      id="program"
                      name="program"
                      value={formData.program}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select a program...</option>
                      <optgroup label="Regular Programs">
                        {programs.map((prog, idx) => (
                          <option key={idx} value={prog.name}>
                            {prog.name} - {prog.price}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Camps">
                        {camps.map((camp, idx) => (
                          <option key={idx} value={camp.name}>
                            {camp.name} - {camp.price}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="sessionType">Session Type *</label>
                    <select
                      id="sessionType"
                      name="sessionType"
                      value={formData.sessionType}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select session type...</option>
                      {sessionTypes.map((type, idx) => (
                        <option key={idx} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="startDate">Preferred Start Date *</label>
                    <input
                      type="date"
                      id="startDate"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                {/* Emergency Information */}
                <div className="form-section">
                  <h3>Emergency Contact</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="emergencyContact">Emergency Contact Name *</label>
                      <input
                        type="text"
                        id="emergencyContact"
                        name="emergencyContact"
                        value={formData.emergencyContact}
                        onChange={handleChange}
                        required
                        placeholder="Jane Smith"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="emergencyPhone">Emergency Phone *</label>
                      <input
                        type="tel"
                        id="emergencyPhone"
                        name="emergencyPhone"
                        value={formData.emergencyPhone}
                        onChange={handleChange}
                        required
                        placeholder="(604) 555-0124"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="medicalInfo">Medical Information / Allergies</label>
                    <textarea
                      id="medicalInfo"
                      name="medicalInfo"
                      value={formData.medicalInfo}
                      onChange={handleChange}
                      rows="3"
                      placeholder="Any medical conditions, allergies, or special needs we should know about..."
                    ></textarea>
                  </div>
                </div>

                <div className="recaptcha-container">
                  <ReCAPTCHA
                    sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
                    onChange={handleRecaptchaChange}
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-submit">
                  Complete Enrollment <CreditCard size={20} />
                </button>

                <p className="form-note">
                  <Shield size={16} /> Your information is secure and will only be used for enrollment purposes.
                </p>
              </form>
            </motion.div>

            {/* Sidebar */}
            <motion.div
              className="enrollment-sidebar"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="sidebar-card">
                <h3>What's Included</h3>
                <ul className="benefits-list">
                  {benefits.map((benefit, idx) => (
                    <li key={idx}>
                      <Check size={20} />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="sidebar-card">
                <h3>Payment Options</h3>
                <p>We accept all major credit cards and support monthly payment plans.</p>
                <div className="payment-icons">
                  <CreditCard size={32} />
                </div>
              </div>

              <div className="sidebar-card">
                <h3>Need Help?</h3>
                <p>Have questions about enrollment?</p>
                <Link to="/contact" className="btn btn-secondary">
                  Contact Us
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Enrollment;
