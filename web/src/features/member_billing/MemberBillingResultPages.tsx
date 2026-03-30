import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import "../../components/ui/ui.css";
import "../settings/settings.css";
import "./member-billing.css";

export function MemberBillingSuccessPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  return (
    <div className="mb-page mb-page--success" role="main">
      <div className="mb-success-hero">
        <div className="mb-success-hero__icon" aria-hidden>
          <Loader2 className="mb-success-hero__spinner" size={40} strokeWidth={2.25} />
        </div>
        <header className="mb-success-hero__header">
          <h1 className="mb-page__title mb-success-hero__title">Payment processing</h1>
          <p className="mb-page__subtitle mb-success-hero__lead">
            Thanks — Stripe is finalizing your payment. You&apos;ll get a confirmation email from your organization
            (and from Stripe) when everything is complete.
          </p>
        </header>
      </div>

      <section className="mb-success-panel" aria-labelledby="mb-success-next-label">
        <h2 id="mb-success-next-label" className="mb-success-panel__title">
          What happens next
        </h2>
        <ol className="mb-success-steps">
          <li className="mb-success-steps__item">
            <span className="mb-success-steps__mark">
              <CheckCircle2 size={18} aria-hidden />
            </span>
            <div>
              <strong>Checkout submitted</strong>
              <p>Your bank or card issuer may take a moment to authorize the charge.</p>
            </div>
          </li>
          <li className="mb-success-steps__item">
            <span className="mb-success-steps__mark mb-success-steps__mark--pending">
              <Mail size={18} aria-hidden />
            </span>
            <div>
              <strong>Email confirmation</strong>
              <p>Watch your inbox for the receipt. If you don&apos;t see it, check spam or promotions.</p>
            </div>
          </li>
          <li className="mb-success-steps__item">
            <span className="mb-success-steps__mark mb-success-steps__mark--pending">
              <CheckCircle2 size={18} aria-hidden />
            </span>
            <div>
              <strong>Membership updated</strong>
              <p>
                Your organization&apos;s records refresh automatically. If a webhook is delayed, we sync with Stripe
                every few minutes so nothing gets stuck.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {sessionId ? (
        <div className="mb-success-ref" role="region" aria-label="Checkout reference">
          <span className="mb-success-ref__label">Reference (save for support)</span>
          <code className="mb-success-ref__code">{sessionId}</code>
        </div>
      ) : null}

      <div className="mb-actions mb-success-actions">
        <Link to="/app/member-billing/invoices" className="mb-btn mb-btn--primary" style={{ textDecoration: "none" }}>
          View my invoices
          <ArrowRight size={18} aria-hidden />
        </Link>
        <Link to="/app/member-billing/pay" className="mb-link mb-success-actions__secondary">
          Pay another membership
        </Link>
        <Link to="/app" className="mb-link">
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
