import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  Building2,
  Users,
  Activity,
  DollarSign,
  Search,
  Plus,
  Eye,
  Pencil,
  Ban,
  Trash2,
  Radio,
  Flag,
  Wrench,
  Download,
  ArrowRight,
  TrendingUp,
  UserCog,
} from "lucide-react";
import { getAdminStats, listAdminTenants, type AdminStats, type AdminTenantSummary } from "../../lib/api/admin";
import { KidDropdown } from "../../components/ui";
import "../../components/ui/ui.css";
import "../dashboard/dashboard-bento.css";
import "./super-admin.css";

type TenantStatusFilter = "all" | "active" | "inactive";

export function SuperAdminDashboard() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>("all");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [tenants, setTenants] = useState<AdminTenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, tenantsRes] = await Promise.all([
          getAdminStats(),
          listAdminTenants({ limit: 200 }),
        ]);
        if (!mounted) return;
        setStats(statsRes);
        setTenants(tenantsRes.items);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load admin data");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? t.is_active : !t.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [tenants, search, statusFilter]);

  return (
    <div className="dashboard-bento super-admin" role="main" aria-label="Platform administration">
      <header className="dashboard-bento__header super-admin__header-row">
        <div className="super-admin__header-inner">
          <Shield size={28} className="super-admin__shield" aria-hidden />
          <div>
            <h1 className="dashboard-bento__greeting">Platform Admin</h1>
            <p className="dashboard-bento__subtitle">Manage tenants, monitor health, and run platform operations</p>
          </div>
        </div>
        <button type="button" className="super-admin__btn super-admin__btn--primary">
          <Plus size={18} aria-hidden />
          Add Tenant
        </button>
      </header>

      <div className="dashboard-bento__grid">
        {/* Active Organizations - large */}
        <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--row-2 dashboard-bento__card--blue">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Active Organizations</h2>
            <div className="dashboard-bento__card-icon">
              <Building2 size={24} aria-hidden />
            </div>
          </div>
          <div className="super-admin__stat-row">
            <span className="super-admin__stat-value">
              {stats?.tenant_count ?? (loading ? "…" : "0")}
            </span>
            <span className="super-admin__stat-label">Total Tenants</span>
          </div>
          <div className="super-admin__tenant-toolbar">
            <div className="super-admin__search-wrap">
              <Search size={18} className="super-admin__search-icon" aria-hidden />
              <input
                type="search"
                placeholder="Search tenants..."
                className="super-admin__search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search tenants"
              />
            </div>
            <KidDropdown
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as TenantStatusFilter)}
              minWidth={150}
              ariaLabel="Filter by status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </div>
          {error && <div className="prp-error prp-error--inline"><p>{error}</p></div>}
          <ul className="dashboard-bento__activity-list super-admin__tenant-list" role="list">
            {filteredTenants.slice(0, 8).map((t) => (
              <li key={t.id} className="super-admin__tenant-row" role="listitem">
                <div className="super-admin__tenant-info">
                  <span className="super-admin__tenant-name">{t.name}</span>
                  <span className="super-admin__tenant-meta">
                    {t.slug}
                  </span>
                </div>
                <span className={`super-admin__badge super-admin__badge--${t.is_active ? "active" : "expired"}`}>
                  {t.is_active ? "Active" : "Inactive"}
                </span>
                <div className="super-admin__tenant-actions">
                  <button type="button" className="super-admin__action-btn" title="View" aria-label="View">
                    <Eye size={14} />
                  </button>
                  <button type="button" className="super-admin__action-btn" title="Edit" aria-label="Edit">
                    <Pencil size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <span className="dashboard-bento__card-action">
            View all tenants <ArrowRight size={14} aria-hidden />
          </span>
        </div>

        {/* User Management */}
        <Link
          to="/app/platform/users"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--green"
          aria-label="Open User Management"
        >
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">User Management</h2>
            <div className="dashboard-bento__card-icon">
              <UserCog size={24} aria-hidden />
            </div>
          </div>
          <p className="dashboard-bento__card-desc">Manage platform roles and user assignments</p>
          <span className="dashboard-bento__card-action">
            Open Users <ArrowRight size={14} aria-hidden />
          </span>
        </Link>

        <Link
          to="/app/platform/member-billing-fees"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--orange"
          aria-label="Open Stripe member billing fees"
        >
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Member billing fees</h2>
            <div className="dashboard-bento__card-icon">
              <DollarSign size={24} aria-hidden />
            </div>
          </div>
          <p className="dashboard-bento__card-desc">
            Platform default and per-organization Stripe Connect application fees
          </p>
          <span className="dashboard-bento__card-action">
            Configure fees <ArrowRight size={14} aria-hidden />
          </span>
        </Link>

        {/* Usage Analytics */}
        <div className="dashboard-bento__card dashboard-bento__card--green">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Usage Analytics</h2>
            <div className="dashboard-bento__card-icon">
              <Users size={24} aria-hidden />
            </div>
          </div>
          <div className="super-admin__stat-block">
            <span className="super-admin__stat-value">{stats?.user_count ?? (loading ? "…" : "0")}</span>
            <span className="super-admin__stat-label">Total Users</span>
          </div>
          <div className="super-admin__stat-block">
            <span className="super-admin__stat-value">{stats?.student_count ?? (loading ? "…" : "0")}</span>
            <span className="super-admin__stat-label">Students</span>
          </div>
        </div>

        {/* Revenue Overview */}
        <div className="dashboard-bento__card dashboard-bento__card--orange">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Monthly Revenue</h2>
            <div className="dashboard-bento__card-icon">
              <DollarSign size={24} aria-hidden />
            </div>
          </div>
          <div className="super-admin__stat-block">
            <span className="super-admin__stat-value">{stats?.active_subscription_count ?? (loading ? "…" : "0")}</span>
            <span className="super-admin__stat-label">Active Subscriptions</span>
          </div>
          <div className="super-admin__trend">
            <TrendingUp size={16} aria-hidden />
            <span>Live data from backend</span>
          </div>
        </div>

        {/* System Health */}
        <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--purple">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">System Health</h2>
            <div className="dashboard-bento__card-icon">
              <Activity size={24} aria-hidden />
            </div>
          </div>
          <div className="super-admin__health-grid">
            <div className="super-admin__health-item">
              <span className="super-admin__health-label">API Response</span>
              <span className="super-admin__health-value">45ms avg</span>
            </div>
            <div className="super-admin__health-item">
              <span className="super-admin__health-label">Database</span>
              <span className="super-admin__health-value super-admin__health-value--ok">Healthy</span>
            </div>
            <div className="super-admin__health-item">
              <span className="super-admin__health-label">Storage</span>
              <span className="super-admin__health-value">67% used</span>
              <div className="dashboard-bento__xp-bar">
                <div className="dashboard-bento__xp-fill" style={{ width: "67%" }} />
              </div>
            </div>
            <div className="super-admin__health-item">
              <span className="super-admin__health-label">Background Jobs</span>
              <span className="super-admin__health-value">12 queued</span>
            </div>
          </div>
        </div>

        {/* Recent Platform Activity */}
        <div className="dashboard-bento__card dashboard-bento__card--row-2 dashboard-bento__card--red">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Platform Activity</h2>
          </div>
          <ul className="dashboard-bento__activity-list" role="list">
            {filteredTenants.slice(0, 6).map((a) => (
              <li key={a.id} className="dashboard-bento__activity-item" role="listitem">
                <span className="dashboard-bento__activity-text">
                  Tenant {a.name} ({a.slug}) is {a.is_active ? "active" : "inactive"}.
                </span>
                <span className="dashboard-bento__activity-time">live</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--green">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Quick Actions</h2>
          </div>
          <div className="super-admin__quick-grid">
            <button type="button" className="super-admin__quick-btn">
              <Radio size={20} aria-hidden />
              <span>Broadcast Message</span>
            </button>
            <button type="button" className="super-admin__quick-btn">
              <Flag size={20} aria-hidden />
              <span>Feature Flags</span>
            </button>
            <button type="button" className="super-admin__quick-btn">
              <Wrench size={20} aria-hidden />
              <span>System Maintenance</span>
            </button>
            <button type="button" className="super-admin__quick-btn">
              <Download size={20} aria-hidden />
              <span>Export Data</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
