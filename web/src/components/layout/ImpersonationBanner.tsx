import { Eye, X } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import "./impersonation-banner.css";

export function ImpersonationBanner() {
  const { impersonatedTenant, endImpersonation } = useAuth();

  if (!impersonatedTenant) return null;

  return (
    <div className="imp-banner">
      <div className="imp-banner__content">
        <Eye size={16} />
        <span className="imp-banner__text">
          Viewing as <strong>{impersonatedTenant.name}</strong>
          <span className="imp-banner__slug">({impersonatedTenant.slug})</span>
        </span>
      </div>
      <button
        type="button"
        className="imp-banner__end"
        onClick={endImpersonation}
      >
        <X size={14} />
        End Impersonation
      </button>
    </div>
  );
}
