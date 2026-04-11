import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Facebook, Linkedin, Instagram, Mail, MapPin, Phone, Send } from 'lucide-react';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    // Add your newsletter integration here
    console.log('Newsletter signup:', email);
    setSubscribed(true);
    setTimeout(() => {
      setSubscribed(false);
      setEmail('');
    }, 3000);
  };

  return (
    <footer className="footer">
      {/* Newsletter Section */}
      <div className="footer-newsletter">
        <div className="container">
          <div className="newsletter-content">
            <div className="newsletter-text">
              <h3>Stay Updated with <span className="white-text">STEM</span><span className="plitude-orange">plitude</span></h3>
              <p>Get the latest news, tips, and exclusive offers delivered to your inbox</p>
            </div>
            <form className="newsletter-form-footer" onSubmit={handleNewsletterSubmit}>
              <input 
                type="email" 
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
              <button type="submit" className="btn btn-primary">
                {subscribed ? 'Subscribed!' : 'Subscribe'} <Send size={20} />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="footer-content">
        <div className="footer-section">
          <h3 className="footer-logo">
            <span className="steam-blue">STEM</span><span className="plitude-orange">plitude</span>
          </h3>
          <p>Where Creativity Meets Engineering</p>
          <p>Empowering kids aged 6-14 with STEAM education through hands-on learning in coding, robotics, electronics, 3D printing, 3D modelling, and AI.</p>
          <div className="social-links">
            <a href="#" aria-label="Facebook"><Facebook size={24} /></a>
            <a href="#" aria-label="LinkedIn"><Linkedin size={24} /></a>
            <a href="#" aria-label="Instagram"><Instagram size={24} /></a>
            <a href="#" aria-label="Email"><Mail size={24} /></a>
          </div>
        </div>

        <div className="footer-section">
          <h4>Quick Links</h4>
          <ul>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/programs">Programs</Link></li>
            <li><Link to="/camps">Camps</Link></li>
            <li><Link to="/pricing">Pricing</Link></li>
            <li><Link to="/playground">Playground</Link></li>
            <li><Link to="/demo-days">Demo Days</Link></li>
            <li><a href="http://blog.stemplitude.localhost" target="_blank" rel="noopener noreferrer">Blog</a></li>
            <li><Link to="/about">About Us</Link></li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Programs</h4>
          <ul>
            <li><Link to="/programs#coding">Coding</Link></li>
            <li><Link to="/programs#robotics">Robotics</Link></li>
            <li><Link to="/programs#electronics">Electronics</Link></li>
            <li><Link to="/programs#3d-printing">3D Printing</Link></li>
            <li><Link to="/programs#3d-modelling">3D Modelling</Link></li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Get In Touch</h4>
          <ul className="contact-info">
            <li>
              <MapPin size={18} />
              <span>Vancouver, BC, Canada</span>
            </li>
            <li>
              <Phone size={18} />
              <span>(604) 555-STEAM</span>
            </li>
            <li>
              <Mail size={18} />
              <span>info@stemplitude.com</span>
            </li>
          </ul>
          <Link to="/contact" className="btn btn-primary footer-btn">
            Contact Us
          </Link>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; {currentYear} STEMplitude. All rights reserved.</p>
        <div className="footer-links">
          <Link to="/faq">FAQ</Link>
          <span>|</span>
          <a href="#">Privacy Policy</a>
          <span>|</span>
          <a href="#">Terms & Conditions</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
