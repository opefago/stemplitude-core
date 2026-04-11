import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  Rocket,
  Gamepad2,
  Lightbulb,
  Zap,
  Shield,
  Star,
  Menu,
  X,
  Code,
  Cpu,
  CircuitBoard,
  Box,
  BrainCircuit,
  Trophy,
  Eye,
  EyeOff,
  Heart,
  TrendingUp,
  GraduationCap,
  Users,
  BookOpen,
  Building2,
  Store as StoreIcon,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { useAuth } from "../providers/AuthProvider";
import "./LMSHome.css";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

const bounceIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 200, damping: 12 },
  },
};

const FEATURES = [
  {
    icon: <Sparkles size={32} />,
    title: "Hands-On STEM Labs",
    desc: "Students don\u2019t just watch lessons \u2014 they build, code, and experiment through interactive labs in robotics, programming, electronics, and design.",
    color: "#58cc02",
  },
  {
    icon: <Shield size={32} />,
    title: "Built for Every Age",
    desc: "From curious beginners to future engineers, the platform adapts with simple tools for younger learners and advanced challenges for older students.",
    color: "#1cb0f6",
  },
  {
    icon: <Rocket size={32} />,
    title: "Real-World Projects",
    desc: "Students create projects they can demo, showcase, and proudly present \u2014 from blinking LEDs to programmable robots and interactive games.",
    color: "#ff9600",
  },
];

const STEPS = [
  {
    num: "1",
    text: "Pick Your Adventure",
    sub: "Choose from coding, robotics, electronics, 3D design, or explore all STEM disciplines.",
  },
  {
    num: "2",
    text: "Learn by Doing",
    sub: "Interactive labs and hands-on projects make learning exciting and practical.",
  },
  {
    num: "3",
    text: "Level Up & Show Off",
    sub: "Earn badges, unlock achievements, and present projects at demo days or competitions.",
  },
];

const PATHS = [
  {
    icon: <Code size={28} />,
    title: "Coding & Game Development",
    desc: "Learn programming fundamentals by creating games, animations, and interactive apps.",
    color: "#58cc02",
  },
  {
    icon: <Cpu size={28} />,
    title: "Robotics Engineering",
    desc: "Build and program robots while learning mechanics, sensors, and automation.",
    color: "#1cb0f6",
  },
  {
    icon: <CircuitBoard size={28} />,
    title: "Electronics & Circuits",
    desc: "Understand how technology works by building circuits, experimenting with components, and creating real devices.",
    color: "#ff9600",
  },
  {
    icon: <Box size={28} />,
    title: "3D Design & Printing",
    desc: "Design objects in 3D and bring them to life through digital modeling and fabrication.",
    color: "#ce82ff",
  },
  {
    icon: <BrainCircuit size={28} />,
    title: "Artificial Intelligence",
    desc: "Explore machine learning concepts and create simple AI-powered applications.",
    color: "#ff4b4b",
  },
];

const PROJECTS = [
  "Programmable robots",
  "Smart LED circuits",
  "Arcade-style games",
  "Motion sensors",
  "3D printed inventions",
  "AI-powered apps",
];

const WHY_PARENTS = [
  {
    icon: <Trophy size={28} />,
    title: "Gamified Learning",
    desc: "Students earn points, badges, and achievements that make learning feel like a game.",
  },
  {
    icon: <TrendingUp size={28} />,
    title: "Real Skills for the Future",
    desc: "Coding, robotics, and engineering skills that prepare students for tomorrow\u2019s careers.",
  },
  {
    icon: <Eye size={28} />,
    title: "Parent Progress Tracking",
    desc: "Parents can see student progress, achievements, and completed projects.",
  },
  {
    icon: <Heart size={28} />,
    title: "Confidence Through Creation",
    desc: "Students build real projects that boost creativity, problem-solving, and confidence.",
  },
];

const ROLES = [
  {
    id: "teacher",
    label: "Teacher",
    icon: <GraduationCap size={32} />,
    color: "#ff4b4b",
    bg: "#fff0f0",
  },
  {
    id: "parent",
    label: "Parent",
    icon: <Users size={32} />,
    color: "#1cb0f6",
    bg: "#eef8ff",
  },
  {
    id: "student",
    label: "Student",
    icon: <BookOpen size={32} />,
    color: "#58cc02",
    bg: "#f0fbe6",
  },
  {
    id: "stem-center",
    label: "Organisation",
    icon: <Building2 size={32} />,
    color: "#ff9600",
    bg: "#fff6e6",
  },
];

const SCALE_TIERS = [
  {
    icon: <Users size={28} />,
    title: "Home Tutoring",
    desc: "Teach your own children or a small group at home with ready-made STEM curriculum and labs.",
    color: "#58cc02",
  },
  {
    icon: <BookOpen size={28} />,
    title: "Private Tutoring",
    desc: "Run private STEM classes for students in your community with scheduling, progress tracking, and parent reports.",
    color: "#1cb0f6",
  },
  {
    icon: <Building2 size={28} />,
    title: "Organisation",
    desc: "Open a STEM learning center with classroom management, multi-instructor support, and enrollment tools.",
    color: "#ff9600",
  },
  {
    icon: <StoreIcon size={28} />,
    title: "Franchise",
    desc: "Scale to multiple locations with centralized curriculum, brand management, and district-level analytics.",
    color: "#ce82ff",
  },
];

const LMSHome = () => {
  const navigate = useNavigate();
  const {
    login: authLogin,
    studentLogin: authStudentLogin,
    user,
    isAuthenticated,
  } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const [dialogMode, setDialogMode] = useState(null); // 'signup' | 'login' | null
  const [selectedRole, setSelectedRole] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = dialogMode ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dialogMode]);

  const resetLoginForm = () => {
    setSelectedRole(null);
    setLoginEmail("");
    setLoginPassword("");
    setLoginCode("");
    setLoginError("");
    setLoginLoading(false);
    setShowLoginPassword(false);
  };

  const openSignup = useCallback(() => {
    resetLoginForm();
    setDialogMode("signup");
  }, []);
  const openLogin = useCallback(() => {
    resetLoginForm();
    setDialogMode("login");
  }, []);
  const closeDialog = useCallback(() => {
    resetLoginForm();
    setDialogMode(null);
  }, []);

  const getFriendlyLoginError = useCallback((err, role) => {
    const raw = err?.message || "";
    const text = String(raw);
    const lower = text.toLowerCase();

    if (lower.includes("value is not a valid email")) {
      return role === "student"
        ? "Use a valid email address, or sign in with username + class code."
        : "Please enter a valid email address.";
    }
    if (
      lower.includes(
        "either (username + tenant_slug/tenant_code) or email required",
      )
    ) {
      return "Enter your email, or use username with class code.";
    }
    if (lower.includes("cannot use both tenant-scoped and global login")) {
      return "Use either email login or username + class code.";
    }
    if (lower.includes("tenant not found")) {
      return "Class code not found. Please check and try again.";
    }
    if (
      lower.includes("invalid username or password") ||
      lower.includes("invalid email or password") ||
      lower.includes("invalid credentials")
    ) {
      return "Invalid login details. Please try again.";
    }
    if (text.trim().startsWith("[{")) {
      return "We could not sign you in. Please check your details and try again.";
    }
    return text || "Login failed. Please try again.";
  }, []);

  const handleRoleSelect = useCallback(
    (roleId) => {
      if (dialogMode === "login") {
        setSelectedRole(roleId);
        setLoginError("");
      } else {
        setDialogMode(null);
        navigate(`/auth/onboard?role=${roleId}`);
      }
    },
    [navigate, dialogMode],
  );

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      if (selectedRole === "student") {
        const identifier = loginEmail.trim();
        const password = loginPassword;
        const classCode = loginCode.trim();

        const looksLikeEmail = identifier.includes("@");
        if (looksLikeEmail) {
          await authStudentLogin({
            email: identifier,
            password,
          });
        } else {
          if (!classCode) {
            throw new Error(
              "Please enter your class code when signing in with a username.",
            );
          }
          await authStudentLogin({
            username: identifier,
            tenant_code: classCode,
            password,
          });
        }
      } else {
        await authLogin(loginEmail, loginPassword);
      }
      setDialogMode(null);
      resetLoginForm();
      navigate("/app");
    } catch (err) {
      setLoginError(getFriendlyLoginError(err, selectedRole));
    } finally {
      setLoginLoading(false);
    }
  };

  const welcomeName =
    user?.firstName?.trim() || user?.email?.split("@")[0]?.trim() || "there";

  return (
    <div className="lms-home">
      {/* ===== Header ===== */}
      <header className="lms-header" data-scrolled={scrolled || undefined}>
        <div className="lms-header__inner">
          <Link to="/" className="lms-header__logo">
            <Zap size={22} className="lms-header__logo-icon" />
            <span>Stemplitude</span>
          </Link>

          <nav
            className="lms-header__nav"
            data-open={mobileMenuOpen || undefined}
          >
            <a
              href="http://blog.stemplitude.localhost"
              className="lms-header__link"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
            >
              Blog
            </a>
            <Link
              to="/explore"
              className="lms-header__link"
              onClick={() => setMobileMenuOpen(false)}
            >
              Explore
            </Link>
            <Link
              to="/about"
              className="lms-header__link"
              onClick={() => setMobileMenuOpen(false)}
            >
              About
            </Link>
            <Link
              to="/faq"
              className="lms-header__link"
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </Link>
          </nav>

          <div className="lms-header__actions">
            {isAuthenticated ? (
              <Link to="/app" className="lms-header__welcome">
                <span className="lms-header__welcome-text">
                  Welcome {welcomeName}!
                </span>
                <strong className="lms-header__welcome-jump">Jump in</strong>
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  className="lms-header__login"
                  onClick={openLogin}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className="lms-btn lms-btn--primary lms-btn--sm"
                  onClick={openSignup}
                >
                  Get started
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            className="lms-header__burger"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* ===== Role Selection / Login Dialog ===== */}
      <AnimatePresence>
        {dialogMode && (
          <motion.div
            className="lms-dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDialog}
          >
            <motion.div
              className="lms-dialog"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="lms-dialog__close"
                onClick={closeDialog}
                aria-label="Close"
              >
                <X size={20} />
              </button>

              {/* --- Step 1: Role Selection --- */}
              {!selectedRole && (
                <>
                  <h2 className="lms-dialog__title">
                    {dialogMode === "login"
                      ? "Log in as a\u2026"
                      : "Get started as a\u2026"}
                  </h2>

                  <div className="lms-dialog__roles">
                    {ROLES.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        className="lms-role-card"
                        onClick={() => handleRoleSelect(role.id)}
                      >
                        <div
                          className="lms-role-card__icon"
                          style={{ background: role.bg, color: role.color }}
                        >
                          {role.icon}
                        </div>
                        <span className="lms-role-card__label">
                          {role.label}
                        </span>
                        <ArrowRight
                          size={16}
                          className="lms-role-card__arrow"
                        />
                      </button>
                    ))}
                  </div>

                  <div className="lms-dialog__footer">
                    <button
                      type="button"
                      className="lms-btn lms-btn--outline lms-dialog__cancel"
                      onClick={closeDialog}
                    >
                      Cancel
                    </button>
                    <p className="lms-dialog__login">
                      {dialogMode === "login" ? (
                        <>
                          Don&apos;t have an account?{" "}
                          <button
                            type="button"
                            className="lms-dialog__link"
                            onClick={openSignup}
                          >
                            Sign up
                          </button>
                        </>
                      ) : (
                        <>
                          Already have an account?{" "}
                          <button
                            type="button"
                            className="lms-dialog__link"
                            onClick={openLogin}
                          >
                            Log in
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                </>
              )}

              {/* --- Step 2: Login Form (login mode only) --- */}
              {selectedRole && dialogMode === "login" && (
                <>
                  <button
                    type="button"
                    className="lms-dialog__back"
                    onClick={() => {
                      setSelectedRole(null);
                      setLoginError("");
                    }}
                  >
                    <ChevronLeft size={18} /> Back
                  </button>

                  <h2 className="lms-dialog__title">
                    Log in as {ROLES.find((r) => r.id === selectedRole)?.label}
                  </h2>

                  <form className="lms-login-form" onSubmit={handleLoginSubmit}>
                    <div className="lms-login-form__field">
                      <label htmlFor="lms-login-email">
                        {selectedRole === "student"
                          ? "Email or Username"
                          : "Email"}
                      </label>
                      <input
                        id="lms-login-email"
                        type={selectedRole === "student" ? "text" : "email"}
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder={
                          selectedRole === "student"
                            ? "Enter email or username"
                            : "Enter your email"
                        }
                        required
                        autoFocus
                      />
                    </div>

                    <div className="lms-login-form__field">
                      <label htmlFor="lms-login-password">Password</label>
                      <div className="lms-login-form__pw-wrapper">
                        <input
                          id="lms-login-password"
                          type={showLoginPassword ? "text" : "password"}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Enter your password"
                          required
                        />
                        <button
                          type="button"
                          className="lms-login-form__pw-toggle"
                          onClick={() => setShowLoginPassword((v) => !v)}
                          tabIndex={-1}
                          aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        >
                          {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {selectedRole === "student" && (
                      <div className="lms-login-form__field">
                        <label htmlFor="lms-login-code">
                          Class Code{" "}
                          <span className="lms-login-form__optional">
                            (required for username)
                          </span>
                        </label>
                        <input
                          id="lms-login-code"
                          type="text"
                          value={loginCode}
                          onChange={(e) => setLoginCode(e.target.value)}
                          placeholder="Enter class code"
                        />
                      </div>
                    )}

                    {loginError && (
                      <p className="lms-login-form__error">{loginError}</p>
                    )}

                    <button
                      type="submit"
                      className="lms-btn lms-btn--primary lms-login-form__submit"
                      disabled={loginLoading}
                    >
                      {loginLoading ? (
                        <>
                          <Loader2 size={18} className="lms-spin" /> Logging
                          in&hellip;
                        </>
                      ) : (
                        "Log in"
                      )}
                    </button>
                  </form>

                  <div className="lms-dialog__footer">
                    <p className="lms-dialog__login">
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        className="lms-dialog__link"
                        onClick={openSignup}
                      >
                        Sign up
                      </button>
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== 1. Hero ===== */}
      <section className="lms-hero">
        <div className="lms-hero__container">
          <motion.div
            className="lms-hero__text"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
          >
            <h1 className="lms-hero__title">
              The Fun Way to Learn{" "}
              <span className="lms-hero__highlight">STEM</span>
            </h1>
            <p className="lms-hero__subtitle">
              Build robots. Code games. Design circuits.
              <br />
              Hands-on STEM learning that turns curiosity into real engineering
              skills.
            </p>
            <p className="lms-hero__supporting">
              Interactive labs, real projects, and gamified learning designed to
              inspire the next generation of scientists, engineers, and
              creators.
            </p>
            {!isAuthenticated ? (
              <>
                <div className="lms-hero__ctas">
                  <button
                    type="button"
                    className="lms-btn lms-btn--primary lms-btn--lg"
                    onClick={openSignup}
                  >
                    Start Learning &mdash; It&apos;s Free
                  </button>
                  <Link
                    to="/programs"
                    className="lms-btn lms-btn--outline lms-btn--lg"
                  >
                    Explore Programs
                  </Link>
                </div>
                <p className="lms-hero__trust">
                  No credit card required. 14-day free trial.
                </p>
              </>
            ) : null}
          </motion.div>

          <motion.div
            className="lms-hero__visual"
            initial="hidden"
            animate="visible"
            variants={bounceIn}
          >
            <div className="lms-hero__mascot">
              <div className="lms-mascot">
                <div className="lms-mascot__face">
                  <div className="lms-mascot__eye lms-mascot__eye--left" />
                  <div className="lms-mascot__eye lms-mascot__eye--right" />
                  <div className="lms-mascot__mouth" />
                </div>
                <div className="lms-mascot__body">
                  <div className="lms-mascot__arm lms-mascot__arm--left" />
                  <div className="lms-mascot__arm lms-mascot__arm--right" />
                </div>
                <div className="lms-mascot__bolt">
                  <Zap size={24} fill="currentColor" />
                </div>
              </div>
              <motion.div
                className="lms-hero__bubble lms-hero__bubble--1"
                animate={{ y: [-5, 5, -5] }}
                transition={{
                  repeat: Infinity,
                  duration: 3,
                  ease: "easeInOut",
                }}
              >
                <Rocket size={20} />
              </motion.div>
              <motion.div
                className="lms-hero__bubble lms-hero__bubble--2"
                animate={{ y: [5, -5, 5] }}
                transition={{
                  repeat: Infinity,
                  duration: 4,
                  ease: "easeInOut",
                }}
              >
                <Gamepad2 size={20} />
              </motion.div>
              <motion.div
                className="lms-hero__bubble lms-hero__bubble--3"
                animate={{ y: [-3, 7, -3] }}
                transition={{
                  repeat: Infinity,
                  duration: 3.5,
                  ease: "easeInOut",
                }}
              >
                <Lightbulb size={20} />
              </motion.div>
            </div>
          </motion.div>
        </div>

        <div className="lms-hero__wave">
          <svg viewBox="0 0 1440 120" preserveAspectRatio="none">
            <path
              d="M0,64 C360,120 720,0 1080,64 C1260,96 1380,80 1440,64 L1440,120 L0,120 Z"
              fill="var(--lms-bg-white)"
            />
          </svg>
        </div>
      </section>

      {/* ===== 2. Feature Highlights ===== */}
      <section className="lms-features" id="features">
        <div className="lms-container">
          <motion.h2
            className="lms-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            Learning That Feels Like Play
          </motion.h2>
          <motion.div
            className="lms-features__grid"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                className="lms-feature-card"
                custom={i}
                variants={fadeUp}
              >
                <div
                  className="lms-feature-card__icon"
                  style={{ background: f.color + "18", color: f.color }}
                >
                  {f.icon}
                </div>
                <h3 className="lms-feature-card__title">{f.title}</h3>
                <p className="lms-feature-card__desc">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== 3. How It Works ===== */}
      <section className="lms-how">
        <div className="lms-container">
          <motion.h2
            className="lms-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            How Stemplitude Works
          </motion.h2>
          <div className="lms-how__steps">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                className="lms-step"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                variants={fadeUp}
              >
                <div className="lms-step__num">{step.num}</div>
                <h3 className="lms-step__title">{step.text}</h3>
                <p className="lms-step__sub">{step.sub}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 4. STEM Learning Paths ===== */}
      <section className="lms-paths">
        <div className="lms-container">
          <motion.h2
            className="lms-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            Explore STEM Learning Paths
          </motion.h2>
          <motion.p
            className="lms-section-subtitle"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            Students progress through structured programs designed to develop
            real technical skills while keeping learning fun.
          </motion.p>
          <motion.div
            className="lms-paths__grid"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            {PATHS.map((p, i) => (
              <motion.div
                key={p.title}
                className="lms-path-card"
                custom={i}
                variants={fadeUp}
              >
                <div
                  className="lms-path-card__icon"
                  style={{ background: p.color + "15", color: p.color }}
                >
                  {p.icon}
                </div>
                <h3 className="lms-path-card__title">{p.title}</h3>
                <p className="lms-path-card__desc">{p.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== 5. Projects Students Build ===== */}
      <section className="lms-projects">
        <div className="lms-container">
          <div className="lms-projects__inner">
            <motion.div
              className="lms-projects__text"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <h2 className="lms-section-title lms-section-title--left">
                Projects Students Create
              </h2>
              <p className="lms-projects__intro">
                Learning becomes powerful when students build something real.
                Students finish each project with something they can proudly
                demo to friends and family.
              </p>
              <ul className="lms-projects__list">
                {PROJECTS.map((p) => (
                  <li key={p}>
                    <Zap size={16} className="lms-projects__check" /> {p}
                  </li>
                ))}
              </ul>
              <Link
                to="/playground"
                className="lms-btn lms-btn--outline"
                style={{ marginTop: 16 }}
              >
                Try the Labs <ArrowRight size={16} />
              </Link>
            </motion.div>
            <motion.div
              className="lms-projects__visual"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={bounceIn}
            >
              <div className="lms-projects__grid-art">
                <div className="lms-projects__block lms-projects__block--green">
                  <Cpu size={32} />
                </div>
                <div className="lms-projects__block lms-projects__block--blue">
                  <Gamepad2 size={32} />
                </div>
                <div className="lms-projects__block lms-projects__block--orange">
                  <CircuitBoard size={32} />
                </div>
                <div className="lms-projects__block lms-projects__block--purple">
                  <Box size={32} />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== 6. Grows With You ===== */}
      <section className="lms-scale">
        <div className="lms-container">
          <motion.h2
            className="lms-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            One Platform That Grows With You
          </motion.h2>
          <motion.p
            className="lms-section-subtitle"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            Whether you teach one child at home or run a multi-location STEM
            franchise, Stemplitude scales with your ambition. Start small, dream
            big.
          </motion.p>

          <div className="lms-scale__track">
            <div className="lms-scale__line" aria-hidden="true" />
            {SCALE_TIERS.map((tier, i) => (
              <motion.div
                key={tier.title}
                className="lms-scale-card"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                variants={fadeUp}
              >
                <div
                  className="lms-scale-card__dot"
                  style={{ background: tier.color }}
                />
                <div
                  className="lms-scale-card__icon"
                  style={{ background: tier.color + "15", color: tier.color }}
                >
                  {tier.icon}
                </div>
                <h3 className="lms-scale-card__title">{tier.title}</h3>
                <p className="lms-scale-card__desc">{tier.desc}</p>
              </motion.div>
            ))}
          </div>

          {!isAuthenticated ? (
            <motion.div
              className="lms-scale__cta"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <button
                type="button"
                className="lms-btn lms-btn--primary"
                onClick={openSignup}
              >
                Start Your STEM Journey <ArrowRight size={16} />
              </button>
            </motion.div>
          ) : null}
        </div>
      </section>

      {/* ===== 7. Testimonials ===== */}
      <section className="lms-testimonials">
        <div className="lms-container">
          <motion.h2
            className="lms-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            Loved by Students, Parents, and Educators
          </motion.h2>
          <div className="lms-testimonials__grid">
            <motion.div
              className="lms-testimonial-card"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <div className="lms-testimonial-card__stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={18} fill="#ffc800" color="#ffc800" />
                ))}
              </div>
              <blockquote>
                &ldquo;My children developed a strong interest in coding and
                robotics. Their confidence and problem-solving skills improved
                dramatically.&rdquo;
              </blockquote>
              <p className="lms-testimonial-card__author">
                <strong>Ola</strong> &middot; Parent of 3
              </p>
            </motion.div>
            <motion.div
              className="lms-testimonial-card"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={1}
              variants={fadeUp}
            >
              <div className="lms-testimonial-card__stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={18} fill="#ffc800" color="#ffc800" />
                ))}
              </div>
              <blockquote>
                &ldquo;Stemplitude makes it easy to manage classes while keeping
                students excited about learning technology.&rdquo;
              </blockquote>
              <p className="lms-testimonial-card__author">
                <strong>Sarah</strong> &middot; STEM Instructor
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== 8. Why Parents Love Stemplitude ===== */}
      <section className="lms-why">
        <div className="lms-container">
          <motion.h2
            className="lms-section-title"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            Why Families Choose Stemplitude
          </motion.h2>
          <motion.div
            className="lms-why__grid"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            {WHY_PARENTS.map((item, i) => (
              <motion.div
                key={item.title}
                className="lms-why-card"
                custom={i}
                variants={fadeUp}
              >
                <div className="lms-why-card__icon">{item.icon}</div>
                <h3 className="lms-why-card__title">{item.title}</h3>
                <p className="lms-why-card__desc">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== 9. Final CTA ===== */}
      <section className="lms-final-cta">
        <div className="lms-container">
          <motion.div
            className="lms-final-cta__inner"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={bounceIn}
          >
            <h2>Start Your Child&apos;s STEM Adventure Today</h2>
            <p>
              Give your child the tools to explore technology, build amazing
              projects, and develop skills for the future.
            </p>
            {!isAuthenticated ? (
              <>
                <div className="lms-final-cta__btns">
                  <button
                    type="button"
                    className="lms-btn lms-btn--primary lms-btn--lg"
                    onClick={openSignup}
                  >
                    Start Free Trial
                  </button>
                  <Link
                    to="/programs"
                    className="lms-btn lms-btn--outline lms-btn--lg lms-btn--outline-light"
                  >
                    Explore Programs
                  </Link>
                </div>
                <p className="lms-final-cta__trust">
                  14-day free trial. No credit card required.
                </p>
              </>
            ) : null}
          </motion.div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="lms-footer">
        <div className="lms-footer__top">
          <div className="lms-container">
            <div className="lms-footer__grid">
              <div className="lms-footer__brand">
                <Link to="/" className="lms-footer__logo">
                  <Zap size={20} className="lms-header__logo-icon" />
                  <span>Stemplitude</span>
                </Link>
                <p className="lms-footer__mission">
                  Our mission is to make STEM education accessible, fun, and
                  effective for every child.
                </p>
              </div>

              <div className="lms-footer__col">
                <h4>Platform</h4>
                <Link to="/learning">Labs</Link>
                <Link to="/programs">Programs</Link>
                <Link to="/camps">STEM Camps</Link>
                <Link to="/demo-days">Curriculum</Link>
              </div>

              <div className="lms-footer__col">
                <h4>Resources</h4>
                <Link to="/faq">STEM Learning Guide</Link>
                <Link to="/playground">Coding for Kids</Link>
                <Link to="/playground">Robotics Projects</Link>
                <Link to="/playground">STEM Activities</Link>
              </div>

              <div className="lms-footer__col">
                <h4>Company</h4>
                <Link to="/about">About</Link>
                <Link to="/contact">Contact</Link>
                <Link to="/faq">FAQ</Link>
              </div>

              <div className="lms-footer__col">
                <h4>Legal</h4>
                <Link to="/privacy">Privacy</Link>
                <Link to="/terms">Terms</Link>

                <h4 className="lms-footer__col-spacer">Socials</h4>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Twitter / X
                </a>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram
                </a>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Facebook
                </a>
                <a
                  href="https://youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  YouTube
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="lms-footer__bottom">
          <div className="lms-container">
            <div className="lms-footer__bottom-inner">
              <p>&copy; {new Date().getFullYear()} Stemplitude Inc.</p>
              <div className="lms-footer__legal">
                <Link to="/terms">Terms of Service</Link>
                <Link to="/privacy">Privacy Policy</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LMSHome;
