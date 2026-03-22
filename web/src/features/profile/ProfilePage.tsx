import { useEffect, useState } from "react";
import {
  User,
  Mail,
  Phone,
  FileText,
  Lock,
  Shield,
  Bell,
  Monitor,
  Sun,
  Moon,
  Smartphone,
  Trash2,
  Edit3,
  Check,
  Zap,
  Flame,
  Trophy,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useColorScheme, type ColorSchemePreference } from "../../hooks/useColorScheme";
import { KidDropdown, ProgressBar } from "../../components/ui";
import {
  getMyGamificationProfile,
  iconSlugToEmoji,
  type GamificationProfile,
} from "../../lib/api/gamification";
import "../../components/ui/ui.css";
import "./profile.css";

function getInitials(firstName: string, lastName: string): string {
  const first = firstName?.charAt(0) ?? "";
  const last = lastName?.charAt(0) ?? "";
  return (first + last).toUpperCase() || "?";
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    student: "Student",
    instructor: "Instructor",
    parent: "Parent",
    admin: "Admin",
    owner: "Owner",
    homeschool_parent: "Homeschool Parent",
  };
  return labels[role] ?? role;
}

export function ProfilePage() {
  const { user } = useAuth();
  const { preference, setColorScheme } = useColorScheme();
  const [isEditing, setIsEditing] = useState(false);
  const [gamification, setGamification] = useState<GamificationProfile | null>(null);

  useEffect(() => {
    if (user?.role === "student") {
      getMyGamificationProfile().then(setGamification).catch(() => {});
    }
  }, [user?.role]);
  const [form, setForm] = useState({
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    phone: "",
    bio: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    twoFactorEnabled: false,
    emailNotifications: true,
    sessionTimeout: "30",
  });

  const handleFormChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = () => {
    setForm((prev) => ({
      ...prev,
      firstName: (prev.firstName || user?.firstName) ?? "",
      lastName: (prev.lastName || user?.lastName) ?? "",
    }));
    setIsEditing(false);
  };

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() || "User" : "User";
  const displayEmail = user?.email ?? "—";
  const sessionTimeoutOptions = [
    { value: "15", label: "15 minutes" },
    { value: "30", label: "30 minutes" },
    { value: "60", label: "1 hour" },
    { value: "120", label: "2 hours" },
    { value: "0", label: "Never" },
  ];

  return (
    <div className="profile-page" role="main" aria-label="Profile">
      <header className="profile-page__header">
        <div className="profile-page__avatar" aria-hidden>
          {user ? getInitials(user.firstName, user.lastName) : "?"}
        </div>
        <div className="profile-page__header-info">
          <h1 className="profile-page__name">{displayName}</h1>
          <p className="profile-page__email">{displayEmail}</p>
          <span className="profile-page__role-badge">{user ? roleLabel(user.role) : "User"}</span>
        </div>
        <button
          type="button"
          className={`profile-page__edit-btn ${isEditing ? "profile-page__edit-btn--active" : ""}`}
          onClick={() => {
            if (isEditing) {
              handleSaveProfile();
            } else {
              setForm((prev) => ({
                ...prev,
                firstName: user?.firstName ?? "",
                lastName: user?.lastName ?? "",
              }));
              setIsEditing(true);
            }
          }}
        >
          {isEditing ? (
            <>
              <Check size={18} aria-hidden /> Done
            </>
          ) : (
            <>
              <Edit3 size={18} aria-hidden /> Edit Profile
            </>
          )}
        </button>
      </header>

      <div className="profile-page__sections">
        {/* Gamification showcase — students only */}
        {gamification && (
          <section className="profile-page__card profile-page__card--gamification" aria-labelledby="gamification-heading">
            <h2 id="gamification-heading" className="profile-page__card-title">
              <Trophy size={20} aria-hidden /> Progress & Achievements
            </h2>

            {/* Level + XP */}
            <div className="profile-gamification__level-row">
              <div className="profile-gamification__level-badge">
                <span className="profile-gamification__level-num">{gamification.level}</span>
                <span className="profile-gamification__level-name">{gamification.level_name}</span>
              </div>
              <div className="profile-gamification__xp-wrap">
                <ProgressBar
                  value={Math.min(100, ((gamification.total_xp - gamification.xp_start) / Math.max(1, gamification.xp_end - gamification.xp_start)) * 100)}
                  label={`${gamification.total_xp} / ${gamification.xp_end} XP`}
                  showPercent
                  variant="xp"
                />
              </div>
            </div>

            {/* Quick stats */}
            <div className="profile-gamification__stats">
              <div className="profile-gamification__stat">
                <Zap size={16} style={{ color: "var(--color-xp, #ffc800)" }} aria-hidden />
                <span className="profile-gamification__stat-value">{gamification.total_xp}</span>
                <span className="profile-gamification__stat-label">Total XP</span>
              </div>
              <div className="profile-gamification__stat">
                <Flame size={16} style={{ color: "#f97316" }} aria-hidden />
                <span className="profile-gamification__stat-value">{gamification.streak.current_streak}</span>
                <span className="profile-gamification__stat-label">Day streak</span>
              </div>
              <div className="profile-gamification__stat">
                <Trophy size={16} style={{ color: "var(--color-primary)" }} aria-hidden />
                <span className="profile-gamification__stat-value">{gamification.stats.total_badges}</span>
                <span className="profile-gamification__stat-label">Badges</span>
              </div>
            </div>

            {/* Badge showcase */}
            {gamification.badges.length > 0 && (
              <div className="profile-gamification__badges" role="list" aria-label="Earned badges">
                {gamification.badges.slice(0, 8).map((sb) => (
                  <div
                    key={sb.id}
                    className="profile-gamification__badge"
                    role="listitem"
                    title={`${sb.badge.name} — ${sb.badge.description}`}
                    style={{ "--badge-color": sb.badge.color } as React.CSSProperties}
                  >
                    <span className="profile-gamification__badge-emoji">
                      {iconSlugToEmoji(sb.badge.icon_slug)}
                    </span>
                    <span className="profile-gamification__badge-name">{sb.badge.name}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Personal Information */}
        <section className="profile-page__card" aria-labelledby="personal-heading">
          <h2 id="personal-heading" className="profile-page__card-title">
            <User size={20} aria-hidden /> Personal Information
          </h2>
          <div className="profile-page__fields">
            <div className="profile-page__field profile-page__field--half">
              <label htmlFor="first-name">First name</label>
              <input
                id="first-name"
                type="text"
                value={isEditing ? form.firstName : (user?.firstName ?? "")}
                onChange={(e) => handleFormChange("firstName", e.target.value)}
                readOnly={!isEditing}
                disabled={!isEditing}
              />
            </div>
            <div className="profile-page__field profile-page__field--half">
              <label htmlFor="last-name">Last name</label>
              <input
                id="last-name"
                type="text"
                value={isEditing ? form.lastName : (user?.lastName ?? "")}
                onChange={(e) => handleFormChange("lastName", e.target.value)}
                readOnly={!isEditing}
                disabled={!isEditing}
              />
            </div>
            <div className="profile-page__field">
              <label htmlFor="email">
                <Mail size={16} aria-hidden /> Email
              </label>
              <input
                id="email"
                type="email"
                value={displayEmail}
                readOnly
                disabled
                aria-describedby="email-hint"
              />
              <p id="email-hint" className="profile-page__hint">
                Contact admin to change
              </p>
            </div>
            <div className="profile-page__field">
              <label htmlFor="phone">
                <Phone size={16} aria-hidden /> Phone number
              </label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => handleFormChange("phone", e.target.value)}
                readOnly={!isEditing}
                disabled={!isEditing}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="profile-page__field">
              <label htmlFor="bio">
                <FileText size={16} aria-hidden /> Bio / About
              </label>
              <textarea
                id="bio"
                value={form.bio}
                onChange={(e) => handleFormChange("bio", e.target.value)}
                readOnly={!isEditing}
                disabled={!isEditing}
                rows={4}
                placeholder="Tell us about yourself..."
              />
            </div>
          </div>
        </section>

        {/* Account Settings */}
        <section className="profile-page__card" aria-labelledby="account-heading">
          <h2 id="account-heading" className="profile-page__card-title">
            <Lock size={20} aria-hidden /> Account Settings
          </h2>
          <div className="profile-page__fields">
            <div className="profile-page__field">
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                value={form.currentPassword}
                onChange={(e) => handleFormChange("currentPassword", e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="profile-page__field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={form.newPassword}
                onChange={(e) => handleFormChange("newPassword", e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="profile-page__field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => handleFormChange("confirmPassword", e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="profile-page__toggle-row">
              <div className="profile-page__toggle-label">
                <Shield size={18} aria-hidden />
                <span>Two-factor authentication</span>
              </div>
              <button
                type="button"
                className={`profile-page__toggle ${form.twoFactorEnabled ? "profile-page__toggle--on" : ""}`}
                onClick={() => handleFormChange("twoFactorEnabled", !form.twoFactorEnabled)}
                aria-pressed={form.twoFactorEnabled}
              >
                <span className="profile-page__toggle-thumb" />
              </button>
            </div>
            <div className="profile-page__toggle-row">
              <div className="profile-page__toggle-label">
                <Bell size={18} aria-hidden />
                <span>Email notifications</span>
              </div>
              <button
                type="button"
                className={`profile-page__toggle ${form.emailNotifications ? "profile-page__toggle--on" : ""}`}
                onClick={() => handleFormChange("emailNotifications", !form.emailNotifications)}
                aria-pressed={form.emailNotifications}
              >
                <span className="profile-page__toggle-thumb" />
              </button>
            </div>
            <div className="profile-page__field">
              <label>Session timeout</label>
              <KidDropdown
                value={form.sessionTimeout}
                onChange={(v) => handleFormChange("sessionTimeout", v)}
                options={sessionTimeoutOptions}
                ariaLabel="Session timeout"
                fullWidth
              />
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="profile-page__card" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className="profile-page__card-title">
            <Monitor size={20} aria-hidden /> Appearance
          </h2>
          <div className="profile-page__scheme-options">
            {(["light", "dark", "system"] as ColorSchemePreference[]).map((opt) => {
              const Icon = opt === "light" ? Sun : opt === "dark" ? Moon : Smartphone;
              return (
                <button
                  key={opt}
                  type="button"
                  className={`profile-page__scheme-btn ${preference === opt ? "profile-page__scheme-btn--active" : ""}`}
                  onClick={() => setColorScheme(opt)}
                  aria-pressed={preference === opt}
                >
                  <Icon size={20} aria-hidden />
                  <span>{opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Connected Accounts */}
        <section className="profile-page__card" aria-labelledby="connected-heading">
          <h2 id="connected-heading" className="profile-page__card-title">
            Connected Accounts
          </h2>
          <div className="profile-page__connected-badges">
            <span className="profile-page__badge profile-page__badge--google">Google</span>
            <span className="profile-page__badge profile-page__badge--microsoft">Microsoft</span>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="profile-page__card profile-page__card--danger" aria-labelledby="danger-heading">
          <h2 id="danger-heading" className="profile-page__card-title profile-page__card-title--danger">
            <Trash2 size={20} aria-hidden /> Danger Zone
          </h2>
          <p className="profile-page__danger-text">
            Once you delete your account, there is no going back. All your data will be permanently removed.
          </p>
          <button
            type="button"
            className="profile-page__delete-btn"
            disabled
            aria-disabled="true"
          >
            <Trash2 size={18} aria-hidden /> Delete Account
          </button>
        </section>
      </div>
    </div>
  );
}
