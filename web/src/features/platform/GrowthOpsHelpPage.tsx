import { Link } from "react-router-dom";
import "./growth-ops-help.css";

const PROMO_FIELDS = [
  {
    field: "code",
    type: "string (required)",
    intent: "Human-facing promo identifier",
    meaning: "Unique code entered by customers at checkout.",
  },
  {
    field: "name",
    type: "string (required)",
    intent: "Internal display label",
    meaning: "Ops-facing readable name for campaign reporting.",
  },
  {
    field: "discount_type",
    type: "enum(percent|fixed)",
    intent: "How discount is computed",
    meaning: "Percent applies a ratio; fixed subtracts a fixed currency amount.",
  },
  {
    field: "discount_value",
    type: "number",
    intent: "Discount amount",
    meaning: "Percentage points or currency value based on selected discount type.",
  },
  {
    field: "starts_at / ends_at",
    type: "datetime",
    intent: "Campaign validity window",
    meaning: "Redemptions are only valid inside this time range.",
  },
  {
    field: "provider_mappings",
    type: "object",
    intent: "Provider-neutral linkage",
    meaning: "Stores external provider refs without coupling internal model to one vendor.",
  },
];

const AFFILIATE_FIELDS = [
  {
    field: "code",
    type: "string (required)",
    intent: "Referral identifier",
    meaning: "Partner code used at checkout attribution.",
  },
  {
    field: "commission_type / commission_value",
    type: "enum + number",
    intent: "Commission math",
    meaning: "Defines how earned commission is calculated for each conversion.",
  },
  {
    field: "commission_mode",
    type: "enum(one_time|recurring)",
    intent: "Payout policy shape",
    meaning: "One-time pays once; recurring allows subsequent billing-cycle commissions.",
  },
  {
    field: "commission_window_days",
    type: "integer",
    intent: "Attribution duration",
    meaning: "Maximum days from attribution start where commissions can be generated.",
  },
  {
    field: "max_commission_cycles",
    type: "integer",
    intent: "Cycle cap",
    meaning: "Upper bound on billable cycles per conversion attribution.",
  },
  {
    field: "payout_hold_days",
    type: "integer",
    intent: "Fraud/chargeback hold",
    meaning: "Number of days before a commission becomes available for payout.",
  },
];

export function GrowthOpsHelpPage() {
  return (
    <div className="growth-help">
      <header className="growth-help__hero">
        <h1>Growth Ops Reference</h1>
        <p>
          Promo, affiliate, and payout operations reference for product, support,
          and finance teams.
        </p>
        <Link className="growth-help__back" to="/app/platform/growth">
          Back to Growth Ops
        </Link>
      </header>

      <section className="growth-help__section">
        <h2>Promo fields</h2>
        <table className="growth-help__table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Intent</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {PROMO_FIELDS.map((row) => (
              <tr key={row.field}>
                <td>{row.field}</td>
                <td>{row.type}</td>
                <td>{row.intent}</td>
                <td>{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="growth-help__section">
        <h2>Affiliate fields</h2>
        <table className="growth-help__table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Intent</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {AFFILIATE_FIELDS.map((row) => (
              <tr key={row.field}>
                <td>{row.field}</td>
                <td>{row.type}</td>
                <td>{row.intent}</td>
                <td>{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="growth-help__section">
        <h2>How commission payment works</h2>
        <ol>
          <li>Webhook captures paid invoice and creates conversion + commission.</li>
          <li>Commission starts as pending, then approved after review.</li>
          <li>Commission becomes available at `created_at + payout_hold_days`.</li>
          <li>Ops exports payout CSV and pays partner off-platform.</li>
          <li>Ops marks commission as paid for audit closure.</li>
        </ol>
      </section>

      <section className="growth-help__section">
        <h2>Commission status lifecycle</h2>
        <ul>
          <li>`pending`: created and awaiting review.</li>
          <li>`approved`: accepted for payout queue.</li>
          <li>`paid`: payout settled and reconciled.</li>
          <li>`reversed`: clawback/chargeback adjustment.</li>
        </ul>
      </section>
    </div>
  );
}
