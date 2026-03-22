import { useState, useEffect, useCallback } from "react";
import {
  HeartPulse,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  Server,
  Globe,
  Mail,
  HardDrive,
  Clock,
  Cpu,
  Loader2,
  CreditCard,
  Send,
} from "lucide-react";
import {
  runHealthChecks,
  type HealthReport,
  type ServiceCheckResult,
} from "../../lib/api/platform";
import "./health-check.css";

type ServiceStatus = "healthy" | "degraded" | "down" | "checking";

const STATUS_CONFIG: Record<
  ServiceStatus,
  { icon: React.ElementType; label: string; className: string }
> = {
  healthy: { icon: CheckCircle2, label: "Healthy", className: "hc-status--healthy" },
  degraded: { icon: AlertTriangle, label: "Degraded", className: "hc-status--degraded" },
  down: { icon: XCircle, label: "Down", className: "hc-status--down" },
  checking: { icon: Loader2, label: "Checking…", className: "hc-status--checking" },
};

const SERVICE_META: Record<
  string,
  { name: string; icon: React.ElementType; order: number }
> = {
  api: { name: "API Server", icon: Server, order: 0 },
  database: { name: "Database", icon: Database, order: 1 },
  redis: { name: "Cache (Redis)", icon: HardDrive, order: 2 },
  storage: { name: "File Storage", icon: HardDrive, order: 3 },
  celery: { name: "Job Worker", icon: Cpu, order: 4 },
  stripe: { name: "Stripe Payments", icon: CreditCard, order: 5 },
  postmark: { name: "Postmark Email", icon: Mail, order: 6 },
  mailgun: { name: "Mailgun Email", icon: Send, order: 7 },
  ses: { name: "AWS SES Email", icon: Globe, order: 8 },
};

function formatDetailKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (typeof value[0] === "object" && value[0] !== null) {
      return value
        .map((item) => {
          const obj = item as Record<string, unknown>;
          if ("amount" in obj && "currency" in obj) {
            return `${obj.currency}: ${Number(obj.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
          }
          return JSON.stringify(obj);
        })
        .join(", ");
    }
    return value.join(", ");
  }
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export function HealthCheckPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doCheck = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await runHealthChecks();
      setReport(result);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    doCheck();
  }, [doCheck]);

  const services: { key: string; meta: (typeof SERVICE_META)[string]; result: ServiceCheckResult | null }[] = [];

  if (report) {
    const sortedKeys = Object.keys(report.services).sort((a, b) => {
      const oa = SERVICE_META[a]?.order ?? 99;
      const ob = SERVICE_META[b]?.order ?? 99;
      return oa - ob;
    });
    for (const key of sortedKeys) {
      services.push({
        key,
        meta: SERVICE_META[key] || { name: key, icon: Server, order: 99 },
        result: report.services[key],
      });
    }
  }

  const overallStatus: ServiceStatus = report
    ? (report.overall as ServiceStatus)
    : isRunning
      ? "checking"
      : "healthy";

  const OverallIcon = STATUS_CONFIG[overallStatus].icon;

  return (
    <div className="hc-page">
      <div className="hc-header">
        <div className="hc-header__title-row">
          <HeartPulse size={28} className="hc-header__icon" />
          <div>
            <h1 className="hc-header__title">Health Check</h1>
            <p className="hc-header__subtitle">Real-time platform service status</p>
          </div>
        </div>
        <button
          type="button"
          className="hc-header__refresh"
          onClick={doCheck}
          disabled={isRunning}
        >
          <RefreshCw size={16} className={isRunning ? "hc-spin" : ""} />
          {isRunning ? "Checking…" : "Run All Checks"}
        </button>
      </div>

      {error && (
        <div className="hc-overall hc-status--down" style={{ marginBottom: 16 }}>
          <XCircle size={24} />
          <div className="hc-overall__info">
            <span className="hc-overall__label">Error</span>
            <span className="hc-overall__value">{error}</span>
          </div>
        </div>
      )}

      {/* Overall Status */}
      <div className={`hc-overall ${STATUS_CONFIG[overallStatus].className}`}>
        <OverallIcon
          size={32}
          className={overallStatus === "checking" ? "hc-spin" : ""}
        />
        <div className="hc-overall__info">
          <span className="hc-overall__label">Overall Status</span>
          <span className="hc-overall__value">
            {isRunning && !report ? "Running checks…" : STATUS_CONFIG[overallStatus].label}
          </span>
        </div>
        {report && (
          <div className="hc-overall__counts">
            <span className="hc-count hc-count--healthy">
              {report.healthy_count} healthy
            </span>
            {report.degraded_count > 0 && (
              <span className="hc-count hc-count--degraded">
                {report.degraded_count} degraded
              </span>
            )}
            {report.down_count > 0 && (
              <span className="hc-count hc-count--down">
                {report.down_count} down
              </span>
            )}
          </div>
        )}
        {lastChecked && (
          <span className="hc-overall__time">
            <Clock size={12} />
            Last check: {lastChecked.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Service Grid */}
      {isRunning && !report ? (
        <div className="hc-grid">
          {Object.entries(SERVICE_META).map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <div key={key} className="hc-card hc-status--checking">
                <div className="hc-card__header">
                  <div className="hc-card__icon-wrap">
                    <Icon size={20} />
                  </div>
                  <div className="hc-card__name">{meta.name}</div>
                  <div className="hc-card__badge hc-status--checking">
                    <Loader2 size={12} className="hc-spin" />
                    <span>Checking…</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hc-grid">
          {services.map(({ key, meta, result }) => {
            if (!result) return null;
            const Icon = meta.icon;
            const status = result.status as ServiceStatus;
            const statusCfg = STATUS_CONFIG[status];
            const StatusIcon = statusCfg.icon;

            const detailEntries = Object.entries(result.details || {}).filter(
              ([, v]) => v !== null && v !== undefined && v !== ""
            );

            return (
              <div key={key} className={`hc-card ${statusCfg.className}`}>
                <div className="hc-card__header">
                  <div className="hc-card__icon-wrap">
                    <Icon size={20} />
                  </div>
                  <div className="hc-card__name">{meta.name}</div>
                  <div className={`hc-card__badge ${statusCfg.className}`}>
                    <StatusIcon size={12} />
                    <span>{statusCfg.label}</span>
                  </div>
                </div>

                <div className="hc-card__message">{result.message}</div>

                <div className="hc-card__metrics">
                  {result.latency_ms > 0 && (
                    <div className="hc-metric">
                      <span className="hc-metric__label">Latency</span>
                      <span className="hc-metric__value">{result.latency_ms}ms</span>
                    </div>
                  )}
                </div>

                {detailEntries.length > 0 && (
                  <div className="hc-card__details">
                    {detailEntries.map(([dKey, dVal]) => (
                      <div key={dKey} className="hc-detail">
                        <span className="hc-detail__key">
                          {formatDetailKey(dKey)}
                        </span>
                        <span className="hc-detail__val">
                          {formatDetailValue(dVal)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
