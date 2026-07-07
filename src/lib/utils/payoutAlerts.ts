/**
 * Client-side payout-alerts flows: status lookup, and the sign-then-submit
 * link/unlink round trips. The wallet signature (over the canonical message in
 * payoutAlertsMessage.ts) proves the connected wallet consents to the link —
 * the server rebuilds the same message from the fields and verifies.
 */
import axios from "axios";
import { signMessage } from "@wagmi/core";
import { wagmiConfig } from "svelte-wagmi";
import { get } from "svelte/store";
import { buildPayoutAlertsMessage } from "$lib/utils/payoutAlertsMessage";

export interface AlertStatus {
  configured: boolean;
  linked: boolean;
  emailMasked: string | null;
}

export async function getAlertStatus(wallet: string): Promise<AlertStatus> {
  const { data } = await axios.get<AlertStatus>("/api/notifications/status", {
    params: { wallet },
  });
  return data;
}

export async function linkAlertEmail(
  wallet: string,
  email: string,
): Promise<{ linked: boolean; emailMasked: string }> {
  const issuedAt = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();
  const message = buildPayoutAlertsMessage({
    action: "link",
    walletAddress: wallet,
    email: normalizedEmail,
    issuedAt,
  });
  const signature = await signMessage(get(wagmiConfig), { message });
  const { data } = await axios.post("/api/notifications/subscribe", {
    email: normalizedEmail,
    walletAddress: wallet,
    issuedAt,
    signature,
  });
  return data;
}

export async function unlinkAlertEmail(wallet: string): Promise<void> {
  const issuedAt = new Date().toISOString();
  const message = buildPayoutAlertsMessage({
    action: "unlink",
    walletAddress: wallet,
    issuedAt,
  });
  const signature = await signMessage(get(wagmiConfig), { message });
  await axios.post("/api/notifications/unsubscribe", {
    walletAddress: wallet,
    issuedAt,
    signature,
  });
}
