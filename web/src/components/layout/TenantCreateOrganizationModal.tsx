import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { ModalDialog } from "../ui/ModalDialog";
import { KidCheckbox, KidDropdown } from "../ui";
import { createTenant, submitFranchiseJoinRequest } from "../../lib/api/tenants";
import type { TenantInfo } from "../../providers/TenantProvider";
import "./tenant-create-org-modal.css";

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function randomOrgCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export interface TenantCreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantType: "parent" | "center";
  onCreated: (tenant: TenantInfo) => Promise<void>;
}

export function TenantCreateOrganizationModal({
  isOpen,
  onClose,
  tenantType,
  onCreated,
}: TenantCreateOrganizationModalProps) {
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgCode, setNewOrgCode] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [publicSubTouched, setPublicSubTouched] = useState(false);
  const [publicSub, setPublicSub] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [requestFranchise, setRequestFranchise] = useState(false);
  const [franchiseParentSlug, setFranchiseParentSlug] = useState("");
  const [franchiseMsg, setFranchiseMsg] = useState("");
  const [franchisePrefBill, setFranchisePrefBill] = useState<"central" | "independent" | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNewOrgName("");
      setNewOrgSlug("");
      setNewOrgCode("");
      setSlugTouched(false);
      setPublicSubTouched(false);
      setPublicSub("");
      setCustomDomain("");
      setRequestFranchise(false);
      setFranchiseParentSlug("");
      setFranchiseMsg("");
      setFranchisePrefBill("");
      setErr(null);
      setBusy(false);
      return;
    }
    setNewOrgCode(randomOrgCode());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || slugTouched || !newOrgName) return;
    setNewOrgSlug(slugFromName(newOrgName));
  }, [newOrgName, isOpen, slugTouched]);

  useEffect(() => {
    if (!isOpen || publicSubTouched) return;
    setPublicSub(newOrgSlug.trim().toLowerCase());
  }, [newOrgSlug, isOpen, publicSubTouched]);

  const handleSubmit = async () => {
    const name = newOrgName.trim();
    const slug = newOrgSlug.trim().toLowerCase();
    const code = newOrgCode.trim().toUpperCase();
    if (name.length < 2) {
      setErr("Enter an organization name.");
      return;
    }
    if (slug.length < 2) {
      setErr("Enter a URL slug (letters, numbers, hyphens).");
      return;
    }
    if (code.length < 4) {
      setErr("Join code must be at least 4 characters.");
      return;
    }
    if (requestFranchise && !franchiseParentSlug.trim()) {
      setErr("Enter the parent organization slug to request a franchise link.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const sub = publicSub.trim().toLowerCase();
      const dom = customDomain.trim().toLowerCase();
      const created = await createTenant({
        name,
        slug,
        code,
        type: tenantType,
        public_host_subdomain: sub || undefined,
        custom_domain: dom || undefined,
      });
      if (requestFranchise && franchiseParentSlug.trim()) {
        try {
          await submitFranchiseJoinRequest(
            {
              parent_slug: franchiseParentSlug.trim().toLowerCase(),
              message: franchiseMsg.trim() || undefined,
              preferred_billing_mode: franchisePrefBill || undefined,
            },
            { tenantId: created.id },
          );
        } catch (fe: unknown) {
          const msg =
            fe instanceof Error
              ? fe.message
              : "Franchise request could not be sent. You can submit it from Organization Settings → Franchise & domain.";
          window.alert(msg);
        }
      }
      await onCreated(created);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not create organization.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Create new organization"
      disableClose={busy}
      contentClassName="tenant-create-org-modal"
      footer={
        <div className="tenant-create-org-modal__footer">
          <button
            type="button"
            className="tenant-create-org-modal__btn tenant-create-org-modal__btn--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tenant-create-org-modal__btn tenant-create-org-modal__btn--primary"
            onClick={() => void handleSubmit()}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="tenant-create-org-modal__spinner" aria-hidden />
                Creating…
              </>
            ) : (
              "Create & switch"
            )}
          </button>
        </div>
      }
    >
      <div className="tenant-create-org-modal__hero">
        <div className="tenant-create-org-modal__hero-icon" aria-hidden>
          <Building2 size={22} strokeWidth={2.25} />
        </div>
        <h3 className="tenant-create-org-modal__title">New organization</h3>
        <p className="tenant-create-org-modal__hint">
          Name your workspace, pick a URL slug, and set a join code students can use to enroll. Optionally
          set a public hostname or ask to link under a parent franchise.
        </p>
      </div>

      <div className="tenant-create-org-modal__fields">
        <label className="tenant-create-org-modal__field">
          <span className="tenant-create-org-modal__label">Name</span>
          <input
            type="text"
            className="tenant-create-org-modal__input"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="e.g. Smith Homeschool"
            autoComplete="organization"
            disabled={busy}
          />
        </label>
        <label className="tenant-create-org-modal__field">
          <span className="tenant-create-org-modal__label">URL slug</span>
          <input
            type="text"
            className="tenant-create-org-modal__input"
            value={newOrgSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setNewOrgSlug(e.target.value);
            }}
            placeholder="smith-homeschool"
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="tenant-create-org-modal__field">
          <span className="tenant-create-org-modal__label">Student join code</span>
          <input
            type="text"
            className="tenant-create-org-modal__input"
            value={newOrgCode}
            onChange={(e) => setNewOrgCode(e.target.value.toUpperCase())}
            placeholder="ABCD12"
            maxLength={20}
            autoComplete="off"
            disabled={busy}
          />
        </label>

        <div className="tenant-create-org-modal__section-label">Public hostname (optional)</div>
        <label className="tenant-create-org-modal__field">
          <span className="tenant-create-org-modal__label">Subdomain label</span>
          <input
            type="text"
            className="tenant-create-org-modal__input"
            value={publicSub}
            onChange={(e) => {
              setPublicSubTouched(true);
              setPublicSub(e.target.value.toLowerCase());
            }}
            placeholder="e.g. oakridge (for oakridge.your-platform.com)"
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="tenant-create-org-modal__field">
          <span className="tenant-create-org-modal__label">Custom domain</span>
          <input
            type="text"
            className="tenant-create-org-modal__input"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
            placeholder="learn.oakridge.edu"
            autoComplete="off"
            disabled={busy}
          />
        </label>

        <div className="tenant-create-org-modal__checkbox-row">
          <KidCheckbox
            checked={requestFranchise}
            onChange={setRequestFranchise}
            disabled={busy}
            ariaLabel="Request franchise link from parent organization"
          >
            Request franchise link from a parent organization
          </KidCheckbox>
        </div>
        {requestFranchise ? (
          <>
            <label className="tenant-create-org-modal__field">
              <span className="tenant-create-org-modal__label">Parent organization slug</span>
              <input
                type="text"
                className="tenant-create-org-modal__input"
                value={franchiseParentSlug}
                onChange={(e) => setFranchiseParentSlug(e.target.value)}
                placeholder="district-slug"
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <div className="tenant-create-org-modal__field">
              <span className="tenant-create-org-modal__label">Preferred billing (optional)</span>
              <KidDropdown
                value={franchisePrefBill || "any"}
                onChange={(v) =>
                  setFranchisePrefBill(v === "any" ? "" : (v as "central" | "independent"))
                }
                fullWidth
                ariaLabel="Franchise billing preference"
                disabled={busy}
                options={[
                  { value: "any", label: "No preference" },
                  { value: "central", label: "Central (parent license)" },
                  { value: "independent", label: "Independent (child billing)" },
                ]}
              />
            </div>
            <label className="tenant-create-org-modal__field">
              <span className="tenant-create-org-modal__label">Message to parent (optional)</span>
              <textarea
                className="tenant-create-org-modal__input tenant-create-org-modal__textarea"
                rows={2}
                value={franchiseMsg}
                onChange={(e) => setFranchiseMsg(e.target.value)}
                disabled={busy}
              />
            </label>
          </>
        ) : null}
      </div>

      {err ? (
        <p className="tenant-create-org-modal__error" role="alert">
          {err}
        </p>
      ) : null}
    </ModalDialog>
  );
}
