import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyMemberInvoices, type MemberInvoice } from "../../lib/api/memberBilling";
import { ApiHttpError } from "../../lib/api/client";
import "../../components/ui/ui.css";
import "../settings/settings.css";
import "./member-billing.css";

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(amountCents / 100);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function MemberInvoicesPage() {
  const [rows, setRows] = useState<MemberInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listMyMemberInvoices();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof ApiHttpError
              ? String(e.message)
              : e instanceof Error
                ? e.message
                : "Could not load invoices";
          setError(msg);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mb-page" role="main">
      <header className="mb-page__header">
        <h1 className="mb-page__title">My invoices</h1>
        <p className="mb-page__subtitle">
          Invoices where you are the payer for organization membership billing.
        </p>
      </header>
      <p className="mb-muted">
        <Link className="mb-link" to="/app/member-billing/pay">
          Pay membership
        </Link>
      </p>

      {error ? (
        <div className="mb-section mb-alert" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mb-muted">Loading…</p>
      ) : (
        <section className="mb-section">
          <div className="mb-table-wrap">
            <table className="mb-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Created</th>
                  <th>Paid</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="mb-muted">
                      No invoices yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.status}</td>
                      <td>{formatMoney(inv.amount_cents, inv.currency)}</td>
                      <td>{formatDate(inv.created_at)}</td>
                      <td>{formatDate(inv.paid_at)}</td>
                      <td>
                        {inv.hosted_invoice_url ? (
                          <a className="mb-link" href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : inv.invoice_pdf ? (
                          <a className="mb-link" href={inv.invoice_pdf} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
