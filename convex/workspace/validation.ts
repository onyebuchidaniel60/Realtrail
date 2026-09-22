import { appError } from "../lib/errors";

// Shared workspace field validators (Phase 11). workspace.create was the
// original home of these rules; settings.updateWorkspace reuses them so
// onboarding and settings can never disagree on what a valid workspace
// looks like.

export const ISO_CURRENCY_CODES: ReadonlySet<string> = new Set([
  "USD",
  "EUR",
  "GBP",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "EGP",
  "XOF",
  "XAF",
  "MAD",
  "ETB",
  "TZS",
  "UGX",
  "RWF",
  "ZMW",
  "CAD",
  "AUD",
  "JPY",
  "CNY",
  "INR",
  "AED",
  "SAR",
  "QAR",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "BRL",
  "MXN",
]);

// Trims and bounds a workspace name. Returns the trimmed value.
export function validateWorkspaceName(raw: string, field: string): string {
  const name = raw.trim();
  if (name.length < 2 || name.length > 80) {
    appError(
      "VALIDATION_ERROR",
      "Workspace name must be 2..80 characters.",
      field,
    );
  }
  return name;
}

// Rejects non-IANA timezones. Returns the value unchanged (create stores
// the timezone verbatim; settings must match that behavior).
export function validateTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    appError("VALIDATION_ERROR", "Invalid IANA timezone.", "timezone");
  }
  return timezone;
}

// Trims, uppercases, and checks against the supported ISO set. Returns
// the normalized code.
export function validateCurrency(raw: string): string {
  const currency = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !ISO_CURRENCY_CODES.has(currency)) {
    appError(
      "VALIDATION_ERROR",
      "Currency must be a supported 3-letter ISO code.",
      "currency",
    );
  }
  return currency;
}
