import { useState, useEffect, useCallback, useRef } from "react";
import {
  Terminal,
  Play,
  Trash2,
  RotateCcw,
  Edit3,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Search,
  Zap,
  Copy,
  Info,
  Code,
  Table,
} from "lucide-react";
import {
  executeCommand,
  getCommandHistory,
  deleteHistoryEntry,
  clearCommandHistory,
  type HistoryEntry,
} from "../../lib/api/platform";
import "./admin-tasks.css";

export type CommandStatus = "success" | "failed" | "pending";

export interface CommandHistoryItem {
  id: string;
  command: string;
  timestamp: number;
  status: CommandStatus;
  output: string;
}

interface CommandParam {
  long: string;
  short?: string;
  required?: boolean;
  help: string;
  default?: string;
}

interface CommandAction {
  action: string;
  params: CommandParam[];
  help?: string;
}

interface CommandHint {
  domain: string;
  actions: CommandAction[];
}

const COMMAND_HINTS: CommandHint[] = [
  {
    domain: "users",
    actions: [
      {
        action: "create",
        help: "Create a new user account",
        params: [
          { long: "--email", short: "-e", required: true, help: "Email address" },
          { long: "--password", short: "-p", required: true, help: "Password (min 12 chars)" },
          { long: "--first-name", short: "-f", help: "First name", default: "New" },
          { long: "--last-name", short: "-l", help: "Last name", default: "User" },
        ],
      },
      {
        action: "get",
        help: "Get user details including tenants and global role",
        params: [
          { long: "--email", short: "-e", help: "User email" },
          { long: "--id", help: "User UUID" },
        ],
      },
      {
        action: "set-role",
        help: "Assign a global role to a user",
        params: [
          { long: "--email", short: "-e", required: true, help: "User email" },
          { long: "--role", short: "-r", required: true, help: "Global role slug (platform_owner, platform_admin, devops, support)" },
        ],
      },
      {
        action: "remove-role",
        help: "Remove a user's global role",
        params: [
          { long: "--email", short: "-e", required: true, help: "User email" },
        ],
      },
      {
        action: "deactivate",
        help: "Deactivate a user account",
        params: [
          { long: "--email", short: "-e", required: true, help: "User email" },
        ],
      },
      {
        action: "activate",
        help: "Activate a user account",
        params: [
          { long: "--email", short: "-e", required: true, help: "User email" },
        ],
      },
      {
        action: "list-admins",
        help: "List all users with global roles",
        params: [],
      },
    ],
  },
  {
    domain: "tenants",
    actions: [
      {
        action: "create",
        help: "Create a new tenant with default roles",
        params: [
          { long: "--name", short: "-n", required: true, help: "Display name" },
          { long: "--slug", short: "-s", required: true, help: "URL-safe identifier" },
          { long: "--code", short: "-c", required: true, help: "Student login code (4-20 chars)" },
          { long: "--type", short: "-t", help: "Tenant type", default: "center" },
          { long: "--owner", short: "-o", help: "Admin user email" },
        ],
      },
      {
        action: "list",
        help: "List all tenants",
        params: [
          { long: "--active-only", help: "Only show active tenants" },
        ],
      },
      {
        action: "get",
        help: "Get tenant details",
        params: [
          { long: "--slug", short: "-s", help: "Tenant slug" },
          { long: "--code", short: "-c", help: "Tenant code" },
          { long: "--id", help: "Tenant UUID" },
        ],
      },
      {
        action: "deactivate",
        help: "Deactivate a tenant",
        params: [
          { long: "--slug", short: "-s", required: true, help: "Tenant slug" },
        ],
      },
      {
        action: "activate",
        help: "Activate a tenant",
        params: [
          { long: "--slug", short: "-s", required: true, help: "Tenant slug" },
        ],
      },
      {
        action: "add-member",
        help: "Add a user to a tenant",
        params: [
          { long: "--slug", short: "-s", required: true, help: "Tenant slug" },
          { long: "--email", short: "-e", required: true, help: "User email" },
          { long: "--role", short: "-r", required: true, help: "Role slug (admin, instructor, student)" },
        ],
      },
      {
        action: "list-members",
        help: "List all members of a tenant",
        params: [
          { long: "--slug", short: "-s", required: true, help: "Tenant slug" },
        ],
      },
      {
        action: "list-roles",
        help: "List tenant roles with permission counts (exactly one of slug or tenant id)",
        params: [
          { long: "--slug", short: "-s", help: "Tenant slug" },
          { long: "--tenant-id", help: "Tenant UUID" },
        ],
      },
      {
        action: "show-role",
        help: "Show one tenant role and its permissions",
        params: [
          { long: "--role-slug", short: "-r", required: true, help: "Role slug on the tenant" },
          { long: "--slug", short: "-s", help: "Tenant slug" },
          { long: "--tenant-id", help: "Tenant UUID" },
        ],
      },
      {
        action: "create-role",
        help: "Create a tenant role; optional template role and extra permissions",
        params: [
          { long: "--role-name", required: true, help: "Display name" },
          { long: "--role-slug", required: true, help: "URL-safe role slug" },
          { long: "--slug", short: "-s", help: "Tenant slug" },
          { long: "--tenant-id", help: "Tenant UUID" },
          { long: "--template", short: "-t", help: "Copy permissions from this role slug" },
          {
            long: "--permissions",
            help: "Comma-separated resource:action (merged with template)",
          },
          { long: "--system", help: "Mark as system role", default: "false" },
        ],
      },
      {
        action: "add-role-permissions",
        help: "Add permissions to a tenant role",
        params: [
          { long: "--role-slug", short: "-r", required: true, help: "Role slug" },
          {
            long: "--permissions",
            required: true,
            help: "Comma-separated resource:action",
          },
          { long: "--slug", short: "-s", help: "Tenant slug" },
          { long: "--tenant-id", help: "Tenant UUID" },
          { long: "--allow-system", help: "Allow editing system roles", default: "false" },
        ],
      },
      {
        action: "remove-role-permissions",
        help: "Remove permissions from a tenant role",
        params: [
          { long: "--role-slug", short: "-r", required: true, help: "Role slug" },
          {
            long: "--permissions",
            required: true,
            help: "Comma-separated resource:action",
          },
          { long: "--slug", short: "-s", help: "Tenant slug" },
          { long: "--tenant-id", help: "Tenant UUID" },
          { long: "--allow-system", help: "Allow editing system roles", default: "false" },
        ],
      },
      {
        action: "permissions-catalog",
        help: "List all platform permission keys (resource:action)",
        params: [],
      },
    ],
  },
  {
    domain: "plans",
    actions: [
      {
        action: "list",
        help: "List all plans",
        params: [
          { long: "--active-only", help: "Only show active plans" },
        ],
      },
      {
        action: "get",
        help: "Get plan details with features and limits",
        params: [
          { long: "--slug", short: "-s", help: "Plan slug" },
          { long: "--id", help: "Plan UUID" },
        ],
      },
      {
        action: "create",
        help: "Create a new plan",
        params: [
          { long: "--name", short: "-n", required: true, help: "Display name" },
          { long: "--slug", short: "-s", required: true, help: "URL-safe identifier" },
          { long: "--type", short: "-t", help: "Plan type (free, starter, pro, enterprise, custom)", default: "starter" },
          { long: "--price-monthly", help: "Monthly price (e.g. 29.99)" },
          { long: "--price-yearly", help: "Yearly price (e.g. 299.99)" },
          { long: "--trial-days", help: "Trial period in days", default: "0" },
        ],
      },
      {
        action: "deactivate",
        help: "Deactivate a plan",
        params: [
          { long: "--slug", short: "-s", required: true, help: "Plan slug" },
        ],
      },
      {
        action: "activate",
        help: "Activate a plan",
        params: [
          { long: "--slug", short: "-s", required: true, help: "Plan slug" },
        ],
      },
    ],
  },
  {
    domain: "subscriptions",
    actions: [
      {
        action: "list",
        help: "List subscriptions, optionally filtered by tenant or status",
        params: [
          { long: "--tenant", short: "-t", help: "Filter by tenant slug" },
          { long: "--status", short: "-s", help: "Filter by status (trialing, active, past_due, canceled, unpaid)" },
        ],
      },
      {
        action: "get",
        help: "Get subscription details",
        params: [
          { long: "--id", required: true, help: "Subscription UUID" },
        ],
      },
      {
        action: "status",
        help: "Get a tenant's subscription with plan details and expiration info",
        params: [
          { long: "--tenant", short: "-t", help: "Tenant slug" },
          { long: "--email", short: "-e", help: "Subscriber email" },
        ],
      },
      {
        action: "expiring",
        help: "Find subscriptions expiring within N days",
        params: [
          { long: "--days", short: "-d", help: "Look-ahead window in days", default: "30" },
        ],
      },
      {
        action: "cancel",
        help: "Cancel a subscription",
        params: [
          { long: "--id", required: true, help: "Subscription UUID" },
        ],
      },
      {
        action: "reconcile-stripe",
        help: "Reconcile Stripe-backed subscriptions + licenses (exactly one of --tenant or --tenant-id)",
        params: [
          { long: "--tenant", short: "-t", help: "Tenant slug" },
          { long: "--tenant-id", help: "Tenant UUID" },
          { long: "--max-items", help: "Max subscriptions to process (1–1000)", default: "200" },
        ],
      },
    ],
  },
  {
    domain: "licenses",
    actions: [
      {
        action: "list",
        help: "List licenses, optionally filtered by tenant or status",
        params: [
          { long: "--tenant", short: "-t", help: "Filter by tenant slug" },
          { long: "--status", short: "-s", help: "Filter by status (active, expired, revoked, suspended)" },
        ],
      },
      {
        action: "get",
        help: "Get license details with features, limits, and seat usage",
        params: [
          { long: "--id", required: true, help: "License UUID" },
        ],
      },
      {
        action: "grant",
        help: "Grant a new license to a tenant",
        params: [
          { long: "--tenant", short: "-t", required: true, help: "Tenant slug" },
          { long: "--email", short: "-e", help: "User email (optional)" },
          { long: "--subscription-id", help: "Link to subscription UUID" },
          { long: "--valid-from", help: "Start date (YYYY-MM-DD, default: today)" },
          { long: "--valid-until", help: "End date (YYYY-MM-DD, optional)" },
        ],
      },
      {
        action: "revoke",
        help: "Revoke an active license",
        params: [
          { long: "--id", required: true, help: "License UUID" },
        ],
      },
      {
        action: "reinstate",
        help: "Reinstate a revoked or expired license",
        params: [
          { long: "--id", required: true, help: "License UUID" },
        ],
      },
    ],
  },
  {
    domain: "audit",
    actions: [
      {
        action: "list",
        help: "List command audit log entries (who did what)",
        params: [
          { long: "--email", short: "-e", help: "Filter by executor email" },
          { long: "--domain", short: "-d", help: "Filter by command domain" },
          { long: "--action", short: "-a", help: "Filter by action" },
          { long: "--status", short: "-s", help: "Filter by status (success, failed)" },
          { long: "--limit", short: "-l", help: "Max entries (1-200)", default: "50" },
        ],
      },
      {
        action: "get",
        help: "Get full details of an audit log entry",
        params: [
          { long: "--id", required: true, help: "Audit entry UUID" },
        ],
      },
    ],
  },
  {
    domain: "robotics",
    actions: [
      {
        action: "toolchain-status",
        help: "Show local robotics compile toolchain status (PROS + ARM GCC)",
        params: [],
      },
      {
        action: "toolchain-install",
        help: "Install local robotics compile toolchain dependencies",
        params: [
          { long: "--python", help: "Python executable", default: "python3" },
          { long: "--brew", help: "Homebrew executable", default: "brew" },
          { long: "--xpm", help: "xpm runner command", default: "npx xpm" },
        ],
      },
    ],
  },
];

interface Suggestion {
  command: string;
  help: string;
  domain: string;
  action: string;
}

const ALL_SUGGESTIONS: Suggestion[] = COMMAND_HINTS.flatMap((h) =>
  h.actions.map((a) => ({
    command: `${h.domain}:${a.action}`,
    help: a.help || "",
    domain: h.domain,
    action: a.action,
  }))
);

function buildCommandTemplate(domain: string, action: CommandAction): string {
  const parts = [`${domain}:${action.action}`];
  for (const p of action.params) {
    const flag = p.short || p.long;
    if (p.required) {
      parts.push(`${flag} <${p.long.replace(/^--/, "")}>`);
    }
  }
  return parts.join(" ");
}

function buildFullTemplate(domain: string, action: CommandAction): string {
  const parts = [`${domain}:${action.action}`];
  for (const p of action.params) {
    const flag = p.short || p.long;
    const placeholder = p.default || `<${p.long.replace(/^--/, "")}>`;
    parts.push(`${flag} ${placeholder}`);
  }
  return parts.join(" ");
}

const QUICK_ACTIONS = [
  { label: "List Tenants", command: "tenants:list" },
  { label: "Permission catalog", command: "tenants:permissions-catalog" },
  { label: "List Admins", command: "users:list-admins" },
  { label: "Active Tenants", command: "tenants:list --active-only true" },
  { label: "List Plans", command: "plans:list" },
  { label: "Active Plans", command: "plans:list --active-only true" },
  { label: "List Subscriptions", command: "subscriptions:list" },
  { label: "Expiring Soon (30d)", command: "subscriptions:expiring --days 30" },
  { label: "Active Licenses", command: "licenses:list --status active" },
  { label: "Audit Log", command: "audit:list" },
  { label: "Robotics Toolchain Status", command: "robotics:toolchain-status" },
];

function formatTimestamp(ts: number): string {
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function groupByTime(items: CommandHistoryItem[]): Record<string, CommandHistoryItem[]> {
  const groups: Record<string, CommandHistoryItem[]> = {};
  const now = Date.now();
  const DAY = 86400_000;

  for (const item of items) {
    const diff = now - item.timestamp;
    let label: string;
    if (diff < DAY) label = "Today";
    else if (diff < 7 * DAY) label = "This week";
    else label = "Older";

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return groups;
}

const PRIMARY_ARRAY_KEYS = [
  "items",
  "subscriptions",
  "commands",
  "results",
  "tenants",
  "plans",
  "roles",
  "permissions",
  "assignments",
  "entries",
  "events",
  "job_types",
  "active_tasks",
  "providers",
  "blobs",
  "folders",
  "users",
  "students",
  "instructors",
  "members",
];

function isArrayOfRecords(val: unknown): val is Record<string, unknown>[] {
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    typeof val[0] === "object" &&
    val[0] !== null &&
    !Array.isArray(val[0])
  );
}

function pickPrimaryArray(
  data: Record<string, unknown>
): { key: string; items: Record<string, unknown>[] } | null {
  for (const key of PRIMARY_ARRAY_KEYS) {
    const v = data[key];
    if (isArrayOfRecords(v)) return { key, items: v };
  }
  for (const key of Object.keys(data)) {
    if (
      key === "ok" ||
      key === "message" ||
      key === "count" ||
      key === "changes" ||
      key === "window_days" ||
      key === "slash_commands"
    ) {
      continue;
    }
    const v = data[key];
    if (isArrayOfRecords(v)) return { key, items: v };
  }
  return null;
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) {
    if (val.length === 0) return "—";
    if (val.every((x) => typeof x === "string")) return val.join("\n");
    if (
      val.every(
        (x) => typeof x === "object" && x !== null && !Array.isArray(x)
      )
    ) {
      return (val as Record<string, unknown>[])
        .map((p) => {
          const flag = String(p.long ?? "");
          const short = p.short != null && p.short !== "" ? ` (${String(p.short)})` : "";
          const req = p.required ? " · required" : "";
          const help = p.help != null && String(p.help) !== "" ? ` — ${String(p.help)}` : "";
          const def =
            p.default != null && String(p.default) !== ""
              ? ` [default: ${String(p.default)}]`
              : "";
          return `${flag}${short}${req}${help}${def}`.trim() || "—";
        })
        .join("\n");
    }
    return JSON.stringify(val);
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function cellClassForColumn(col: string, formatted: string): string {
  if (
    formatted.includes("\n") ||
    col === "help" ||
    col === "params" ||
    col === "description" ||
    col === "error" ||
    col === "result_summary"
  ) {
    return "admin-tasks__cell-multiline";
  }
  return "";
}

function SlashHelpSummary({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="admin-tasks__formatted-card">
      {data.title != null ? (
        <h3 className="admin-tasks__formatted-title">{String(data.title)}</h3>
      ) : null}
      {Array.isArray(data.slash_commands) ? (
        <ul className="admin-tasks__formatted-list">
          {(data.slash_commands as unknown[]).map((line, i) => (
            <li key={i}>{String(line)}</li>
          ))}
        </ul>
      ) : null}
      {data.command_format != null ? (
        <p className="admin-tasks__formatted-meta">
          <span className="admin-tasks__formatted-label">Command format</span>{" "}
          <code className="admin-tasks__formatted-code">{String(data.command_format)}</code>
        </p>
      ) : null}
      {data.example != null ? (
        <p className="admin-tasks__formatted-meta">
          <span className="admin-tasks__formatted-label">Example</span>{" "}
          <code className="admin-tasks__formatted-code">{String(data.example)}</code>
        </p>
      ) : null}
    </div>
  );
}

function PrimaryArrayTable({
  arrayKey,
  items,
  data,
}: {
  arrayKey: string;
  items: Record<string, unknown>[];
  data: Record<string, unknown>;
}) {
  const columns = Object.keys(items[0] as Record<string, unknown>);
  const count = data.count !== undefined ? Number(data.count) : items.length;
  return (
    <div className="admin-tasks__table-wrap">
      {data.message != null && String(data.message) !== "" ? (
        <div className="admin-tasks__table-message">{String(data.message)}</div>
      ) : null}
      <div className="admin-tasks__table-count">
        {arrayKey.replace(/_/g, " ")} · {count} row{count !== 1 ? "s" : ""}
      </div>
      <table className="admin-tasks__result-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col.replace(/_/g, " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => {
                const formatted = formatCellValue(row[col]);
                return (
                  <td key={col} className={cellClassForColumn(col, formatted)}>
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultTable({ data }: { data: Record<string, unknown> }) {
  const nonOkKeys = Object.keys(data).filter((k) => k !== "ok");
  if (nonOkKeys.length === 0 && data.ok === true) {
    return (
      <div className="admin-tasks__result-ok" role="status">
        Command completed successfully.
      </div>
    );
  }

  const slashHelp = Array.isArray(data.slash_commands);
  const primary = pickPrimaryArray(data);

  if (slashHelp && primary) {
    return (
      <div className="admin-tasks__formatted-stack">
        <SlashHelpSummary data={data} />
        <PrimaryArrayTable arrayKey={primary.key} items={primary.items} data={data} />
      </div>
    );
  }

  if (slashHelp) {
    return (
      <div className="admin-tasks__formatted-stack">
        <SlashHelpSummary data={data} />
      </div>
    );
  }

  if (primary) {
    return <PrimaryArrayTable arrayKey={primary.key} items={primary.items} data={data} />;
  }

  const singleKey = Object.keys(data).find(
    (k) =>
      k !== "ok" &&
      k !== "message" &&
      k !== "count" &&
      k !== "changes" &&
      k !== "window_days" &&
      typeof data[k] === "object" &&
      data[k] !== null &&
      !Array.isArray(data[k])
  );
  const singleObject = singleKey ? (data[singleKey] as Record<string, unknown>) : null;

  if (singleObject) {
    const entries = Object.entries(singleObject);
    return (
      <div className="admin-tasks__table-wrap">
        {data.message && (
          <div className="admin-tasks__table-message">{String(data.message)}</div>
        )}
        <table className="admin-tasks__result-table admin-tasks__result-table--kv">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, val]) => {
              if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
                const subCols = Object.keys(val[0] as Record<string, unknown>);
                return (
                  <tr key={key}>
                    <td className="admin-tasks__kv-key">{key.replace(/_/g, " ")}</td>
                    <td>
                      <table className="admin-tasks__result-table admin-tasks__result-table--nested">
                        <thead>
                          <tr>{subCols.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr>
                        </thead>
                        <tbody>
                          {(val as Record<string, unknown>[]).map((subRow, si) => (
                            <tr key={si}>
                              {subCols.map((c) => {
                                const subF = formatCellValue(subRow[c]);
                                return (
                                  <td key={c} className={cellClassForColumn(c, subF)}>
                                    {subF}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                );
              }
              if (typeof val === "object" && val !== null && !Array.isArray(val)) {
                return (
                  <tr key={key}>
                    <td className="admin-tasks__kv-key">{key.replace(/_/g, " ")}</td>
                    <td>
                      <table className="admin-tasks__result-table admin-tasks__result-table--nested">
                        <tbody>
                          {Object.entries(val as Record<string, unknown>).map(([sk, sv]) => {
                            const nv = formatCellValue(sv);
                            return (
                              <tr key={sk}>
                                <td className="admin-tasks__kv-key">{sk.replace(/_/g, " ")}</td>
                                <td className={cellClassForColumn(sk, nv)}>{nv}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                );
              }
              const vf = formatCellValue(val);
              return (
                <tr key={key}>
                  <td className="admin-tasks__kv-key">{key.replace(/_/g, " ")}</td>
                  <td className={cellClassForColumn(key, vf)}>{vf}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const topEntries = Object.entries(data).filter(([k]) => k !== "ok");
  if (topEntries.length > 0) {
    return (
      <div className="admin-tasks__table-wrap">
        <table className="admin-tasks__result-table admin-tasks__result-table--kv">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {topEntries.map(([key, val]) => {
              const vf = formatCellValue(val);
              return (
                <tr key={key}>
                  <td className="admin-tasks__kv-key">{key.replace(/_/g, " ")}</td>
                  <td className={cellClassForColumn(key, vf)}>{vf}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return <span className="admin-tasks__output-empty">No data to display.</span>;
}

function FormattedOutput({
  data,
  isRunning,
}: {
  data: Record<string, unknown>;
  isRunning: boolean;
}) {
  if (typeof data._error === "string") {
    return (
      <div
        className={`admin-tasks__output admin-tasks__output--formatted ${isRunning ? "admin-tasks__output--running" : ""}`}
      >
        <div className="admin-tasks__result-error" role="alert">
          {data._error}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`admin-tasks__output admin-tasks__output--formatted ${isRunning ? "admin-tasks__output--running" : ""}`}
    >
      <ResultTable data={data} />
    </div>
  );
}

export function AdminTasksPage() {
  const [commandInput, setCommandInput] = useState("");
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [output, setOutput] = useState("");
  const [hintFilter, setHintFilter] = useState<string>("");
  const [historySearch, setHistorySearch] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [outputMode, setOutputMode] = useState<"raw" | "formatted">("formatted");
  const [resultData, setResultData] = useState<Record<string, unknown> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await getCommandHistory(0, 100);
      setHistory(
        res.items.map((e: HistoryEntry) => ({
          id: e.id,
          command: e.command,
          timestamp: e.timestamp,
          status: (e.status === "success" ? "success" : "failed") as CommandStatus,
          output: e.output,
        }))
      );
    } catch {
      // Fall back silently — history is non-critical
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!showHistory) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        historyPanelRef.current &&
        !historyPanelRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showHistory]);

  useEffect(() => {
    if (!showSuggestions) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  const commandToken = commandInput.trim().split(/\s+/)[0] || "";
  const suggestions = commandInput.trim().length > 0
    ? ALL_SUGGESTIONS.filter(
        (s) =>
          s.command.toLowerCase().includes(commandToken.toLowerCase()) ||
          s.domain.toLowerCase().startsWith(commandToken.toLowerCase())
      )
    : [];

  const handleInputChange = (value: string) => {
    setCommandInput(value);
    const token = value.trim().split(/\s+/)[0] || "";
    const hasFlags = value.includes("--") || value.includes(" -");
    if (token.length > 0 && !hasFlags) {
      setShowSuggestions(true);
      setSelectedSuggestionIdx(-1);
    } else {
      setShowSuggestions(false);
    }
  };

  const acceptSuggestion = (s: Suggestion) => {
    const hint = COMMAND_HINTS.find((h) => h.domain === s.domain);
    const action = hint?.actions.find((a) => a.action === s.action);
    if (action) {
      const template = buildCommandTemplate(s.domain, action);
      setCommandInput(template);
    } else {
      setCommandInput(s.command + " ");
    }
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Tab" || (e.key === "Enter" && selectedSuggestionIdx >= 0)) {
      if (selectedSuggestionIdx >= 0) {
        e.preventDefault();
        acceptSuggestion(suggestions[selectedSuggestionIdx]);
      } else if (e.key === "Tab" && suggestions.length > 0) {
        e.preventDefault();
        acceptSuggestion(suggestions[0]);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const runCommand = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      setIsRunning(true);
      setOutput("Running...");
      setResultData(null);
      setShowHistory(false);

      let outputText: string;
      let structured: Record<string, unknown> | null = null;

      try {
        const res = await executeCommand(trimmed);
        if (
          res.ok &&
          res.result != null &&
          typeof res.result === "object" &&
          !Array.isArray(res.result)
        ) {
          outputText = JSON.stringify(res.result, null, 2);
          structured = res.result as Record<string, unknown>;
        } else if (res.ok) {
          outputText = JSON.stringify(res, null, 2);
          structured = { ok: true };
        } else if (res.error) {
          outputText = `Error: ${res.error}`;
          structured = { _error: res.error } as Record<string, unknown>;
        } else {
          outputText = JSON.stringify(res, null, 2);
          structured = null;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        outputText = `Request failed: ${msg}`;
        structured = { _error: `Request failed: ${msg}` } as Record<string, unknown>;
      }

      setOutput(outputText);
      setResultData(structured);
      setIsRunning(false);
      fetchHistory();
    },
    [fetchHistory]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runCommand(commandInput);
    setCommandInput("");
  };

  const handleRerun = (item: CommandHistoryItem) => {
    setShowHistory(false);
    runCommand(item.command);
  };

  const handleEditAndRun = (item: CommandHistoryItem) => {
    setCommandInput(item.command);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const handleDelete = async (id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
    try {
      await deleteHistoryEntry(id);
    } catch {
      fetchHistory();
    }
  };

  const handleClearHistory = async () => {
    setHistory([]);
    try {
      await clearCommandHistory();
    } catch {
      fetchHistory();
    }
  };

  const handleCopyOutput = () => {
    if (output) navigator.clipboard.writeText(output);
  };

  const insertCommand = (domain: string, action: CommandAction) => {
    const template = buildCommandTemplate(domain, action);
    setCommandInput(template);
    inputRef.current?.focus();
  };

  const insertFullCommand = (domain: string, action: CommandAction) => {
    const template = buildFullTemplate(domain, action);
    setCommandInput(template);
    inputRef.current?.focus();
  };

  const filteredHistory = history.filter((h) =>
    historySearch
      ? h.command.toLowerCase().includes(historySearch.toLowerCase())
      : true
  );

  const filteredHints = hintFilter
    ? COMMAND_HINTS.filter(
        (h) =>
          h.domain.toLowerCase().includes(hintFilter.toLowerCase()) ||
          h.actions.some((a) =>
            a.action.toLowerCase().includes(hintFilter.toLowerCase())
          )
      )
    : COMMAND_HINTS;

  const groupedHistory = groupByTime(filteredHistory);

  return (
    <div className="admin-tasks" role="main" aria-label="Admin command runner">
      <header className="admin-tasks__header">
        <div className="admin-tasks__header-inner">
          <Terminal size={32} className="admin-tasks__icon" aria-hidden />
          <div>
            <h1 className="admin-tasks__title">Admin Tasks</h1>
            <p className="admin-tasks__subtitle">
              Run platform commands &bull; Super admin only
            </p>
          </div>
        </div>
      </header>

      {/* ── Terminal Block ── */}
      <div className="admin-tasks__terminal">
        {/* Input row */}
        <form onSubmit={handleSubmit} className="admin-tasks__form">
          <div className="admin-tasks__input-wrap">
            <span className="admin-tasks__prompt">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              className="admin-tasks__input"
              placeholder='domain:action --flags  ·  /commands  ·  /help  ·  e.g. tenants:list'
              value={commandInput}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onFocus={() => {
                const token = commandInput.trim().split(/\s+/)[0] || "";
                const hasFlags = commandInput.includes("--") || commandInput.includes(" -");
                if (token.length > 0 && !hasFlags) setShowSuggestions(true);
              }}
              aria-label="Command input"
              aria-autocomplete="list"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-activedescendant={
                selectedSuggestionIdx >= 0 ? `suggestion-${selectedSuggestionIdx}` : undefined
              }
              disabled={isRunning}
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="admin-tasks__suggestions"
                role="listbox"
              >
                {suggestions.map((s, idx) => (
                  <div
                    key={s.command}
                    id={`suggestion-${idx}`}
                    className={`admin-tasks__suggestion-item${idx === selectedSuggestionIdx ? " admin-tasks__suggestion-item--active" : ""}`}
                    role="option"
                    aria-selected={idx === selectedSuggestionIdx}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      acceptSuggestion(s);
                    }}
                    onMouseEnter={() => setSelectedSuggestionIdx(idx)}
                  >
                    <code className="admin-tasks__suggestion-cmd">{s.command}</code>
                    <span className="admin-tasks__suggestion-help">{s.help}</span>
                  </div>
                ))}
                <div className="admin-tasks__suggestion-footer">
                  <kbd>↑↓</kbd> navigate &middot; <kbd>Tab</kbd> accept &middot; <kbd>Esc</kbd> dismiss
                </div>
              </div>
            )}
          </div>
          <button
            type="submit"
            className="admin-tasks__btn admin-tasks__btn--run"
            disabled={isRunning || !commandInput.trim()}
            aria-label="Run command"
          >
            <Play size={16} aria-hidden />
            Run
          </button>
        </form>

        {/* Tabs bar beneath input */}
        <div className="admin-tasks__tabs" ref={historyPanelRef}>
          <div className="admin-tasks__tab-row">
            <div className="admin-tasks__tab-group">
              <button
                type="button"
                className={`admin-tasks__tab-pill ${showHistory ? "admin-tasks__tab-pill--active" : ""}`}
                onClick={() => setShowHistory(!showHistory)}
              >
                <Clock size={13} aria-hidden />
                Recent commands
              </button>
            </div>
            <div className="admin-tasks__tab-actions">
              <div className="admin-tasks__view-toggle" role="radiogroup" aria-label="Output format">
                <button
                  type="button"
                  className={`admin-tasks__view-btn ${outputMode === "formatted" ? "admin-tasks__view-btn--active" : ""}`}
                  onClick={() => setOutputMode("formatted")}
                  aria-checked={outputMode === "formatted"}
                  role="radio"
                  title="Formatted tables and cards"
                >
                  <Table size={13} aria-hidden />
                  Formatted
                </button>
                <button
                  type="button"
                  className={`admin-tasks__view-btn ${outputMode === "raw" ? "admin-tasks__view-btn--active" : ""}`}
                  onClick={() => setOutputMode("raw")}
                  aria-checked={outputMode === "raw"}
                  role="radio"
                  title="Raw JSON"
                >
                  <Code size={13} aria-hidden />
                  Raw
                </button>
              </div>
              <button
                type="button"
                className="admin-tasks__tab-btn"
                onClick={() => {
                  setCommandInput("");
                  setOutput("");
                  setResultData(null);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="admin-tasks__copy-btn"
                onClick={handleCopyOutput}
                disabled={!output}
                aria-label="Copy output"
              >
                <Copy size={13} aria-hidden />
                Copy
              </button>
            </div>
          </div>

          {/* History dropdown panel */}
          {showHistory && (
            <div className="admin-tasks__history-dropdown">
              <div className="admin-tasks__history-search">
                <Search size={14} className="admin-tasks__search-icon" aria-hidden />
                <input
                  type="search"
                  placeholder="Search command"
                  className="admin-tasks__search-input"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  aria-label="Search command history"
                  autoFocus
                />
              </div>
              <div className="admin-tasks__history-list">
                {filteredHistory.length === 0 ? (
                  <p className="admin-tasks__history-empty">
                    No commands run yet.
                  </p>
                ) : (
                  Object.entries(groupedHistory).map(([label, items]) => (
                    <div key={label}>
                      <div className="admin-tasks__history-group-label">{label}</div>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="admin-tasks__history-item"
                          onClick={() => handleEditAndRun(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditAndRun(item);
                          }}
                        >
                          <span
                            className={`admin-tasks__history-dot admin-tasks__history-dot--${item.status}`}
                            aria-label={item.status}
                          />
                          <div className="admin-tasks__history-body">
                            <code className="admin-tasks__history-cmd">
                              {item.command}
                            </code>
                          </div>
                          <span className="admin-tasks__history-time">
                            {formatTimestamp(item.timestamp)}
                          </span>
                          <div className="admin-tasks__history-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="admin-tasks__action-btn"
                              onClick={() => handleRerun(item)}
                              title="Rerun"
                              aria-label="Rerun"
                            >
                              <RotateCcw size={13} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="admin-tasks__action-btn"
                              onClick={() => handleEditAndRun(item)}
                              title="Edit"
                              aria-label="Edit"
                            >
                              <Edit3 size={13} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="admin-tasks__action-btn admin-tasks__action-btn--danger"
                              onClick={() => handleDelete(item.id)}
                              title="Delete"
                              aria-label="Delete"
                            >
                              <Trash2 size={13} aria-hidden />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
              {history.length > 0 && (
                <div className="admin-tasks__history-footer">
                  <button
                    type="button"
                    className="admin-tasks__history-clear"
                    onClick={handleClearHistory}
                  >
                    <Trash2 size={12} aria-hidden />
                    Clear all history
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Output area — directly under terminal */}
        {outputMode === "raw" || !resultData ? (
          <pre className={`admin-tasks__output ${isRunning ? "admin-tasks__output--running" : ""}`}>
            {output || "Run a command to see output here."}
          </pre>
        ) : (
          <FormattedOutput data={resultData} isRunning={isRunning} />
        )}
      </div>

      {/* Quick Actions */}
      <section className="admin-tasks__section" aria-label="Quick actions">
        <h2 className="admin-tasks__section-title">
          <Zap size={18} aria-hidden />
          Quick Actions
        </h2>
        <div className="admin-tasks__chips">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.command}
              type="button"
              className="admin-tasks__chip"
              onClick={() => {
                setCommandInput(qa.command);
                runCommand(qa.command);
              }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      </section>

      {/* Available Commands */}
      <section className="admin-tasks__section" aria-label="Command reference">
        <h2 className="admin-tasks__section-title">Available Commands</h2>
        <p className="admin-tasks__format-hint">
          Format: <code>domain:action --flag value</code> (short flags like <code>-n</code>). Slash helpers in the same box:{" "}
          <code>/commands</code> lists everything, <code>/help</code> summarizes, <code>/help tenants</code> filters by domain.
        </p>
        <div className="admin-tasks__hint-filter">
          <Search size={16} className="admin-tasks__search-icon" aria-hidden />
          <input
            type="search"
            placeholder="Filter commands..."
            className="admin-tasks__search-input"
            value={hintFilter}
            onChange={(e) => setHintFilter(e.target.value)}
            aria-label="Filter commands"
          />
        </div>
        <div className="admin-tasks__hints">
          {filteredHints.map((h) => (
            <div key={h.domain} className="admin-tasks__hint-group">
              <h3 className="admin-tasks__hint-domain">{h.domain}</h3>
              <ul className="admin-tasks__hint-list">
                {h.actions.map((a) => {
                  const actionKey = `${h.domain}:${a.action}`;
                  const isExpanded = expandedAction === actionKey;
                  return (
                    <li key={a.action} className="admin-tasks__hint-item-wrap">
                      <div className="admin-tasks__hint-item">
                        <button
                          type="button"
                          className="admin-tasks__hint-expand"
                          onClick={() =>
                            setExpandedAction(isExpanded ? null : actionKey)
                          }
                          aria-expanded={isExpanded}
                          aria-label={`Toggle details for ${actionKey}`}
                        >
                          <ChevronRight
                            size={14}
                            className={`admin-tasks__hint-chevron ${isExpanded ? "admin-tasks__hint-chevron--open" : ""}`}
                            aria-hidden
                          />
                        </button>
                        <div className="admin-tasks__hint-main">
                          <code className="admin-tasks__hint-cmd">{a.action}</code>
                          {a.help && (
                            <span className="admin-tasks__hint-help">{a.help}</span>
                          )}
                        </div>
                        <div className="admin-tasks__hint-badges">
                          {a.params.filter((p) => p.required).length > 0 && (
                            <span className="admin-tasks__hint-badge admin-tasks__hint-badge--req">
                              {a.params.filter((p) => p.required).length} required
                            </span>
                          )}
                          {a.params.filter((p) => !p.required).length > 0 && (
                            <span className="admin-tasks__hint-badge">
                              {a.params.filter((p) => !p.required).length} optional
                            </span>
                          )}
                        </div>
                        <div className="admin-tasks__hint-actions">
                          <button
                            type="button"
                            className="admin-tasks__hint-insert"
                            onClick={() => insertCommand(h.domain, a)}
                            title="Insert with required flags"
                            aria-label={`Insert ${actionKey} with required flags`}
                          >
                            <ChevronRight size={14} aria-hidden />
                          </button>
                        </div>
                      </div>
                      {isExpanded && a.params.length > 0 && (
                        <div className="admin-tasks__hint-detail">
                          <table className="admin-tasks__param-table">
                            <thead>
                              <tr>
                                <th>Flag</th>
                                <th>Short</th>
                                <th>Description</th>
                                <th>Default</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.params.map((p) => (
                                <tr key={p.long} className={p.required ? "admin-tasks__param-row--req" : ""}>
                                  <td>
                                    <code>{p.long}</code>
                                    {p.required && <span className="admin-tasks__req-dot" title="Required">*</span>}
                                  </td>
                                  <td>
                                    {p.short ? <code>{p.short}</code> : <span className="admin-tasks__param-na">&mdash;</span>}
                                  </td>
                                  <td>{p.help}</td>
                                  <td>
                                    {p.default ? <code>{p.default}</code> : <span className="admin-tasks__param-na">&mdash;</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="admin-tasks__hint-detail-actions">
                            <button
                              type="button"
                              className="admin-tasks__chip admin-tasks__chip--sm"
                              onClick={() => insertCommand(h.domain, a)}
                            >
                              Insert required flags
                            </button>
                            <button
                              type="button"
                              className="admin-tasks__chip admin-tasks__chip--sm"
                              onClick={() => insertFullCommand(h.domain, a)}
                            >
                              Insert all flags
                            </button>
                          </div>
                        </div>
                      )}
                      {isExpanded && a.params.length === 0 && (
                        <div className="admin-tasks__hint-detail">
                          <p className="admin-tasks__no-params">
                            <Info size={14} aria-hidden /> No parameters required
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
