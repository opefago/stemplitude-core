import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import Programs from './pages/Programs';
import Camps from './pages/Camps';
import DemoDays from './pages/DemoDays';
import About from './pages/About';
import Contact from './pages/Contact';
import Enrollment from './pages/Enrollment';
import Pricing from './pages/Pricing';
import Playground from './pages/Playground';
import ElectronicsLab from './pages/ElectronicsLab';
import MCULab from './pages/MCULab';
import GameDevLab from './pages/GameDevLab';
import PythonGameLab from './pages/PythonGameLab';
import GameMakerLab from './pages/GameMakerLab';
import FAQ from './pages/FAQ';
import './App.css';

function AppContent() {
  const location = useLocation();
  
  // Hide navbar and footer on lab pages for immersive full-screen experience
  const isLabPage = location.pathname.startsWith('/playground/circuit-maker') || 
                    location.pathname.startsWith('/playground/micro-maker') ||
                    location.pathname.startsWith('/playground/gamedev') ||
                    location.pathname.startsWith('/playground/python-game') ||
                    location.pathname.startsWith('/playground/game-maker');

  return (
    <div className="app">
      {!isLabPage && <Navbar />}
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/camps" element={<Camps />} />
          <Route path="/demo-days" element={<DemoDays />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/playground/circuit-maker" element={<ElectronicsLab />} />
          <Route path="/playground/micro-maker" element={<MCULab />} />
          <Route path="/playground/gamedev" element={<GameDevLab />} />
          <Route path="/playground/python-game" element={<PythonGameLab />} />
          <Route path="/playground/game-maker" element={<GameMakerLab />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/enrollment" element={<Enrollment />} />
          <Route path="/faq" element={<FAQ />} />
        </Routes>
      </AnimatePresence>
      {!isLabPage && <Footer />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <AppContent />
    </Router>
  );
}

export default App;
