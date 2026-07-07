import { describe, it, expect } from "vitest";
import {
  buildPayoutAlertsMessage,
  isIssuedAtFresh,
  isPlausibleEmail,
  SIGNATURE_MAX_AGE_MS,
} from "./payoutAlertsMessage";

const WALLET = "0x8f6bF4A948Af2Fc74eE34982C4435a7C013D1A52";

describe("buildPayoutAlertsMessage (canonical: client signs === server verifies)", () => {
  it("builds the link message with normalised wallet and email", () => {
    expect(
      buildPayoutAlertsMessage({
        action: "link",
        walletAddress: WALLET,
        email: "  Alice@Example.COM ",
        issuedAt: "2026-07-07T12:00:00.000Z",
      }),
    ).toBe(
      [
        "Albion payout alerts v1",
        "Action: link",
        `Wallet: ${WALLET.toLowerCase()}`,
        "Email: alice@example.com",
        "Issued: 2026-07-07T12:00:00.000Z",
      ].join("\n"),
    );
  });

  it("omits the email line for unlink", () => {
    const msg = buildPayoutAlertsMessage({
      action: "unlink",
      walletAddress: WALLET,
      issuedAt: "2026-07-07T12:00:00.000Z",
    });
    expect(msg).not.toContain("Email:");
    expect(msg).toContain("Action: unlink");
  });

  it("is case-insensitive over wallet + email inputs (same signature both ways)", () => {
    const a = buildPayoutAlertsMessage({
      action: "link",
      walletAddress: WALLET.toUpperCase().replace("0X", "0x"),
      email: "A@B.CO",
      issuedAt: "t",
    });
    const b = buildPayoutAlertsMessage({
      action: "link",
      walletAddress: WALLET.toLowerCase(),
      email: "a@b.co",
      issuedAt: "t",
    });
    expect(a).toBe(b);
  });
});

describe("isIssuedAtFresh (replay guard)", () => {
  const now = Date.parse("2026-07-07T12:00:00.000Z");

  it("accepts a just-issued timestamp", () => {
    expect(isIssuedAtFresh("2026-07-07T11:59:00.000Z", now)).toBe(true);
  });

  it("rejects one older than the max age", () => {
    const old = new Date(now - SIGNATURE_MAX_AGE_MS - 1000).toISOString();
    expect(isIssuedAtFresh(old, now)).toBe(false);
  });

  it("tolerates small forward clock skew but rejects far-future timestamps", () => {
    expect(isIssuedAtFresh(new Date(now + 30_000).toISOString(), now)).toBe(true);
    expect(isIssuedAtFresh(new Date(now + 120_000).toISOString(), now)).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isIssuedAtFresh("not-a-date", now)).toBe(false);
  });
});

describe("isPlausibleEmail", () => {
  it("accepts normal addresses and rejects obvious junk", () => {
    expect(isPlausibleEmail("a@b.co")).toBe(true);
    expect(isPlausibleEmail("first.last+tag@sub.domain.org")).toBe(true);
    expect(isPlausibleEmail("nope")).toBe(false);
    expect(isPlausibleEmail("a@b")).toBe(false);
    expect(isPlausibleEmail("a b@c.com")).toBe(false);
  });
});
