import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import '../components/ReCaptcha.css';
import './Contact.css';

const Contact = () => {
  const [formData, setFormData] = useState({
    parentName: '',
    childName: '',
    email: '',
    phone: '',
    program: '',
    message: ''
  });

  const [submitted, setSubmitted] = useState(false);
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
    
    // Here you would integrate with Airtable or your backend
    console.log('Form submitted:', formData);
    console.log('reCAPTCHA token:', recaptchaValue);
    
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setRecaptchaValue(null);
      setFormData({
        parentName: '',
        childName: '',
        email: '',
        phone: '',
        program: '',
        message: ''
      });
    }, 3000);
  };

  const contactInfo = [
    {
      icon: <MapPin size={28} />,
      title: 'Location',
      content: ['177 Innovation Way', 'Vancouver, BC V6B 4N9', 'Canada']
    },
    {
      icon: <Phone size={28} />,
      title: 'Phone',
      content: ['Main: (604) 555-STEAM', 'Mobile: (604) 555-0123']
    },
    {
      icon: <Mail size={28} />,
      title: 'Email',
      content: ['info@stemplitude.com', 'programs@stemplitude.com']
    },
    {
      icon: <Clock size={28} />,
      title: 'Hours',
      content: ['Mon-Fri: 3:00 PM - 7:00 PM', 'Sat: 9:00 AM - 5:00 PM', 'Sun: Online Classes Only']
    }
  ];

  const programs = [
    'Complete STEAM Package (All Disciplines)',
    'Summer Camp',
    'Spring Camp',
    'Winter Camp',
    'Demo Day Visit',
    'General Inquiry'
  ];

  return (
    <div className="contact-page">
      {/* Hero Section */}
      <section className="contact-hero">
        <div className="container">
          <motion.div
            className="contact-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1>Get in <span className="gradient-text">Touch</span></h1>
            <p>Have questions? We'd love to hear from you!</p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info */}
      <section className="contact-info-section">
        <div className="container">
          <div className="contact-info-grid">
            {contactInfo.map((info, index) => (
              <motion.div
                key={index}
                className="contact-info-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="info-icon">{info.icon}</div>
                <h3>{info.title}</h3>
                {info.content.map((line, idx) => (
                  <p key={idx}>{line}</p>
                ))}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="contact-form-section">
        <div className="container">
          <div className="form-wrapper">
            <motion.div
              className="form-header"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2>Send Us a <span className="gradient-text">Message</span></h2>
              <p>Fill out the form below and we'll get back to you within 24 hours</p>
            </motion.div>

            <motion.form
              onSubmit={handleSubmit}
              className="contact-form"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="parentName">Parent/Guardian Name *</label>
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

                <div className="form-group">
                  <label htmlFor="childName">Child's Name</label>
                  <input
                    type="text"
                    id="childName"
                    name="childName"
                    value={formData.childName}
                    onChange={handleChange}
                    placeholder="Jane Doe"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="john.doe@example.com"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone Number *</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    placeholder="(604) 555-0123"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="program">Program Interest *</label>
                <select
                  id="program"
                  name="program"
                  value={formData.program}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select a program...</option>
                  {programs.map((program, index) => (
                    <option key={index} value={program}>
                      {program}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows="5"
                  placeholder="Tell us more about your inquiry..."
                ></textarea>
              </div>

              <div className="recaptcha-container">
                <ReCAPTCHA
                  sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
                  onChange={handleRecaptchaChange}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-submit">
                {submitted ? 'Message Sent!' : 'Send Message'} <Send size={20} />
              </button>

              {submitted && (
                <motion.p
                  className="success-message"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  Thank you for contacting us! We'll be in touch soon.
                </motion.p>
              )}
            </motion.form>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section className="map-section">
        <div className="container">
          <motion.div
            className="map-placeholder"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <MapPin size={64} />
            <h3>Find Us</h3>
            <p>177 Innovation Way, Vancouver, BC V6B 4N9</p>
            <a 
              href="https://maps.google.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              Open in Google Maps
            </a>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Contact;
