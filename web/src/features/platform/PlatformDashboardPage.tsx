import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Users,
  Building2,
  GraduationCap,
  BookOpen,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Globe,
  Clock,
  Activity,
  Zap,
} from "lucide-react";
import {
  getPlatformStats,
  getTopTenants,
  getRecentEvents,
  type PlatformStats,
  type TopTenant,
  type AuditEvent,
} from "../../lib/api/platform";
import "./platform-dashboard.css";

type TimeRange = "24h" | "7d" | "30d" | "90d";

const PERIOD_MAP: Record<TimeRange, string> = {
  "24h": "last_24h",
  "7d": "last_7d",
  "30d": "last_30d",
  "90d": "last_90d",
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: "#00b894",
  UPDATE: "#fdcb6e",
  DELETE: "#ef4444",
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString();
}

export function PlatformDashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<TopTenant[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const period = PERIOD_MAP[timeRange];
      const [statsRes, tenantsRes, eventsRes] = await Promise.all([
        getPlatformStats(period),
        getTopTenants(10),
        getRecentEvents(20),
      ]);
      setStats(statsRes);
      setTenants(tenantsRes.tenants);
      setEvents(eventsRes.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (error) {
    return (
      <div className="pd-page">
        <div className="pd-header">
          <div className="pd-header__left">
            <BarChart3 size={28} className="pd-header__icon" />
            <div>
              <h1 className="pd-header__title">Platform Analytics</h1>
              <p className="pd-header__subtitle">Stemplitude-wide usage statistics</p>
            </div>
          </div>
        </div>
        <div className="pd-error">
          <p>{error}</p>
          <button type="button" className="pd-retry-btn" onClick={fetchAll}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  type Trend = "up" | "down" | "flat";

  const statCards: {
    label: string;
    value: string;
    change: string;
    trend: Trend;
    icon: React.ElementType;
    color: string;
  }[] = stats
    ? [
        {
          label: "Total Tenants",
          value: stats.tenant_count.toLocaleString(),
          change: `+${stats.new_tenants} this period`,
          trend: "up",
          icon: Building2,
          color: "#6c5ce7",
        },
        {
          label: "Total Users",
          value: stats.user_count.toLocaleString(),
          change: `+${stats.new_users} this period`,
          trend: "up",
          icon: Users,
          color: "#00b894",
        },
        {
          label: "Active Students",
          value: stats.student_count.toLocaleString(),
          change: `+${stats.new_students} this period`,
          trend: "up",
          icon: GraduationCap,
          color: "#0984e3",
        },
        {
          label: "Active Tenants",
          value: stats.active_tenant_count.toLocaleString(),
          change: "",
          trend: "flat",
          icon: BookOpen,
          color: "#e17055",
        },
        {
          label: "Active Users",
          value: stats.active_user_count.toLocaleString(),
          change: "",
          trend: "flat",
          icon: Activity,
          color: "#fdcb6e",
        },
        {
          label: "New Signups",
          value: (stats.new_tenants + stats.new_users + stats.new_students).toLocaleString(),
          change: "this period",
          trend: "up",
          icon: Zap,
          color: "#a29bfe",
        },
      ]
    : [];

  return (
    <div className="pd-page">
      <div className="pd-header">
        <div className="pd-header__left">
          <BarChart3 size={28} className="pd-header__icon" />
          <div>
            <h1 className="pd-header__title">Platform Analytics</h1>
            <p className="pd-header__subtitle">Stemplitude-wide usage statistics</p>
          </div>
        </div>

        <div className="pd-time-range">
          {(["24h", "7d", "30d", "90d"] as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`pd-time-btn ${r === timeRange ? "pd-time-btn--active" : ""}`}
              onClick={() => setTimeRange(r)}
              disabled={loading}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats ? (
        <div className="pd-loading">Loading dashboard…</div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="pd-stats">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              const TrendIcon = stat.trend === "up" ? TrendingUp : stat.trend === "down" ? TrendingDown : null;
              return (
                <div
                  key={stat.label}
                  className="pd-stat-card"
                  style={{ "--accent": stat.color } as React.CSSProperties}
                >
                  <div className="pd-stat-card__icon">
                    <Icon size={22} />
                  </div>
                  <div className="pd-stat-card__value">{stat.value}</div>
                  <div className="pd-stat-card__label">{stat.label}</div>
                  {stat.change && (
                    <div className={`pd-stat-card__change pd-stat-card__change--${stat.trend}`}>
                      {TrendIcon && <TrendIcon size={12} />}
                      <span>{stat.change}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Charts placeholder */}
          <div className="pd-charts">
            <div className="pd-chart-card">
              <div className="pd-chart-card__header">
                <h3>User Growth</h3>
                <span className="pd-chart-card__period">{timeRange}</span>
              </div>
              <div className="pd-chart-card__placeholder">
                <TrendingUp size={40} />
                <p>Chart visualization coming soon</p>
              </div>
            </div>
            <div className="pd-chart-card">
              <div className="pd-chart-card__header">
                <h3>Lab Sessions</h3>
                <span className="pd-chart-card__period">{timeRange}</span>
              </div>
              <div className="pd-chart-card__placeholder">
                <Activity size={40} />
                <p>Chart visualization coming soon</p>
              </div>
            </div>
          </div>

          {/* Bottom panels */}
          <div className="pd-panels">
            {/* Top Tenants */}
            <div className="pd-panel">
              <div className="pd-panel__header">
                <h3><Globe size={18} /> Top Tenants</h3>
              </div>
              {loading && tenants.length === 0 ? (
                <div className="pd-loading-inline">Loading…</div>
              ) : (
                <div className="pd-panel__table-wrap">
                  <table className="pd-table">
                    <thead>
                      <tr>
                        <th>Tenant</th>
                        <th>Members</th>
                        <th>Students</th>
                        <th>Type</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="pd-table__empty">
                            No tenants found
                          </td>
                        </tr>
                      ) : (
                        tenants.map((t) => (
                          <tr key={t.slug}>
                            <td>
                              <div className="pd-tenant-name">{t.name}</div>
                              <div className="pd-tenant-slug">{t.slug}</div>
                            </td>
                            <td>{t.member_count}</td>
                            <td>{t.student_count}</td>
                            <td>{t.type}</td>
                            <td>
                              <span
                                className={`pd-plan-badge ${t.is_active ? "pd-plan-badge--active" : "pd-plan-badge--inactive"}`}
                              >
                                {t.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Events */}
            <div className="pd-panel">
              <div className="pd-panel__header">
                <h3><Clock size={18} /> Recent Events</h3>
              </div>
              {loading && events.length === 0 ? (
                <div className="pd-loading-inline">Loading…</div>
              ) : (
                <div className="pd-events">
                  {events.map((ev) => (
                    <div key={ev.id} className="pd-event">
                      <div
                        className="pd-event__dot"
                        style={{
                          background: ACTION_COLORS[ev.action] ?? "#64748b",
                        }}
                      />
                      <div className="pd-event__content">
                        <span className="pd-event__msg">
                          {ev.action} on {ev.table_name}
                        </span>
                        <span className="pd-event__time">{formatRelativeTime(ev.created_at)}</span>
                      </div>
                      <ArrowRight size={14} className="pd-event__arrow" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
