import { Link, useSearchParams } from "react-router-dom";
import "../../components/ui/ui.css";
import "../settings/settings.css";
import "./member-billing.css";

export function MemberBillingSuccessPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  return (
    <div className="mb-page" role="main">
      <header className="mb-page__header">
        <h1 className="mb-page__title">Payment started</h1>
        <p className="mb-page__subtitle">
          Thanks — Stripe is processing your payment. You will receive a confirmation by email when it
          completes.
        </p>
      </header>
      {sessionId ? (
        <p className="mb-muted">
          Reference: <code style={{ fontSize: "0.85em" }}>{sessionId}</code>
        </p>
      ) : null}
      <div className="mb-actions">
        <Link to="/app/member-billing/invoices" className="mb-link" style={{ fontSize: "1rem" }}>
          View my invoices
        </Link>
        <Link to="/app" className="mb-link" style={{ fontSize: "1rem" }}>
          Back to home
        </Link>
      </div>
    </div>
  );
}

export function MemberBillingCancelPage() {
  return (
    <div className="mb-page" role="main">
      <header className="mb-page__header">
        <h1 className="mb-page__title">Checkout canceled</h1>
        <p className="mb-page__subtitle">No charge was made. You can try again whenever you are ready.</p>
      </header>
      <div className="mb-actions">
        <Link to="/app/member-billing/pay" className="mb-btn mb-btn--primary" style={{ textDecoration: "none" }}>
          Return to pay
        </Link>
        <Link to="/app" className="mb-link" style={{ fontSize: "1rem", alignSelf: "center" }}>
          Home
        </Link>
      </div>
    </div>
  );
}
