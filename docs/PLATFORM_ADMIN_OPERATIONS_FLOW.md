# Platform Admin Operations Flow

## Purpose

This runbook documents the operational flows for platform admins using:

- Platform UI pages (`/app/platform/*`)
- Admin Tasks command runner (`/app/platform/tasks`)
- Platform APIs (`/api/v1/platform/*`, `/api/v1/growth/*`, `/api/v1/subscriptions/*`, `/api/v1/licenses/*`)

It covers users, tenants, roles, plans, subscriptions, licenses, promos, affiliates, commissions, exports, and what to do for deletion/deactivation.

## Access and permissions

Platform operations are guarded by global permissions. Typical global roles:

- `platform_owner`
- `platform_admin`
- `devops`
- `support`
- `platform_finance`
- `growth_ops`

Growth endpoints require:

- View: `platform.growth:view`
- Manage: `platform.growth:manage`

## Operating surfaces

- **Admin Tasks UI**: `/app/platform/tasks`
  - Runs whitelisted commands in format `domain:action --flag value`
  - Stores command history and audit log
- **Role Manager UI**: `/app/platform/roles`
- **Growth Ops UI**: `/app/platform/growth`
- **Billing settings API (tenant mode switch)**:
  - `PATCH /api/v1/platform/tenants/{tenant_id}/billing-mode`

---

## 1) User lifecycle flow

### Create user

- Admin Tasks:
  - `users:create -e user@example.com -p VeryStrongPass123! -f Jane -l Doe`

### Inspect user and role

- Admin Tasks:
  - `users:get -e user@example.com`
  - `users:list-admins`

### Assign global role

- Admin Tasks:
  - `users:set-role -e user@example.com -r platform_finance`
  - `users:set-role -e user@example.com -r growth_ops`

### Deactivate / reactivate user

- Deactivate:
  - `users:deactivate -e user@example.com`
- Reactivate:
  - `users:activate -e user@example.com`

### Remove global role

- `users:remove-role -e user@example.com`

### Deletion behavior

- There is no user hard-delete command in Admin Tasks.
- Operationally, use `deactivate` for safe disablement and auditability.

---

## 2) Tenant lifecycle flow

### Create tenant

- `tenants:create -n "STEM Center A" -s stem-center-a -c STEMA01 -t center -o owner@example.com`

### View and list tenants

- `tenants:list`
- `tenants:list --active-only true`
- `tenants:get -s stem-center-a`

### Add members

- `tenants:add-member -s stem-center-a -e instructor@example.com -r instructor`
- `tenants:list-members -s stem-center-a`

### Activate / deactivate tenant

- Deactivate:
  - `tenants:deactivate -s stem-center-a`
- Reactivate:
  - `tenants:activate -s stem-center-a`

### Tenant billing mode switch (live/test/internal)

- API:
  - `PATCH /api/v1/platform/tenants/{tenant_id}/billing-mode`
- Body:
  - `{ "billing_mode": "internal", "billing_email_enabled": false }`

### Deletion behavior

- No hard-delete command exposed for tenant in Admin Tasks.
- Use deactivate/reactivate lifecycle.

---

## 3) Tenant RBAC flow

### Discover permission catalog

- `tenants:permissions-catalog`

### List tenant roles

- `tenants:list-roles -s stem-center-a`

### Create custom tenant role

- `tenants:create-role --role-name "Curriculum Lead" --role-slug curriculum_lead -s stem-center-a --template instructor`

### Add / remove role permissions

- Add:
  - `tenants:add-role-permissions -r curriculum_lead -s stem-center-a --permissions curriculum:view,curriculum:edit`
- Remove:
  - `tenants:remove-role-permissions -r curriculum_lead -s stem-center-a --permissions curriculum:edit`

### Show role detail

- `tenants:show-role -r curriculum_lead -s stem-center-a`

### Deletion behavior

- No explicit tenant-role delete command in Admin Tasks.
- Practical approach: remove assignments and permissions, then mark role inactive through tenant role management API/UI as available.

---

## 4) Plan flow

### Create plan

- `plans:create -n "Pro Plus" -s pro_plus -t pro --price-monthly 79.00 --price-yearly 790.00 --trial-days 14`

### Inspect plans

- `plans:list`
- `plans:get -s pro_plus`

### Activate / deactivate plan

- Deactivate:
  - `plans:deactivate -s pro_plus`
- Reactivate:
  - `plans:activate -s pro_plus`

### Deletion behavior

- No hard-delete command exposed for plans.
- Use deactivate/reactivate.

---

## 5) Subscription flow

### Checkout (customer path)

- Frontend billing page uses live endpoints:
  - `GET /api/v1/plans`
  - `POST /api/v1/subscriptions/checkout`
- Promo and affiliate code fields are sent in checkout payload.

### Operational subscription checks

- `subscriptions:list`
- `subscriptions:get --id <subscription_uuid>`
- `subscriptions:status --tenant stem-center-a`
- `subscriptions:expiring --days 30`

### Cancel subscription

- `subscriptions:cancel --id <subscription_uuid>`

### Stripe reconciliation (ops API)

- `POST /api/v1/subscriptions/reconcile/stripe`

### Deletion behavior

- No hard-delete subscription command exposed.
- Use cancel/status lifecycle.

---

## 6) License flow

### List and inspect

- `licenses:list`
- `licenses:get --id <license_uuid>`

### Grant license

- `licenses:grant -t stem-center-a -e owner@example.com --subscription-id <subscription_uuid> --valid-from 2026-03-23 --valid-until 2027-03-23`

### Revoke / reinstate

- Revoke:
  - `licenses:revoke --id <license_uuid>`
- Reinstate:
  - `licenses:reinstate --id <license_uuid>`

### Deletion behavior

- No hard-delete command exposed.
- Use revoke/reinstate status transitions.

---

## 7) Growth Ops flow (promos, affiliates, commissions)

## Access

- UI: `/app/platform/growth`
- Requires `platform.growth:view` for read and `platform.growth:manage` for writes

### Create promo

- UI form or API:
  - `POST /api/v1/growth/promos`
- Includes code, discount, start/end, limits, provider mappings.

### Validate promo

- `GET /api/v1/growth/promos/validate?code=...&subtotal_cents=...`

### List promos

- `GET /api/v1/growth/promos`

### Create affiliate

- UI form or API:
  - `POST /api/v1/growth/affiliates`
- Includes commission mode/type/window/cycles/hold days.

### List affiliates

- `GET /api/v1/growth/affiliates`

### List commissions and update status

- List:
  - `GET /api/v1/growth/commissions`
- Update:
  - `PATCH /api/v1/growth/commissions/{commission_id}/status`
  - e.g. mark paid

### Export reporting

- Commissions CSV:
  - `GET /api/v1/growth/reports/commissions.csv`
- Payout file CSV:
  - `GET /api/v1/growth/reports/payouts.csv`

### Deletion behavior (important)

- Current growth API does not expose explicit delete endpoints for promos/affiliates.
- Operational pattern:
  - Keep historical records immutable for audit.
  - Use lifecycle/status controls (inactive/paused style behavior) instead of hard delete.
- If hard-delete is required, implement explicit constrained delete endpoints with integrity checks first.

---

## 8) Audit flow

### List audit entries

- Admin Tasks:
  - `audit:list`
  - filters: `--email`, `--domain`, `--action`, `--status`, `--limit`

### Get one audit entry

- `audit:get --id <audit_uuid>`

Use audit output to trace:

- who executed command/API
- target entity
- state transitions and result summary

---

## 9) Recommended SOP sequence

For onboarding a new customer org:

1. Create tenant (`tenants:create`)
2. Add core users (`users:create`, `tenants:add-member`)
3. Assign global/tenant roles (`users:set-role`, tenant role flows)
4. Confirm plan and checkout (`plans:get`, billing page checkout)
5. Verify subscription/license (`subscriptions:status`, `licenses:get`)
6. Configure promos/affiliates if needed (`/growth` UI)
7. Monitor with audit and exports (`audit:list`, growth CSV exports)

For internal dogfooding:

1. Set tenant billing mode to `internal`
2. Disable billing emails if desired
3. Run full checkout + webhook simulation flows
4. Validate commissions are marked non-payable in internal mode

---

## 10) Safety notes

- Prefer deactivate/revoke over hard deletes for operational entities.
- Keep promo/affiliate/commission data append-only for finance traceability.
- Always run changes with global roles scoped to least privilege (`platform_finance`, `growth_ops`) where possible.
