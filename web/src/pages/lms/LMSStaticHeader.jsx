import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, Zap } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import "../LMSHome.css";

export default function LMSStaticHeader({ solidHero = false }) {
  const { user, isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const welcomeName = useMemo(
    () => user?.firstName?.trim() || user?.email?.split("@")[0]?.trim() || "there",
    [user?.firstName, user?.email],
  );

  return (
    <header
      className="lms-header"
      data-scrolled={solidHero || scrolled || undefined}
    >
      <div className="lms-header__inner">
        <Link to="/" className="lms-header__logo">
          <Zap size={22} className="lms-header__logo-icon" />
          <span>Stemplitude</span>
        </Link>

        <nav className="lms-header__nav" data-open={mobileMenuOpen || undefined}>
          <a
            href="http://blog.stemplitude.localhost"
            className="lms-header__link"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileMenuOpen(false)}
          >
            Blog
          </a>
          <Link to="/explore" className="lms-header__link" onClick={() => setMobileMenuOpen(false)}>
            Explore
          </Link>
          <Link to="/about" className="lms-header__link" onClick={() => setMobileMenuOpen(false)}>
            About
          </Link>
          <Link to="/faq" className="lms-header__link" onClick={() => setMobileMenuOpen(false)}>
            FAQ
          </Link>
        </nav>

        <div className="lms-header__actions">
          {isAuthenticated ? (
            <Link to="/app" className="lms-header__welcome">
              <span className="lms-header__welcome-text">Welcome {welcomeName}</span>
              <strong className="lms-header__welcome-jump">Jump in!</strong>
            </Link>
          ) : (
            <>
              <Link to="/" className="lms-header__login">
                Log in
              </Link>
              <Link to="/auth/onboard" className="lms-btn lms-btn--primary lms-btn--sm">
                Get started
              </Link>
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
  );
}
