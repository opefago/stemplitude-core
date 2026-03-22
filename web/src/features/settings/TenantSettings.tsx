import { useEffect, useMemo, useState } from "react";
import {
  Settings,
  FlaskConical,
  Palette,
  Users,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { useTenant } from "../../providers/TenantProvider";
import {
  createSupportAccessGrant,
  getSupportAccessOptions,
  listSupportAccessGrants,
  revokeSupportAccessGrant,
  type SupportAccessGrant,
  type SupportAccessRoleOption,
  type SupportAccessUserOption,
} from "../../lib/api/tenants";
import { KidDropdown } from "../../components/ui";
import "../../components/ui/ui.css";
import "./settings.css";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese (Simplified)" },
  { value: "yo", label: "Yoruba" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Toronto", label: "Toronto (ET)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const LABS = [
  { id: "circuit-maker", name: "Circuit Maker" },
  { id: "micro-maker", name: "Micro Maker" },
  { id: "python-game", name: "Python Game Maker" },
  { id: "game-maker", name: "Game Maker" },
  { id: "design-maker", name: "Design Maker" },
];

const UI_MODES = [
  { value: "auto", label: "Auto" },
  { value: "kids", label: "Kids" },
  { value: "explorer", label: "Explorer" },
  { value: "pro", label: "Pro" },
];

type TabId = "general" | "labs" | "ui" | "parent" | "support" | "danger";

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "labs", label: "Lab Settings", icon: FlaskConical },
  { id: "ui", label: "UI Policy", icon: Palette },
  { id: "parent", label: "Parent Policies", icon: Users },
  { id: "support", label: "Support Access", icon: Shield },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export function TenantSettings() {
  const { tenant } = useTenant();
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [labEnabled, setLabEnabled] = useState<Record<string, boolean>>(() =>
    LABS.reduce((acc, lab) => ({ ...acc, [lab.id]: true }), {})
  );
  const [uiMode, setUiMode] = useState("auto");
  const [allowCancel, setAllowCancel] = useState(true);
  const [allowReschedule, setAllowReschedule] = useState(true);
  const [cancelDeadlineHours, setCancelDeadlineHours] = useState(24);
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [supportUsers, setSupportUsers] = useState<SupportAccessUserOption[]>([]);
  const [supportRoles, setSupportRoles] = useState<SupportAccessRoleOption[]>([]);
  const [supportGrants, setSupportGrants] = useState<SupportAccessGrant[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportSuccess, setSupportSuccess] = useState("");
  const [selectedSupportUserId, setSelectedSupportUserId] = useState("");
  const [selectedSupportRoleId, setSelectedSupportRoleId] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [supportExpiry, setSupportExpiry] = useState(() => {
    const dt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });

  const tenantName = tenant?.name ?? "Organization";
  const tenantSlug = tenant?.slug ?? "org";
  const contactEmail = "admin@example.com";
  const roleNameById = useMemo(
    () => Object.fromEntries(supportRoles.map((item) => [item.id, item.name])),
    [supportRoles],
  );
  const supportUserLabelById = useMemo(
    () =>
      Object.fromEntries(
        supportUsers.map((item) => [
          item.id,
          `${item.first_name} ${item.last_name}`.trim() || item.email,
        ]),
      ),
    [supportUsers],
  );

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;

    async function loadSupportAccess() {
      setSupportLoading(true);
      setSupportError("");
      try {
        const [options, grants] = await Promise.all([
          getSupportAccessOptions(tenant.id),
          listSupportAccessGrants(tenant.id),
        ]);
        if (cancelled) return;
        setSupportUsers(options.support_users);
        setSupportRoles(options.roles);
        setSupportGrants(grants.items);
      } catch (error) {
        if (cancelled) return;
        setSupportError(error instanceof Error ? error.message : "Failed to load support access");
      } finally {
        if (!cancelled) setSupportLoading(false);
      }
    }

    loadSupportAccess();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  const refreshSupportGrants = async () => {
    if (!tenant?.id) return;
    const grants = await listSupportAccessGrants(tenant.id);
    setSupportGrants(grants.items);
  };

  const handleCreateSupportGrant = async () => {
    if (!tenant?.id) return;
    setSupportError("");
    setSupportSuccess("");
    try {
      await createSupportAccessGrant(tenant.id, {
        support_user_id: selectedSupportUserId,
        role_id: selectedSupportRoleId,
        reason: supportReason.trim() || undefined,
        expires_at: new Date(supportExpiry).toISOString(),
      });
      setSupportSuccess("Support access granted.");
      setSupportReason("");
      await refreshSupportGrants();
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Failed to grant support access");
    }
  };

  const handleRevokeSupportGrant = async (grantId: string) => {
    if (!tenant?.id) return;
    setSupportError("");
    setSupportSuccess("");
    try {
      await revokeSupportAccessGrant(tenant.id, grantId);
      setSupportSuccess("Support access revoked.");
      await refreshSupportGrants();
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Failed to revoke support access");
    }
  };

  return (
    <div
      className="tenant-settings"
      role="main"
      aria-label="Tenant settings"
    >
      <header className="tenant-settings__header">
        <h1 className="tenant-settings__title">Organization Settings</h1>
        <p className="tenant-settings__subtitle">
          Manage your organization configuration
        </p>
      </header>

      <div className="tenant-settings__layout">
        <nav
          className="tenant-settings__nav"
          role="tablist"
          aria-label="Settings sections"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                className={`tenant-settings__nav-btn ${
                  activeTab === tab.id ? "tenant-settings__nav-btn--active" : ""
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="tenant-settings__content">
          {/* General */}
          <section
            id="panel-general"
            role="tabpanel"
            aria-labelledby="tab-general"
            hidden={activeTab !== "general"}
            className="tenant-settings__panel"
          >
            <h2 className="tenant-settings__panel-title">General</h2>
            <div className="tenant-settings__form">
              <div className="tenant-settings__field">
                <label htmlFor="org-name">Organization name</label>
                <input
                  id="org-name"
                  type="text"
                  value={tenantName}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-slug">Slug</label>
                <input
                  id="org-slug"
                  type="text"
                  value={tenantSlug}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="contact-email">Contact email</label>
                <input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  readOnly
                  className="tenant-settings__input tenant-settings__input--readonly"
                  aria-readonly="true"
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-language">Language</label>
                <KidDropdown
                  value={language}
                  onChange={setLanguage}
                  fullWidth
                  ariaLabel="Language"
                  options={LANGUAGES}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="org-timezone">Timezone</label>
                <KidDropdown
                  value={timezone}
                  onChange={setTimezone}
                  fullWidth
                  ariaLabel="Timezone"
                  options={TIMEZONES}
                />
              </div>
            </div>
          </section>

          {/* Lab Settings */}
          <section
            id="panel-labs"
            role="tabpanel"
            aria-labelledby="tab-labs"
            hidden={activeTab !== "labs"}
            className="tenant-settings__panel"
          >
            <h2 className="tenant-settings__panel-title">Lab Settings</h2>
            <p className="tenant-settings__panel-desc">
              Enable or disable labs for your organization
            </p>
            <div className="tenant-settings__toggles">
              {LABS.map((lab) => (
                <div
                  key={lab.id}
                  className="tenant-settings__toggle-row"
                  role="group"
                  aria-label={`${lab.name} lab`}
                >
                  <label
                    htmlFor={`lab-${lab.id}`}
                    className="tenant-settings__toggle-label"
                  >
                    {lab.name}
                  </label>
                  <button
                    id={`lab-${lab.id}`}
                    type="button"
                    role="switch"
                    aria-checked={labEnabled[lab.id]}
                    className={`tenant-settings__switch ${
                      labEnabled[lab.id] ? "tenant-settings__switch--on" : ""
                    }`}
                    onClick={() =>
                      setLabEnabled((prev) => ({
                        ...prev,
                        [lab.id]: !prev[lab.id],
                      }))
                    }
                  >
                    <span className="tenant-settings__switch-track">
                      <span className="tenant-settings__switch-thumb" />
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* UI Policy */}
          <section
            id="panel-ui"
            role="tabpanel"
            aria-labelledby="tab-ui"
            hidden={activeTab !== "ui"}
            className="tenant-settings__panel"
          >
            <h2 className="tenant-settings__panel-title">UI Policy</h2>
            <p className="tenant-settings__panel-desc">
              Set tenant-wide UI mode
            </p>
            <div className="tenant-settings__field">
              <label htmlFor="ui-mode">UI mode</label>
              <KidDropdown
                value={uiMode}
                onChange={setUiMode}
                fullWidth
                ariaLabel="UI mode"
                options={UI_MODES}
              />
            </div>
          </section>

          {/* Parent Policies */}
          <section
            id="panel-parent"
            role="tabpanel"
            aria-labelledby="tab-parent"
            hidden={activeTab !== "parent"}
            className="tenant-settings__panel"
          >
            <h2 className="tenant-settings__panel-title">Parent Policies</h2>
            <p className="tenant-settings__panel-desc">
              Configure parent-facing policies
            </p>
            <div className="tenant-settings__toggles">
              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Allow cancel"
              >
                <label
                  htmlFor="allow-cancel"
                  className="tenant-settings__toggle-label"
                >
                  Allow cancel
                </label>
                <button
                  id="allow-cancel"
                  type="button"
                  role="switch"
                  aria-checked={allowCancel}
                  className={`tenant-settings__switch ${
                    allowCancel ? "tenant-settings__switch--on" : ""
                  }`}
                  onClick={() => setAllowCancel((v) => !v)}
                >
                  <span className="tenant-settings__switch-track">
                    <span className="tenant-settings__switch-thumb" />
                  </span>
                </button>
              </div>
              <div
                className="tenant-settings__toggle-row"
                role="group"
                aria-label="Allow reschedule"
              >
                <label
                  htmlFor="allow-reschedule"
                  className="tenant-settings__toggle-label"
                >
                  Allow reschedule
                </label>
                <button
                  id="allow-reschedule"
                  type="button"
                  role="switch"
                  aria-checked={allowReschedule}
                  className={`tenant-settings__switch ${
                    allowReschedule ? "tenant-settings__switch--on" : ""
                  }`}
                  onClick={() => setAllowReschedule((v) => !v)}
                >
                  <span className="tenant-settings__switch-track">
                    <span className="tenant-settings__switch-thumb" />
                  </span>
                </button>
              </div>
            </div>
            <div className="tenant-settings__field">
              <label htmlFor="cancel-deadline">Cancel deadline (hours)</label>
              <input
                id="cancel-deadline"
                type="number"
                min={0}
                value={cancelDeadlineHours}
                onChange={(e) =>
                  setCancelDeadlineHours(Number(e.target.value) || 0)
                }
                className="tenant-settings__input"
              />
            </div>
          </section>

          {/* Support Access */}
          <section
            id="panel-support"
            role="tabpanel"
            aria-labelledby="tab-support"
            hidden={activeTab !== "support"}
            className="tenant-settings__panel"
          >
            <h2 className="tenant-settings__panel-title">Support Access</h2>
            <p className="tenant-settings__panel-desc">
              Grant time-limited, role-scoped access to a specific STEMplitude support user.
            </p>

            <div className="tenant-settings__support-grid">
              <div className="tenant-settings__support-card">
                <h3 className="tenant-settings__support-title">Grant access</h3>
                <div className="tenant-settings__form">
                  <div className="tenant-settings__field">
                    <label htmlFor="support-user">Support user</label>
                    <KidDropdown
                      value={selectedSupportUserId}
                      onChange={setSelectedSupportUserId}
                      fullWidth
                      ariaLabel="Support user"
                      options={[
                        { value: "", label: "Select a support user" },
                        ...supportUsers.map((user) => ({
                          value: user.id,
                          label: `${`${user.first_name} ${user.last_name}`.trim() || user.email}${user.global_role ? ` • ${user.global_role}` : ""}`,
                        })),
                      ]}
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-role">Tenant role scope</label>
                    <KidDropdown
                      value={selectedSupportRoleId}
                      onChange={setSelectedSupportRoleId}
                      fullWidth
                      ariaLabel="Tenant role scope"
                      options={[
                        { value: "", label: "Select tenant role" },
                        ...supportRoles.map((roleOption) => ({
                          value: roleOption.id,
                          label: roleOption.name,
                        })),
                      ]}
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-expiry">Expires at</label>
                    <input
                      id="support-expiry"
                      type="datetime-local"
                      value={supportExpiry}
                      onChange={(e) => setSupportExpiry(e.target.value)}
                      className="tenant-settings__input"
                    />
                  </div>

                  <div className="tenant-settings__field">
                    <label htmlFor="support-reason">Reason</label>
                    <input
                      id="support-reason"
                      type="text"
                      value={supportReason}
                      onChange={(e) => setSupportReason(e.target.value)}
                      className="tenant-settings__input tenant-settings__input--wide"
                      placeholder="Investigating sync issue, billing issue, onboarding help..."
                    />
                  </div>

                  {(supportError || supportSuccess) && (
                    <div
                      className={`tenant-settings__support-message ${
                        supportError
                          ? "tenant-settings__support-message--error"
                          : "tenant-settings__support-message--success"
                      }`}
                    >
                      {supportError || supportSuccess}
                    </div>
                  )}

                  <div className="tenant-settings__support-actions">
                    <button
                      type="button"
                      className="tenant-settings__primary-btn"
                      disabled={
                        supportLoading ||
                        !selectedSupportUserId ||
                        !selectedSupportRoleId ||
                        !supportExpiry
                      }
                      onClick={handleCreateSupportGrant}
                    >
                      Grant support access
                    </button>
                  </div>
                </div>
              </div>

              <div className="tenant-settings__support-card">
                <h3 className="tenant-settings__support-title">Active and past grants</h3>
                {supportLoading ? (
                  <p className="tenant-settings__panel-desc">Loading support grants...</p>
                ) : supportGrants.length === 0 ? (
                  <p className="tenant-settings__panel-desc">No support access grants yet.</p>
                ) : (
                  <div className="tenant-settings__support-list">
                    {supportGrants.map((grant) => {
                      const isExpired = new Date(grant.expires_at).getTime() <= Date.now();
                      const isRevoked = grant.status !== "active" || !!grant.revoked_at || isExpired;
                      return (
                        <div key={grant.id} className="tenant-settings__support-item">
                          <div className="tenant-settings__support-item-main">
                            <div className="tenant-settings__support-item-name">
                              {supportUserLabelById[grant.support_user_id] ?? grant.support_user_id}
                            </div>
                            <div className="tenant-settings__support-item-meta">
                              <span>{roleNameById[grant.role_id ?? ""] ?? "No role scope"}</span>
                              <span>Expires {new Date(grant.expires_at).toLocaleString()}</span>
                              {grant.reason && <span>{grant.reason}</span>}
                            </div>
                          </div>
                          <div className="tenant-settings__support-item-actions">
                            <span
                              className={`tenant-settings__status-badge ${
                                isRevoked
                                  ? "tenant-settings__status-badge--inactive"
                                  : "tenant-settings__status-badge--active"
                              }`}
                            >
                              {isExpired ? "Expired" : isRevoked ? "Revoked" : "Active"}
                            </span>
                            {!isRevoked && (
                              <button
                                type="button"
                                className="tenant-settings__secondary-btn"
                                onClick={() => handleRevokeSupportGrant(grant.id)}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section
            id="panel-danger"
            role="tabpanel"
            aria-labelledby="tab-danger"
            hidden={activeTab !== "danger"}
            className="tenant-settings__panel tenant-settings__panel--danger"
          >
            <h2 className="tenant-settings__panel-title">Danger Zone</h2>
            <p className="tenant-settings__panel-desc">
              Irreversible actions. Proceed with caution.
            </p>
            <div className="tenant-settings__danger-actions">
              <button
                type="button"
                className="tenant-settings__danger-btn"
                disabled
                title="Contact support to delete your organization"
                aria-disabled="true"
              >
                Delete organization
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
