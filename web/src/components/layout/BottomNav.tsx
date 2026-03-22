import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { House, FlaskConical, Trophy, User } from "lucide-react";
import "./bottom-nav.css";

const TABS = [
  { path: "/app", label: "Home", icon: House },
  { path: "/app/labs", label: "Labs", icon: FlaskConical },
  { path: "/app/achievements", label: "Badges", icon: Trophy },
  { path: "/app/profile", label: "Me", icon: User },
] as const;

export function BottomNav() {
  return (
    <nav
      className="bottom-nav"
      role="navigation"
      aria-label="Bottom navigation"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `bottom-nav__link ${isActive ? "active" : ""}`
            }
            end={tab.path === "/app"}
            aria-current={undefined}
          >
            {({ isActive }) => (
              <>
                <div className="bottom-nav__icon-wrapper">
                  <motion.div
                    animate={{ scale: isActive ? 1.15 : 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 15,
                    }}
                  >
                    <Icon
                      className="bottom-nav__icon"
                      aria-hidden
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  </motion.div>
                </div>
                <span className="bottom-nav__label">{tab.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
