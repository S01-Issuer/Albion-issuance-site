/**
 * GET /api/notifications/status?wallet=0x…
 *
 * Read-only lookup for the UI: is this wallet linked to a payout-alert email,
 * and if so what does the masked address look like. Served entirely from the
 * link map — no MailerLite call, no signature needed (the map holds no PII;
 * masked emails are display-only).
 */
import { json, type RequestEvent } from "@sveltejs/kit";
import { loadLinkMap } from "../service";
import { mailerliteConfig } from "../service";

export async function GET({ url }: RequestEvent) {
  const wallet = url.searchParams.get("wallet")?.toLowerCase();
  if (!wallet || !wallet.startsWith("0x")) {
    return json({ error: "invalid_wallet" }, { status: 400 });
  }

  // Feature-flag signal for the UI: hide the card entirely when unconfigured.
  if (!mailerliteConfig()) {
    return json({ configured: false, linked: false });
  }

  const map = await loadLinkMap();
  const link = map.links[wallet];
  return json({
    configured: true,
    linked: !!link,
    emailMasked: link?.emailMasked ?? null,
  });
}
