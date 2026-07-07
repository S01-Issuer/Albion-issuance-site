/**
 * Canonical sign-message for linking/unlinking a payout-alert email to a wallet.
 *
 * The SAME builder runs in the browser (to produce the message the wallet signs)
 * and on the server (to reconstruct the expected message before verifying the
 * signature) — the server never trusts a client-supplied message string, only
 * the structured fields it rebuilds the message from. The signature requirement
 * exists so nobody can attach an email to a wallet they don't control, and it
 * doubles as an auditable consent record.
 */

export type PayoutAlertsAction = "link" | "unlink";

/** Reject requests whose signature was issued outside this window (replay guard). */
export const SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;

export interface PayoutAlertsMessageFields {
  action: PayoutAlertsAction;
  walletAddress: string;
  /** Required for "link"; omitted from the message for "unlink". */
  email?: string;
  /** ISO-8601 timestamp chosen by the client at signing time. */
  issuedAt: string;
}

export function buildPayoutAlertsMessage(
  fields: PayoutAlertsMessageFields,
): string {
  const lines = [
    "Albion payout alerts v1",
    `Action: ${fields.action}`,
    `Wallet: ${fields.walletAddress.toLowerCase()}`,
  ];
  if (fields.action === "link") {
    lines.push(`Email: ${(fields.email ?? "").trim().toLowerCase()}`);
  }
  lines.push(`Issued: ${fields.issuedAt}`);
  return lines.join("\n");
}

/**
 * Freshness check for the signed timestamp. Allows a small negative skew for
 * clients whose clock runs slightly ahead of the server's.
 */
export function isIssuedAtFresh(
  issuedAt: string,
  now: number,
  maxAgeMs: number = SIGNATURE_MAX_AGE_MS,
): boolean {
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return false;
  const age = now - t;
  return age <= maxAgeMs && age >= -60_000;
}

/** Light structural validation — MailerLite does the real deliverability work. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
