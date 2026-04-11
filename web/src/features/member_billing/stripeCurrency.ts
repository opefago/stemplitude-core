/**
 * Stripe amounts are in the “smallest currency unit” (cents for USD, whole yen for JPY, etc.).
 * @see https://docs.stripe.com/currencies#zero-decimal
 */
const STRIPE_ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export function isStripeZeroDecimalCurrency(currency: string): boolean {
  return STRIPE_ZERO_DECIMAL.has((currency || "").toLowerCase());
}

/** Convert a human-entered major amount (e.g. 19.99 USD, 1000 JPY) to Stripe unit_amount. */
export function majorUnitsToStripeUnitAmount(major: number, currency: string): number {
  const c = (currency || "usd").toLowerCase();
  if (isStripeZeroDecimalCurrency(c)) {
    return Math.round(major);
  }
  return Math.round(major * 100);
}

/** Default form string for an amount field from stored Stripe unit_amount. */
export function stripeUnitAmountToMajorString(unitAmount: number, currency: string): string {
  const c = (currency || "usd").toLowerCase();
  if (isStripeZeroDecimalCurrency(c)) {
    return String(Math.round(unitAmount));
  }
  return (unitAmount / 100).toFixed(2);
}

export function formatStripeCurrency(unitAmount: number, currency: string): string {
  const c = (currency || "usd").toLowerCase();
  const display = isStripeZeroDecimalCurrency(c) ? unitAmount : unitAmount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c.toUpperCase(),
    }).format(display);
  } catch {
    return `${display} ${c.toUpperCase()}`;
  }
}

/** Common Connect charge currencies; admins can pick “Other” and type any 3-letter ISO code Stripe supports. */
export const MEMBER_BILLING_CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "usd", label: "USD — US dollar" },
  { value: "eur", label: "EUR — Euro" },
  { value: "gbp", label: "GBP — British pound" },
  { value: "cad", label: "CAD — Canadian dollar" },
  { value: "aud", label: "AUD — Australian dollar" },
  { value: "nzd", label: "NZD — New Zealand dollar" },
  { value: "chf", label: "CHF — Swiss franc" },
  { value: "sek", label: "SEK — Swedish krona" },
  { value: "nok", label: "NOK — Norwegian krone" },
  { value: "dkk", label: "DKK — Danish krone" },
  { value: "pln", label: "PLN — Polish złoty" },
  { value: "czk", label: "CZK — Czech koruna" },
  { value: "huf", label: "HUF — Hungarian forint" },
  { value: "ron", label: "RON — Romanian leu" },
  { value: "mxn", label: "MXN — Mexican peso" },
  { value: "brl", label: "BRL — Brazilian real" },
  { value: "clp", label: "CLP — Chilean peso" },
  { value: "cop", label: "COP — Colombian peso" },
  { value: "pen", label: "PEN — Peruvian sol" },
  { value: "inr", label: "INR — Indian rupee" },
  { value: "jpy", label: "JPY — Japanese yen" },
  { value: "krw", label: "KRW — South Korean won" },
  { value: "sgd", label: "SGD — Singapore dollar" },
  { value: "hkd", label: "HKD — Hong Kong dollar" },
  { value: "twd", label: "TWD — New Taiwan dollar" },
  { value: "thb", label: "THB — Thai baht" },
  { value: "myr", label: "MYR — Malaysian ringgit" },
  { value: "idr", label: "IDR — Indonesian rupiah" },
  { value: "php", label: "PHP — Philippine peso" },
  { value: "vnd", label: "VND — Vietnamese đồng" },
  { value: "zar", label: "ZAR — South African rand" },
  { value: "aed", label: "AED — UAE dirham" },
  { value: "ils", label: "ILS — Israeli shekel" },
  { value: "try", label: "TRY — Turkish lira" },
  { value: "sar", label: "SAR — Saudi riyal" },
  { value: "egp", label: "EGP — Egyptian pound" },
  { value: "ngn", label: "NGN — Nigerian naira" },
  { value: "kes", label: "KES — Kenyan shilling" },
  { value: "other", label: "Other…" },
];

export function currencyCodeToDropdownValue(code: string): { select: string; other: string } {
  const c = (code || "usd").toLowerCase();
  const preset = MEMBER_BILLING_CURRENCY_OPTIONS.find((o) => o.value === c);
  if (preset && preset.value !== "other") {
    return { select: c, other: "" };
  }
  return { select: "other", other: c.toUpperCase() };
}
