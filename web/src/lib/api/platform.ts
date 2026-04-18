import { apiFetch } from "./client";

export interface CommandResponse {
  ok: boolean;
  command: string;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export async function executeCommand(
  command: string
): Promise<CommandResponse> {
  return apiFetch<CommandResponse>("/platform/execute", {
    method: "POST",
    body: { command },
  });
}

export interface CommandListResponse {
  commands: {
    domain: string;
    action: string;
    help: string;
    params: {
      long: string;
      short: string | null;
      required: boolean;
      help: string;
      default: string | null;
    }[];
  }[];
}

export async function getAvailableCommands(): Promise<CommandListResponse> {
  return apiFetch<CommandListResponse>("/platform/commands");
}

// ─── Command History ────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  status: string;
  output: string;
}

export interface HistoryListResponse {
  items: HistoryEntry[];
  count: number;
}

export async function getCommandHistory(
  offset = 0,
  limit = 50
): Promise<HistoryListResponse> {
  return apiFetch<HistoryListResponse>(
    `/platform/history?offset=${offset}&limit=${limit}`
  );
}

export async function deleteHistoryEntry(
  entryId: string
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(
    `/platform/history/${encodeURIComponent(entryId)}`,
    { method: "DELETE" }
  );
}

export async function clearCommandHistory(): Promise<{ cleared: number }> {
  return apiFetch<{ cleared: number }>("/platform/history", {
    method: "DELETE",
  });
}

// ─── Entity Browser ─────────────────────────────────────────────────────────

export interface EntityFilterDef {
  column: string;
  label: string;
  type: "text" | "boolean" | "uuid" | "select";
  options: string[] | null;
}

export interface EntityTypeDef {
  key: string;
  label: string;
  icon: string;
  count: number;
  display_columns: string[];
  filters: EntityFilterDef[];
}

export interface EntityListResponse {
  entities: EntityTypeDef[];
}

export async function getEntityTypes(): Promise<EntityListResponse> {
  return apiFetch<EntityListResponse>("/platform/entities");
}

export interface EntityQueryResponse {
  items: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

export async function queryEntity(
  entityKey: string,
  params: {
    search?: string;
    sort?: string;
    dir?: "asc" | "desc";
    offset?: number;
    limit?: number;
    filters?: Record<string, string>;
  } = {}
): Promise<EntityQueryResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.sort) qs.set("sort", params.sort);
  if (params.dir) qs.set("dir", params.dir);
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.filters) {
    for (const [k, v] of Object.entries(params.filters)) {
      if (v) qs.set(k, v);
    }
  }
  return apiFetch<EntityQueryResponse>(
    `/platform/entities/${encodeURIComponent(entityKey)}?${qs.toString()}`
  );
}

export interface EntityDetailResponse {
  entity_key: string;
  entity_id: string;
  data: Record<string, unknown>;
}

export async function getEntityDetail(
  entityKey: string,
  entityId: string
): Promise<EntityDetailResponse> {
  return apiFetch<EntityDetailResponse>(
    `/platform/entities/${encodeURIComponent(entityKey)}/${encodeURIComponent(entityId)}`
  );
}

// ─── Blob Finder ─────────────────────────────────────────────────────────────

export interface BlobListItem {
  key: string;
  size?: number | null;
  etag?: string | null;
  storage_class?: string | null;
  last_modified?: string | null;
}

export interface BlobDetailItem extends BlobListItem {
  content_type?: string | null;
  metadata?: Record<string, string>;
}

export interface BlobQueryResponse {
  mode: "exact" | "contains";
  query: string;
  prefix: string;
  folders: string[];
  items: BlobListItem[];
}

export async function queryBlobs(params: {
  key?: string;
  mode?: "exact" | "contains";
  folders?: boolean;
  max?: number;
  prefix?: string;
} = {}): Promise<BlobQueryResponse> {
  const qs = new URLSearchParams();
  if (params.key) qs.set("key", params.key);
  if (params.mode) qs.set("mode", params.mode);
  if (params.folders != null) qs.set("folders", String(params.folders));
  if (params.max != null) qs.set("max", String(params.max));
  if (params.prefix) qs.set("prefix", params.prefix);
  return apiFetch<BlobQueryResponse>(`/platform/blobs/query?${qs.toString()}`);
}

export async function getBlobItem(key: string): Promise<{ item: BlobDetailItem }> {
  return apiFetch<{ item: BlobDetailItem }>(
    `/platform/blobs/item?key=${encodeURIComponent(key)}`
  );
}

export async function getBlobDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<{ key: string; url: string; expires_in: number }> {
  return apiFetch<{ key: string; url: string; expires_in: number }>(
    `/platform/blobs/item/download?key=${encodeURIComponent(key)}&expires_in=${expiresIn}`
  );
}

// ─── Role Manager ────────────────────────────────────────────────────────────

export interface RolePermissions {
  [resource: string]: string[];
}

export interface GlobalRole {
  id: string;
  slug: string;
  name: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string | null;
  user_count: number;
  permissions: RolePermissions;
}

export interface UserAssignment {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role_slug: string;
  role_name: string;
  is_active: boolean;
  assigned_at: string | null;
  granted_by_email: string | null;
}

export async function getGlobalRoles(): Promise<{ roles: GlobalRole[] }> {
  return apiFetch<{ roles: GlobalRole[] }>("/platform/roles");
}

export async function getRoleAssignments(): Promise<{ assignments: UserAssignment[] }> {
  return apiFetch<{ assignments: UserAssignment[] }>("/platform/roles/users");
}

export interface GlobalPermission {
  id: string;
  resource: string;
  action: string;
  description: string | null;
}

export async function getGlobalPermissions(): Promise<{ permissions: GlobalPermission[] }> {
  return apiFetch<{ permissions: GlobalPermission[] }>("/platform/roles/permissions");
}

export async function createGlobalRole(payload: {
  name: string;
  slug: string;
}): Promise<{ id: string; name: string; slug: string }> {
  return apiFetch("/platform/roles", {
    method: "POST",
    body: payload,
  });
}

export async function updateGlobalRole(
  roleId: string,
  payload: { name?: string; is_active?: boolean }
): Promise<{ id: string; name: string; slug: string; is_active: boolean }> {
  return apiFetch(`/platform/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteGlobalRole(roleId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/platform/roles/${encodeURIComponent(roleId)}`, {
    method: "DELETE",
  });
}

export async function assignGlobalRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<{ ok: boolean; added: number }> {
  return apiFetch(`/platform/roles/${encodeURIComponent(roleId)}/permissions`, {
    method: "POST",
    body: { permission_ids: permissionIds },
  });
}

export async function revokeGlobalRolePermission(
  roleId: string,
  permissionId: string
): Promise<{ ok: boolean }> {
  return apiFetch(
    `/platform/roles/${encodeURIComponent(roleId)}/permissions/${encodeURIComponent(permissionId)}`,
    { method: "DELETE" }
  );
}

export async function assignRole(
  email: string,
  role_slug: string
): Promise<{ ok: boolean; message?: string; error?: string }> {
  return apiFetch("/platform/roles/assign", {
    method: "POST",
    body: { email, role_slug },
  });
}

export async function removeRole(
  email: string
): Promise<{ ok: boolean; message?: string; error?: string }> {
  return apiFetch("/platform/roles/remove", {
    method: "POST",
    body: { email },
  });
}

export interface PlatformEmailProvider {
  id: string;
  provider: string;
  is_active: boolean;
  priority: number;
  config: Record<string, unknown>;
  last_error: string | null;
  last_used_at: string | null;
  updated_at: string;
}

export async function getPlatformEmailProviders(): Promise<{ providers: PlatformEmailProvider[] }> {
  return apiFetch<{ providers: PlatformEmailProvider[] }>("/platform/email/providers");
}

export async function updatePlatformEmailProvider(
  providerId: string,
  payload: {
    is_active?: boolean;
    priority?: number;
    config?: Record<string, unknown>;
  }
): Promise<PlatformEmailProvider> {
  return apiFetch(`/platform/email/providers/${encodeURIComponent(providerId)}`, {
    method: "PATCH",
    body: payload,
  });
}

// ─── Platform Analytics ──────────────────────────────────────────────────────

export interface PlatformStats {
  tenant_count: number;
  active_tenant_count: number;
  user_count: number;
  active_user_count: number;
  student_count: number;
  new_tenants: number;
  new_users: number;
  new_students: number;
}

export interface TopTenant {
  name: string;
  slug: string;
  member_count: number;
  student_count: number;
  is_active: boolean;
  created_at: string;
  type: string;
}

export interface AuditEvent {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  db_user: string;
  created_at: string;
}

export async function getPlatformStats(
  period = "last_30d"
): Promise<PlatformStats> {
  return apiFetch<PlatformStats>(
    `/platform/analytics/stats?period=${encodeURIComponent(period)}`
  );
}

export async function getTopTenants(
  limit = 10
): Promise<{ tenants: TopTenant[] }> {
  return apiFetch<{ tenants: TopTenant[] }>(
    `/platform/analytics/top-tenants?limit=${limit}`
  );
}

export async function getRecentEvents(
  limit = 20
): Promise<{ events: AuditEvent[] }> {
  return apiFetch<{ events: AuditEvent[] }>(
    `/platform/analytics/recent-events?limit=${limit}`
  );
}

// ─── Job Worker ──────────────────────────────────────────────────────────────

export interface JobType {
  job_type: string;
  description: string;
  queue: string;
  runtime: string;
  max_retries: number;
  retry_delay: number;
  dedup_ttl: number;
  has_schedule: boolean;
  schedule: Record<string, string> | null;
}

export interface ActiveTask {
  id: string;
  /** Celery task name (module path or registered name). */
  name: string;
  /** Registry description or humanized name for UI. */
  display_name?: string | null;
  /** Job registry key when known (e.g. ``email.send``). */
  job_type?: string | null;
  worker: string;
  started_at?: number;
}

export interface JobStats {
  available: boolean;
  running_count: number;
  workers: string[];
  active_tasks: ActiveTask[];
  /** Present when ``available`` is false or when the API adds context */
  message?: string | null;
}

/** Celery extended metadata (``result_extended``): worker, kwargs snapshot, traceback, … */
export interface TaskResultDetails {
  worker?: string;
  queue?: string;
  retries?: number;
  parent_id?: string;
  root_id?: string;
  traceback?: string;
  args?: unknown;
  parameters?: Record<string, unknown>;
}

export interface TaskResult {
  task_id: string;
  status: string;
  result: unknown;
  date_done: string | null;
  task_name: string | null;
  job_type?: string | null;
  display_name?: string | null;
  /** Populated when the result backend stores extended task meta (see workers ``result_extended``). */
  details?: TaskResultDetails | null;
}

export interface RetryJobResponse {
  success: boolean;
  message?: string;
  task_id?: string;
  job_type?: string | null;
  error?: string;
}

export async function getJobTypes(): Promise<{ job_types: JobType[] }> {
  return apiFetch<{ job_types: JobType[] }>("/platform/jobs/types");
}

export async function getJobStats(): Promise<JobStats> {
  return apiFetch<JobStats>("/platform/jobs/stats");
}

export async function getRecentJobResults(
  limit = 50
): Promise<{ results: TaskResult[] }> {
  return apiFetch<{ results: TaskResult[] }>(
    `/platform/jobs/results?limit=${limit}`
  );
}

export async function retryJob(taskId: string): Promise<RetryJobResponse> {
  return apiFetch<RetryJobResponse>(
    `/platform/jobs/${encodeURIComponent(taskId)}/retry`,
    {
      method: "POST",
    }
  );
}

export async function cancelJob(
  taskId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  return apiFetch(`/platform/jobs/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  });
}

// ─── Health Check ────────────────────────────────────────────────────────────

export interface ServiceCheckResult {
  status: "healthy" | "degraded" | "down";
  latency_ms: number;
  message: string;
  details: Record<string, unknown>;
}

export interface HealthReport {
  overall: "healthy" | "degraded" | "down";
  healthy_count: number;
  degraded_count: number;
  down_count: number;
  total_services: number;
  services: Record<string, ServiceCheckResult>;
}

export async function runHealthChecks(): Promise<HealthReport> {
  return apiFetch<HealthReport>("/platform/health");
}

// ─── Impersonation ───────────────────────────────────────────────────────────

export interface TenantSearchResult {
  grant_id: string;
  id: string;
  name: string;
  slug: string;
  type: string;
  is_active: boolean;
  role_slug?: string | null;
  role_name?: string | null;
  expires_at?: string | null;
  reason?: string | null;
}

export async function searchTenants(
  q: string,
  limit = 10
): Promise<{ tenants: TenantSearchResult[] }> {
  return apiFetch<{ tenants: TenantSearchResult[] }>(
    `/platform/tenants/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

export interface ImpersonateResponse {
  access_token: string;
  refresh_token: string;
  tenant: { id: string; name: string; slug: string };
}

export async function impersonateTenant(
  grantId: string
): Promise<ImpersonateResponse> {
  return apiFetch<ImpersonateResponse>("/platform/impersonate", {
    method: "POST",
    body: { grant_id: grantId },
  });
}

export interface PlatformMemberBillingDefaultFeeResponse {
  member_billing_default_application_fee_bps: number;
}

export async function getPlatformMemberBillingDefaultFee(): Promise<PlatformMemberBillingDefaultFeeResponse> {
  return apiFetch<PlatformMemberBillingDefaultFeeResponse>(
    "/platform/member-billing/platform-application-fee"
  );
}

export async function updatePlatformMemberBillingDefaultFee(
  member_billing_default_application_fee_bps: number
): Promise<{ ok: boolean; member_billing_default_application_fee_bps: number }> {
  return apiFetch("/platform/member-billing/platform-application-fee", {
    method: "PATCH",
    body: { member_billing_default_application_fee_bps },
  });
}

/** Per-tenant Stripe Connect application fee (100 bps = 1%). */
export async function updateTenantMemberBillingFee(
  tenantId: string,
  body: {
    member_billing_application_fee_bps?: number;
    member_billing_application_fee_use_platform_default?: boolean;
  }
): Promise<{
  ok: boolean;
  tenant_id: string;
  member_billing_application_fee_bps: number;
  member_billing_application_fee_use_platform_default: boolean;
}> {
  return apiFetch(
    `/platform/tenants/${encodeURIComponent(tenantId)}/member-billing-fee`,
    {
      method: "PATCH",
      body,
    }
  );
}

export interface RateLimitProfile {
  key: string;
  limit: number;
  window_seconds: number;
  description?: string | null;
}

export interface RateLimitOverride {
  id: string;
  scope_type: "tenant" | "user";
  scope_id: string;
  scope_label?: string | null;
  scope_subtitle?: string | null;
  mode: "profile_only" | "custom_only" | "profile_plus_custom";
  profile_key?: string | null;
  custom_limit?: number | null;
  custom_window_seconds?: number | null;
  reason?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RateLimitOverrideListResponse {
  items: RateLimitOverride[];
  total: number;
  offset: number;
  limit: number;
}

export interface RateLimitLookupUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
}

export interface RateLimitLookupTenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  is_active: boolean;
}

export interface EffectiveRateLimitResponse {
  route_path: string;
  route_class: string;
  route_profile_key: string;
  user_profile?: RateLimitProfile | null;
  tenant_profile?: RateLimitProfile | null;
  anonymous_profile: RateLimitProfile;
  failure_mode: "open" | "closed";
}

export async function listRateLimitProfiles(): Promise<RateLimitProfile[]> {
  return apiFetch<RateLimitProfile[]>("/platform/rate-limits/profiles");
}

export async function searchRateLimitUsers(
  q: string,
  limit = 10
): Promise<RateLimitLookupUser[]> {
  return apiFetch<RateLimitLookupUser[]>(
    `/platform/rate-limits/lookup/users?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

export async function searchRateLimitTenants(
  q: string,
  limit = 10
): Promise<RateLimitLookupTenant[]> {
  return apiFetch<RateLimitLookupTenant[]>(
    `/platform/rate-limits/lookup/tenants?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

export async function listRateLimitOverrides(params: {
  scope_type?: "tenant" | "user";
  profile_key?: string;
  offset?: number;
  limit?: number;
} = {}): Promise<RateLimitOverrideListResponse> {
  const query = new URLSearchParams();
  query.set("offset", String(params.offset ?? 0));
  query.set("limit", String(params.limit ?? 50));
  if (params.scope_type) query.set("scope_type", params.scope_type);
  if (params.profile_key) query.set("profile_key", params.profile_key);
  return apiFetch<RateLimitOverrideListResponse>(
    `/platform/rate-limits/overrides?${query.toString()}`
  );
}

export async function upsertRateLimitOverride(payload: {
  scope_type: "tenant" | "user";
  scope_id: string;
  mode: "profile_only" | "custom_only" | "profile_plus_custom";
  profile_key?: string | null;
  custom_limit?: number | null;
  custom_window_seconds?: number | null;
  reason?: string | null;
}): Promise<RateLimitOverride> {
  return apiFetch<RateLimitOverride>("/platform/rate-limits/overrides", {
    method: "PUT",
    body: payload,
  });
}

export async function deleteRateLimitOverride(
  scopeType: "tenant" | "user",
  scopeId: string
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(
    `/platform/rate-limits/overrides/${scopeType}/${encodeURIComponent(scopeId)}`,
    { method: "DELETE" }
  );
}

export async function getEffectiveRateLimit(params: {
  path: string;
  user_id?: string;
  tenant_id?: string;
}): Promise<EffectiveRateLimitResponse> {
  const query = new URLSearchParams();
  query.set("path", params.path);
  if (params.user_id) query.set("user_id", params.user_id);
  if (params.tenant_id) query.set("tenant_id", params.tenant_id);
  return apiFetch<EffectiveRateLimitResponse>(
    `/platform/rate-limits/effective?${query.toString()}`
  );
}

export interface PlatformFeatureFlag {
  id: string;
  key: string;
  owner: string;
  status: string;
  description: string;
  stage: string;
  default_enabled: boolean;
  allow_debug_events: boolean;
  fail_mode: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformFeatureFlagRule {
  id: string;
  flag_id: string;
  priority: number;
  enabled: boolean;
  rule_type: string;
  match_operator: string;
  conditions: Array<{ attribute: string; op: string; value: unknown }>;
  rollout_percentage: number | null;
  variant: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformFeatureFlagTarget {
  id: string;
  flag_id: string;
  target_type: "all" | "user" | "tenant";
  target_key: string;
  stage: string;
  enabled: boolean;
  variant: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlatformFeatureFlagMetricPoint {
  bucket_start: string;
  on_count: number;
  off_count: number;
  usage_count: number;
  variant_counts: Record<string, number>;
}

export interface PlatformFeatureFlagMetrics {
  flag_key: string;
  dimension_key: string;
  dimension_value: string;
  granularity: string;
  points: PlatformFeatureFlagMetricPoint[];
}

export interface PlatformFeatureEvaluation {
  key: string;
  enabled: boolean;
  variant: string | null;
  decision_source: string;
  cache_hit: boolean;
  reason: string | null;
}

export interface PlatformFeatureLookupUser {
  id: string;
  avatar_url: string | null;
  email: string;
  full_name: string;
  is_active: boolean;
}

export interface PlatformFeatureLookupTenant {
  id: string;
  avatar_url: string | null;
  name: string;
  slug: string;
  type: string;
  is_active: boolean;
}

export interface PlatformFeatureFlagListResponse {
  total: number;
  offset: number;
  limit: number;
  items: PlatformFeatureFlag[];
}

export async function listPlatformFeatureFlags(
  includeArchived = false,
  params: {
    offset?: number;
    limit?: number;
    q?: string;
    status?: string;
    stage?: string;
  } = {}
): Promise<PlatformFeatureFlagListResponse> {
  const query = new URLSearchParams();
  query.set("include_archived", includeArchived ? "true" : "false");
  query.set("offset", String(params.offset ?? 0));
  query.set("limit", String(params.limit ?? 25));
  if (params.q) query.set("q", params.q);
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.stage && params.stage !== "all") query.set("stage", params.stage);
  return apiFetch<PlatformFeatureFlagListResponse>(
    `/platform/feature-flags/?${query.toString()}`
  );
}

export async function getPlatformFeatureFlag(
  flagId: string
): Promise<PlatformFeatureFlag> {
  return apiFetch<PlatformFeatureFlag>(
    `/platform/feature-flags/${encodeURIComponent(flagId)}`
  );
}

export async function createPlatformFeatureFlag(payload: {
  key: string;
  owner: string;
  status: string;
  description: string;
  stage: string;
  default_enabled: boolean;
  allow_debug_events: boolean;
  fail_mode: "open" | "closed";
}): Promise<{ id: string; key: string }> {
  return apiFetch("/platform/feature-flags/", { method: "POST", body: payload });
}

export async function patchPlatformFeatureFlag(
  flagId: string,
  payload: Partial<{
    owner: string;
    status: string;
    description: string;
    stage: string;
    default_enabled: boolean;
    allow_debug_events: boolean;
    fail_mode: "open" | "closed";
  }>
): Promise<{ ok: boolean }> {
  return apiFetch(`/platform/feature-flags/${encodeURIComponent(flagId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function listPlatformFeatureFlagRules(
  flagId: string
): Promise<PlatformFeatureFlagRule[]> {
  return apiFetch<PlatformFeatureFlagRule[]>(
    `/platform/feature-flags/${encodeURIComponent(flagId)}/rules`
  );
}

export async function createPlatformFeatureFlagRule(
  flagId: string,
  payload: {
    priority: number;
    enabled: boolean;
    rule_type: "targeting" | "rollout" | "experiment";
    match_operator: "all" | "any";
    conditions: Array<{ attribute: string; op: string; value: unknown }>;
    rollout_percentage: number | null;
    variant: string | null;
  }
): Promise<PlatformFeatureFlagRule> {
  return apiFetch(
    `/platform/feature-flags/${encodeURIComponent(flagId)}/rules`,
    { method: "POST", body: payload }
  );
}

export async function patchPlatformFeatureFlagRule(
  ruleId: string,
  payload: Partial<{
    priority: number;
    enabled: boolean;
    rule_type: "targeting" | "rollout" | "experiment";
    match_operator: "all" | "any";
    conditions: Array<{ attribute: string; op: string; value: unknown }>;
    rollout_percentage: number | null;
    variant: string | null;
  }>
): Promise<PlatformFeatureFlagRule> {
  return apiFetch(
    `/platform/feature-flags/rules/${encodeURIComponent(ruleId)}`,
    { method: "PATCH", body: payload }
  );
}

export async function listPlatformFeatureFlagTargets(
  flagId: string
): Promise<PlatformFeatureFlagTarget[]> {
  return apiFetch<PlatformFeatureFlagTarget[]>(
    `/platform/feature-flags/${encodeURIComponent(flagId)}/targets`
  );
}

export async function createPlatformFeatureFlagTarget(
  flagId: string,
  payload: {
    target_type: "all" | "user" | "tenant";
    target_key: string;
    stage: "any" | "dev" | "production";
    enabled: boolean;
    variant?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<PlatformFeatureFlagTarget> {
  return apiFetch(
    `/platform/feature-flags/${encodeURIComponent(flagId)}/targets`,
    {
      method: "POST",
      body: payload,
    }
  );
}

export async function patchPlatformFeatureFlagTarget(
  targetId: string,
  payload: Partial<{
    target_type: "all" | "user" | "tenant";
    target_key: string;
    stage: "any" | "dev" | "production";
    enabled: boolean;
    variant?: string | null;
    metadata?: Record<string, unknown>;
  }>
): Promise<PlatformFeatureFlagTarget> {
  return apiFetch(
    `/platform/feature-flags/targets/${encodeURIComponent(targetId)}`,
    {
      method: "PATCH",
      body: payload,
    }
  );
}

export async function listPlatformFeatureFlagMetrics(
  flagId: string,
  params: {
    days?: number;
    dimension_key?: string;
    dimension_value?: string;
    granularity?: string;
  } = {}
): Promise<PlatformFeatureFlagMetrics> {
  const query = new URLSearchParams();
  if (params.days != null) query.set("days", String(params.days));
  if (params.dimension_key) query.set("dimension_key", params.dimension_key);
  if (params.dimension_value) query.set("dimension_value", params.dimension_value);
  if (params.granularity) query.set("granularity", params.granularity);
  return apiFetch<PlatformFeatureFlagMetrics>(
    `/platform/feature-flags/${encodeURIComponent(flagId)}/metrics?${query.toString()}`
  );
}

export async function syncPlatformFeatureFlagRegistry(): Promise<{
  ok: boolean;
  loaded: number;
  created: number;
  updated: number;
}> {
  return apiFetch("/platform/feature-flags/sync-registry", { method: "POST" });
}

export async function evaluatePlatformFeatureFlag(
  flagKey: string
): Promise<PlatformFeatureEvaluation> {
  return apiFetch<PlatformFeatureEvaluation>(
    `/platform/feature-flags/evaluate/${encodeURIComponent(flagKey)}`
  );
}

export async function searchPlatformFeatureFlagUsers(
  q: string,
  limit = 10
): Promise<{ items: PlatformFeatureLookupUser[] }> {
  return apiFetch<{ items: PlatformFeatureLookupUser[] }>(
    `/platform/feature-flags/lookup/users?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

export async function searchPlatformFeatureFlagTenants(
  q: string,
  limit = 10
): Promise<{ items: PlatformFeatureLookupTenant[] }> {
  return apiFetch<{ items: PlatformFeatureLookupTenant[] }>(
    `/platform/feature-flags/lookup/tenants?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}
