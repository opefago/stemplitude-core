import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../../providers/AuthProvider";
import type { StudentLoginData } from "../../lib/api/auth";
import "./auth.css";

type LoginMode = "code" | "email";

export function StudentLoginPage() {
  const navigate = useNavigate();
  const { studentLogin } = useAuth();
  const [mode, setMode] = useState<LoginMode>("code");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function getFriendlyLoginError(err: unknown): string {
    const raw = err instanceof Error ? err.message : "";
    const lower = raw.toLowerCase();
    if (lower.includes("value is not a valid email")) {
      return "Please enter a valid email address.";
    }
    if (lower.includes("either (username + tenant_slug/tenant_code) or email required")) {
      return "Enter your email, or use username with class code.";
    }
    if (lower.includes("cannot use both tenant-scoped and global login")) {
      return "Use either email login or username + class code.";
    }
    if (lower.includes("tenant not found")) {
      return "Class code not found. Please check and try again.";
    }
    if (lower.includes("invalid username or password") || lower.includes("invalid email or password")) {
      return "Invalid login details. Please try again.";
    }
    if (raw.trim().startsWith("[{")) {
      return "We could not sign you in. Please check your details and try again.";
    }
    return raw || "Login failed. Please try again.";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "code") {
      if (!username || !code || !password) {
        setError("Please fill in all fields.");
        return;
      }
    } else {
      if (!email || !password) {
        setError("Please enter your email and password.");
        return;
      }
    }

    setIsLoading(true);
    try {
      const data: StudentLoginData =
        mode === "code"
          ? { username, tenant_code: code, password }
          : { email, password };
      await studentLogin(data);
      navigate("/app");
    } catch (err: unknown) {
      setError(getFriendlyLoginError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card auth-card--student"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="auth-title">Student sign in</h1>
        <p className="auth-subtitle">Welcome back! Choose how you'd like to log in</p>

        <div className="auth-toggle">
          <button
            type="button"
            className={`auth-toggle__btn ${mode === "code" ? "auth-toggle__btn--active" : ""}`}
            onClick={() => setMode("code")}
          >
            Login with code
          </button>
          <button
            type="button"
            className={`auth-toggle__btn ${mode === "email" ? "auth-toggle__btn--active" : ""}`}
            onClick={() => setMode("email")}
          >
            Login with email
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "code" ? (
            <>
              <div className="auth-form-group">
                <label htmlFor="username" className="auth-label">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  className="auth-input auth-input--student"
                  placeholder="Your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={isLoading}
                />
              </div>
              <div className="auth-form-group">
                <label htmlFor="code" className="auth-label">
                  Class code
                </label>
                <input
                  id="code"
                  type="text"
                  className="auth-input auth-input--student"
                  placeholder="e.g. ABC-123"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoComplete="off"
                  disabled={isLoading}
                />
              </div>
            </>
          ) : (
            <div className="auth-form-group">
              <label htmlFor="email" className="auth-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="auth-input auth-input--student"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={isLoading}
              />
            </div>
          )}

          <div className="auth-form-group">
            <label htmlFor="password" className="auth-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="auth-input auth-input--student"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "code" ? "current-password" : "current-password"}
              disabled={isLoading}
            />
          </div>

          {error && (
            <motion.div
              className="auth-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            className="auth-btn auth-btn--primary"
            disabled={isLoading}
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: "24px" }}>
          <Link to="/auth" className="auth-link">
            ← Back
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
