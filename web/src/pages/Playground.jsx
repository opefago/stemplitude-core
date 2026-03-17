import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Cpu, Play, Lock, ArrowRight, Wrench, Gamepad2, Puzzle, Cuboid } from 'lucide-react';
import './Playground.css';

const Playground = () => {
  const labs = [
    {
      id: 'circuit-maker',
      title: 'Circuit Maker',
      icon: <Zap size={48} />,
      description: 'Interactive circuit simulator. Build and test circuits with virtual components.',
      features: [
        'Virtual breadboard',
        'Component library',
        'Real-time simulation',
        'Circuit diagrams'
      ],
      color: '#0066FF',
      status: 'available',
      path: '/playground/circuit-maker'
    },
    {
      id: 'micro-maker',
      title: 'Micro Maker',
      icon: <Cpu size={48} />,
      description: 'Microcontroller programming environment. Write, compile, and upload MicroPython code to ESP32/Arduino.',
      features: [
        'Blockly visual programming',
        'Python code editor',
        'ESP32/Arduino compatible',
        'Web Serial upload'
      ],
      color: '#FF6B35',
      status: 'available',
      path: '/playground/micro-maker'
    },
    {
      id: 'game-maker',
      title: 'Game Maker',
      icon: <Puzzle size={48} />,
      description: 'Create games by snapping blocks together! See the Python code your blocks generate.',
      features: [
        'Drag-and-drop block coding',
        'Same game engine as Py Game Maker',
        'See generated Python code',
        'Sprites, collision & sound'
      ],
      color: '#a78bfa',
      status: 'available',
      path: '/playground/game-maker'
    },
    {
      id: 'python-game-lab',
      title: 'Py Game Maker',
      icon: <Gamepad2 size={48} />,
      description: 'Write Python code to create your own games! Built-in game engine with sprites, collisions, and sound.',
      features: [
        'Python game engine',
        'Code editor with highlighting',
        '8 example games included',
        'Sprites, input & collision'
      ],
      color: '#f0883e',
      status: 'available',
      path: '/playground/python-game'
    },
    {
      id: 'design-maker',
      title: 'Design Maker',
      icon: <Cuboid size={48} />,
      description: 'Tinkercad-inspired 3D modeling platform. Create, combine, and export 3D designs.',
      features: [
        '3D shape library & text',
        'Boolean CSG operations',
        'Transform & align tools',
        'Export STL / GLB'
      ],
      color: '#6366f1',
      status: 'available',
      path: '/playground/design-maker'
    },
  ];

  return (
    <div className="playground-page">
      {/* Hero Section */}
      <section className="playground-hero">
        <div className="container">
          <motion.div
            className="playground-hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="hero-badge">
              <Play size={20} />
              <span>Interactive Learning</span>
            </div>
            <h1>STEAM <span className="gradient-text">Playground</span></h1>
            <p>Hands-on virtual labs for electronics, microcontrollers, and coding</p>
          </motion.div>
        </div>
      </section>

      {/* Labs Grid */}
      <section className="labs-section">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Virtual <span className="gradient-text">Labs</span></h2>
            <p>Practice and experiment in our interactive learning environments</p>
          </motion.div>

          <div className="labs-grid">
            {labs.map((lab, index) => (
              <motion.div
                key={lab.id}
                className={`lab-card ${lab.status}`}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="lab-icon" style={{ background: lab.color }}>
                  {lab.icon}
                </div>
                
                {lab.status === 'coming-soon' && (
                  <div className="coming-soon-badge">Coming Soon</div>
                )}

                <h3>{lab.title}</h3>
                <p className="lab-description">{lab.description}</p>

                <div className="lab-features">
                  <h4>Features:</h4>
                  <ul>
                    {lab.features.map((feature, idx) => (
                      <li key={idx}>
                        <Wrench size={16} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {lab.status === 'available' ? (
                  <Link to={lab.path} className="btn btn-primary">
                    Launch Lab <Play size={20} />
                  </Link>
                ) : (
                  <button className="btn btn-secondary" disabled>
                    <Lock size={20} />
                    Coming Soon
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Access Info */}
      <section className="access-info">
        <div className="container">
          <motion.div
            className="info-card"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Who Can Access the Playground?</h2>
            <div className="access-grid">
              <div className="access-item">
                <div className="access-icon">
                  <Play size={32} />
                </div>
                <h3>Current Students</h3>
                <p>Full access to all labs as part of your enrollment</p>
              </div>
              <div className="access-item">
                <div className="access-icon">
                  <Lock size={32} />
                </div>
                <h3>Public Access</h3>
                <p>Limited demo mode available. Enroll for full access and features</p>
              </div>
            </div>
            <p className="info-note">
              <strong>Note:</strong> Full LMS (Learning Management System) with progress tracking, 
              saved projects, and advanced features coming soon!
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="playground-cta">
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2>Ready to Start <span className="gradient-text">Experimenting</span>?</h2>
            <p>Enroll now to get full access to all virtual labs and more</p>
            <div className="cta-buttons">
              <Link to="/enrollment" className="btn btn-primary">
                Enroll Now <ArrowRight size={20} />
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

export default Playground;
