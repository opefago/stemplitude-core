import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, HelpCircle, ArrowRight } from 'lucide-react';
import './FAQ.css';

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const faqCategories = [
    {
      category: 'General Questions',
      questions: [
        {
          question: 'What age groups do you serve?',
          answer: 'We serve students aged 6-14 years old. Our programs are designed with age-appropriate content and instruction methods to ensure every child can learn effectively and enjoy their experience.'
        },
        {
          question: 'Do I need any prior experience or knowledge?',
          answer: 'No prior experience is required! Our programs are designed for beginners through advanced students. We assess each student\'s level and provide appropriate challenges and support.'
        },
        {
          question: 'What is the student-to-instructor ratio?',
          answer: 'We maintain small class sizes with a maximum of 12 students per class. This ensures personalized attention and effective learning for every student.'
        },
        {
          question: 'Where are classes held?',
          answer: 'Our main location is at 177 Innovation Way, Vancouver, BC. We also offer online classes on Sundays and can arrange school-based programs upon request.'
        }
      ]
    },
    {
      category: 'Programs & Curriculum',
      questions: [
        {
          question: 'How does your curriculum work?',
          answer: 'STEMplitude offers a complete STEAM package where every student experiences all five core disciplines: Coding, Robotics, Electronics, 3D Printing, and 3D Modelling. This isn\'t a menu—it\'s one comprehensive program. Students progress from beginner to advanced levels in each discipline as they gain mastery. This holistic approach ensures well-rounded technical skills.'
        },
        {
          question: 'What does "progression through mastery" mean?',
          answer: 'Rather than completing fixed-duration courses, students advance through skill levels across all disciplines based on demonstrated understanding and capability. For example, in Robotics they start with LEGO WeDo, progress to Mindstorms, then advance to embedded systems. In Coding, they begin with Scratch, move to Python, then to web development or game programming—all while simultaneously progressing in the other STEAM areas.'
        },
        {
          question: 'Do students study all programs at once?',
          answer: 'Yes! Our complete STEAM package includes all five disciplines. Sessions are structured to rotate through different STEAM areas, ensuring balanced exposure and skill development. This approach mirrors real-world engineering and innovation where professionals integrate multiple disciplines to solve problems.'
        },
        {
          question: 'How do you determine what level my child should start at?',
          answer: 'We conduct an initial assessment to understand your child\'s current skills and interests across all STEAM areas. This helps us place them at the appropriate level in each discipline—they might be advanced in coding but beginner in robotics, for example. Students progress at their own pace in each area.'
        },
        {
          question: 'What tools and software do you use?',
          answer: 'We use industry-standard tools that match each skill level: Scratch and Blockly for beginners, Python and Arduino for intermediate, and professional tools like React, Raspberry Pi, and TensorFlow for advanced students. All software and equipment are provided during classes.'
        },
        {
          question: 'Will my child get certificates?',
          answer: 'Yes! Students receive certificates as they complete each skill level within each discipline. These recognize their achievement and readiness to advance to the next level in that particular STEAM area.'
        }
      ]
    },
    {
      category: 'Camps',
      questions: [
        {
          question: 'What camps do you offer?',
          answer: 'We offer seasonal camps during Spring Break, Summer (8 weeks), and Winter Break. Both full-day (8:30 AM - 4:30 PM) and half-day (8:30 AM - 12:30 PM) options are available.'
        },
        {
          question: 'What does a typical camp day look like?',
          answer: 'Camp days include hands-on project work, skill-building activities, creative challenges, and collaborative team projects. Full-day camps include lunch break and recreational activities. Every camper completes a take-home project.'
        },
        {
          question: 'Do you provide meals?',
          answer: 'We provide healthy snacks for all camps. For full-day camps, parents should pack a lunch. We accommodate dietary restrictions and allergies.'
        },
        {
          question: 'Is extended care available?',
          answer: 'Yes! We offer before-care (starting at 7:30 AM) and after-care (until 6:00 PM) for an additional fee.'
        }
      ]
    },
    {
      category: 'Competitions & Demo Days',
      questions: [
        {
          question: 'What are Demo Days?',
          answer: 'Demo Days are showcase events where students present their projects to parents, peers, and community members. They occur at the end of each program term and provide valuable presentation experience.'
        },
        {
          question: 'Do students compete in robotics competitions?',
          answer: 'Yes! We prepare teams for VEX Robotics, FIRST Tech Challenge, and other regional and national competitions. Participation is optional but strongly encouraged.'
        },
        {
          question: 'Are there costs associated with competitions?',
          answer: 'Competition registration fees and travel expenses (if applicable) are separate from regular tuition. We provide detailed cost breakdowns and fundraising support for competition teams.'
        }
      ]
    },
    {
      category: 'Enrollment & Payment',
      questions: [
        {
          question: 'How do I enroll my child?',
          answer: 'You can enroll online through our Enrollment page. Select your desired program and level, fill out the registration form, and set up monthly payments securely via Stripe. You\'ll receive confirmation within 24 hours.'
        },
        {
          question: 'What are the payment options?',
          answer: 'We operate on a monthly subscription model. Prices range from $249-$349 per month depending on the program and level. We accept all major credit cards. Camp prices vary and are paid per week or session.'
        },
        {
          question: 'Can my child switch levels or programs?',
          answer: 'Yes! If we find a student needs to move to a different level, we\'ll discuss it with you. Students can also switch programs, though we recommend completing at least one level before changing focus areas.'
        },
        {
          question: 'What is your cancellation policy?',
          answer: 'You can cancel your monthly subscription at any time with 30 days notice. For camps, full refunds are available if you cancel at least 7 days before the camp start date. Please see our Terms & Conditions for complete details.'
        },
        {
          question: 'Are there sibling discounts?',
          answer: 'Yes! We offer a 10% discount for the second child and 15% for the third child from the same family when enrolled in concurrent programs.'
        },
        {
          question: 'How long will my child be in the program?',
          answer: 'There\'s no fixed duration! Students progress through skill levels at their own pace. Some may advance quickly through levels, while others take more time to master skills. Most students stay with us for multiple years, growing from beginner to advanced levels.'
        }
      ]
    },
    {
      category: 'Safety & Policies',
      questions: [
        {
          question: 'What safety measures do you have in place?',
          answer: 'All instructors are background-checked and certified. We maintain secure facilities with monitored access. Student safety is our top priority, and we follow all provincial health and safety guidelines.'
        },
        {
          question: 'What is your attendance and makeup policy?',
          answer: 'We understand that conflicts arise. Students can make up missed classes by attending another section of the same program (subject to availability) or accessing recorded online sessions through our parent portal.'
        },
        {
          question: 'Can parents observe classes?',
          answer: 'Parents are welcome to observe the first and last class of each program. For other sessions, we find that students focus better without parent observation, but we provide regular progress updates through our parent portal.'
        },
        {
          question: 'What if my child has special needs?',
          answer: 'We strive to be inclusive and accommodate all learners. Please contact us to discuss your child\'s specific needs, and we\'ll work with you to ensure they have a positive, successful experience.'
        }
      ]
    }
  ];

  return (
    <div className="faq-page">
      {/* Hero Section */}
      <section className="faq-hero">
        <div className="container">
          <motion.div
            className="faq-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <HelpCircle size={64} className="hero-icon" />
            <h1>Frequently Asked <span className="gradient-text">Questions</span></h1>
            <p>Find answers to common questions about our programs, camps, and policies</p>
          </motion.div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="faq-content">
        <div className="container">
          {faqCategories.map((category, catIndex) => (
            <motion.div
              key={catIndex}
              className="faq-category"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: catIndex * 0.1 }}
            >
              <h2 className="category-title">{category.category}</h2>
              <div className="faq-list">
                {category.questions.map((faq, faqIndex) => {
                  const globalIndex = `${catIndex}-${faqIndex}`;
                  const isOpen = openIndex === globalIndex;

                  return (
                    <div key={faqIndex} className="faq-item">
                      <button
                        className={`faq-question ${isOpen ? 'active' : ''}`}
                        onClick={() => toggleFAQ(globalIndex)}
                      >
                        <span>{faq.question}</span>
                        <ChevronDown
                          size={24}
                          className={`chevron ${isOpen ? 'rotate' : ''}`}
                        />
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            className="faq-answer"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <p>{faq.answer}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Still Have Questions */}
      <section className="faq-cta">
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Still Have Questions?</h2>
            <p>Can't find what you're looking for? We're here to help!</p>
            <div className="cta-buttons">
              <Link to="/contact" className="btn btn-primary">
                Contact Us <ArrowRight size={20} />
              </Link>
              <Link to="/enrollment" className="btn btn-secondary">
                Enroll Now
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default FAQ;
