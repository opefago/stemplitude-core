import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, Clock, UserCheck, Users, XCircle } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import {
  acceptInvite,
  validateInviteToken,
  type ValidateInviteResponse,
} from "../../lib/api/invitations";
import { login as apiLogin, register as apiRegister } from "../../lib/api/auth";
import "./auth.css";
import "./accept-invite.css";

type Tab = "login" | "register";

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [invite, setInvite] = useState<ValidateInviteResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("No invite token found in the link.");
      setLoading(false);
      return;
    }
    validateInviteToken(token)
      .then((data) => {
        setInvite(data);
        setEmail(data.email);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Invalid or expired invitation.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await acceptInvite(token);
      setAccepted(true);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to accept invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoginAndAccept(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiLogin(email, password);
      await handleAccept();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Login failed. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleRegisterAndAccept(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRegister({ email, password, first_name: firstName, last_name: lastName });
      await handleAccept();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Registration failed. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card accept-invite__card">
          <p className="auth-subtitle">Checking invitation…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="auth-page">
        <motion.div
          className="auth-card accept-invite__card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="accept-invite__status-icon accept-invite__status-icon--error">
            <XCircle size={40} />
          </div>
          <h1 className="auth-title">Invitation Invalid</h1>
          <p className="auth-subtitle">{loadError}</p>
          <button className="ui-btn ui-btn--primary accept-invite__cta" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </motion.div>
      </div>
    );
  }

  if (invite && (invite.status === "expired" || invite.status === "revoked")) {
    return (
      <div className="auth-page">
        <motion.div
          className="auth-card accept-invite__card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="accept-invite__status-icon accept-invite__status-icon--error">
            <Clock size={40} />
          </div>
          <h1 className="auth-title">Invitation {invite.status === "expired" ? "Expired" : "Revoked"}</h1>
          <p className="auth-subtitle">
            This invitation is no longer valid. Please ask your admin to send a new one.
          </p>
          <button className="ui-btn ui-btn--ghost accept-invite__cta" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </motion.div>
      </div>
    );
  }

  if (invite && invite.status === "accepted" && !accepted) {
    return (
      <div className="auth-page">
        <motion.div
          className="auth-card accept-invite__card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="accept-invite__status-icon accept-invite__status-icon--success">
            <CheckCircle size={40} />
          </div>
          <h1 className="auth-title">Already Accepted</h1>
          <p className="auth-subtitle">
            This invitation has already been accepted. Sign in to access your workspace.
          </p>
          <button
            className="ui-btn ui-btn--primary accept-invite__cta"
            onClick={() => navigate("/auth/login")}
          >
            Sign In
          </button>
        </motion.div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="auth-page">
        <motion.div
          className="auth-card accept-invite__card"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="accept-invite__status-icon accept-invite__status-icon--success">
            <CheckCircle size={40} />
          </div>
          <h1 className="auth-title">You're in! 🎉</h1>
          <p className="auth-subtitle">
            You've successfully joined <strong>{invite?.tenant_name}</strong>.
          </p>
          <button
            className="ui-btn ui-btn--primary accept-invite__cta"
            onClick={() => navigate("/app")}
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card accept-invite__card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Invite summary */}
        <div className="accept-invite__org">
          <div className="accept-invite__org-icon">
            {invite?.invite_type === "parent" ? <Users size={28} /> : <UserCheck size={28} />}
          </div>
          <div>
            <p className="accept-invite__org-label">Invited to join</p>
            <p className="accept-invite__org-name">{invite?.tenant_name}</p>
          </div>
        </div>

        <div className="accept-invite__meta">
          <span className="accept-invite__meta-row">
            <strong>Invited by:</strong> {invite?.inviter_name}
          </span>
          {invite?.invite_type === "user" && invite.role_name && (
            <span className="accept-invite__meta-row">
              <strong>Role:</strong> {invite.role_name}
            </span>
          )}
          {invite?.invite_type === "parent" && invite.student_names && invite.student_names.length > 0 && (
            <span className="accept-invite__meta-row">
              <strong>Children:</strong> {invite.student_names.join(", ")}
            </span>
          )}
        </div>

        {/* Already logged in — one-click accept */}
        {isAuthenticated ? (
          <>
            <p className="auth-subtitle" style={{ marginBottom: "1rem" }}>
              You're already signed in. Click below to accept and join.
            </p>
            {formError && <p className="accept-invite__error">{formError}</p>}
            <button
              className="ui-btn ui-btn--primary accept-invite__cta"
              onClick={() => void handleAccept()}
              disabled={submitting}
            >
              {submitting ? "Joining…" : "Accept & Join"}
            </button>
          </>
        ) : (
          <>
            {/* Tab switcher */}
            <div className="accept-invite__tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "login"}
                className={`accept-invite__tab${tab === "login" ? " accept-invite__tab--active" : ""}`}
                onClick={() => { setTab("login"); setFormError(null); }}
                type="button"
              >
                Sign In
              </button>
              <button
                role="tab"
                aria-selected={tab === "register"}
                className={`accept-invite__tab${tab === "register" ? " accept-invite__tab--active" : ""}`}
                onClick={() => { setTab("register"); setFormError(null); }}
                type="button"
              >
                Create Account
              </button>
            </div>

            {formError && <p className="accept-invite__error">{formError}</p>}

            {tab === "login" ? (
              <form className="auth-form" onSubmit={(e) => void handleLoginAndAccept(e)}>
                <div className="auth-form-group">
                  <label className="auth-label" htmlFor="invite-email">Email</label>
                  <input
                    id="invite-email"
                    className="auth-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="auth-form-group">
                  <label className="auth-label" htmlFor="invite-password">Password</label>
                  <input
                    id="invite-password"
                    className="auth-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  className="ui-btn ui-btn--primary accept-invite__cta"
                  disabled={submitting}
                >
                  {submitting ? "Signing in…" : "Sign In & Accept"}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={(e) => void handleRegisterAndAccept(e)}>
                <div className="accept-invite__name-row">
                  <div className="auth-form-group">
                    <label className="auth-label" htmlFor="invite-first-name">First name</label>
                    <input
                      id="invite-first-name"
                      className="auth-input"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="auth-form-group">
                    <label className="auth-label" htmlFor="invite-last-name">Last name</label>
                    <input
                      id="invite-last-name"
                      className="auth-input"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div className="auth-form-group">
                  <label className="auth-label" htmlFor="invite-reg-email">Email</label>
                  <input
                    id="invite-reg-email"
                    className="auth-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="auth-form-group">
                  <label className="auth-label" htmlFor="invite-reg-password">Password</label>
                  <input
                    id="invite-reg-password"
                    className="auth-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                </div>
                <button
                  type="submit"
                  className="ui-btn ui-btn--primary accept-invite__cta"
                  disabled={submitting}
                >
                  {submitting ? "Creating account…" : "Create Account & Accept"}
                </button>
              </form>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
