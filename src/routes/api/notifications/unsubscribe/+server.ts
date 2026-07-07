/**
 * POST /api/notifications/unsubscribe
 *
 * Unlinks a wallet from payout alerts. Body: { walletAddress, issuedAt, signature }.
 * Signature is over the canonical unlink message — only the wallet owner can
 * unlink it. (Email-side opt-out doesn't need this route at all: MailerLite's
 * own unsubscribe links in every email keep working independently.)
 */
import { json, type RequestEvent } from "@sveltejs/kit";
import { isIssuedAtFresh } from "$lib/utils/payoutAlertsMessage";
import { applyUnlink, removeWalletFromField } from "../lib";
import {
  WALLETS_FIELD,
  getSubscriber,
  mailerliteConfig,
  removeFromGroup,
  setSubscriberWallets,
  updateLinkMap,
  verifyWalletSignature,
} from "../service";

export async function POST({ request }: RequestEvent) {
  const config = mailerliteConfig();
  if (!config) {
    return json({ error: "notifications_not_configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { walletAddress, issuedAt, signature } = body ?? {};

    if (
      typeof walletAddress !== "string" ||
      typeof issuedAt !== "string" ||
      typeof signature !== "string" ||
      !walletAddress.startsWith("0x")
    ) {
      return json({ error: "invalid_request" }, { status: 400 });
    }
    if (!isIssuedAtFresh(issuedAt, Date.now())) {
      return json({ error: "stale_signature" }, { status: 400 });
    }

    const verified = await verifyWalletSignature(
      { action: "unlink", walletAddress, issuedAt },
      signature,
    );
    if (!verified) {
      return json({ error: "invalid_signature" }, { status: 401 });
    }

    const wallet = walletAddress.toLowerCase();

    let removedSubscriberId: string | null = null;
    await updateLinkMap((map) => {
      const { map: next, removed } = applyUnlink(map, wallet);
      removedSubscriberId = removed?.subscriberId ?? null;
      return next;
    });

    if (removedSubscriberId) {
      const subscriber = await getSubscriber(
        config.apiKey,
        removedSubscriberId,
      );
      if (subscriber) {
        const remaining = removeWalletFromField(
          subscriber.fields?.[WALLETS_FIELD],
          wallet,
        );
        await setSubscriberWallets(config.apiKey, subscriber.id, remaining);
        if (remaining === "") {
          await removeFromGroup(config.apiKey, config.groupId, subscriber.id);
        }
      }
    }

    return json({ linked: false });
  } catch (err) {
    console.error("payout-alerts unsubscribe error:", err);
    return json({ error: "unsubscribe_failed" }, { status: 500 });
  }
}
