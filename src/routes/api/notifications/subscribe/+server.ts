/**
 * POST /api/notifications/subscribe
 *
 * Links an email to a wallet for payout alerts. Body:
 *   { email, walletAddress, issuedAt, signature }
 *
 * The signature must be the wallet's signature over the canonical link message
 * (buildPayoutAlertsMessage) — this is what stops a third party subscribing an
 * email to a wallet they don't control. Flow:
 *   1. verify signature (EOA or smart wallet) + freshness
 *   2. upsert the MailerLite subscriber: merge wallet into its wallet_addresses
 *      field, attach the payout-alerts group
 *   3. if the wallet was previously linked to a DIFFERENT subscriber, strip it
 *      from that subscriber's field (change-email flow)
 *   4. record wallet -> { subscriberId, emailMasked } in the link map
 */
import { json, type RequestEvent } from "@sveltejs/kit";
import {
  isIssuedAtFresh,
  isPlausibleEmail,
} from "$lib/utils/payoutAlertsMessage";
import {
  applyLink,
  maskEmail,
  mergeWalletIntoField,
  removeWalletFromField,
} from "../lib";
import {
  WALLETS_FIELD,
  getSubscriber,
  mailerliteConfig,
  removeFromGroup,
  setSubscriberWallets,
  updateLinkMap,
  upsertSubscriber,
  verifyWalletSignature,
} from "../service";

export async function POST({ request }: RequestEvent) {
  const config = mailerliteConfig();
  if (!config) {
    return json({ error: "notifications_not_configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { email, walletAddress, issuedAt, signature } = body ?? {};

    if (
      typeof email !== "string" ||
      typeof walletAddress !== "string" ||
      typeof issuedAt !== "string" ||
      typeof signature !== "string" ||
      !walletAddress.startsWith("0x")
    ) {
      return json({ error: "invalid_request" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isPlausibleEmail(normalizedEmail)) {
      return json({ error: "invalid_email" }, { status: 400 });
    }
    if (!isIssuedAtFresh(issuedAt, Date.now())) {
      return json({ error: "stale_signature" }, { status: 400 });
    }

    const verified = await verifyWalletSignature(
      { action: "link", walletAddress, email: normalizedEmail, issuedAt },
      signature,
    );
    if (!verified) {
      return json({ error: "invalid_signature" }, { status: 401 });
    }

    const wallet = walletAddress.toLowerCase();

    // Merge the wallet into the subscriber's existing wallet list (one email
    // may cover several wallets), then upsert with the group attached.
    const existing = await getSubscriber(config.apiKey, normalizedEmail);
    const mergedWallets = mergeWalletIntoField(
      existing?.fields?.[WALLETS_FIELD],
      wallet,
    );
    const subscriber = await upsertSubscriber(
      config.apiKey,
      config.groupId,
      normalizedEmail,
      mergedWallets,
    );

    const emailMasked = maskEmail(normalizedEmail);
    let previousSubscriberId: string | null = null;
    await updateLinkMap((map) => {
      const { map: next, previous } = applyLink(map, wallet, {
        subscriberId: subscriber.id,
        emailMasked,
        updatedAt: Date.now(),
      });
      previousSubscriberId = previous?.subscriberId ?? null;
      return next;
    });

    // Change-email flow: the wallet moved to a new subscriber, so remove it
    // from the old one (and detach the old subscriber from the group if this
    // was its last wallet). Best-effort — a failure here leaves a harmless
    // extra notification, never a missing one.
    if (previousSubscriberId) {
      try {
        const old = await getSubscriber(config.apiKey, previousSubscriberId);
        if (old) {
          const remaining = removeWalletFromField(
            old.fields?.[WALLETS_FIELD],
            wallet,
          );
          await setSubscriberWallets(config.apiKey, old.id, remaining);
          if (remaining === "") {
            await removeFromGroup(config.apiKey, config.groupId, old.id);
          }
        }
      } catch (error) {
        console.warn("payout-alerts: old-subscriber cleanup failed:", error);
      }
    }

    return json({ linked: true, emailMasked });
  } catch (err) {
    console.error("payout-alerts subscribe error:", err);
    return json({ error: "subscribe_failed" }, { status: 500 });
  }
}
