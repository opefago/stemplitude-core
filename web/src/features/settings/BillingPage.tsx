import { CreditCard, TrendingUp } from "lucide-react";
import { ProgressBar } from "../../components/ui";
import "../../components/ui/ui.css";
import "./settings.css";

const BILLING_HISTORY = [
  { id: "1", date: "2025-03-01", amount: "$49.00", status: "Paid" },
  { id: "2", date: "2025-02-01", amount: "$49.00", status: "Paid" },
  { id: "3", date: "2025-01-01", amount: "$49.00", status: "Paid" },
];

export function BillingPage() {
  return (
    <div
      className="billing-page"
      role="main"
      aria-label="Billing"
    >
      <header className="billing-page__header">
        <h1 className="billing-page__title">Billing</h1>
        <p className="billing-page__subtitle">
          Manage your subscription and payment methods
        </p>
      </header>

      <div className="billing-page__content">
        {/* Current Plan */}
        <section
          className="billing-page__card"
          aria-labelledby="plan-heading"
        >
          <h2 id="plan-heading" className="billing-page__card-title">
            Current Plan
          </h2>
          <div className="billing-page__plan">
            <div className="billing-page__plan-name">Professional Plan</div>
            <div className="billing-page__plan-price">$49/mo</div>
            <div className="billing-page__plan-seats">50 seats</div>
          </div>
        </section>

        {/* Usage */}
        <section
          className="billing-page__card"
          aria-labelledby="usage-heading"
        >
          <h2 id="usage-heading" className="billing-page__card-title">
            Usage
          </h2>
          <ProgressBar
            value={64}
            label="Seats used"
            showPercent
            variant="default"
          />
          <p className="billing-page__usage-text">32 / 50 seats</p>
        </section>

        {/* Payment method */}
        <section
          className="billing-page__card"
          aria-labelledby="payment-heading"
        >
          <h2 id="payment-heading" className="billing-page__card-title">
            Payment Method
          </h2>
          <div className="billing-page__payment">
            <CreditCard size={20} aria-hidden />
            <span>Visa ending in 4242</span>
            <button
              type="button"
              className="billing-page__btn-secondary"
              onClick={() => {}}
            >
              Update
            </button>
          </div>
        </section>

        {/* Billing history */}
        <section
          className="billing-page__card"
          aria-labelledby="history-heading"
        >
          <h2 id="history-heading" className="billing-page__card-title">
            Billing History
          </h2>
          <div className="billing-page__table-wrapper">
            <table className="billing-page__table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {BILLING_HISTORY.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.amount}</td>
                    <td>
                      <span className="billing-page__status billing-page__status--paid">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Upgrade */}
        <div className="billing-page__actions">
          <button
            type="button"
            className="billing-page__btn-primary"
            onClick={() => {}}
          >
            <TrendingUp size={18} aria-hidden />
            Upgrade Plan
          </button>
        </div>
      </div>
    </div>
  );
}
