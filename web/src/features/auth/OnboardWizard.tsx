import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../providers/AuthProvider";
import { checkEmail, checkSlug } from "../../lib/api/auth";
import type { OnboardData } from "../../lib/api/auth";
import "./auth.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEBOUNCE_MS = 400;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type OrgType = "center" | "parent";

export function OnboardWizard() {
  const navigate = useNavigate();
  const { onboard } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1 fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2 fields
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgSlugManual, setOrgSlugManual] = useState(false);
  const [orgType, setOrgType] = useState<OrgType>("center");

  // Validation state
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedEmail = useDebounce(email, DEBOUNCE_MS);
  const debouncedSlug = useDebounce(orgSlug, DEBOUNCE_MS);

  // Auto-generate slug from org name
  useEffect(() => {
    if (!orgSlugManual && orgName) {
      setOrgSlug(slugFromName(orgName));
    }
  }, [orgName, orgSlugManual]);

  // Check email availability
  useEffect(() => {
    if (!debouncedEmail) {
      setEmailStatus("idle");
      setEmailMessage("");
      return;
    }
    if (!EMAIL_REGEX.test(debouncedEmail)) {
      setEmailStatus("invalid");
      setEmailMessage("Please enter a valid email address");
      return;
    }
    setEmailStatus("checking");
    setEmailMessage("");
    checkEmail(debouncedEmail)
      .then((res) => {
        setEmailStatus(res.available ? "available" : "taken");
        setEmailMessage(res.message);
      })
      .catch(() => {
        setEmailStatus("idle");
        setEmailMessage("");
      });
  }, [debouncedEmail]);

  // Check slug availability
  useEffect(() => {
    if (!debouncedSlug || debouncedSlug.length < 2) {
      setSlugStatus("idle");
      setSlugMessage("");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(debouncedSlug)) {
      setSlugStatus("invalid");
      setSlugMessage("Slug can only contain lowercase letters, numbers, and hyphens");
      return;
    }
    setSlugStatus("checking");
    setSlugMessage("");
    checkSlug(debouncedSlug)
      .then((res) => {
        setSlugStatus(res.available ? "available" : "taken");
        setSlugMessage(res.message);
      })
      .catch(() => {
        setSlugStatus("idle");
        setSlugMessage("");
      });
  }, [debouncedSlug]);

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    setOrgSlugManual(false);
  };

  const handleOrgSlugChange = (value: string) => {
    setOrgSlug(value);
    setOrgSlugManual(true);
  };

  const step1Valid =
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    EMAIL_REGEX.test(email) &&
    emailStatus === "available" &&
    password.length >= 8 &&
    password === confirmPassword;

  const step2Valid =
    orgName.trim() &&
    orgSlug.trim().length >= 2 &&
    /^[a-z0-9-]+$/.test(orgSlug) &&
    slugStatus === "available";

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step1Valid) setStep(2);
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step2Valid) return;

    setError(null);
    setIsLoading(true);

    const data: OnboardData = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      password,
      organization: {
        name: orgName.trim(),
        slug: orgSlug.trim(),
        type: orgType,
      },
    };

    try {
      await onboard(data);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ maxWidth: "520px" }}
      >
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">
          {step === 1 ? "Step 1 of 2: Your account" : "Step 2 of 2: Your organization"}
        </p>

        <div className="wizard-progress">
          <div className={`wizard-progress__step ${step >= 1 ? "wizard-progress__step--active" : ""} ${step > 1 ? "wizard-progress__step--completed" : ""}`}>
            <span className="wizard-progress__dot" />
            Step 1
          </div>
          <div className="wizard-progress__separator" />
          <div className={`wizard-progress__step ${step >= 2 ? "wizard-progress__step--active" : ""}`}>
            <span className="wizard-progress__dot" />
            Step 2
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.form
              key="step1"
              className="auth-form"
              onSubmit={handleStep1Submit}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="auth-form-group">
                <label htmlFor="firstName" className="auth-label">
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  className="auth-input"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div className="auth-form-group">
                <label htmlFor="lastName" className="auth-label">
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  className="auth-input"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
              <div className="auth-form-group">
                <label htmlFor="email" className="auth-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className={`auth-input ${emailStatus === "taken" || emailStatus === "invalid" ? "auth-input--error" : ""}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                {emailStatus === "checking" && <span className="auth-success">Checking…</span>}
                {emailStatus === "available" && <span className="auth-success">✓ {emailMessage || "Available"}</span>}
                {(emailStatus === "taken" || emailStatus === "invalid") && (
                  <span className="auth-error">{emailMessage}</span>
                )}
              </div>
              <div className="auth-form-group">
                <label htmlFor="password" className="auth-label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="auth-input"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <div className="auth-form-group">
                <label htmlFor="confirmPassword" className="auth-label">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className={`auth-input ${confirmPassword && password !== confirmPassword ? "auth-input--error" : ""}`}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {confirmPassword && password !== confirmPassword && (
                  <span className="auth-error">Passwords do not match</span>
                )}
              </div>
              <button
                type="submit"
                className="auth-btn auth-btn--primary"
                disabled={!step1Valid}
              >
                Continue
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="step2"
              className="auth-form"
              onSubmit={handleStep2Submit}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="auth-form-group">
                <label htmlFor="orgName" className="auth-label">
                  Organization name
                </label>
                <input
                  id="orgName"
                  type="text"
                  className="auth-input"
                  placeholder="e.g. Sunny Day Learning Center"
                  value={orgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                />
              </div>
              <div className="auth-form-group">
                <label htmlFor="orgSlug" className="auth-label">
                  URL slug
                </label>
                <input
                  id="orgSlug"
                  type="text"
                  className={`auth-input ${slugStatus === "taken" || slugStatus === "invalid" ? "auth-input--error" : ""}`}
                  placeholder="sunny-day-learning"
                  value={orgSlug}
                  onChange={(e) => handleOrgSlugChange(e.target.value)}
                  style={{ fontFamily: "monospace" }}
                />
                {slugStatus === "checking" && <span className="auth-success">Checking…</span>}
                {slugStatus === "available" && <span className="auth-success">✓ {slugMessage || "Available"}</span>}
                {(slugStatus === "taken" || slugStatus === "invalid") && (
                  <span className="auth-error">{slugMessage}</span>
                )}
              </div>
              <div className="auth-form-group">
                <label className="auth-label">Organization type</label>
                <div style={{ display: "flex", gap: "24px", marginTop: "4px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "var(--color-text, #e2e8f0)" }}>
                    <input
                      type="radio"
                      name="orgType"
                      value="center"
                      checked={orgType === "center"}
                      onChange={() => setOrgType("center")}
                    />
                    Center / School
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "var(--color-text, #e2e8f0)" }}>
                    <input
                      type="radio"
                      name="orgType"
                      value="parent"
                      checked={orgType === "parent"}
                      onChange={() => setOrgType("parent")}
                    />
                    Parent
                  </label>
                </div>
              </div>
              {error && (
                <motion.div className="auth-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {error}
                </motion.div>
              )}
              <div className="wizard-actions">
                <button
                  type="button"
                  className="auth-btn auth-btn--ghost"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="auth-btn auth-btn--primary"
                  disabled={!step2Valid || isLoading}
                >
                  {isLoading ? "Creating…" : "Create account"}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="auth-footer" style={{ marginTop: "24px" }}>
          <Link to="/auth" className="auth-link">
            ← Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
