import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { GraduationCap, School, Users } from "lucide-react";
import "./auth.css";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const roles = [
  {
    title: "I'm a Student",
    description: "Log in with your class code or email to access your learning.",
    icon: GraduationCap,
    to: "/auth/student-login",
  },
  {
    title: "I'm a Teacher/Admin",
    description: "Manage your classes and students with your account.",
    icon: School,
    to: "/auth/login",
  },
  {
    title: "I'm a Parent",
    description: "View your child's progress and stay connected.",
    icon: Users,
    to: "/auth/login",
  },
];

export function RolePickerPage() {
  return (
    <div className="auth-page">
      <motion.div
        className="auth-card"
        style={{ maxWidth: "680px" }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="auth-title">Welcome!</h1>
        <p className="auth-subtitle">Choose how you'd like to sign in</p>

        <motion.div
          className="role-picker-grid"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {roles.map((role) => (
            <motion.div key={role.title} variants={item}>
              <Link to={role.to} className="role-card">
                <role.icon className="role-card__icon" aria-hidden />
                <span className="role-card__title">{role.title}</span>
                <span className="role-card__desc">{role.description}</span>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="auth-footer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          New organization?{" "}
          <Link to="/auth/onboard" className="auth-link">
            Create an account
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
